const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Set up the ticket panel in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post the panel in').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addRoleOption(o => o.setName('support_role').setDescription('Primary support role that can see all tickets').setRequired(true))
    .addRoleOption(o => o.setName('support_role_2').setDescription('Second support role'))
    .addRoleOption(o => o.setName('support_role_3').setDescription('Third support role'))
    .addRoleOption(o => o.setName('support_role_4').setDescription('Fourth support role'))
    .addRoleOption(o => o.setName('support_role_5').setDescription('Fifth support role'))
    .addChannelOption(o => o.setName('category').setDescription('Category to create ticket channels under').addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(o => o.setName('log_channel').setDescription('Channel for open/close log events').addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('message').setDescription('Panel embed description').setMaxLength(512)),

  async execute(interaction, db) {
    await interaction.deferReply({ ephemeral: true });

    const channel     = interaction.options.getChannel('channel');
    const supportRole = interaction.options.getRole('support_role');
    const category    = interaction.options.getChannel('category');
    const logChannel  = interaction.options.getChannel('log_channel');
    const message     = interaction.options.getString('message')
      ?? '🎫 Click the button below to open a support ticket. Our team will assist you shortly.';

    const updates = {
      support_role_id:   supportRole.id,
      support_role_id_2: interaction.options.getRole('support_role_2')?.id ?? null,
      support_role_id_3: interaction.options.getRole('support_role_3')?.id ?? null,
      support_role_id_4: interaction.options.getRole('support_role_4')?.id ?? null,
      support_role_id_5: interaction.options.getRole('support_role_5')?.id ?? null,
      ticket_message:    message,
    };
    if (category)   updates.ticket_category_id = category.id;
    if (logChannel) updates.log_channel_id      = logChannel.id;
    db.updateGuildConfig(interaction.guild.id, updates);

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Tickets')
      .setDescription(message)
      .setColor(0x5865F2)
      .setFooter({ text: `${interaction.guild.name} Support` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:open')
        .setLabel('Open a Ticket')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Primary),
    );

    const panelMsg = await channel.send({ embeds: [embed], components: [row] });
    db.updateGuildConfig(interaction.guild.id, {
      panel_channel_id: channel.id,
      panel_message_id: panelMsg.id,
    });

    await interaction.editReply({ content: `✅ Ticket panel created in ${channel}!` });
  },
};
