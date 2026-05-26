const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the kick').setMaxLength(512)),

  async execute(interaction, db) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    if (!target) return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
    if (!target.kickable) return interaction.reply({ content: '❌ I cannot kick this user.', ephemeral: true });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot kick yourself.', ephemeral: true });

    try {
      await target.send(`You have been **kicked** from **${interaction.guild.name}**.\nReason: ${reason}`).catch(() => {});
      await target.kick(`${interaction.user.tag}: ${reason}`);

      const config = db.getGuildConfig(interaction.guild.id);
      if (config.log_channel_id) {
        const logCh = interaction.guild.channels.cache.get(config.log_channel_id);
        if (logCh) await logCh.send({
          embeds: [new EmbedBuilder()
            .setTitle('👢 Member Kicked')
            .setColor(0xFAA61A)
            .addFields(
              { name: 'User',      value: `${target.user.tag} (<@${target.id}>)`, inline: true },
              { name: 'Moderator', value: `<@${interaction.user.id}>`,             inline: true },
              { name: 'Reason',    value: reason },
            )
            .setTimestamp()],
        });
      }

      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFAA61A).setDescription(`👢 **${target.user.tag}** has been kicked.\nReason: ${reason}`)] });
    } catch (err) {
      console.error('Kick error:', err);
      await interaction.reply({ content: '❌ Failed to kick the user.', ephemeral: true });
    }
  },
};
