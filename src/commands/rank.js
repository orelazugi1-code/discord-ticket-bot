const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { calculateLevel } = require('../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your XP rank or another member\'s')
    .addUserOption(o => o.setName('user').setDescription('Member to check (defaults to you)')),

  async execute(interaction, db) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const row    = db.getLevel(interaction.guild.id, target.id);

    if (!row || row.xp === 0) {
      return interaction.reply({ content: `${target.id === interaction.user.id ? 'You haven\'t' : `**${target.username}** hasn't`} earned any XP yet. Start chatting!`, ephemeral: true });
    }

    const { level, currentXp, needed } = calculateLevel(row.xp);
    const percent = Math.floor((currentXp / needed) * 100);
    const bar = buildBar(percent);

    // Rank position
    const lb = db.getLeaderboard(interaction.guild.id);
    const rank = lb.findIndex(r => r.user_id === target.id) + 1;

    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${target.username}'s Rank`)
      .setColor(0x5865F2)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Level',    value: String(level),       inline: true },
        { name: 'Total XP', value: String(row.xp),      inline: true },
        { name: 'Rank',     value: rank ? `#${rank}` : 'Unranked', inline: true },
        { name: `Progress to Level ${level + 1} (${percent}%)`, value: bar },
      )
      .setFooter({ text: `${currentXp} / ${needed} XP` });

    await interaction.reply({ embeds: [embed] });
  },
};

function buildBar(percent) {
  const filled = Math.floor(percent / 5);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}
