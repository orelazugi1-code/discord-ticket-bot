const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { calculateLevel } = require('../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top 10 XP leaderboard for this server'),

  async execute(interaction, db) {
    await interaction.deferReply();

    const rows = db.getLeaderboard(interaction.guild.id);
    if (rows.length === 0) {
      return interaction.editReply('No XP data yet. Start chatting to earn XP!');
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(rows.map(async (row, i) => {
      const { level } = calculateLevel(row.xp);
      let name;
      try {
        const member = await interaction.guild.members.fetch(row.user_id);
        name = member.displayName;
      } catch {
        name = `<@${row.user_id}>`;
      }
      const prefix = medals[i] ?? `**${i + 1}.**`;
      return `${prefix} ${name} — Level **${level}** (${row.xp} XP)`;
    }));

    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${interaction.guild.name} — XP Leaderboard`)
      .setColor(0x5865F2)
      .setDescription(lines.join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Earn XP by chatting!' });

    await interaction.editReply({ embeds: [embed] });
  },
};
