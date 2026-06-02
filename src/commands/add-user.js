const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-user')
    .setDescription('Add a user to this ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)),

  async execute(interaction, db) {
    const ticket = db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });

    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.create(user, {
      ViewChannel:        true,
      SendMessages:       true,
      ReadMessageHistory: true,
    });
    db.addTicketUser(ticket.id, user.id);
    await interaction.reply({ content: `✅ Added ${user} to the ticket.` });
  },
};
