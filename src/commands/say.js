const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a message')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const msg = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.send(msg);
    await interaction.reply({ content: '✅ Sent.', ephemeral: true });
  },
};