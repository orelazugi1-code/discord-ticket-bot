const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome-setup')
    .setDescription('Configure the welcome card system')
    .addSubcommand(sub => sub
      .setName('enable')
      .setDescription('Enable welcome cards in a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send welcome cards in').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Welcome message (use {user}, {username}, {server}, {membercount})').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable the welcome card system')
    )
    .addSubcommand(sub => sub
      .setName('test')
      .setDescription('Send a test welcome card for yourself')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId) && !db.isUserPremium(interaction.user.id)) return interaction.reply({ content: '👑 **Premium בלבד!** כתבו /shop לפרטים.', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'enable') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message') || 'Welcome {user} to {server}! You are member #{membercount} 🎉';

      db.updateGuildConfig(interaction.guildId, {
        welcome_channel_id: channel.id,
        welcome_message:    message,
        welcome_enabled:    1,
      });

      return interaction.reply({
        content:
          `✅ Welcome cards enabled in ${channel}!\n` +
          `**Message:** \`${message}\`\n\n` +
          `Available placeholders: \`{user}\` \`{username}\` \`{server}\` \`{membercount}\``,
        ephemeral: true,
      });
    }

    if (sub === 'disable') {
      db.updateGuildConfig(interaction.guildId, { welcome_enabled: 0 });
      return interaction.reply({ content: '✅ Welcome cards disabled.', ephemeral: true });
    }

    if (sub === 'test') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const { generateWelcomeCard } = require('../utils/welcomeCard');
        const config = db.getGuildConfig(interaction.guildId);
        const buf    = await generateWelcomeCard(interaction.member, config);
        await interaction.editReply({
          content: '🎴 Here is a preview of the welcome card:',
          files: [{ attachment: buf, name: 'welcome-preview.png' }],
        });
      } catch (err) {
        console.error('Welcome card test error:', err);
        await interaction.editReply({ content: `❌ Failed to generate card: \`${err.message}\`` });
      }
    }
  },
};