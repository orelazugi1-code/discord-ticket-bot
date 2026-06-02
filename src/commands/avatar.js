const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's avatar")
    .addUserOption(o => o.setName('user').setDescription('User')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s avatar`)
      .setImage(user.displayAvatarURL({ size: 1024, extension: 'png' }))
      .setColor(0x5865f2);
    await interaction.reply({ embeds: [embed] });
  },
};