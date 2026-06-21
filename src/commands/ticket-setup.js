const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, RoleSelectMenuBuilder,
} = require('discord.js');
const sessions = require('../utils/setupSessions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Create a ticket support panel in a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post the panel in').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Panel message text').setRequired(false))
    .addStringOption(o => o.setName('title').setDescription('Panel embed title').setRequired(false))
    .addChannelOption(o => o.setName('category').setDescription('Category to create tickets inside').setRequired(false))
    .addIntegerOption(o => o.setName('max_tickets').setDescription('Max open tickets per user (default 1)').setMinValue(1).setMaxValue(10).setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **פיצ'ר Premium!** כתבו /shop לפרטים.', ephemeral: true });

    const channel    = interaction.options.getChannel('channel');
    const message    = interaction.options.getString('message')    || 'Click the button below to open a support ticket.';
    const title      = interaction.options.getString('title')      || '🎫 Support Tickets';
    const category   = interaction.options.getChannel('category');
    const maxTickets = interaction.options.getInteger('max_tickets') || 1;

    const key = `${interaction.guildId}:${interaction.user.id}`;
    sessions.set(key, {
      type:        'ticket',
      channelId:   channel.id,
      guildId:     interaction.guildId,
      message,
      title,
      categoryId:  category?.id ?? null,
      maxTickets,
      expiresAt:   Date.now() + 5 * 60_000,
    });

    const row = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`tsetup:${key}`)
        .setPlaceholder('Select support roles (you can pick multiple)...')
        .setMinValues(0)
        .setMaxValues(25),
    );

    await interaction.reply({
      content:
        `✅ Panel will be posted in ${channel}.\n\n` +
        `**Select support roles** — members with these roles can view and reply to tickets.\n` +
        `You can pick as many roles as you need (or leave empty for no role restriction):`,
      components: [row],
      ephemeral:  true,
    });
  },
};
