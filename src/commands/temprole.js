const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
function parseDuration(str) {
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const v = parseInt(m[1]);
  return { m: '60000', h: '3600000', d: '86400000', s: '1000' }[m[2].toLowerCase()] * v;
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Give a temporary role to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 30m, 2h, 7d').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction, db) {
    const member = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    const durStr = interaction.options.getString('duration');
    const ms = parseDuration(durStr);
    if (!ms) return interaction.reply({ content: '❌ Invalid duration. Use: `30m`, `2h`, `7d`', ephemeral: true });
    const expiresAt = new Date(Date.now() + ms).toISOString();
    await member.roles.add(role);
    db.addTempRole(interaction.guild.id, member.id, role.id, expiresAt);
    await interaction.reply({ content: `✅ Gave **${role.name}** to ${member} for **${durStr}**.`, ephemeral: true });
  },
};