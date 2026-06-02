const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { closeTicketChannel } = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName('reason').setDescription('Reason for closing')),

  async execute(interaction, db) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ content: '❌ This command can only be used inside a ticket channel.', ephemeral: true });
    }
    if (ticket.status === 'closed') {
      return interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
    }

    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    await interaction.reply({ content: `🔒 Closing ticket in 5 seconds…\n**Reason:** ${reason}` });

    setTimeout(() => closeTicketChannel(interaction.channel, ticket, interaction.user, db, reason), 5000);
  },
};
