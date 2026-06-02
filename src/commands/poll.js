const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const NUMS = ['1️⃣','2️⃣','3️⃣','4️⃣'];
module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1 (default: Yes)'))
    .addStringOption(o => o.setName('option2').setDescription('Option 2 (default: No)'))
    .addStringOption(o => o.setName('option3').setDescription('Option 3'))
    .addStringOption(o => o.setName('option4').setDescription('Option 4')),
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const opts = [
      interaction.options.getString('option1') || '✅ Yes',
      interaction.options.getString('option2') || '❌ No',
      interaction.options.getString('option3'),
      interaction.options.getString('option4'),
    ].filter(Boolean);
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription(opts.map((o, i) => `${NUMS[i]} ${o}`).join('\n\n'))
      .setColor(0x5865f2)
      .setFooter({ text: `Poll by ${interaction.user.tag}` });
    await interaction.reply({ embeds: [embed] });
    const msg = await interaction.fetchReply();
    for (let i = 0; i < opts.length; i++) await msg.react(NUMS[i]).catch(() => {});
  },
};