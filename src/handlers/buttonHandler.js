const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const { closeTicketChannel } = require('../utils/ticketManager');

async function handleButton(interaction, db) {
  const parts = interaction.customId.split(':');
  const ns    = parts[0];

  // ── Ticket buttons ──────────────────────────────────────────────────────────
  if (ns === 'ticket') {
    const action = parts[1];

    if (action === 'open') {
      const modal = new ModalBuilder()
        .setCustomId('ticket:create')
        .setTitle('Open a Support Ticket');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('Subject')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Brief description of your issue')
            .setRequired(true)
            .setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Please describe your issue in detail…')
            .setRequired(true)
            .setMaxLength(1000),
        ),
      );

      return interaction.showModal(modal);
    }

    if (action === 'close') {
      const ticket = db.getTicketByChannel(interaction.channel.id);
      if (!ticket || ticket.status === 'closed') {
        return interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });
      }
      await interaction.deferReply();
      await interaction.editReply({ content: '🔒 Closing ticket in 5 seconds…' });
      setTimeout(() => closeTicketChannel(interaction.channel, ticket, interaction.user, db, 'Closed via button'), 5000);
    }
    return;
  }

  // ── Role toggle buttons ─────────────────────────────────────────────────────
  // customId format: role:toggle:<panelId>:<roleId>
  if (ns === 'role' && parts[1] === 'toggle') {
    const roleId = parts[3];
    if (!roleId) return;

    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const role   = interaction.guild.roles.cache.get(roleId);

    if (!role) {
      return interaction.editReply('❌ Role no longer exists. Please contact an admin.');
    }

    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        await interaction.editReply(`✅ Removed **${role.name}** from your roles.`);
      } else {
        await member.roles.add(roleId);
        await interaction.editReply(`✅ Added **${role.name}** to your roles.`);
      }
    } catch (err) {
      console.error('Role toggle error:', err);
      await interaction.editReply('❌ Failed to update your roles. Make sure the bot has the Manage Roles permission.');
    }
    return;
  }
}

module.exports = { handleButton };
