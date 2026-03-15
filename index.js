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

// Verifica se as chaves estão definidas
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN não definido!");
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY não definido!");
    process.exit(1);
}

// Inicializa OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Inicializa bot
const client = new Client({
    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials:[Partials.Channel]
});

// Histórico de conversas por usuário
const conversations = new Map();

// Conjunto para evitar duplicações
const processing = new Set();

// Servidor Express para Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Noxen Studios Bot Online"));
app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}`));

// Bot online
client.once(Events.ClientReady, () => {
    console.log(`Bot online: ${client.user.tag}`);
});

// Mensagens
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    const userId = message.author.id;

    // Evita processar duplicado
    if (processing.has(userId)) return;
    processing.add(userId);

    try {
        const msg = message.content.toLowerCase();

        if (!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        // Comandos
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

        // Adiciona mensagem do usuário
        history.push({ role: "user", content: message.content });

        // Limita histórico a 10 mensagens
        while (history.length > 10) history.shift();

        // Gera resposta com OpenAI
        try {
            const completion = await openai.chat.completions.create({
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

            const reply = completion.choices[0].message.content;
            history.push({ role: "assistant", content: reply });
            await message.reply(reply);

        } catch (err) {
            console.error("❌ Erro OpenAI:", err);
            await message.reply("❌ Erro ao gerar resposta. Confira a chave API ou tente novamente mais tarde.");
        }

    } finally {
        processing.delete(userId); // libera para próxima mensagem
    }
});

// Interações (botões)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "open_ticket") {
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

// Login do bot
client.login(process.env.DISCORD_TOKEN);
