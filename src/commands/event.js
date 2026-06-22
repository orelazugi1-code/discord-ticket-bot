const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { startEvent } = require('../utils/eventGames');

const OWNER_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Start a Pela Premium giveaway event')
    .addChannelOption(o => o.setName('channel').setDescription('Event channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .setDefaultMemberPermissions('0'),
  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌', ephemeral: true });
    const channel = interaction.options.getChannel('channel');
    await interaction.reply({ content: '✅ מתחיל אירוע ב-' + channel + '!', ephemeral: true });
    await startEvent(channel, interaction.client);
  },
};
