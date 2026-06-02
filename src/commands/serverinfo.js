const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Show server information'),
  async execute(interaction) {
    const g = interaction.guild;
    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .setThumbnail(g.iconURL({ size: 256 }))
      .setColor(0x5865f2)
      .addFields(
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Members', value: String(g.memberCount), inline: true },
        { name: 'Channels', value: String(g.channels.cache.size), inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Boost Level', value: String(g.premiumTier), inline: true },
        { name: 'Boosts', value: String(g.premiumSubscriptionCount ?? 0), inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Verification', value: g.verificationLevel.toString(), inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};