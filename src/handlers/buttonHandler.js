const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder,
} = require('discord.js');
const { closeTicketChannel } = require('../utils/ticketManager');

async function handleButton(interaction, db) {
  const parts = interaction.customId.split(':');
  const ns    = parts[0];

  // ── Ticket buttons ────────────────────────────────────────────────────────
  if (ns === 'ticket') {
    const action = parts[1];
    if (action === 'open') {
      const modal = new ModalBuilder().setCustomId('ticket:create').setTitle('Open a Support Ticket');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('subject').setLabel('Subject')
            .setStyle(TextInputStyle.Short).setPlaceholder('Brief description').setRequired(true).setMaxLength(100),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Description')
            .setStyle(TextInputStyle.Paragraph).setPlaceholder('Describe your issue in detail…').setRequired(true).setMaxLength(1000),
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

  // ── Role toggle buttons ───────────────────────────────────────────────────
  if (ns === 'role' && parts[1] === 'toggle') {
    const roleId = parts[3];
    if (!roleId) return;
    await interaction.deferReply({ ephemeral: true });
    const member = interaction.member;
    const role   = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.editReply('❌ Role no longer exists.');
    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        await interaction.editReply(`✅ Removed **${role.name}**.`);
      } else {
        await member.roles.add(roleId);
        await interaction.editReply(`✅ Added **${role.name}**.`);
      }
    } catch (err) {
      console.error('Role toggle error:', err);
      await interaction.editReply('❌ Failed to update roles. Check bot permissions.');
    }
    return;
  }

  // ── Form buttons ──────────────────────────────────────────────────────────
  // customId formats:
  //   form:open:<id>  — modal mode OR rolebutton mode
  //   form:yes:<id>   — yesno mode, user clicked Yes
  //   form:no:<id>    — yesno mode, user clicked No
  if (ns === 'form') {
    const action = parts[1];           // open | yes | no
    const formId = parseInt(parts[2]);
    const form   = db.getForm(formId);

    if (!form || !form.active) {
      return interaction.reply({ content: '❌ This form is no longer active.', ephemeral: true });
    }

    const mode = form.mode || 'modal';

    // ── rolebutton: assign roles immediately ──────────────────────────────
    if (action === 'open' && mode === 'role') {
      await interaction.deferReply({ ephemeral: true });
      const formRoles = db.getFormRoles(formId).filter(r => r.trigger === 'submit');
      const assigned = [];
      for (const fr of formRoles) {
        const role = interaction.guild.roles.cache.get(fr.role_id);
        if (role) {
          await interaction.member.roles.add(fr.role_id).catch(() => {});
          assigned.push(role.name);
        }
      }
      db.saveFormResponse(formId, interaction.user.id, interaction.guildId, {}, interaction.user.tag, 'submit');
      const msg = assigned.length
        ? `✅ You have been given: **${assigned.join(', ')}**`
        : '✅ Done!';
      return interaction.editReply({ content: msg });
    }

    // ── modal mode: open modal with questions ─────────────────────────────
    if (action === 'open' && mode === 'modal') {
      const questions = db.getFormQuestions(formId);
      if (!questions.length) {
        return interaction.reply({ content: '❌ This form has no questions configured yet.', ephemeral: true });
      }
      return interaction.showModal(buildFormModal(formId, form.title, questions, 'modal'));
    }

    // ── yesno: Yes button ─────────────────────────────────────────────────
    if (action === 'yes') {
      const questions = db.getFormQuestions(formId);
      if (questions.length > 0) {
        // open a modal so the user can answer the questions
        return interaction.showModal(buildFormModal(formId, form.title, questions, 'yes'));
      }
      // no questions — immediately log + assign yes roles + respond
      await interaction.deferReply({ ephemeral: true });
      await handleFormSubmit(interaction, form, {}, 'yes', db);
      return;
    }

    // ── yesno: No button ──────────────────────────────────────────────────
    if (action === 'no') {
      await interaction.deferReply({ ephemeral: true });
      await handleFormSubmit(interaction, form, {}, 'no', db);
      return;
    }
  }
}

// Build a Discord modal for a form
function buildFormModal(formId, title, questions, type) {
  // type: 'modal' | 'yes'  — encoded in customId so modalHandler knows the response type
  const modal = new ModalBuilder()
    .setCustomId(`fsubmit:${type}:${formId}`)
    .setTitle(title.substring(0, 45));

  for (const q of questions.slice(0, 5)) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`q_${q.id}`)
          .setLabel(q.question.substring(0, 45))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(500),
      ),
    );
  }
  return modal;
}

// Process a completed form submission (called by both buttonHandler and modalHandler)
async function handleFormSubmit(interaction, form, answers, responseType, db) {
  const { user, guild } = interaction;

  // Log to log channel
  if (form.log_channel_id) {
    const logCh = guild.channels.cache.get(form.log_channel_id);
    if (logCh) {
      const embed = new EmbedBuilder()
        .setTitle(`📋 Form Response: ${form.title}`)
        .setColor(responseType === 'yes' ? 0x3ddc84 : responseType === 'no' ? 0xf75a5a : 0x7c5af7)
        .addFields({ name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true })
        .setTimestamp();

      if (responseType === 'yes' || responseType === 'no') {
        embed.addFields({ name: 'Answer', value: responseType === 'yes' ? '✅ Yes' : '❌ No', inline: true });
      }

      // add question answers
      const questions = db.getFormQuestions(form.id);
      for (const q of questions) {
        const val = answers[`q_${q.id}`] || answers[`q${q.id}`] || '';
        if (val) embed.addFields({ name: q.question.substring(0, 256), value: String(val).substring(0, 1024) });
      }

      await logCh.send({ embeds: [embed] }).catch(() => {});
    }
  }

  // Save response
  db.saveFormResponse(form.id, user.id, guild.id, answers, user.tag, responseType);

  // Assign roles
  const formRoles = db.getFormRoles(form.id);
  const triggerRoles = formRoles.filter(r =>
    r.trigger === 'submit' ||
    r.trigger === responseType
  );
  for (const fr of triggerRoles) {
    await interaction.member.roles.add(fr.role_id).catch(() => {});
  }

  // Send response to user
  let replyMsg;
  if (responseType === 'yes') {
    replyMsg = form.accept_message || '✅ Thank you for your response!';
  } else if (responseType === 'no') {
    replyMsg = form.decline_message || '❌ Your response has been recorded.';
  } else {
    replyMsg = form.accept_message || '✅ Your response has been submitted!';
  }
  await interaction.editReply({ content: replyMsg });
}

module.exports = { handleButton, handleFormSubmit };