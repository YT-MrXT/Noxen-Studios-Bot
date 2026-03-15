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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require("discord.js");

const OpenAI = require("openai");
const franc = require("franc"); // Detect language
const express = require("express");

// ---------- Config ----------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error("❌ DISCORD_TOKEN or CLIENT_ID not defined!");
    process.exit(1);
}

// ---------- OpenAI ----------
let openai;
if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log("✅ OpenAI activated");
} else {
    console.log("⚠️ OpenAI not set, bot will work without AI");
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

// ---------- Storage ----------
const conversations = new Map(); // userId => [{role, content}]
const userTickets = new Map();
const lastReplies = new Map(); // userId => last reply content

// ---------- Express ----------
const app = express();
app.get("/", (req, res) => res.send("Noxen Studios Bot Online"));
app.listen(process.env.PORT || 3000, () => console.log("Server running"));

// ---------- Slash Commands ----------
const commands = [
    new SlashCommandBuilder()
        .setName("ia")
        .setDescription("Talk to Noxen AI"),
    new SlashCommandBuilder()
        .setName("ticket_panel")
        .setDescription("Show ticket panel"),
    new SlashCommandBuilder()
        .setName("newchat")
        .setDescription("Reset AI chat"),
    new SlashCommandBuilder()
        .setName("site")
        .setDescription("Show Noxen site"),
    new SlashCommandBuilder()
        .setName("contact")
        .setDescription("Show contact email")
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

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async interaction => {

    // ---------- Slash Commands ----------
    if (interaction.isChatInputCommand()) {
        const userId = interaction.user.id;
        if (!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        switch (interaction.commandName) {
            case "newchat":
                conversations.set(userId, []);
                lastReplies.delete(userId);
                return interaction.reply("🧹 Chat reset.");

            case "site":
                return interaction.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");

            case "contact":
                return interaction.reply({ content: "📧 noxenstds@gmail.com", ephemeral: true });

            case "ticket_panel":
                const button = new ButtonBuilder()
                    .setCustomId("open_ticket")
                    .setLabel("🎫 Open Ticket")
                    .setStyle(ButtonStyle.Primary);
                const row = new ActionRowBuilder().addComponents(button);
                return interaction.reply({
                    content: "🎫 Noxen Studios Support Panel\nClick the button to open a ticket.",
                    components: [row],
                    ephemeral: false
                });

            case "ia":
                const menu = new StringSelectMenuBuilder()
                    .setCustomId("ia_options")
                    .setPlaceholder("Select an option")
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel("Continue Chat").setValue("continue"),
                        new StringSelectMenuOptionBuilder().setLabel("New Chat").setValue("new"),
                        new StringSelectMenuOptionBuilder().setLabel("Reset Chat").setValue("reset")
                    );
                const menuRow = new ActionRowBuilder().addComponents(menu);
                return interaction.reply({ content: "💬 Noxen AI Options", components: [menuRow], ephemeral: true });
        }
    }

    // ---------- Select Menu ----------
    if (interaction.isStringSelectMenu()) {
        const userId = interaction.user.id;
        if (!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        switch (interaction.values[0]) {
            case "new":
            case "reset":
                conversations.set(userId, []);
                lastReplies.delete(userId);
                return interaction.update({ content: "🧹 Chat reset.", components: [] });
            case "continue":
                return interaction.update({ content: "💬 Continue your chat by sending a DM or using /ia again.", components: [] });
        }
    }

    // ---------- Buttons ----------
    if (interaction.isButton()) {
        const userId = interaction.user.id;

        // Open Ticket
        if (interaction.customId === "open_ticket") {
            if (userTickets.has(userId)) {
                const channel = userTickets.get(userId);
                return interaction.reply({ content: `You already have an open ticket: ${channel}`, ephemeral: true });
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

                const closeButton = new ButtonBuilder()
                    .setCustomId("close_ticket")
                    .setLabel("Close Ticket")
                    .setStyle(ButtonStyle.Danger);

                const addUserButton = new ButtonBuilder()
                    .setCustomId("add_user")
                    .setLabel("Add User")
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder().addComponents(closeButton, addUserButton);

                await channel.send({
                    content: `🎫 Ticket opened by ${interaction.user}. Explain your issue and the Noxen team will respond.`,
                    components: [row]
                });

                return interaction.reply({ content: `✅ Your ticket has been created: ${channel}`, ephemeral: true });

            } catch (err) {
                console.error("❌ Failed to create ticket:", err);
                return interaction.reply({ content: "❌ Failed to create ticket.", ephemeral: true });
            }
        }

        // Close Ticket
        if (interaction.customId === "close_ticket") {
            if (interaction.channel.type === ChannelType.GuildText) {
                await interaction.channel.delete();
                userTickets.forEach((ch, uid) => {
                    if (ch.id === interaction.channel.id) userTickets.delete(uid);
                });
            }
        }

        // Add User
        if (interaction.customId === "add_user") {
            const modal = new ModalBuilder()
                .setCustomId("add_user_modal")
                .setTitle("Add User to Ticket");

            const input = new TextInputBuilder()
                .setCustomId("user_to_add")
                .setLabel("Enter User ID or mention")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("@username")
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }
    }

    // ---------- Modal Submit ----------
    if (interaction.isModalSubmit()) {
        if (interaction.customId === "add_user_modal") {
            const userInput = interaction.fields.getTextInputValue("user_to_add");

            try {
                let userToAdd;
                if (userInput.match(/^<@!?(\d+)>$/)) {
                    const id = userInput.match(/^<@!?(\d+)>$/)[1];
                    userToAdd = await interaction.guild.members.fetch(id);
                } else {
                    userToAdd = await interaction.guild.members.fetch(userInput);
                }

                if (!userToAdd) return interaction.reply({ content: "❌ User not found.", ephemeral: true });

                await interaction.channel.permissionOverwrites.edit(userToAdd.id, { ViewChannel: true });
                return interaction.reply({ content: `✅ ${userToAdd.user.tag} added to the ticket.`, ephemeral: true });

            } catch (err) {
                console.error("❌ Failed to add user:", err);
                return interaction.reply({ content: "❌ Failed to add user.", ephemeral: true });
            }
        }
    }
});

// ---------- DMs ----------
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (message.guild) return;

    const userId = message.author.id;
    if (!conversations.has(userId)) conversations.set(userId, []);
    const history = conversations.get(userId);

    // Detect language
    const lang = franc(message.content) || "eng";

    history.push({ role: "user", content: message.content });
    while (history.length > 10) history.shift();

    if (!openai) return message.reply("💬 AI not available.");

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: `You are the official Noxen Studios assistant. Detect user language and reply in same language (${lang}).` },
                ...history
            ]
        });

        const reply = completion.choices[0].message.content;

        // Prevent duplicates
        if (lastReplies.get(userId) === reply) return;
        lastReplies.set(userId, reply);

        await message.reply(reply);
        history.push({ role: "assistant", content: reply });

    } catch (err) {
        console.error("⚠️ OpenAI failed:", err);
        await message.reply("⚠️ Failed to generate AI response. Check your API key or try later.");
    }
});

// ---------- Login ----------
client.login(DISCORD_TOKEN);
