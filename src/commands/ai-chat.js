const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { clearConv } = require('../utils/aiChat');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai-chat')
    .setDescription('Configure the AI server manager chatbot')
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Set a dedicated channel for AI chat (bot responds to every message there)')
      .addChannelOption(o => o.setName('channel').setDescription('The dedicated AI chat channel').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable the dedicated AI chat channel')
    )
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Clear your current AI conversation history')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      db.updateGuildConfig(interaction.guildId, { ai_chat_channel_id: channel.id });
      return interaction.reply({
        content:
          `✅ AI chat channel set to ${channel}.\n\n` +
          `**How to use:**\n` +
          `• Type anything in ${channel} and I'll respond\n` +
          `• Or mention me anywhere: \`@Pela create a gaming section\`\n` +
          `• Or DM me directly\n\n` +
          `I can create channels, categories, roles, set up tickets, and more — just describe what you want!`,
        ephemeral: true,
      });
    }

    if (sub === 'disable') {
      db.updateGuildConfig(interaction.guildId, { ai_chat_channel_id: null });
      return interaction.reply({ content: '✅ AI chat channel disabled. You can still mention me or DM me.', ephemeral: true });
    }

    if (sub === 'reset') {
      clearConv(interaction.guildId, interaction.user.id);
      return interaction.reply({ content: '✅ Conversation cleared — starting fresh!', ephemeral: true });
    }
  },
};