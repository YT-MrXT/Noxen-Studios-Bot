const { 
    Client, GatewayIntentBits, Partials, Events,
    ChannelType, PermissionsBitField,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    SlashCommandBuilder, REST, Routes
} = require("discord.js");
const OpenAI = require("openai");
const express = require("express");
const franc = require("franc");

// ---------- Config ----------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

if (!DISCORD_TOKEN || !OPENAI_API_KEY || !CLIENT_ID) {
    console.error("❌ DISCORD_TOKEN, OPENAI_API_KEY ou CLIENT_ID não definido!");
    process.exit(1);
}

// ---------- Client ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------- Express ----------
const app = express();
app.get("/", (req,res)=>res.send("🤖 Bot Noxen Studios online e pronto!"));
app.listen(process.env.PORT || 3000, ()=>console.log("Servidor web rodando..."));

// ---------- Storage ----------
const conversations = new Map();
const lastReplies = new Map();
const userTickets = new Map();
const respondedMessages = new Set();

// ---------- Slash Commands ----------
const commands = [
    new SlashCommandBuilder().setName("ia").setDescription("Talk to Noxen AI"),
    new SlashCommandBuilder().setName("ticket_panel").setDescription("Show ticket panel"),
    new SlashCommandBuilder().setName("site").setDescription("Show Noxen site"),
    new SlashCommandBuilder().setName("contact").setDescription("Show contact email")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async () => {
    try {
        console.log("🔹 Registering global commands...");
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("✅ Global commands registered!");
    } catch (err) { console.error(err); }
})();

// ---------- Ready ----------
client.once(Events.ClientReady, () => console.log(`Bot online: ${client.user.tag}`));

// ---------- Função de IA ----------
async function getAIResponse(userId, message) {
    if (!conversations.has(userId)) conversations.set(userId, []);
    const history = conversations.get(userId);

    history.push({ role: "user", content: message });
    if (history.length > 10) history.shift();

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Você é o assistente oficial da Noxen Studios.
A Noxen Studios desenvolve jogos criativos para Roblox.
Responda sempre de forma educada, profissional e no idioma do usuário.`
                },
                ...history
            ]
        });

        const reply = completion.choices[0].message.content.trim();

        if (lastReplies.get(userId) === reply) return null;
        lastReplies.set(userId, reply);

        history.push({ role:"assistant", content: reply });
        conversations.set(userId, history);

        return reply;
    } catch (err) {
        console.error("❌ Erro OpenAI:", err);
        return "⚠️ Erro ao gerar resposta. Confira a chave API ou tente novamente mais tarde.";
    }
}

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async interaction => {
    const userId = interaction.user.id;

    // Slash Commands
    if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
            case "ia":
                const menu = new StringSelectMenuBuilder()
                    .setCustomId("ia_options")
                    .setPlaceholder("Select an option")
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel("Continue Chat").setValue("continue"),
                        new StringSelectMenuOptionBuilder().setLabel("New Chat").setValue("new"),
                        new StringSelectMenuOptionBuilder().setLabel("Reset Chat").setValue("reset")
                    );
                return interaction.reply({ content: "💬 Noxen AI Options", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
            case "ticket_panel":
                const button = new ButtonBuilder()
                    .setCustomId("open_ticket")
                    .setLabel("🎫 Open Ticket")
                    .setStyle(ButtonStyle.Primary);
                return interaction.reply({ content: "🎫 Noxen Studios Support Panel\nClick the button to open a ticket.", components: [new ActionRowBuilder().addComponents(button)], ephemeral: false });
            case "site":
                return interaction.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");
            case "contact":
                return interaction.reply({ content: "📧 noxenstds@gmail.com", ephemeral: true });
        }
    }

    // IA Select Menu
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "ia_options") {
            switch (interaction.values[0]) {
                case "new":
                case "reset":
                    conversations.set(userId, []);
                    lastReplies.delete(userId);
                    return interaction.update({ content: "🧹 Chat reset.", components: [] });
                case "continue":
                    return interaction.update({ content: "💬 Continue your chat by sending a DM.", components: [] });
            }
        }
    }

    // Ticket Buttons
    if (interaction.isButton()) {
        if (interaction.customId === "open_ticket") {
            if (userTickets.has(userId)) return interaction.reply({ content: `You already have an open ticket: ${userTickets.get(userId)}`, ephemeral: true });

            const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
            const channel = await interaction.guild.channels.create({
                name: `ticket-${safeName}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            userTickets.set(userId, channel);
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("add_user").setLabel("Add User").setStyle(ButtonStyle.Secondary)
                );

            await channel.send({ content: `🎫 Ticket opened by ${interaction.user}`, components: [row] });
            return interaction.reply({ content: `✅ Your ticket has been created: ${channel}`, ephemeral: true });
        }

        if (interaction.customId === "close_ticket") {
            if (interaction.channel.type === ChannelType.GuildText) {
                await interaction.channel.delete();
                userTickets.forEach((ch, uid) => { if (ch.id === interaction.channel.id) userTickets.delete(uid); });
            }
        }
    }
});

// ---------- DMs ----------
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (message.guild) return; // Somente DMs

    if (respondedMessages.has(message.id)) return;
    respondedMessages.add(message.id);

    const reply = await getAIResponse(message.author.id, message.content);
    if (reply) await message.channel.send(reply);
});

// ---------- Login ----------
client.login(DISCORD_TOKEN);
