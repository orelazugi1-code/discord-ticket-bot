const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a user')
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }))
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  async execute(interaction) {
    const action = interaction.options.getString('action');
    const member = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    if (action === 'add') { await member.roles.add(role); await interaction.reply({ content: `✅ Added **${role.name}** to ${member}.`, ephemeral: true }); }
    else { await member.roles.remove(role); await interaction.reply({ content: `✅ Removed **${role.name}** from ${member}.`, ephemeral: true }); }
  },
};