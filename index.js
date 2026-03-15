const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Events,
    ChannelType,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const OpenAI = require("openai");
const express = require("express");

// ---------- Checagem de chaves ----------
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN não definido!");
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY não definido!");
    process.exit(1);
}

// ---------- Inicializa OpenAI ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- Inicializa bot ----------
const client = new Client({
    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials:[Partials.Channel]
});

// ---------- Histórico de conversas ----------
const conversations = new Map();

// ---------- Controle de duplicação ----------
const processing = new Set();

// ---------- Controle de tickets ----------
const userTickets = new Map();

// ---------- Servidor Express ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Noxen Studios Bot Online"));
app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}`));

// ---------- Bot online ----------
client.once(Events.ClientReady, () => {
    console.log(`Bot online: ${client.user.tag}`);
});

// ---------- Mensagens ----------
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    const userId = message.author.id;

    if (processing.has(userId)) return;
    processing.add(userId);

    try {
        const msg = message.content.toLowerCase();

        if (!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        // -------- Comandos ----------
        if (msg === "/newchat") {
            conversations.set(userId, []);
            return message.reply("🧹 Chat reiniciado.");
        }

        if (msg === "/site") {
            return message.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");
        }

        if (msg === "/contact") {
            return message.reply("📧 noxenstds@gmail.com");
        }

        if (msg === "/ticket") {
            // Verifica se já existe ticket
            if (userTickets.has(userId)) {
                const channel = userTickets.get(userId);
                return message.reply(`Você já possui um ticket aberto: ${channel}`);
            }

            const button = new ButtonBuilder()
                .setCustomId("open_ticket")
                .setLabel("🎫 Abrir Ticket")
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            return message.reply({
                content: "🎫 Suporte Noxen Studios\nClique no botão para abrir ticket.",
                components: [row]
            });
        }

        // -------- Histórico ----------
        history.push({ role: "user", content: message.content });
        while (history.length > 10) history.shift();

        // -------- Testa se OpenAI responde ----------
        let completion;
        try {
            completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `
Você é o assistente oficial da Noxen Studios.
Empresa que desenvolve jogos Roblox.
Site: https://noxenstd.wixsite.com/noxen-studios
Email: noxenstds@gmail.com
Responda em qualquer idioma automaticamente.
                        `
                    },
                    ...history
                ]
            });
        } catch (err) {
            console.warn("⚠️ gpt-4o-mini falhou, tentando gpt-3.5-turbo...", err);
            // Tenta modelo alternativo
            try {
                completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: `
Você é o assistente oficial da Noxen Studios.
Empresa que desenvolve jogos Roblox.
Responda em qualquer idioma automaticamente.
                        `
                        },
                        ...history
                    ]
                });
            } catch (err2) {
                console.error("❌ Erro OpenAI:", err2);
                return message.reply("❌ Erro ao gerar resposta. Confira a chave API ou tente novamente mais tarde.");
            }
        }

        const reply = completion.choices[0].message.content;
        history.push({ role: "assistant", content: reply });
        await message.reply(reply);

    } finally {
        processing.delete(userId);
    }
});

// ---------- Interações (botões) ----------
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "open_ticket") {
        const userId = interaction.user.id;

        if (userTickets.has(userId)) {
            const channel = userTickets.get(userId);
            return interaction.reply({
                content: `Você já possui um ticket aberto: ${channel}`,
                ephemeral: true
            });
        }

        const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

        try {
            const channel = await interaction.guild.channels.create({
                name: `ticket-${safeName}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            userTickets.set(userId, channel);

            await channel.send(
                `🎫 Ticket aberto por ${interaction.user}\nExplique seu problema e a equipe Noxen responderá.`
            );

            interaction.reply({
                content: `Ticket criado: ${channel}`,
                ephemeral: true
            });

        } catch (err) {
            console.error("❌ Erro ao criar ticket:", err);
            interaction.reply({
                content: "❌ Não foi possível criar o ticket.",
                ephemeral: true
            });
        }
    }
});

// ---------- Login do bot ----------
client.login(process.env.DISCORD_TOKEN);
