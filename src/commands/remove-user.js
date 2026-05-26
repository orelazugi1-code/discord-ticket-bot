const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-user')
    .setDescription('Remove a user from this ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)),

  async execute(interaction, db) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });

    const user = interaction.options.getUser('user');
    if (user.id === ticket.user_id) {
      return interaction.reply({ content: '❌ Cannot remove the ticket owner.', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.delete(user);
    db.removeTicketUser(ticket.id, user.id);
    await interaction.reply({ content: `✅ Removed ${user} from the ticket.` });
  },
};
