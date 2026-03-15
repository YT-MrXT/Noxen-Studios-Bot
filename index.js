const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Events,
    ChannelType,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const OpenAI = require("openai");
const express = require("express");

// ---------- Configurações ----------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // ID do bot
const GUILD_ID = process.env.GUILD_ID;   // ID do servidor (guild) para registrar comandos
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("❌ DISCORD_TOKEN, CLIENT_ID ou GUILD_ID não definido!");
    process.exit(1);
}

// ---------- Inicializa OpenAI ----------
let openai;
if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log("✅ OpenAI ativado");
} else {
    console.log("⚠️ OpenAI não ativado, bot funcionará sem IA");
}

// ---------- Inicializa bot ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// ---------- Histórico e tickets ----------
const conversations = new Map();
const processing = new Set();
const userTickets = new Map();

// ---------- Servidor Express ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Noxen Studios Bot Online"));
app.listen(PORT, () => console.log(`Servidor Express rodando na porta ${PORT}`));

// ---------- Registro de Slash Commands ----------
const commands = [
    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Abrir um ticket de suporte"),
    new SlashCommandBuilder()
        .setName("newchat")
        .setDescription("Reiniciar a conversa com a IA"),
    new SlashCommandBuilder()
        .setName("site")
        .setDescription("Mostrar o site da Noxen Studios"),
    new SlashCommandBuilder()
        .setName("contact")
        .setDescription("Mostrar email para contato")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async () => {
    try {
        console.log("🔹 Registrando comandos...");
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("✅ Comandos registrados com sucesso!");
    } catch (err) {
        console.error(err);
    }
})();

// ---------- Bot online ----------
client.once(Events.ClientReady, () => {
    console.log(`Bot online: ${client.user.tag}`);
});

// ---------- Interações ----------
client.on(Events.InteractionCreate, async interaction => {

    if (interaction.isChatInputCommand()) {
        const userId = interaction.user.id;

        if (!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        switch (interaction.commandName) {
            case "newchat":
                conversations.set(userId, []);
                return interaction.reply("🧹 Chat reiniciado.");
            case "site":
                return interaction.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");
            case "contact":
                return interaction.reply("📧 noxenstds@gmail.com");
            case "ticket":
                if (userTickets.has(userId)) {
                    const channel = userTickets.get(userId);
                    return interaction.reply({ content: `Você já possui um ticket aberto: ${channel}`, ephemeral: true });
                }

                const button = new ButtonBuilder()
                    .setCustomId("open_ticket")
                    .setLabel("🎫 Abrir Ticket")
                    .setStyle(ButtonStyle.Primary);
                const row = new ActionRowBuilder().addComponents(button);

                return interaction.reply({
                    content: "🎫 Suporte Noxen Studios\nClique no botão para abrir ticket.",
                    components: [row],
                    ephemeral: true
                });
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId === "open_ticket") {
            const userId = interaction.user.id;

            if (userTickets.has(userId)) {
                const channel = userTickets.get(userId);
                return interaction.reply({ content: `Você já possui um ticket aberto: ${channel}`, ephemeral: true });
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

                await channel.send(`🎫 Ticket aberto por ${interaction.user}\nExplique seu problema e a equipe Noxen responderá.`);

                interaction.reply({ content: `Ticket criado: ${channel}`, ephemeral: true });
            } catch (err) {
                console.error("❌ Erro ao criar ticket:", err);
                interaction.reply({ content: "❌ Não foi possível criar o ticket.", ephemeral: true });
            }
        }
    }
});

// ---------- Mensagens para IA (opcional) ----------
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!openai) return; // se IA não estiver ativada

    const userId = message.author.id;
    if (processing.has(userId)) return;
    processing.add(userId);

    try {
        if (!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        history.push({ role: "user", content: message.content });
        while (history.length > 10) history.shift();

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "Você é o assistente oficial da Noxen Studios. Responda em qualquer idioma automaticamente." },
                    ...history
                ]
            });
            const reply = completion.choices[0].message.content;
            history.push({ role: "assistant", content: reply });
            await message.reply(reply);
        } catch (err) {
            console.error("⚠️ OpenAI falhou:", err);
            await message.reply("⚠️ IA não respondeu, mas o bot continua funcionando normalmente.");
        }
    } finally {
        processing.delete(userId);
    }
});

// ---------- Login ----------
client.login(DISCORD_TOKEN);
