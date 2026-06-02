const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { calculateLevel } = require('../utils/levels');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('give-xp')
    .setDescription('Give XP to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('XP amount').setRequired(true).setMinValue(1).setMaxValue(1000000))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, db) {
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const updated = db.addXp(interaction.guild.id, user.id, amount);
    const { level } = calculateLevel(updated.xp);
    if (level > updated.level) db.updateLevel(interaction.guild.id, user.id, level);
    await interaction.reply({ content: `✅ Gave **${amount} XP** to ${user}. Total: **${updated.xp} XP** (Level ${level}).`, ephemeral: true });
  },
};