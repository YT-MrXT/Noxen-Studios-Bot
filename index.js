const {
Client, GatewayIntentBits, Partials, Events,
ChannelType, PermissionsBitField,
ActionRowBuilder, ButtonBuilder, ButtonStyle,
StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
SlashCommandBuilder, REST, Routes
} = require("discord.js");

const Groq = require("groq-sdk");
const express = require("express");

// CONFIG
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// CHECK
if (!DISCORD_TOKEN || !CLIENT_ID) {
console.error("Missing token or client id");
process.exit(1);
}

// CLIENT
const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.DirectMessages
],
partials:[Partials.Channel]
});

// GROQ
let groq=null;

if(GROQ_API_KEY){
groq=new Groq({apiKey:GROQ_API_KEY});
console.log("Groq AI loaded");
}

// EXPRESS (Render keep alive)
const app=express();
app.get("/",(req,res)=>res.send("Noxen Bot Online"));
app.listen(3000);

// STORAGE
const conversations=new Map();
const cooldown=new Map();
const userTickets=new Map();

// COMMANDS
const commands=[
new SlashCommandBuilder().setName("ia").setDescription("Open AI menu"),
new SlashCommandBuilder().setName("ticket_panel").setDescription("Open ticket panel"),
new SlashCommandBuilder().setName("site").setDescription("Show website"),
new SlashCommandBuilder().setName("contact").setDescription("Contact email")
].map(c=>c.toJSON());

const rest=new REST({version:"10"}).setToken(DISCORD_TOKEN);

(async()=>{
try{
console.log("Registering commands...");
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});
console.log("Commands registered");
}catch(e){console.error(e);}
})();

// READY
client.once(Events.ClientReady,()=>{
console.log(`Bot ready ${client.user.tag}`);
});

// AI FUNCTION
async function getAIResponse(userId,msg){

if(!groq) return "AI not configured.";

if(!conversations.has(userId))
conversations.set(userId,[]);

const history=conversations.get(userId);

history.push({role:"user",content:msg});
if(history.length>8)history.shift();

try{

const completion=await groq.chat.completions.create({
model:"llama-3.3-70b-versatile",
messages:[
{
role:"system",
content:`You are the assistant of Noxen Studios.
Noxen Studios makes Roblox games.
Always respond politely and in the user's language.`
},
...history
]
});

const reply=completion.choices[0].message.content;

history.push({role:"assistant",content:reply});

return reply;

}catch(err){

console.error("Groq error",err);
return "AI error occurred.";

}

}

// INTERACTIONS
client.on(Events.InteractionCreate,async interaction=>{

try{

const userId=interaction.user.id;

if(interaction.isChatInputCommand()){

switch(interaction.commandName){

case "ia":

const menu=new StringSelectMenuBuilder()
.setCustomId("ai_menu")
.setPlaceholder("AI Options")
.addOptions(
{label:"Continue Chat",value:"continue"},
{label:"New Chat",value:"new"},
{label:"Reset Chat",value:"reset"}
);

return interaction.reply({
content:"AI Menu",
components:[new ActionRowBuilder().addComponents(menu)],
ephemeral:true
});

case "ticket_panel":

const button=new ButtonBuilder()
.setCustomId("open_ticket")
.setLabel("Open Ticket")
.setStyle(ButtonStyle.Primary);

return interaction.reply({
content:"Support Panel",
components:[new ActionRowBuilder().addComponents(button)]
});

case "site":
return interaction.reply("https://noxenstd.wixsite.com/noxen-studios");

case "contact":
return interaction.reply({content:"noxenstds@gmail.com",ephemeral:true});

}

}

if(interaction.isStringSelectMenu()){

switch(interaction.values[0]){

case "new":
case "reset":

conversations.set(userId,[]);

return interaction.update({
content:"Chat reset",
components:[]
});

case "continue":

return interaction.update({
content:"Send me a DM to talk.",
components:[]
});

}

}

if(interaction.isButton()){

if(interaction.customId==="open_ticket"){

if(userTickets.has(userId))
return interaction.reply({content:"You already have a ticket.",ephemeral:true});

const safe=interaction.user.username.replace(/[^a-zA-Z0-9]/g,"-");

const channel=await interaction.guild.channels.create({
name:`ticket-${safe}`,
type:ChannelType.GuildText,
permissionOverwrites:[
{id:interaction.guild.id,deny:[PermissionsBitField.Flags.ViewChannel]},
{id:interaction.user.id,allow:[PermissionsBitField.Flags.ViewChannel]}
]
});

userTickets.set(userId,channel);

const row=new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId("close_ticket")
.setLabel("Close")
.setStyle(ButtonStyle.Danger)
);

await channel.send({
content:`Ticket opened by ${interaction.user}`,
components:[row]
});

return interaction.reply({content:`Ticket created ${channel}`,ephemeral:true});

}

if(interaction.customId==="close_ticket"){

await interaction.channel.delete();

userTickets.forEach((c,u)=>{
if(c.id===interaction.channel.id)userTickets.delete(u);
});

}

}

}catch(err){

console.error("Interaction error",err);

if(!interaction.replied)
interaction.reply({content:"Error occurred.",ephemeral:true}).catch(()=>{});

}

});

// DM AI
client.on(Events.MessageCreate,async message=>{

if(message.author.bot) return;
if(message.guild) return;

const userId=message.author.id;

const now=Date.now();

if(cooldown.has(userId) && now-cooldown.get(userId)<2000)
return;

cooldown.set(userId,now);

const reply=await getAIResponse(userId,message.content);

if(reply)
message.channel.send(reply);

});

// ERROR PROTECTION
process.on("unhandledRejection",console.error);
process.on("uncaughtException",console.error);

// LOGIN
client.login(DISCORD_TOKEN);
// ---------- Groq ----------
let groq = null;

if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
  console.log("🔹 Groq AI carregada!");
} else {
  console.warn("⚠️ GROQ_API_KEY não definida. IA desativada.");
}

// ---------- Express ----------
const app = express();
app.get("/", (req,res)=>res.send("🤖 Noxen Studios Bot Online"));
app.listen(3000, ()=>console.log("Servidor web ativo..."));

// ---------- Storage ----------
const conversations = new Map();
const lastReplies = new Map();
const respondedMessages = new Set();
const userTickets = new Map();

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
    console.log("🔹 Registrando comandos globais...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Comandos registrados!");
  } catch (err) {
    console.error("❌ Erro ao registrar comandos:", err);
  }
})();

// ---------- Ready ----------
client.once(Events.ClientReady, () => {
  console.log(`Bot online: ${client.user.tag}`);
});

// ---------- Função IA ----------
async function getAIResponse(userId, message) {

  if (!groq) return "⚠️ AI is currently disabled.";

  if (!conversations.has(userId)) conversations.set(userId, []);
  const history = conversations.get(userId);

  history.push({ role: "user", content: message });

  if (history.length > 10) history.shift();

  try {

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are the official assistant of Noxen Studios.
Noxen Studios develops Roblox games.

Website:
https://noxenstd.wixsite.com/noxen-studios

Always respond politely and professionally.
Respond in the same language as the user.`
        },
        ...history
      ]
    });

    const reply = completion.choices[0].message.content.trim();

    if (lastReplies.get(userId) === reply) return null;

    lastReplies.set(userId, reply);
    history.push({ role: "assistant", content: reply });

    return reply;

  } catch (err) {

    console.error("❌ Groq error:", err);
    return "⚠️ AI error occurred.";

  }
}

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async interaction => {

  const userId = interaction.user.id;

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

        return interaction.reply({
          content:"💬 Noxen AI Options",
          components:[new ActionRowBuilder().addComponents(menu)],
          ephemeral:true
        });

      case "ticket_panel":

        const button = new ButtonBuilder()
          .setCustomId("open_ticket")
          .setLabel("🎫 Open Ticket")
          .setStyle(ButtonStyle.Primary);

        return interaction.reply({
          content:"🎫 Noxen Studios Support Panel\nClick the button to open a ticket.",
          components:[new ActionRowBuilder().addComponents(button)]
        });

      case "site":
        return interaction.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");

      case "contact":
        return interaction.reply({
          content:"📧 noxenstds@gmail.com",
          ephemeral:true
        });

    }

  }

  // ---------- Menu IA ----------
  if (interaction.isStringSelectMenu() && interaction.customId === "ia_options") {

    switch (interaction.values[0]) {

      case "new":
      case "reset":
        conversations.set(userId, []);
        lastReplies.delete(userId);
        return interaction.update({
          content:"🧹 Chat reset.",
          components:[]
        });

      case "continue":
        return interaction.update({
          content:"💬 Continue your chat by sending a DM.",
          components:[]
        });

    }

  }

  // ---------- Tickets ----------
  if (interaction.isButton()) {

    if (interaction.customId === "open_ticket") {

      if (userTickets.has(userId))
        return interaction.reply({
          content:"You already have an open ticket.",
          ephemeral:true
        });

      const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g,"-").toLowerCase();

      const channel = await interaction.guild.channels.create({
        name:`ticket-${safeName}`,
        type:ChannelType.GuildText,
        permissionOverwrites:[
          {id:interaction.guild.id,deny:[PermissionsBitField.Flags.ViewChannel]},
          {id:interaction.user.id,allow:[PermissionsBitField.Flags.ViewChannel]}
        ]
      });

      userTickets.set(userId,channel);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId("close_ticket").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content:`🎫 Ticket opened by ${interaction.user}`,
        components:[row]
      });

      return interaction.reply({
        content:`✅ Your ticket has been created: ${channel}`,
        ephemeral:true
      });

    }

    if (interaction.customId === "close_ticket") {

      if (interaction.channel.type === ChannelType.GuildText) {

        await interaction.channel.delete();

        userTickets.forEach((ch,uid)=>{
          if(ch.id===interaction.channel.id) userTickets.delete(uid);
        });

      }

    }

  }

});

// ---------- DMs IA ----------
client.on(Events.MessageCreate, async message => {

  if (message.author.bot) return;
  if (message.guild) return;

  if (respondedMessages.has(message.id)) return;
  respondedMessages.add(message.id);

  const reply = await getAIResponse(message.author.id, message.content);

  if (reply) await message.channel.send(reply);

});

// ---------- Login ----------
client.login(DISCORD_TOKEN);
