const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { closeTicketChannel } = require('../utils/ticketManager');

async function handleButton(interaction, db) {
  const parts = interaction.customId.split(':');
  const ns    = parts[0];

  // ── Ticket buttons ────────────────────────────────────────────────────────
  if (ns === 'ticket') {
    if (parts[1] === 'open') {
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
    if (parts[1] === 'close') {
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

  // ── Staff approval buttons ────────────────────────────────────────────────
  // customId: fapprove:<yes|no>:<responseId>
  if (ns === 'fapprove') {
    const decision   = parts[1];       // 'yes' | 'no'
    const responseId = parseInt(parts[2]);

    await interaction.deferUpdate();   // acknowledge fast, then edit the message

    const response = db.getFormResponse(responseId);
    if (!response) {
      return interaction.followUp({ content: '❌ Response record not found.', ephemeral: true });
    }

    // One-time only: check if already decided
    if (response.approved !== null && response.approved !== undefined) {
      const prev = response.approved === 1 ? 'approved' : 'rejected';
      return interaction.followUp({ content: `⚠️ This submission was already **${prev}**.`, ephemeral: true });
    }

    const form = db.getForm(response.form_id);
    if (!form) {
      return interaction.followUp({ content: '❌ Form no longer exists.', ephemeral: true });
    }

    const guild = interaction.guild;

    // Fetch the original member so we can DM + assign roles
    const member = await guild.members.fetch(response.user_id).catch(() => null);

    // DM the user
    const dmMessage = decision === 'yes'
      ? (form.accept_message  || '✅ Your application has been approved!')
      : (form.decline_message || '❌ Your application has been declined.');

    if (member) {
      await member.send({ content: dmMessage }).catch(() => {
        console.warn(`[Forms] Could not DM user ${response.user_id} — DMs may be closed.`);
      });
    }

    // Assign the appropriate role
    const formRoles = db.getFormRoles(form.id);
    const rolesToAdd = formRoles.filter(r => r.trigger === decision);
    if (member) {
      for (const fr of rolesToAdd) {
        await member.roles.add(fr.role_id).catch(err => console.warn('[Forms] role assign error:', err.message));
      }
    }

    // Mark decision in DB
    db.setResponseDecision(responseId, decision === 'yes');

    // Edit the log message: remove buttons, add decision footer
    const staffUser = interaction.user;
    const original  = interaction.message;
    const oldEmbed  = original.embeds[0];

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .setColor(decision === 'yes' ? 0x3ddc84 : 0xf75a5a)
      .setFooter({
        text: `${decision === 'yes' ? '✅ Approved' : '❌ Rejected'} by ${staffUser.tag}`,
      });

    await original.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

    return interaction.followUp({
      content: `${decision === 'yes' ? '✅' : '❌'} **${decision === 'yes' ? 'Approved' : 'Rejected'}** — <@${response.user_id}> has been notified.`,
      ephemeral: true,
    });
  }

  // ── Form open/yes/no buttons ──────────────────────────────────────────────
  // customId: form:<open|yes|no>:<formId>
  if (ns === 'form') {
    const action = parts[1];
    const formId = parseInt(parts[2]);
    const form   = db.getForm(formId);

    if (!form || !form.active) {
      return interaction.reply({ content: '❌ This form is no longer active.', ephemeral: true });
    }

    const mode = form.mode || 'modal';

    // rolebutton: assign roles immediately
    if (action === 'open' && mode === 'role') {
      await interaction.deferReply({ ephemeral: true });
      const formRoles = db.getFormRoles(formId).filter(r => r.trigger === 'submit');
      const assigned  = [];
      for (const fr of formRoles) {
        const role = interaction.guild.roles.cache.get(fr.role_id);
        if (role) { await interaction.member.roles.add(fr.role_id).catch(() => {}); assigned.push(role.name); }
      }
      db.saveFormResponse(formId, interaction.user.id, interaction.guildId, {}, interaction.user.tag, 'submit');
      return interaction.editReply({ content: assigned.length ? `✅ You have been given: **${assigned.join(', ')}**` : '✅ Done!' });
    }

    // modal mode: open modal with questions
    if (action === 'open' && mode === 'modal') {
      const questions = db.getFormQuestions(formId);
      if (!questions.length) {
        return interaction.reply({ content: '❌ This form has no questions configured yet.', ephemeral: true });
      }
      return interaction.showModal(buildFormModal(formId, form.title, questions, 'modal'));
    }

    // yesno: Yes button
    if (action === 'yes') {
      const questions = db.getFormQuestions(formId);
      if (questions.length > 0) return interaction.showModal(buildFormModal(formId, form.title, questions, 'yes'));
      await interaction.deferReply({ ephemeral: true });
      await handleFormSubmit(interaction, form, {}, 'yes', db);
      return;
    }

    // yesno: No button
    if (action === 'no') {
      await interaction.deferReply({ ephemeral: true });
      await handleFormSubmit(interaction, form, {}, 'no', db);
      return;
    }
  }
}

// ── Build a Discord modal ─────────────────────────────────────────────────────
function buildFormModal(formId, title, questions, type) {
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

// ── Process a completed form submission ───────────────────────────────────────
async function handleFormSubmit(interaction, form, answers, responseType, db) {
  const { user, guild } = interaction;
  const isApprovalMode  = !!(form.yes_label || form.no_label);

  // Assign "submit" roles immediately (regardless of approval mode)
  const submitRoles = db.getFormRoles(form.id).filter(r => r.trigger === 'submit');
  for (const fr of submitRoles) {
    await interaction.member.roles.add(fr.role_id).catch(() => {});
  }

  // Save to DB and get the new response ID
  const responseId = db.saveFormResponse(form.id, user.id, guild.id, answers, user.tag, responseType);

  // Build the log embed
  const logEmbed = new EmbedBuilder()
    .setTitle(`📋 Form Response: ${form.title}`)
    .setColor(responseType === 'yes' ? 0x3ddc84 : responseType === 'no' ? 0xf75a5a : 0x7c5af7)
    .addFields({ name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true })
    .setTimestamp();

  if (responseType === 'yes' || responseType === 'no') {
    logEmbed.addFields({ name: 'Answer', value: responseType === 'yes' ? '✅ Yes' : '❌ No', inline: true });
  }

  // Add Q&A fields
  const questions = db.getFormQuestions(form.id);
  for (const q of questions) {
    const val = answers[`q_${q.id}`] || answers[`q${q.id}`] || '';
    if (val) logEmbed.addFields({ name: q.question.substring(0, 256), value: String(val).substring(0, 1024) });
  }

  // Send to log channel
  if (form.log_channel_id) {
    const logCh = guild.channels.cache.get(form.log_channel_id);
    if (logCh) {
      let logMsg;
      if (isApprovalMode) {
        // Send with approval buttons
        const yesBtn = new ButtonBuilder()
          .setCustomId(`fapprove:yes:${responseId}`)
          .setLabel(form.yes_label || 'Accept')
          .setStyle(ButtonStyle.Success);
        const noBtn = new ButtonBuilder()
          .setCustomId(`fapprove:no:${responseId}`)
          .setLabel(form.no_label || 'Reject')
          .setStyle(ButtonStyle.Danger);
        logMsg = await logCh.send({
          embeds:     [logEmbed],
          components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)],
        }).catch(() => null);
      } else {
        logMsg = await logCh.send({ embeds: [logEmbed] }).catch(() => null);
      }
      if (logMsg) db.setResponseLogMessage(responseId, logMsg.id);
    }
  }

  // Reply to the user
  if (isApprovalMode) {
    // Don't DM yet — staff will trigger the DM when they approve/reject
    await interaction.editReply({ content: '✅ Your response has been submitted and is pending review!' });
  } else {
    // Assign yes/no roles immediately if not in approval mode
    const triggerRoles = db.getFormRoles(form.id).filter(r =>
      r.trigger === 'submit' || r.trigger === responseType
    );
    for (const fr of triggerRoles.filter(r => r.trigger !== 'submit')) {
      await interaction.member.roles.add(fr.role_id).catch(() => {});
    }
    // DM the user
    let replyMsg;
    if (responseType === 'yes')      replyMsg = form.accept_message  || '✅ Thank you for your response!';
    else if (responseType === 'no')  replyMsg = form.decline_message || '❌ Your response has been recorded.';
    else                             replyMsg = form.accept_message  || '✅ Your response has been submitted!';
    await interaction.editReply({ content: replyMsg });
  }
}

module.exports = { handleButton, handleFormSubmit };