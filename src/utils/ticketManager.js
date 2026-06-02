const { EmbedBuilder } = require('discord.js');
const { generateTranscript } = require('./transcript');

async function closeTicketChannel(channel, ticket, closer, db, reason = 'No reason provided') {
  try {
    const transcriptPath = await generateTranscript(ticket, db);
    db.closeTicket(channel.id, closer.id, transcriptPath);

    const config = db.getGuildConfig(channel.guild.id);
    if (config.log_channel_id) {
      const logChannel = channel.guild.channels.cache.get(config.log_channel_id);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🔒 Ticket Closed')
          .setColor(0xED4245)
          .addFields(
            { name: 'Channel',    value: `#${channel.name}`,    inline: true },
            { name: 'Opened By', value: `<@${ticket.user_id}>`, inline: true },
            { name: 'Closed By', value: `<@${closer.id}>`,      inline: true },
            { name: 'Subject',   value: ticket.subject },
            { name: 'Reason',    value: reason },
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    }

    await channel.delete(`Ticket #${ticket.id} closed by ${closer.username}`);
  } catch (err) {
    console.error('Error closing ticket:', err);
  }
}

module.exports = { closeTicketChannel };
