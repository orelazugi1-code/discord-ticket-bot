const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketremove')
    .setDescription('Remove a user from the current ticket')
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction, db) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket || ticket.status !== 'open') return interaction.reply({ content: '❌ This is not an open ticket channel.', ephemeral: true });
    const member = interaction.options.getMember('user');
    await interaction.channel.permissionOverwrites.delete(member);
    await interaction.reply({ content: `✅ Removed ${member} from this ticket.`, ephemeral: true });
  },
};