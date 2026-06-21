const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-level-role')
    .setDescription('Assign a role that is automatically given when a user reaches a level')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s
      .setName('set')
      .setDescription('Set a role reward for a level')
      .addIntegerOption(o => o.setName('level').setDescription('Level that triggers the reward').setRequired(true).setMinValue(1).setMaxValue(500))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove the role reward for a level')
      .addIntegerOption(o => o.setName('level').setDescription('Level to remove reward from').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all level role rewards')),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **פיצ'ר Premium!** כתבו /shop לפרטים.', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const level = interaction.options.getInteger('level');
      const role  = interaction.options.getRole('role');
      db.setLevelRole(interaction.guild.id, level, role.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ <@&${role.id}> will now be assigned when users reach level **${level}**.`)], ephemeral: true });

    } else if (sub === 'remove') {
      const level = interaction.options.getInteger('level');
      db.deleteLevelRole(interaction.guild.id, level);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Removed level role reward for level **${level}**.`)], ephemeral: true });

    } else {
      const roles = db.getLevelRoles(interaction.guild.id);
      const embed = new EmbedBuilder().setTitle('⭐ Level Role Rewards').setColor(0x5865F2);
      if (roles.length === 0) {
        embed.setDescription('No level roles configured. Use `/set-level-role set` to add one.');
      } else {
        embed.setDescription(roles.map(r => `Level **${r.level}** → <@&${r.role_id}>`).join('\n'));
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
