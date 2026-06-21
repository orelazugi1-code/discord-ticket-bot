const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goodbye-setup')
    .setDescription('Configure the goodbye card system')
    .addSubcommand(sub => sub
      .setName('enable')
      .setDescription('Enable goodbye cards in a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send goodbye cards in').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Goodbye message (use {user}, {username}, {server})').setRequired(false))
    )
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Disable the goodbye card system')
    )
    .addSubcommand(sub => sub
      .setName('test')
      .setDescription('Send a test goodbye card for yourself')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **Premium בלבד!** כתבו /shop לפרטים.', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'enable') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message') || 'Goodbye {user}, we will miss you!';

      db.updateGuildConfig(interaction.guildId, {
        goodbye_channel_id: channel.id,
        goodbye_message:    message,
        goodbye_enabled:    1,
      });

      return interaction.reply({
        content:
          `✅ Goodbye cards enabled in ${channel}!\n` +
          `**Message:** \`${message}\`\n\n` +
          `Available placeholders: \`{user}\` \`{username}\` \`{server}\``,
        ephemeral: true,
      });
    }

    if (sub === 'disable') {
      db.updateGuildConfig(interaction.guildId, { goodbye_enabled: 0 });
      return interaction.reply({ content: '✅ Goodbye cards disabled.', ephemeral: true });
    }

    if (sub === 'test') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const { generateGoodbyeCard } = require('../utils/welcomeCard');
        const config = db.getGuildConfig(interaction.guildId);
        const buf    = await generateGoodbyeCard(interaction.member, config);
        await interaction.editReply({
          content: '🎴 Here is a preview of the goodbye card:',
          files: [{ attachment: buf, name: 'goodbye-preview.png' }],
        });
      } catch (err) {
        console.error('Goodbye card test error:', err);
        await interaction.editReply({ content: `❌ Failed to generate card: \`${err.message}\`` });
      }
    }
  },
};