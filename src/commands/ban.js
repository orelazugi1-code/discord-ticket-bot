const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban').setMaxLength(512))
    .addIntegerOption(o => o.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7)),

  async execute(interaction, db) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: '❌ I cannot ban this user (missing permissions or higher role).', ephemeral: true });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot ban yourself.', ephemeral: true });

    try {
      await target.send(`You have been **banned** from **${interaction.guild.name}**.\nReason: ${reason}`).catch(() => {});
      await target.ban({ deleteMessageSeconds: deleteDays * 86400, reason: `${interaction.user.tag}: ${reason}` });

      const config = db.getGuildConfig(interaction.guild.id);
      if (config.log_channel_id) {
        const logCh = interaction.guild.channels.cache.get(config.log_channel_id);
        if (logCh) await logCh.send({
          embeds: [new EmbedBuilder()
            .setTitle('🔨 Member Banned')
            .setColor(0xED4245)
            .addFields(
              { name: 'User',      value: `${target.user.tag} (<@${target.id}>)`, inline: true },
              { name: 'Moderator', value: `<@${interaction.user.id}>`,             inline: true },
              { name: 'Reason',    value: reason },
            )
            .setTimestamp()],
        });
      }

      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`🔨 **${target.user.tag}** has been banned.\nReason: ${reason}`)] });
    } catch (err) {
      console.error('Ban error:', err);
      await interaction.reply({ content: '❌ Failed to ban the user.', ephemeral: true });
    }
  },
};
