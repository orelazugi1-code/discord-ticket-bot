const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { calculateLevel } = require('../utils/levels');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-xp')
    .setDescription('Remove XP from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('XP to remove').setRequired(true).setMinValue(1).setMaxValue(1000000))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction, db) {
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const cur = db.getLevel(interaction.guild.id, user.id);
    const newXp = Math.max(0, (cur?.xp || 0) - amount);
    db.setXp(interaction.guild.id, user.id, newXp);
    const { level } = calculateLevel(newXp);
    db.updateLevel(interaction.guild.id, user.id, level);
    await interaction.reply({ content: `✅ Removed **${amount} XP** from ${user}. Total: **${newXp} XP** (Level ${level}).`, ephemeral: true });
  },
};