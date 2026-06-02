const { SlashCommandBuilder } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice (e.g. 2d6, d20)')
    .addStringOption(o => o.setName('dice').setDescription('Dice notation, default 1d6')),
  async execute(interaction) {
    const input = interaction.options.getString('dice') || '1d6';
    const m = input.match(/^(\d*)d(\d+)$/i);
    if (!m) return interaction.reply({ content: '❌ Use format like `2d6` or `d20`.', ephemeral: true });
    const count = Math.min(parseInt(m[1] || '1'), 10);
    const sides = Math.min(parseInt(m[2]), 10000);
    if (sides < 2) return interaction.reply({ content: '❌ Dice need at least 2 sides.', ephemeral: true });
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    await interaction.reply(`🎲 ${input}: ${count > 1 ? `[${rolls.join(', ')}] = **${total}**` : `**${rolls[0]}**`}`);
  },
};