const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Get information about a user')
    .addUserOption(o => o.setName('user').setDescription('User to look up')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const roles = member?.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).slice(0, 15).join(' ') || 'None';
    const embed = new EmbedBuilder()
      .setTitle(`${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(0x5865f2)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        ...(member ? [
          { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: 'Nickname', value: member.nickname || 'None', inline: true },
          { name: 'Top Role', value: member.roles.highest.toString(), inline: true },
          { name: `Roles (${member.roles.cache.size - 1})`, value: roles },
        ] : []),
      );
    await interaction.reply({ embeds: [embed] });
  },
};