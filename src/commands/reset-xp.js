const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-xp')
    .setDescription("Reset a user's XP and level to zero")
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, db) {
    const user = interaction.options.getUser('user');
    db.setXp(interaction.guild.id, user.id, 0);
    db.updateLevel(interaction.guild.id, user.id, 0);
    await interaction.reply({ content: `✅ Reset XP and level for ${user}.`, ephemeral: true });
  },
};