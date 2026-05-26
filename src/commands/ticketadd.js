const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketadd')
    .setDescription('Add a user to the current ticket')
    .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, db) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket || ticket.status !== 'open') return interaction.reply({ content: '❌ This is not an open ticket channel.', ephemeral: true });
    const member = interaction.options.getMember('user');
    await interaction.channel.permissionOverwrites.edit(member, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    await interaction.reply(`✅ Added ${member} to this ticket.`);
  },
};