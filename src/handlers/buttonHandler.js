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

  // ── Form buttons ────────────────────────────────────────────────────────────
  // customId: form:open:<formId> | form:yes:<formId> | form:no:<formId>
  if (ns === 'form') {
    const action = parts[1];
    const formId = parseInt(parts[2]);
    const form   = db.getForm(formId);

    if (!form || !form.active) {
      return interaction.reply({ content: '❌ This form is no longer active.', ephemeral: true });
    }

    if (action === 'open') {
      const questions = db.getFormQuestions(formId);
      if (questions.length === 0) {
        if (form.role_id) {
          // role-only mode with no questions — just assign role
          await interaction.deferReply({ ephemeral: true });
          await handleFormResult(interaction, form, { _mode: 'role' }, db);
          return;
        }
        return interaction.reply({ content: '❌ This form has no questions configured yet.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`form_submit:${formId}`)
        .setTitle(form.title.substring(0, 45));

      for (const q of questions.slice(0, 5)) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`q${q.id}`)
              .setLabel(q.question.substring(0, 45))
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );
      }
      return interaction.showModal(modal);
    }

    if (action === 'yes' || action === 'no') {
      await interaction.deferReply({ ephemeral: true });
      await handleFormResult(interaction, form, { answer: action }, db);
    }
    return;
  }
}

async function handleFormResult(interaction, form, answers, db) {
  const { user, guild } = interaction;

  // Log to log channel
  if (form.log_channel_id) {
    const logCh = guild.channels.cache.get(form.log_channel_id);
    if (logCh) {
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle(`📋 Form Response: ${form.title}`)
        .setColor(0x5865f2)
        .addFields({ name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true })
        .setTimestamp();

      if (answers.answer) {
        embed.addFields({ name: 'Answer', value: answers.answer === 'yes' ? '✅ Yes' : '❌ No', inline: true });
      } else {
        for (const [key, val] of Object.entries(answers)) {
          embed.addFields({ name: key, value: String(val).substring(0, 1024) });
        }
      }
      await logCh.send({ embeds: [embed] }).catch(() => {});
    }
  }

  // Save to DB
  db.saveFormResponse(form.id, user.id, guild.id, answers);

  // Assign role
  if (form.role_id) {
    const isYes = !answers.answer || answers.answer === 'yes' || answers._mode === 'role';
    if (isYes) {
      await interaction.member.roles.add(form.role_id).catch(() => {});
    }
  }

  // Reply to user
  let replyMsg = '✅ Your response has been submitted!';
  if (answers.answer === 'yes' && form.accept_message) replyMsg = form.accept_message;
  else if (answers.answer === 'no' && form.decline_message) replyMsg = form.decline_message;
  else if (form.accept_message && !answers.answer) replyMsg = form.accept_message;

  await interaction.editReply({ content: replyMsg });
}

module.exports = { handleButton };
