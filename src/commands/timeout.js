const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const DURATIONS = {
  '60s':   60_000,
  '5m':    5 * 60_000,
  '10m':   10 * 60_000,
  '30m':   30 * 60_000,
  '1h':    3_600_000,
  '6h':    6 * 3_600_000,
  '12h':   12 * 3_600_000,
  '1d':    86_400_000,
  '3d':    3 * 86_400_000,
  '7d':    7 * 86_400_000,
  '28d':   28 * 86_400_000,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration').setRequired(true)
      .addChoices(
        { name: '60 seconds', value: '60s' },
        { name: '5 minutes',  value: '5m'  },
        { name: '10 minutes', value: '10m' },
        { name: '30 minutes', value: '30m' },
        { name: '1 hour',     value: '1h'  },
        { name: '6 hours',    value: '6h'  },
        { name: '12 hours',   value: '12h' },
        { name: '1 day',      value: '1d'  },
        { name: '3 days',     value: '3d'  },
        { name: '7 days',     value: '7d'  },
        { name: '28 days',    value: '28d' },
      ))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(512)),

  async execute(interaction, db) {
    const target   = interaction.options.getMember('user');
    const durKey   = interaction.options.getString('duration');
    const reason   = interaction.options.getString('reason') ?? 'No reason provided';
    const durationMs = DURATIONS[durKey];

    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    if (!target.moderatable) return interaction.reply({ content: '❌ I cannot timeout this user.', ephemeral: true });

    try {
      await target.timeout(durationMs, `${interaction.user.tag}: ${reason}`);

      const config = db.getGuildConfig(interaction.guild.id);
      if (config.log_channel_id) {
        const logCh = interaction.guild.channels.cache.get(config.log_channel_id);
        if (logCh) await logCh.send({
          embeds: [new EmbedBuilder()
            .setTitle('⏱️ Member Timed Out')
            .setColor(0xFAA61A)
            .addFields(
              { name: 'User',      value: `${target.user.tag} (<@${target.id}>)`, inline: true },
              { name: 'Moderator', value: `<@${interaction.user.id}>`,             inline: true },
              { name: 'Duration',  value: durKey,                                  inline: true },
              { name: 'Reason',    value: reason },
            )
            .setTimestamp()],
        });
      }

      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xFAA61A)
          .setDescription(`⏱️ **${target.user.tag}** has been timed out for **${durKey}**.\nReason: ${reason}`)],
      });
    } catch (err) {
      console.error('Timeout error:', err);
      await interaction.reply({ content: '❌ Failed to timeout the user.', ephemeral: true });
    }
  },
};
