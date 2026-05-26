const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(512)),

  async execute(interaction, db) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');

    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot warn yourself.', ephemeral: true });

    db.addWarning(interaction.guild.id, target.id, interaction.user.id, reason);
    const total = db.countWarnings(interaction.guild.id, target.id);

    await target.send(`⚠️ You have received a warning in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: **${total}**`).catch(() => {});

    const config = db.getGuildConfig(interaction.guild.id);
    if (config.log_channel_id) {
      const logCh = interaction.guild.channels.cache.get(config.log_channel_id);
      if (logCh) await logCh.send({
        embeds: [new EmbedBuilder()
          .setTitle('⚠️ Member Warned')
          .setColor(0xFAA61A)
          .addFields(
            { name: 'User',           value: `${target.user.tag} (<@${target.id}>)`, inline: true },
            { name: 'Moderator',      value: `<@${interaction.user.id}>`,             inline: true },
            { name: 'Total Warnings', value: String(total),                           inline: true },
            { name: 'Reason',         value: reason },
          )
          .setTimestamp()],
      });
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFAA61A)
        .setDescription(`⚠️ **${target.user.tag}** has been warned.\nReason: ${reason}\nTotal warnings: **${total}**`)],
    });
  },
};
