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

const fetch = require("node-fetch"); // Hugging Face API
const franc = require("franc"); // language detection
const express = require("express");

// ---------- Config ----------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const HF_API_KEY = process.env.HF_API_KEY; // Hugging Face API key
const HF_MODEL = "bigscience/bloomz" // Modelo de chat (pode mudar)

if (!DISCORD_TOKEN || !CLIENT_ID || !HF_API_KEY) {
    console.error("❌ DISCORD_TOKEN, CLIENT_ID ou HF_API_KEY não definido!");
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

// ---------- Storage ----------
const conversations = new Map(); // userId => [{role, content}]
const userTickets = new Map();
const lastReplies = new Map(); // prev reply to avoid duplicates

// ---------- Express ----------
const app = express();
app.get("/", (req,res)=>res.send("Noxen Studios Bot Online"));
app.listen(process.env.PORT || 3000, ()=>console.log("Server running"));

// ---------- Slash Commands ----------
const commands = [
    new SlashCommandBuilder().setName("ia").setDescription("Talk to Noxen AI"),
    new SlashCommandBuilder().setName("ticket_panel").setDescription("Show ticket panel"),
    new SlashCommandBuilder().setName("newchat").setDescription("Reset AI chat"),
    new SlashCommandBuilder().setName("site").setDescription("Show Noxen site"),
    new SlashCommandBuilder().setName("contact").setDescription("Show contact email")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async()=>{
    try{
        console.log("🔹 Registering global commands...");
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("✅ Global commands registered!");
    }catch(err){ console.error(err); }
})();

// ---------- Ready ----------
client.once(Events.ClientReady, ()=>console.log(`Bot online: ${client.user.tag}`));

// ---------- Hugging Face Chat ----------
async function getHFResponse(userId, message, lang="eng") {
    const history = conversations.get(userId) || [];
    history.push({ role: "user", content: message });
    if (history.length>10) history.shift();

    try{
        const res = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${HF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ inputs: message })
        });
        const data = await res.json();
        let reply = data?.generated_text || "⚠️ Failed to generate AI response.";
        if(lastReplies.get(userId)===reply) return null;
        lastReplies.set(userId, reply);
        history.push({ role:"assistant", content: reply });
        conversations.set(userId, history);
        return reply;
    }catch(err){
        console.error("❌ Hugging Face error:", err);
        return "⚠️ Failed to generate AI response.";
    }
}

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async interaction => {

    // Slash Commands
    if(interaction.isChatInputCommand()){
        const userId = interaction.user.id;
        if(!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);

        switch(interaction.commandName){
            case "newchat":
                conversations.set(userId, []);
                lastReplies.delete(userId);
                return interaction.reply("🧹 Chat reset.");
            case "site":
                return interaction.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");
            case "contact":
                return interaction.reply({ content:"📧 noxenstds@gmail.com", ephemeral:true });
            case "ticket_panel":
                const button = new ButtonBuilder()
                    .setCustomId("open_ticket")
                    .setLabel("🎫 Open Ticket")
                    .setStyle(ButtonStyle.Primary);
                const row = new ActionRowBuilder().addComponents(button);
                return interaction.reply({ content:"🎫 Noxen Studios Support Panel\nClick the button to open a ticket.", components:[row], ephemeral:false });
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
                return interaction.reply({ content:"💬 Noxen AI Options", components:[menuRow], ephemeral:true });
        }
    }

    // Select Menu
    if(interaction.isStringSelectMenu()){
        const userId = interaction.user.id;
        if(!conversations.has(userId)) conversations.set(userId, []);
        const history = conversations.get(userId);
        switch(interaction.values[0]){
            case "new":
            case "reset":
                conversations.set(userId, []);
                lastReplies.delete(userId);
                return interaction.update({ content:"🧹 Chat reset.", components:[] });
            case "continue":
                return interaction.update({ content:"💬 Continue your chat by sending a DM or using /ia again.", components:[] });
        }
    }

    // Buttons
    if(interaction.isButton()){
        const userId = interaction.user.id;

        if(interaction.customId==="open_ticket"){
            if(userTickets.has(userId)){
                const channel = userTickets.get(userId);
                return interaction.reply({ content:`You already have an open ticket: ${channel}`, ephemeral:true });
            }
            const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g,"-").toLowerCase();
            try{
                const channel = await interaction.guild.channels.create({
                    name:`ticket-${safeName}`,
                    type:ChannelType.GuildText,
                    permissionOverwrites:[
                        { id: interaction.guild.id, deny:[PermissionsBitField.Flags.ViewChannel] },
                        { id: interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel] }
                    ]
                });
                userTickets.set(userId, channel);

                const closeButton = new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger);
                const addUserButton = new ButtonBuilder().setCustomId("add_user").setLabel("Add User").setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(closeButton, addUserButton);

                await channel.send({ content:`🎫 Ticket opened by ${interaction.user}. Explain your issue and the Noxen team will respond.`, components:[row] });

                return interaction.reply({ content:`✅ Your ticket has been created: ${channel}`, ephemeral:true });
            }catch(err){ console.error(err); return interaction.reply({ content:"❌ Failed to create ticket.", ephemeral:true }); }
        }

        if(interaction.customId==="close_ticket"){
            if(interaction.channel.type===ChannelType.GuildText){
                await interaction.channel.delete();
                userTickets.forEach((ch,uid)=>{ if(ch.id===interaction.channel.id) userTickets.delete(uid); });
            }
        }

        if(interaction.customId==="add_user"){
            const modal = new ModalBuilder().setCustomId("add_user_modal").setTitle("Add User to Ticket");
            const input = new TextInputBuilder().setCustomId("user_to_add").setLabel("Enter User ID or mention").setStyle(TextInputStyle.Short).setPlaceholder("@username").setRequired(true);
            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);
            return interaction.showModal(modal);
        }
    }

    // Modal Submit
    if(interaction.isModalSubmit()){
        if(interaction.customId==="add_user_modal"){
            const userInput = interaction.fields.getTextInputValue("user_to_add");
            try{
                let userToAdd;
                if(userInput.match(/^<@!?(\d+)>$/)){
                    const id = userInput.match(/^<@!?(\d+)>$/)[1];
                    userToAdd = await interaction.guild.members.fetch(id);
                }else{
                    userToAdd = await interaction.guild.members.fetch(userInput);
                }
                if(!userToAdd) return interaction.reply({ content:"❌ User not found.", ephemeral:true });
                await interaction.channel.permissionOverwrites.edit(userToAdd.id,{ViewChannel:true});
                return interaction.reply({ content:`✅ ${userToAdd.user.tag} added to the ticket.`, ephemeral:true });
            }catch(err){ console.error(err); return interaction.reply({ content:"❌ Failed to add user.", ephemeral:true }); }
        }
    }

});

// ---------- DMs ----------
client.on(Events.MessageCreate, async message=>{
    if(message.author.bot) return;
    if(message.guild) return;

    const userId = message.author.id;
    if(!conversations.has(userId)) conversations.set(userId, []);
    const lang = franc(message.content) || "eng";

    const reply = await getHFResponse(userId,message.content,lang);
    if(reply) message.reply(reply);
});

// ---------- Login ----------
client.login(DISCORD_TOKEN);
