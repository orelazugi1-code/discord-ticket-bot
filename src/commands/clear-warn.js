const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear-warn')
    .setDescription('Remove warnings from a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member whose warnings to manage').setRequired(true))
    .addIntegerOption(o => o.setName('id').setDescription('Specific warning ID to remove (omit to clear all)').setMinValue(1)),

  async execute(interaction, db) {
    const target = interaction.options.getUser('user');
    const warnId = interaction.options.getInteger('id');

    if (warnId) {
      const warn = db.getWarningById(warnId);
      if (!warn || warn.guild_id !== interaction.guild.id || warn.user_id !== target.id) {
        return interaction.reply({ content: `❌ Warning #${warnId} not found for that user.`, ephemeral: true });
      }
      db.deleteWarning(warnId, interaction.guild.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Warning #${warnId} removed from **${target.tag}**.`)] });
    } else {
      db.clearWarnings(interaction.guild.id, target.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ All warnings cleared for **${target.tag}**.`)] });
    }
  },
};
