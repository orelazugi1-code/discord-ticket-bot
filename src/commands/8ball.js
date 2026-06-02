const { SlashCommandBuilder } = require('discord.js');
const ANSWERS = [
  'It is certain.','It is decidedly so.','Without a doubt.','Yes, definitely.',
  'You may rely on it.','As I see it, yes.','Most likely.','Outlook good.','Yes.',
  "Reply hazy, try again.",'Ask again later.',"Better not tell you now.","Cannot predict now.",
  "Don't count on it.",'My reply is no.','My sources say no.','Outlook not so good.','Very doubtful.',
];
module.exports = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  async execute(interaction) {
    const q = interaction.options.getString('question');
    await interaction.reply(`🎱 **${q}**\n${ANSWERS[Math.floor(Math.random() * ANSWERS.length)]}`);
  },
};