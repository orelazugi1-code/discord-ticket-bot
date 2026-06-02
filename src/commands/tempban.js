const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
function parseMs(str) {
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  return parseInt(m[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a user')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 1h, 7d').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const durStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const ms = parseMs(durStr);
    if (!ms) return interaction.reply({ content: '❌ Use: `1h`, `7d`', ephemeral: true });
    await interaction.guild.members.ban(user, { reason });
    await interaction.reply({ content: `🔨 **${user.tag}** has been temporarily banned for **${durStr}**. Reason: ${reason}`, ephemeral: true });
    setTimeout(async () => {
      await interaction.guild.members.unban(user.id, 'Temporary ban expired').catch(() => {});
    }, ms);
  },
};