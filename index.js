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

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
GatewayIntentBits.DirectMessages
],
partials:[Partials.Channel]
});

const openai = new OpenAI({
apiKey:process.env.OPENAI_API_KEY
});

const conversations = new Map();

const app = express();
app.get("/",(req,res)=>res.send("Noxen Studios Bot Online"));
app.listen(process.env.PORT || 3000);

client.once(Events.ClientReady,()=>{
console.log(`Bot online: ${client.user.tag}`);
});

client.on(Events.MessageCreate, async message=>{

if(message.author.bot) return;

const userId = message.author.id;

if(!conversations.has(userId)){
conversations.set(userId,[]);
}

const history = conversations.get(userId);

if(message.content === "/newchat"){
conversations.set(userId,[]);
return message.reply("🧹 Chat reiniciado.");
}

if(message.content === "/site"){
return message.reply("🌐 https://noxenstd.wixsite.com/noxen-studios");
}

if(message.content === "/contact"){
return message.reply("📧 noxenstds@gmail.com");
}

if(message.content === "/ticket"){

const button = new ButtonBuilder()
.setCustomId("open_ticket")
.setLabel("🎫 Abrir Ticket")
.setStyle(ButtonStyle.Primary);

const row = new ActionRowBuilder().addComponents(button);

return message.reply({
content:"🎫 Suporte Noxen Studios\nClique no botão para abrir ticket.",
components:[row]
});

}

history.push({
role:"user",
content:message.content
});

try{

const completion = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:`
Você é o assistente oficial da Noxen Studios.

Empresa que desenvolve jogos Roblox.

Site:
https://noxenstd.wixsite.com/noxen-studios

Email:
noxenstds@gmail.com

Responda em qualquer idioma automaticamente.
`
},
...history
]
});

const reply = completion.choices[0].message.content;

history.push({
role:"assistant",
content:reply
});

if(history.length > 10){
history.shift();
}

message.reply(reply);

}catch(err){

console.log(err);

message.reply("Erro ao gerar resposta.");

}

});

client.on(Events.InteractionCreate, async interaction=>{

if(!interaction.isButton()) return;

if(interaction.customId === "open_ticket"){

const channel = await interaction.guild.channels.create({
name:`ticket-${interaction.user.username}`,
type:ChannelType.GuildText,
permissionOverwrites:[
{
id:interaction.guild.id,
deny:[PermissionsBitField.Flags.ViewChannel]
},
{
id:interaction.user.id,
allow:[PermissionsBitField.Flags.ViewChannel]
}
]
});

await channel.send(
`🎫 Ticket aberto por ${interaction.user}

Explique seu problema e a equipe Noxen responderá.`
);

interaction.reply({
content:`Ticket criado: ${channel}`,
ephemeral:true
});

}

});

client.login(process.env.DISCORD_TOKEN);
