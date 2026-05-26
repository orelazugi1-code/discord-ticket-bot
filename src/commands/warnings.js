const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Member to check').setRequired(true)),

  async execute(interaction, db) {
    const target = interaction.options.getUser('user');
    const warns  = db.getWarnings(interaction.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${target.tag}`)
      .setColor(0xFAA61A)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: `Total: ${warns.length} warning(s)` })
      .setTimestamp();

    if (warns.length === 0) {
      embed.setDescription('No warnings found.');
    } else {
      embed.setDescription(
        warns.slice(0, 10).map((w, i) =>
          `**#${w.id}** — <@${w.moderator_id}> on ${new Date(w.created_at).toLocaleDateString()}\n> ${w.reason}`,
        ).join('\n\n') + (warns.length > 10 ? `\n\n*...and ${warns.length - 10} more*` : ''),
      );
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
