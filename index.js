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

// Inicializa o bot
const client = new Client({
    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials:[Partials.Channel]
});

// Inicializa OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Histórico de conversas por usuário
const conversations = new Map();

// Servidor Express para o Render
const app = express();
app.get("/", (req, res) => res.send("Noxen Studios Bot Online"));
app.listen(process.env.PORT || 3000);

// Evento: bot online
client.once(Events.ClientReady, () => {
    console.log(`Bot online: ${client.user.tag}`);
});

// Evento: mensagens
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const userId = message.author.id;
    const msg = message.content.toLowerCase(); // normaliza comando

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

    // Adiciona a mensagem do usuário no histórico
    history.push({ role: "user", content: message.content });

    // Limita o histórico a 10 mensagens
    if (history.length > 10) history.shift();

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
        message.reply(reply);

    } catch (err) {
        console.log("Erro OpenAI:", err);
        message.reply("❌ Erro ao gerar resposta. Tente novamente mais tarde.");
    }
});

// Evento: interação (botões)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === "open_ticket") {
        // Sanitiza nome do canal
        const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

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
    }
});

// Login do bot
client.login(process.env.DISCORD_TOKEN);
