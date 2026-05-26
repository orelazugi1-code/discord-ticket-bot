const {
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

async function handleModal(interaction, db) {
  if (interaction.customId !== 'ticket:create') return;

  await interaction.deferReply({ ephemeral: true });

  const subject     = interaction.fields.getTextInputValue('subject');
  const description = interaction.fields.getTextInputValue('description');
  const { guild, user } = interaction;

  const config = db.getGuildConfig(guild.id);

  // Enforce per-user ticket cap
  const open = db.getOpenTicketsByUser(guild.id, user.id);
  if (open.length >= (config.max_tickets || 1)) {
    return interaction.editReply({
      content: `❌ You already have **${open.length}** open ticket(s). Please wait for it to be resolved before opening another.`,
    });
  }

  try {
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
    ];

    // Add permission overwrites for all configured support roles
    const roleKeys = ['support_role_id', 'support_role_id_2', 'support_role_id_3', 'support_role_id_4', 'support_role_id_5'];
    const supportRoleIds = roleKeys.map(k => config[k]).filter(Boolean);
    for (const roleId of supportRoleIds) {
      overwrites.push({
        id:    roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channelOpts = {
      name:                 `ticket-${user.username}`,
      type:                 ChannelType.GuildText,
      permissionOverwrites: overwrites,
      topic:                `Ticket by ${user.username} | Subject: ${subject}`,
    };
    if (config.ticket_category_id) channelOpts.parent = config.ticket_category_id;

    const ticketChannel = await guild.channels.create(channelOpts);

    db.createTicket(ticketChannel.id, guild.id, user.id, subject, description);
    const ticket = db.getTicketByChannel(ticketChannel.id);

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticket.id} — ${subject}`)
      .setDescription(description)
      .setColor(0x5865F2)
      .addFields(
        { name: 'Opened By', value: `<@${user.id}>`, inline: true },
        { name: 'Status',    value: '🟢 Open',        inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `User ID: ${user.id}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger),
    );

    // Mention all support roles
    const mentions = supportRoleIds.map(id => `<@&${id}>`).join(' ');
    await ticketChannel.send({ content: `${user} ${mentions}`.trim(), embeds: [embed], components: [row] });

    // Log event
    if (config.log_channel_id) {
      const logCh = guild.channels.cache.get(config.log_channel_id);
      if (logCh) {
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🎫 New Ticket Opened')
              .setColor(0x57F287)
              .addFields(
                { name: 'Channel', value: `${ticketChannel}`,  inline: true },
                { name: 'User',    value: `<@${user.id}>`,      inline: true },
                { name: 'Subject', value: subject },
              )
              .setTimestamp(),
          ],
        });
      }
    }

    await interaction.editReply({ content: `✅ Your ticket has been opened in ${ticketChannel}!` });
  } catch (err) {
    console.error('Error creating ticket:', err);
    await interaction.editReply({ content: '❌ Failed to create your ticket. Please try again.' });
  }
}

module.exports = { handleModal };
