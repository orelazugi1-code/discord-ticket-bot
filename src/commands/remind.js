const { SlashCommandBuilder } = require('discord.js');
function parseMs(str) {
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption(o => o.setName('time').setDescription('When e.g. 10m, 2h, 1d').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Reminder message').setRequired(true)),
  async execute(interaction) {
    const timeStr = interaction.options.getString('time');
    const msg = interaction.options.getString('message');
    const ms = parseMs(timeStr);
    if (!ms) return interaction.reply({ content: '❌ Use: `30m`, `2h`, `1d`', ephemeral: true });
    if (ms > 7 * 86400000) return interaction.reply({ content: '❌ Max reminder is 7 days.', ephemeral: true });
    await interaction.reply({ content: `⏰ Reminder set! I will remind you in **${timeStr}**.`, ephemeral: true });
    setTimeout(async () => {
      try { await interaction.user.send(`⏰ **Reminder:** ${msg}`); }
      catch { await interaction.channel?.send(`⏰ <@${interaction.user.id}> **Reminder:** ${msg}`).catch(() => {}); }
    }, ms);
  },
};