const {
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const { closeTicketChannel } = require('../utils/ticketManager');
const sessions = require('../utils/setupSessions');

// ── Entry point ───────────────────────────────────────────────────────────────

async function handleButton(interaction, db) {
  // Role Select Menu interactions (ticket-setup / button-panel flows)
  if (interaction.isRoleSelectMenu()) {
    return handleSetupRoles(interaction, db);
  }
  if (interaction.isStringSelectMenu()) {
    return handleSelectMenu(interaction, db);
  }

  const parts = interaction.customId.split(':');
  const ns    = parts[0];

  // ── Ticket buttons ──────────────────────────────────────────────────────────
  if (ns === 'ticket') {
    if (parts[1] === 'open') {
      // Check for ticket categories first
      let categories = [];
      try { categories = db.getTicketCategories(interaction.guildId); } catch {}

      if (categories.length > 0) {
        const select = new StringSelectMenuBuilder()
          .setCustomId('ticket:category_select')
          .setPlaceholder('Choose a ticket type…')
          .setMinValues(1).setMaxValues(1)
          .addOptions(categories.map(cat =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cat.name.substring(0, 100))
              .setValue(String(cat.id))
              .setEmoji('🎫'),
          ));
        return interaction.reply({
          content: '📋 **Select a ticket type:**',
          components: [new ActionRowBuilder().addComponents(select)],
          ephemeral: true,
        });
      }

      // No categories — show modal with global questions
      let qs = [];
      try { qs = db.getTicketQuestions(interaction.guildId); } catch (err) { console.error('[ticket:open] error:', err.message); }
      return interaction.showModal(buildTicketModal('ticket:create', qs));
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

  // ── Role toggle buttons ─────────────────────────────────────────────────────
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

  // ── Alien-attack role toggle ────────────────────────────────────────────
  if (ns === 'alien_role') {
    const roleId = parts[1];
    await interaction.deferReply({ ephemeral: true });
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.editReply('❌ Role no longer exists.');
    try {
      if (interaction.member.roles.cache.has(roleId)) {
        await interaction.member.roles.remove(roleId);
        await interaction.editReply(`👾 Removed **${role.name}** from your profile.`);
      } else {
        await interaction.member.roles.add(roleId);
        await interaction.editReply(`🛸 You have been granted **${role.name}**!`);
      }
    } catch (err) {
      console.error('Alien role error:', err);
      await interaction.editReply('❌ Could not update your role. Check bot permissions.');
    }
    return;
  }

  // ── Ticket question-setup ─────────────────────────────────────────────────
  if (ns === 'tq_add' || ns === 'tq_done') {
    return handleTicketQuestionBtn(interaction, db, sessions);
  }

  // ── Ticket category-setup
  if (ns === 'tc_add' || ns === 'tc_q_add' || ns === 'tc_q_done' || ns === 'tc_done') {
    return handleTicketCategoryBtn(interaction, db, sessions);
  }

  // ── Staff approval buttons ──────────────────────────────────────────────────
  if (ns === 'fapprove') {
    const decision   = parts[1];
    const responseId = parseInt(parts[2]);

    await interaction.deferUpdate();

    const response = db.getFormResponse(responseId);
    if (!response) return interaction.followUp({ content: '❌ Response record not found.', ephemeral: true });

    if (response.approved !== null && response.approved !== undefined) {
      const prev = response.approved === 1 ? 'approved' : 'rejected';
      return interaction.followUp({ content: `⚠️ Already **${prev}**.`, ephemeral: true });
    }

    const form = db.getForm(response.form_id);
    if (!form) return interaction.followUp({ content: '❌ Form no longer exists.', ephemeral: true });

    const member = await interaction.guild.members.fetch(response.user_id).catch(() => null);

    const dmMessage = decision === 'yes'
      ? (form.accept_message  || '✅ Your application has been approved!')
      : (form.decline_message || '❌ Your application has been declined.');

    if (member) await member.send({ content: dmMessage }).catch(() => {});

    const formRoles = db.getFormRoles(form.id).filter(r => r.trigger === decision);
    if (member) {
      for (const fr of formRoles) await member.roles.add(fr.role_id).catch(() => {});
    }

    db.setResponseDecision(responseId, decision === 'yes');

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(decision === 'yes' ? 0x3ddc84 : 0xf75a5a)
      .setFooter({ text: `${decision === 'yes' ? '✅ Approved' : '❌ Rejected'} by ${interaction.user.tag}` });

    await interaction.message.edit({ embeds: [updatedEmbed], components: [] }).catch(() => {});

    return interaction.followUp({
      content: `${decision === 'yes' ? '✅' : '❌'} **${decision === 'yes' ? 'Approved' : 'Rejected'}** — <@${response.user_id}> has been notified.`,
      ephemeral: true,
    });
  }

  // ── Form open/yes/no buttons ────────────────────────────────────────────────
  if (ns === 'form') {
    const action = parts[1];
    const formId = parseInt(parts[2]);
    const form   = db.getForm(formId);

    if (!form || !form.active) {
      return interaction.reply({ content: '❌ This form is no longer active.', ephemeral: true });
    }

    const mode = form.mode || 'modal';

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

    if (action === 'open' && mode === 'modal') {
      const questions = db.getFormQuestions(formId);
      if (!questions.length) return interaction.reply({ content: '❌ This form has no questions yet.', ephemeral: true });
      return interaction.showModal(buildFormModal(formId, form.title, questions, 'modal'));
    }

    if (action === 'yes') {
      const questions = db.getFormQuestions(formId);
      if (questions.length > 0) return interaction.showModal(buildFormModal(formId, form.title, questions, 'yes'));
      await interaction.deferReply({ ephemeral: true });
      await handleFormSubmit(interaction, form, {}, 'yes', db);
      return;
    }

    if (action === 'no') {
      await interaction.deferReply({ ephemeral: true });
      await handleFormSubmit(interaction, form, {}, 'no', db);
      return;
    }
  }
}

// ── RoleSelectMenu — complete ticket or button-panel setup ────────────────────

async function handleSetupRoles(interaction, db) {
  const parts = interaction.customId.split(':');
  // customId format: `tsetup:${guildId}:${userId}` or `bpanel:${guildId}:${userId}`
  const ns  = parts[0];
  const key = `${parts[1]}:${parts[2]}`;

  const session = sessions.get(key);
  if (!session || Date.now() > session.expiresAt) {
    return interaction.reply({ content: '⏱️ Setup session expired. Please run the command again.', ephemeral: true });
  }

  sessions.delete(key);
  const roleIds = interaction.values; // array of selected role IDs

  if (ns === 'tsetup') {
    await completeTicketSetup(interaction, session, roleIds, db);
  } else if (ns === 'bpanel') {
    await completeButtonPanelSetup(interaction, session, roleIds, db);
  }
}

// ── Complete ticket setup ─────────────────────────────────────────────────────

async function completeTicketSetup(interaction, session, roleIds, db) {
  const { channelId, guildId, message, title, categoryId, maxTickets } = session;

  await interaction.deferUpdate();

  // Save config
  const config = db.getGuildConfig(guildId);
  db.updateGuildConfig(guildId, {
    ticket_message:      message,
    max_tickets:         maxTickets,
    ticket_category_id:  categoryId ?? config.ticket_category_id,
    // Clear old role columns
    support_role_id:   roleIds[0]  ?? null,
    support_role_id_2: roleIds[1]  ?? null,
    support_role_id_3: roleIds[2]  ?? null,
    support_role_id_4: roleIds[3]  ?? null,
    support_role_id_5: roleIds[4]  ?? null,
  });

  // For roles beyond 5, store in guild_config extension or log
  if (roleIds.length > 5) {
    console.log(`[ticket-setup] ${guildId}: roles 6+ (${roleIds.slice(5).join(',')}) stored in extra_support_roles`);
    db.updateGuildConfig(guildId, { extra_support_roles: JSON.stringify(roleIds.slice(5)) });
  }

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.followUp({ content: '❌ Channel not found.', ephemeral: true });
  }

  // Build ticket panel
  const { EmbedBuilder: EB, ButtonBuilder: BB, ButtonStyle: BS, ActionRowBuilder: AR } = require('discord.js');
  const embed = new EB()
    .setTitle(title)
    .setDescription(message)
    .setColor(0x7c5af7)
    .setFooter({ text: 'Click the button below to create a ticket' });

  const row = new AR().addComponents(
    new BB().setCustomId('ticket:open').setLabel('Open Ticket').setEmoji('🎫').setStyle(BS.Primary),
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });

  const roleList = roleIds.length
    ? roleIds.map(id => `<@&${id}>`).join(', ')
    : '_None (anyone can create tickets)_';

  const key = `${guildId}:${interaction.user.id}`;
  sessions.set(key, {
    type:       'ticket_questions',
    guildId,
    questions:  [],
    categories: [],
    expiresAt:  Date.now() + 30 * 60_000,
  });

  await interaction.editReply({
    content:
      `✅ **Ticket panel created** in ${channel}!\n` +
      `Support roles: ${roleList}\n` +
      `Max tickets per user: **${maxTickets}**\n\n` +
      `📋 **Configure ticket questions** _(optional)_\n` +
      `• **Add Categories** — users pick a ticket type, each with its own questions\n` +
      `• **Custom Questions** — one set of questions for all tickets\n` +
      `• **Use Defaults** — simple Subject + Description form`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tc_add:${key}`)
        .setLabel('📂 Add Categories')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tq_add:${key}`)
        .setLabel('📝 Custom Questions')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tq_done:${key}`)
        .setLabel('✅ Use Defaults')
        .setStyle(ButtonStyle.Secondary),
    )],  });
}

// ── Complete button-panel setup ───────────────────────────────────────────────

async function completeButtonPanelSetup(interaction, session, roleIds, db) {
  const { channelId, guildId, title, description } = session;

  await interaction.deferUpdate();

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.followUp({ content: '❌ Channel not found.', ephemeral: true });
  }

  // Save to DB
  const panelId = db.createButtonRole(guildId, channelId, title, description, roleIds);

  // Build panel embed + one button per role
  const { EmbedBuilder: EB, ButtonBuilder: BB, ButtonStyle: BS, ActionRowBuilder: AR } = require('discord.js');
  const embed = new EB()
    .setTitle(title)
    .setDescription(description || 'Click a button below to assign or remove a role.')
    .setColor(0x7c5af7);

  // Discord allows max 5 buttons per row, 5 rows = 25 total
  const rows   = [];
  let   curRow = new AR();
  let   count  = 0;
  for (const roleId of roleIds) {
    const role = interaction.guild.roles.cache.get(roleId);
    const lbl  = role ? role.name : roleId;
    curRow.addComponents(
      new BB()
        .setCustomId(`role:toggle:${panelId}:${roleId}`)
        .setLabel(lbl.substring(0, 80))
        .setStyle(BS.Secondary),
    );
    count++;
    if (count % 5 === 0) { rows.push(curRow); curRow = new AR(); }
  }
  if (count % 5 !== 0) rows.push(curRow);

  const panelMsg = await channel.send({ embeds: [embed], components: rows.slice(0, 5) });
  db.updateButtonRoleMsgId(panelId, panelMsg.id);

  const roleList = roleIds.map(id => `<@&${id}>`).join(', ');
  await interaction.editReply({
    content: `✅ **Role panel created** in ${channel}!\nRoles: ${roleList}`,
    components: [],
  });
}

// ── Form helpers ──────────────────────────────────────────────────────────────

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

async function handleFormSubmit(interaction, form, answers, responseType, db) {
  const { user, guild } = interaction;
  const isApprovalMode  = !!(form.yes_label || form.no_label);

  const submitRoles = db.getFormRoles(form.id).filter(r => r.trigger === 'submit');
  for (const fr of submitRoles) await interaction.member.roles.add(fr.role_id).catch(() => {});

  const responseId = db.saveFormResponse(form.id, user.id, guild.id, answers, user.tag, responseType);

  const logEmbed = new EmbedBuilder()
    .setTitle(`📋 Form Response: ${form.title}`)
    .setColor(responseType === 'yes' ? 0x3ddc84 : responseType === 'no' ? 0xf75a5a : 0x7c5af7)
    .addFields({ name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true })
    .setTimestamp();

  if (responseType === 'yes' || responseType === 'no') {
    logEmbed.addFields({ name: 'Answer', value: responseType === 'yes' ? '✅ Yes' : '❌ No', inline: true });
  }

  const questions = db.getFormQuestions(form.id);
  for (const q of questions) {
    const val = answers[`q_${q.id}`] || answers[`q${q.id}`] || '';
    if (val) logEmbed.addFields({ name: q.question.substring(0, 256), value: String(val).substring(0, 1024) });
  }

  if (form.log_channel_id) {
    const logCh = guild.channels.cache.get(form.log_channel_id);
    if (logCh) {
      let logMsg;
      if (isApprovalMode) {
        const yesBtn = new ButtonBuilder().setCustomId(`fapprove:yes:${responseId}`).setLabel(form.yes_label || 'Accept').setStyle(ButtonStyle.Success);
        const noBtn  = new ButtonBuilder().setCustomId(`fapprove:no:${responseId}`).setLabel(form.no_label  || 'Reject').setStyle(ButtonStyle.Danger);
        logMsg = await logCh.send({ embeds: [logEmbed], components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)] }).catch(() => null);
      } else {
        logMsg = await logCh.send({ embeds: [logEmbed] }).catch(() => null);
      }
      if (logMsg) db.setResponseLogMessage(responseId, logMsg.id);
    }
  }

  if (isApprovalMode) {
    await interaction.editReply({ content: '✅ Your response has been submitted and is pending review!' });
  } else {
    const triggerRoles = db.getFormRoles(form.id).filter(r => r.trigger !== 'submit' && r.trigger === responseType);
    for (const fr of triggerRoles) await interaction.member.roles.add(fr.role_id).catch(() => {});
    let replyMsg;
    if (responseType === 'yes')     replyMsg = form.accept_message  || '✅ Thank you for your response!';
    else if (responseType === 'no') replyMsg = form.decline_message || '❌ Your response has been recorded.';
    else                            replyMsg = form.accept_message  || '✅ Your response has been submitted!';
    await interaction.editReply({ content: replyMsg });
  }
}

// ── Ticket question-setup button handlers ───────────────────────────────

async function handleTicketQuestionBtn(interaction, db, sessions) {
  const parts = interaction.customId.split(':');
  const ns    = parts[0];
  const key   = `${parts[1]}:${parts[2]}`;

  if (ns === 'tq_add') {
    const session = sessions.get(key);
    if (!session || Date.now() > session.expiresAt) {
      return interaction.reply({ content: '⏱️ Session expired. Run /ticket-setup again.', ephemeral: true });
    }
    const qNum = (session.questions?.length ?? 0) + 1;
    const modal = new ModalBuilder()
      .setCustomId(`tq_modal:${key}`)
      .setTitle(`Add Ticket Question ${qNum}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('question_text')
          .setLabel(`Question ${qNum}`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g.  What is your issue? / מה הבעיה שלך?')
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
    return interaction.showModal(modal);
  }

  if (ns === 'tq_done') {
    const session = sessions.get(key);
    if (!session || Date.now() > session.expiresAt) {
      return interaction.reply({ content: '⏱️ Session expired.', ephemeral: true });
    }
    const questions = session.questions ?? [];
    sessions.delete(key);
    db.setTicketQuestions(session.guildId, questions);
    await interaction.update({
      content: questions.length > 0
        ? `✅ **Ticket setup complete!** Saved **${questions.length}** custom question(s):\n` +
          questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n')
        : '✅ **Ticket setup complete!** Using default questions (Subject + Description).',
      components: [],
    });
    return;
  }
}


// ── Build ticket modal ─────────────────────────────────────────────────────────

function buildTicketModal(customId, qs) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('Open a Support Ticket');
  if (qs.length === 0) {
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
  } else {
    for (const q of qs.slice(0, 5)) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('q_' + q.id)
            .setLabel(q.question.substring(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
      );
    }
  }
  return modal;
}

// ── String select menu handler ────────────────────────────────────────────────

async function handleSelectMenu(interaction, db) {
  if (interaction.customId === 'ticket:category_select') {
    const categoryId = parseInt(interaction.values[0]);
    let qs = [];
    try { qs = db.getCategoryQuestions(categoryId); } catch {}
    return interaction.showModal(buildTicketModal(`ticket:create:${categoryId}`, qs));
  }
}

// ── Ticket category-setup button handlers ─────────────────────────────────────

async function handleTicketCategoryBtn(interaction, db, sessions) {
  const parts = interaction.customId.split(':');
  const ns  = parts[0];
  const key = `${parts[1]}:${parts[2]}`;

  const session = sessions.get(key);
  if (!session || Date.now() > session.expiresAt) {
    return interaction.reply({ content: '⏱️ Session expired. Run /ticket-setup again.', ephemeral: true });
  }

  if (ns === 'tc_add') {
    const catNum = (session.categories?.length ?? 0) + 1;
    const modal = new ModalBuilder()
      .setCustomId(`tc_modal:${key}`)
      .setTitle(`Add Ticket Category ${catNum}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('category_name')
          .setLabel(`Category ${catNum} Name`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 🚨 Report a User  •  🐛 Report a Bug  •  ❓ General Question')
          .setRequired(true)
          .setMaxLength(45),
      ),
    );
    return interaction.showModal(modal);
  }

  if (ns === 'tc_q_add') {
    const cats = session.categories || [];
    const currentCat = cats[cats.length - 1];
    if (!currentCat) return interaction.reply({ content: '❌ No active category. Add a category first.', ephemeral: true });
    const qNum = (currentCat.questions?.length ?? 0) + 1;
    const modal = new ModalBuilder()
      .setCustomId(`tc_q_modal:${key}`)
      .setTitle(`"${currentCat.name.substring(0, 35)}" — Question ${qNum}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('question_text')
          .setLabel(`Question ${qNum}`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. What is your username? / מה שם המשתמש שלך?')
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
    return interaction.showModal(modal);
  }

  if (ns === 'tc_q_done') {
    const cats = session.categories || [];
    const catList = cats.map((c, i) => {
      const n = c.questions.length;
      return `**${i + 1}.** ${c.name} — ${n} question${n !== 1 ? 's' : ''}`;
    }).join('\n');
    const atMax = cats.length >= 25;
    const next  = cats.length + 1;
    const row   = new ActionRowBuilder().addComponents(
      ...(atMax ? [] : [
        new ButtonBuilder().setCustomId(`tc_add:${key}`).setLabel(`➕ Add Category ${next}`).setStyle(ButtonStyle.Primary),
      ]),
      new ButtonBuilder().setCustomId(`tc_done:${key}`).setLabel('✅ Save & Done').setStyle(ButtonStyle.Success),
    );
    return interaction.update({
      content: `📂 **Ticket categories configured:**\n${catList}\n\n_Add more categories or save._`,
      components: [row],
    });
  }

  if (ns === 'tc_done') {
    const cats = session.categories || [];
    try { db.clearTicketCategories(session.guildId); } catch {}
    if (cats.length > 0) {
      try { db.setTicketQuestions(session.guildId, []); } catch {}
      for (let i = 0; i < cats.length; i++) {
        const catId = db.createTicketCategory(session.guildId, cats[i].name, i);
        if (cats[i].questions.length > 0) db.setCategoryQuestions(session.guildId, catId, cats[i].questions);
      }
    }
    sessions.delete(key);
    const catList = cats.map((c, i) => `**${i + 1}.** ${c.name}`).join('\n') || '_None_';
    return interaction.update({
      content: cats.length > 0
        ? `✅ **Ticket setup complete!** Saved **${cats.length}** categor${cats.length !== 1 ? 'ies' : 'y'}:\n${catList}\n\nUsers will see a category selection menu when opening a ticket.`
        : `✅ **Ticket setup complete!** No categories saved. Using default form.`,
      components: [],
    });
  }
}
module.exports = { handleButton, handleFormSubmit, handleTicketQuestionBtn, handleTicketCategoryBtn };
