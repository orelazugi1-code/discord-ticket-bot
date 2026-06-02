const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-stats')
    .setDescription('View ticket statistics for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction, db) {
    const stats    = db.getTicketStats(interaction.guild.id);
    const commands = db.getCustomCommands(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setTitle('📊 Ticket Statistics')
      .setColor(0x5865F2)
      .addFields(
        { name: '🎫 Total Tickets',    value: String(stats.total        ?? 0), inline: true },
        { name: '🟢 Open',             value: String(stats.open_count  ?? 0), inline: true },
        { name: '🔴 Closed',           value: String(stats.closed_count ?? 0), inline: true },
        { name: '📋 Custom Commands',  value: String(commands.length),    inline: true },
      )
      .setTimestamp()
      .setFooter({ text: interaction.guild.name });

    await interaction.reply({ embeds: [embed] });
  },
};
