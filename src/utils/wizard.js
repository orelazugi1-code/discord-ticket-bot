'use strict';
const {
  ChannelType, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');

// ── Language table ────────────────────────────────────────────────────────────

const T = {
  en: {
    // buttons
    add_q: '➕ Add Question', rm_q: '🗑️ Remove Last', q_done: '▶️ Continue',
    confirm: '✅ Confirm & Create', edit_btn: '✏️ Start Over', cancel: '❌ Cancel',
    skip: '⏭️ Skip', yes_btn: '✅ Yes', no_btn: '❌ No',
    add_cat: '➕ Add Category', cat_continue: '▶️ Continue to Preview',
    cat_q_done: '✅ Done with Category',
    // prompts
    form_ch_prompt: '📢 Which channel should the form be posted in?',
    log_ch_prompt:  '📋 Which channel for staff logs? (optional)',
    ticket_ch_prompt:    '📢 Which channel should the ticket panel be in?',
    ticket_roles_prompt: '🎭 Which roles should have access to all tickets?',
    approval_q:   '**Add an approval system?**\nShould staff manually accept/reject submissions?',
    approval_role_prompt: '🎭 Which role is assigned when a submission is approved?',
    categories_q: '**Add ticket categories?**\nAllow different ticket types (e.g. Bug Report, General Support)?',
    // labels
    q_label:    (n) => `Questions (${n}/5)`,
    no_q:       '*(none — click Add Question)*',
    cat_label:  (n) => `Categories (${n})`,
    no_cats:    '*(none yet)*',
    cat_q_title:(n) => `📁 Questions for: ${n}`,
    preview:    '📋 Preview',
    form_wiz:   '📋 Form Builder',
    cat_wiz:    '📁 Ticket Categories',
    // modals
    q_modal_t: 'Add a Question',   q_modal_l: 'Question text',  q_modal_ph: 'e.g. What is your username?',
    cat_modal_t: 'Add a Category', cat_modal_l: 'Category name', cat_modal_ph: 'e.g. 🐛 Bug Report',
    // results
    cancelled: '❌ Wizard cancelled.', expired: '⏱️ Wizard session expired.',
    confirmed: '⏳ Creating…',
    // preview labels
    prev_channel: '📢 Channel', prev_log: '📋 Log Channel', prev_approval: '✋ Approval',
    prev_role: '🎭 Approval Role', prev_questions: (n) => `📝 Questions (${n})`,
    prev_roles: '🎭 Support Roles', prev_cats: (n) => `📁 Categories (${n})`,
    none: 'None',
  },
  he: {
    add_q: '➕ הוסף שאלה', rm_q: '🗑️ הסר אחרון', q_done: '▶️ המשך',
    confirm: '✅ אישור וצור', edit_btn: '✏️ התחל מחדש', cancel: '❌ ביטול',
    skip: '⏭️ דלג', yes_btn: '✅ כן', no_btn: '❌ לא',
    add_cat: '➕ הוסף קטגוריה', cat_continue: '▶️ המשך לתצוגה מקדימה',
    cat_q_done: '✅ סיום קטגוריה',
    form_ch_prompt: '📢 באיזה ערוץ לפרסם את הטופס?',
    log_ch_prompt:  '📋 ערוץ לוג לצוות (אופציונלי)',
    ticket_ch_prompt:    '📢 באיזה ערוץ יהיה לוח הכרטיסים?',
    ticket_roles_prompt: '🎭 אילו תפקידים יוכלו לראות כרטיסים?',
    approval_q:   '**מערכת אישור?**\nהאם הצוות יאשר/ידחה בקשות ידנית?',
    approval_role_prompt: '🎭 איזה תפקיד ניתן אחרי אישור?',
    categories_q: '**קטגוריות לכרטיסים?**\nאפשר סוגי כרטיסים שונים (לדוגמה: דיווח, שאלה)?',
    q_label:    (n) => `שאלות (${n}/5)`,
    no_q:       '*(אין — לחץ הוסף שאלה)*',
    cat_label:  (n) => `קטגוריות (${n})`,
    no_cats:    '*(אין עדיין)*',
    cat_q_title:(n) => `📁 שאלות עבור: ${n}`,
    preview:    '📋 תצוגה מקדימה',
    form_wiz:   '📋 בניית טופס',
    cat_wiz:    '📁 קטגוריות כרטיסים',
    q_modal_t: 'הוספת שאלה', q_modal_l: 'טקסט השאלה',   q_modal_ph: 'לדוגמה: מה שם המשתמש שלך?',
    cat_modal_t: 'הוספת קטגוריה', cat_modal_l: 'שם הקטגוריה', cat_modal_ph: 'לדוגמה: 🐛 דיווח על באג',
    cancelled: '❌ הקסם בוטל.', expired: '⏱️ פג תוקף הקסם.',
    confirmed: '⏳ יוצר…',
    prev_channel: '📢 ערוץ', prev_log: '📋 לוג', prev_approval: '✋ אישור',
    prev_role: '🎭 תפקיד אחרי אישור', prev_questions: (n) => `📝 שאלות (${n})`,
    prev_roles: '🎭 תפקידי תמיכה', prev_cats: (n) => `📁 קטגוריות (${n})`,
    none: 'אין',
  },
};

function t(lang, key, ...args) {
  const tbl = T[lang] ?? T.en;
  const v   = tbl[key] ?? T.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

// ── Wizard store ──────────────────────────────────────────────────────────────

const store = new Map();
const TTL   = 20 * 60_000; // 20-min TTL (generous for multi-step wizard)

function getW(gid, uid)        { const k=`${gid}:${uid}`, w=store.get(k); if(!w||Date.now()>w.expiresAt){store.delete(k);return null;} w.expiresAt=Date.now()+TTL; return w; }
function setW(gid, uid, data)  { store.set(`${gid}:${uid}`, {...data, gid, uid, expiresAt: Date.now()+TTL}); }
function delW(gid, uid)        { store.delete(`${gid}:${uid}`); }

// ── Step transition map ───────────────────────────────────────────────────────

function nextStep(type, step, data) {
  if (type === 'form') {
    const map = { questions:'channel', channel:'log_channel', log_channel:'approval',
                  approval: data.approval ? 'approval_role' : 'confirm',
                  approval_role:'confirm' };
    return map[step] ?? 'confirm';
  }
  if (type === 'ticket') {
    const map = { channel:'roles', roles:'categories_q',
                  categories_q: data.categories_enabled ? 'cat_builder' : 'confirm',
                  cat_builder:'confirm' };
    return map[step] ?? 'confirm';
  }
  return 'confirm';
}

// ── Component builders ────────────────────────────────────────────────────────

function chRow(guild, gid, uid, lang, prompt, withSkip = false) {
  const chs = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position).slice(0, 25);

  const sel = new StringSelectMenuBuilder()
    .setCustomId(`wiz:ch:${gid}:${uid}`)
    .setPlaceholder(prompt)
    .addOptions(chs.map(c => new StringSelectMenuOptionBuilder()
      .setLabel(`#${c.name}`.slice(0, 100)).setValue(c.id)
      .setDescription((c.parent?.name||'').slice(0,100)||' ')));

  const btns = [new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger)];
  if (withSkip) btns.unshift(new ButtonBuilder().setCustomId(`wiz:skip_ch:${gid}:${uid}`).setLabel(t(lang,'skip')).setStyle(ButtonStyle.Secondary));

  return {
    embeds:     [new EmbedBuilder().setDescription(prompt).setColor(0x5865F2)],
    components: [new ActionRowBuilder().addComponents(sel), new ActionRowBuilder().addComponents(...btns)],
  };
}

function rolesRow(gid, uid, lang, prompt) {
  return {
    embeds:     [new EmbedBuilder().setDescription(prompt).setColor(0x5865F2)],
    components: [
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`wiz:roles:${gid}:${uid}`).setPlaceholder(prompt).setMinValues(0).setMaxValues(10)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wiz:skip_roles:${gid}:${uid}`).setLabel(t(lang,'skip')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

function yesNoRow(gid, uid, lang, question) {
  return {
    embeds:     [new EmbedBuilder().setDescription(question).setColor(0x5865F2)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:yes:${gid}:${uid}`).setLabel(t(lang,'yes_btn')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:no:${gid}:${uid}`).setLabel(t(lang,'no_btn')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Secondary),
    )],
  };
}

function formBuilderRow(gid, uid, lang, title, questions) {
  const qText = questions.length ? questions.map((q,i) => `**${i+1}.** ${q}`).join('\n') : t(lang,'no_q');
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'form_wiz') + (title ? ` — ${title}` : ''))
      .addFields({ name: t(lang,'q_label',questions.length), value: qText })
      .setColor(0x7c5af7)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:q_add:${gid}:${uid}`).setLabel(t(lang,'add_q')).setStyle(ButtonStyle.Primary).setDisabled(questions.length>=5),
      new ButtonBuilder().setCustomId(`wiz:q_rm:${gid}:${uid}`).setLabel(t(lang,'rm_q')).setStyle(ButtonStyle.Secondary).setDisabled(!questions.length),
      new ButtonBuilder().setCustomId(`wiz:q_done:${gid}:${uid}`).setLabel(t(lang,'q_done')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function catBuilderRow(gid, uid, lang, categories) {
  const catText = categories.length
    ? categories.map((c,i) => `**${i+1}.** ${c.name}${c.questions?.length ? ` (${c.questions.length} q)` : ''}`).join('\n')
    : t(lang,'no_cats');
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'cat_wiz'))
      .addFields({ name: t(lang,'cat_label',categories.length), value: catText })
      .setColor(0x5865F2)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:cat_add:${gid}:${uid}`).setLabel(t(lang,'add_cat')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`wiz:cat_continue:${gid}:${uid}`).setLabel(t(lang,'cat_continue')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function catQBuilderRow(gid, uid, lang, catName, questions) {
  const qText = questions.length ? questions.map((q,i) => `**${i+1}.** ${q}`).join('\n') : t(lang,'no_q');
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'cat_q_title',catName))
      .addFields({ name: t(lang,'q_label',questions.length), value: qText })
      .setColor(0x7c5af7)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:q_add:${gid}:${uid}`).setLabel(t(lang,'add_q')).setStyle(ButtonStyle.Primary).setDisabled(questions.length>=5),
      new ButtonBuilder().setCustomId(`wiz:q_rm:${gid}:${uid}`).setLabel(t(lang,'rm_q')).setStyle(ButtonStyle.Secondary).setDisabled(!questions.length),
      new ButtonBuilder().setCustomId(`wiz:cat_q_done:${gid}:${uid}`).setLabel(t(lang,'cat_q_done')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function formPreviewRow(gid, uid, guild, lang, w) {
  const d = w.data;
  const qs = d.questions || [];
  const fields = [
    { name: t(lang,'prev_channel'), value: d.channel_name ? `#${d.channel_name}` : '?', inline: true },
    { name: t(lang,'prev_log'),     value: d.log_channel_name ? `#${d.log_channel_name}` : t(lang,'none'), inline: true },
    { name: t(lang,'prev_approval'),value: d.approval ? t(lang,'yes_btn') : t(lang,'no_btn'), inline: true },
    { name: t(lang,'prev_questions',qs.length), value: qs.length ? qs.map((q,i) => `${i+1}. ${q}`).join('\n') : t(lang,'none') },
  ];
  if (d.approval && d.approval_role_names?.length) {
    fields.push({ name: t(lang,'prev_role'), value: d.approval_role_names.map(r=>`@${r}`).join(', '), inline: true });
  }
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'preview'))
      .setDescription(`**${d.title || 'Form'}**`)
      .addFields(fields).setColor(0x7c5af7)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:confirm:${gid}:${uid}`).setLabel(t(lang,'confirm')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:edit:${gid}:${uid}`).setLabel(t(lang,'edit_btn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function ticketPreviewRow(gid, uid, guild, lang, w) {
  const d = w.data;
  const roles = d.role_names || [];
  const cats  = d.categories || [];
  const fields = [
    { name: t(lang,'prev_channel'), value: d.channel_name ? `#${d.channel_name}` : '?', inline: true },
    { name: t(lang,'prev_roles'),   value: roles.length ? roles.map(r=>`@${r}`).join(', ') : t(lang,'none'), inline: true },
    { name: t(lang,'prev_cats',cats.length), value: cats.length
        ? cats.map((c,i) => `${i+1}. ${c.name}${c.questions?.length ? ` (${c.questions.length} q)` : ''}`).join('\n')
        : t(lang,'none') },
  ];
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'preview')).setDescription('🎫 **Ticket Panel**')
      .addFields(fields).setColor(0x5865F2)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:confirm:${gid}:${uid}`).setLabel(t(lang,'confirm')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:edit:${gid}:${uid}`).setLabel(t(lang,'edit_btn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

// ── Main step router ──────────────────────────────────────────────────────────

function buildStepMessage(guild, gid, uid, w) {
  const { type, step, lang, data } = w;
  const key = `${type}:${step}`;
  switch (key) {
    case 'form:questions':     return formBuilderRow(gid, uid, lang, data.title, data.questions || []);
    case 'form:channel':       return chRow(guild, gid, uid, lang, t(lang,'form_ch_prompt'));
    case 'form:log_channel':   return chRow(guild, gid, uid, lang, t(lang,'log_ch_prompt'), true);
    case 'form:approval':      return yesNoRow(gid, uid, lang, t(lang,'approval_q'));
    case 'form:approval_role': return rolesRow(gid, uid, lang, t(lang,'approval_role_prompt'));
    case 'form:confirm':       return formPreviewRow(gid, uid, guild, lang, w);
    case 'ticket:channel':     return chRow(guild, gid, uid, lang, t(lang,'ticket_ch_prompt'));
    case 'ticket:roles':       return rolesRow(gid, uid, lang, t(lang,'ticket_roles_prompt'));
    case 'ticket:categories_q':return yesNoRow(gid, uid, lang, t(lang,'categories_q'));
    case 'ticket:cat_builder': return w.sub_step === 'cat_questions'
                                 ? catQBuilderRow(gid, uid, lang, data.categories[data.current_cat_idx]?.name, data.categories[data.current_cat_idx]?.questions||[])
                                 : catBuilderRow(gid, uid, lang, data.categories||[]);
    case 'ticket:confirm':     return ticketPreviewRow(gid, uid, guild, lang, w);
    default:                   return null;
  }
}

// ── Wizard execution ──────────────────────────────────────────────────────────

async function executeFormWizard(guild, w, db) {
  const d = w.data;
  if (!d.channel_id) throw new Error('No channel selected');
  const formId = db.createForm(guild.id, {
    title:          d.title || 'Application Form',
    description:    d.description || '',
    channel_id:     d.channel_id,
    log_channel_id: d.log_channel_id || null,
    button_label:   d.button_label || 'Apply',
    mode:           d.approval ? 'yesno' : 'modal',
    yes_label:      d.approval ? 'Accept' : null,
    no_label:       d.approval ? 'Reject' : null,
  });
  (d.questions || []).slice(0, 5).forEach((q, i) => db.addFormQuestion(formId, String(q), i));
  if (d.approval && d.approval_role_ids?.length) {
    d.approval_role_ids.forEach(rid => db.addFormRole(formId, rid, 'yes'));
  }
  const ch = guild.channels.cache.get(d.channel_id);
  if (!ch) throw new Error(`Channel ${d.channel_name} not found`);
  const embed = new EmbedBuilder()
    .setTitle(d.title || 'Application Form')
    .setDescription(d.description || 'Click below to submit your application.')
    .setColor(0x7c5af7);
  const row = new ActionRowBuilder().addComponents(
    d.approval
      ? [new ButtonBuilder().setCustomId(`form:yes:${formId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
         new ButtonBuilder().setCustomId(`form:no:${formId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger)]
      : [new ButtonBuilder().setCustomId(`form:open:${formId}`).setLabel(d.button_label || 'Apply').setStyle(ButtonStyle.Primary)],
  );
  const msg = await ch.send({ embeds: [embed], components: [row] });
  db.setFormMessageId(formId, msg.id);
  return { channelName: ch.name };
}

async function executeTicketWizard(guild, w, db) {
  const d = w.data;
  if (!d.channel_id) throw new Error('No channel selected');
  const roleIds = d.support_role_ids || [];
  db.updateGuildConfig(guild.id, {
    support_role_id:   roleIds[0] ?? null,
    support_role_id_2: roleIds[1] ?? null,
    support_role_id_3: roleIds[2] ?? null,
    support_role_id_4: roleIds[3] ?? null,
    support_role_id_5: roleIds[4] ?? null,
    ticket_message:    d.message || 'Click below to open a ticket.',
    panel_channel_id:  d.channel_id,
  });
  const cats = d.categories || [];
  if (cats.length) {
    db.clearTicketCategories(guild.id);
    db.setTicketQuestions(guild.id, []);
    for (let i = 0; i < cats.length; i++) {
      const cid = db.createTicketCategory(guild.id, cats[i].name, i);
      if (cats[i].questions?.length) db.setCategoryQuestions(guild.id, cid, cats[i].questions.map(String));
    }
  }
  const allCats = db.getTicketCategories(guild.id);
  const ch      = guild.channels.cache.get(d.channel_id);
  if (!ch) throw new Error(`Channel ${d.channel_name} not found`);
  let panelRow;
  if (allCats.length > 0) {
    const sel = new StringSelectMenuBuilder()
      .setCustomId('ticket:category_select').setPlaceholder('Select a ticket type...')
      .setMinValues(1).setMaxValues(1)
      .addOptions(allCats.map(c => new StringSelectMenuOptionBuilder()
        .setLabel(c.name.substring(0,100)).setValue(String(c.id)).setEmoji('🎫')));
    panelRow = new ActionRowBuilder().addComponents(sel);
  } else {
    panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
  }
  const embed = new EmbedBuilder()
    .setTitle(d.title || '🎫 Support Tickets')
    .setDescription(d.message || 'Click below to open a ticket.')
    .setColor(0x5865F2);
  const msg = await ch.send({ embeds: [embed], components: [panelRow] });
  db.updateGuildConfig(guild.id, { panel_message_id: msg.id });
  return { channelName: ch.name, catCount: allCats.length };
}

// ── Interaction handler ───────────────────────────────────────────────────────

async function handleWizardInteraction(interaction, db) {
  const parts  = interaction.customId.split(':');
  const action = parts[1], gid = parts[2], uid = parts[3];
  if (!gid || !uid) return;
  if (interaction.user.id !== uid) return interaction.reply({ content: '❌', ephemeral: true });

  const guild = interaction.guild;
  const w     = getW(gid, uid);
  const lang  = w?.lang || 'en';

  if (!w && action !== 'cancel') return interaction.update({ content: t(lang,'expired'), embeds: [], components: [] }).catch(() => {});
  if (action === 'cancel') { if (w) delW(gid, uid); return interaction.update({ content: t(lang,'cancelled'), embeds: [], components: [] }); }

  // ── helpers ───────────────────────────────────────────────────────────────
  const advance = async (newStep) => {
    w.step = newStep;
    setW(gid, uid, w);
    const msg = buildStepMessage(guild, gid, uid, w);
    if (msg) await interaction.update(msg);
  };

  // ── channel selected ──────────────────────────────────────────────────────
  if (action === 'ch') {
    const chId = interaction.values[0];
    const ch   = guild.channels.cache.get(chId);
    if (!ch) return interaction.update({ content: '❌ Channel not found.', components: [] });
    w.data = w.data || {};
    if (w.step === 'log_channel') {
      w.data.log_channel_id = chId; w.data.log_channel_name = ch.name;
    } else {
      w.data.channel_id = chId; w.data.channel_name = ch.name;
    }
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── skip log channel ──────────────────────────────────────────────────────
  if (action === 'skip_ch') {
    w.data.log_channel_id = null; w.data.log_channel_name = null;
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── roles selected ────────────────────────────────────────────────────────
  if (action === 'roles') {
    const ids   = interaction.values;
    const names = ids.map(id => guild.roles.cache.get(id)?.name).filter(Boolean);
    w.data = w.data || {};
    if (w.type === 'form') {
      w.data.approval_role_ids   = ids;
      w.data.approval_role_names = names;
    } else {
      w.data.support_role_ids = ids;
      w.data.role_names       = names;
    }
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── skip roles ────────────────────────────────────────────────────────────
  if (action === 'skip_roles') {
    w.data = w.data || {};
    if (w.type === 'form') { w.data.approval_role_ids = []; w.data.approval_role_names = []; }
    else                   { w.data.support_role_ids  = []; w.data.role_names           = []; }
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── yes / no ──────────────────────────────────────────────────────────────
  if (action === 'yes' || action === 'no') {
    const isYes = action === 'yes';
    w.data = w.data || {};
    if (w.step === 'approval')      w.data.approval          = isYes;
    if (w.step === 'categories_q')  w.data.categories_enabled = isYes;
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── form question builder ─────────────────────────────────────────────────
  if (action === 'q_add') {
    const modal = new ModalBuilder().setCustomId(`wizmod:q_text:${gid}:${uid}`).setTitle(t(lang,'q_modal_t'));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel(t(lang,'q_modal_l')).setStyle(TextInputStyle.Short)
        .setPlaceholder(t(lang,'q_modal_ph')).setRequired(true).setMaxLength(200)
    ));
    return interaction.showModal(modal);
  }

  if (action === 'q_rm') {
    w.data = w.data || {};
    if (w.type === 'form') {
      (w.data.questions = w.data.questions || []).pop();
      setW(gid, uid, w);
      return interaction.update(formBuilderRow(gid, uid, lang, w.data.title, w.data.questions));
    }
    if (w.type === 'ticket' && w.step === 'cat_builder') {
      const idx = w.data.current_cat_idx;
      if (idx != null && w.data.categories[idx]) {
        (w.data.categories[idx].questions = w.data.categories[idx].questions || []).pop();
        setW(gid, uid, w);
        return interaction.update(catQBuilderRow(gid, uid, lang, w.data.categories[idx].name, w.data.categories[idx].questions));
      }
    }
  }

  if (action === 'q_done') {
    // form:questions → advance to channel
    w.data = w.data || {};
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── ticket category builder ───────────────────────────────────────────────
  if (action === 'cat_add') {
    const modal = new ModalBuilder().setCustomId(`wizmod:cat_name:${gid}:${uid}`).setTitle(t(lang,'cat_modal_t'));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel(t(lang,'cat_modal_l')).setStyle(TextInputStyle.Short)
        .setPlaceholder(t(lang,'cat_modal_ph')).setRequired(true).setMaxLength(50)
    ));
    return interaction.showModal(modal);
  }

  if (action === 'cat_q_done') {
    // Done with current category's questions → back to cat list
    w.sub_step = null;
    w.data.current_cat_idx = null;
    setW(gid, uid, w);
    return interaction.update(catBuilderRow(gid, uid, lang, w.data.categories || []));
  }

  if (action === 'cat_continue') {
    // Done adding categories → advance to confirm
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── confirm ───────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    await interaction.deferUpdate();
    try {
      let result, msg;
      if (w.type === 'form') {
        result = await executeFormWizard(guild, w, db);
        msg = lang === 'he'
          ? `✅ הטופס **${w.data.title || 'Form'}** נוצר בהצלחה ב-#${result.channelName}!`
          : `✅ Form **${w.data.title || 'Form'}** created in #${result.channelName}!`;
      } else {
        result = await executeTicketWizard(guild, w, db);
        msg = lang === 'he'
          ? `✅ לוח הכרטיסים נוצר ב-#${result.channelName}! (${result.catCount} קטגוריות)`
          : `✅ Ticket panel created in #${result.channelName}! (${result.catCount} categories)`;
      }
      delW(gid, uid);
      await interaction.editReply({ content: '✅ Done!', embeds: [], components: [] });
      await interaction.channel.send({ content: msg });
    } catch (e) {
      console.error('[wizard] execute error:', e.message);
      await interaction.editReply({ content: `❌ Failed: \`${e.message}\``, embeds: [], components: [] });
    }
    return;
  }

  // ── edit (restart) ────────────────────────────────────────────────────────
  if (action === 'edit') {
    w.step     = w.type === 'form' ? 'questions' : 'channel';
    w.sub_step = null;
    w.data     = { title: w.data?.title, message: w.data?.message, questions: [], categories: [], support_role_ids: [] };
    await advance(w.step);
    return;
  }
}

// ── Modal handler ─────────────────────────────────────────────────────────────

async function handleWizardModal(interaction, db) {
  const parts  = interaction.customId.split(':');
  const action = parts[1], gid = parts[2], uid = parts[3];
  if (!gid || !uid) return;
  if (interaction.user.id !== uid) return interaction.reply({ content: '❌', ephemeral: true });

  const w    = getW(gid, uid);
  const lang = w?.lang || 'en';
  if (!w) return interaction.update({ content: t(lang,'expired'), embeds: [], components: [] });

  const val = interaction.fields.getTextInputValue('val').trim();

  if (action === 'q_text') {
    w.data = w.data || {};
    if (w.type === 'form') {
      (w.data.questions = w.data.questions || []).push(val);
      setW(gid, uid, w);
      return interaction.update(formBuilderRow(gid, uid, lang, w.data.title, w.data.questions));
    }
    if (w.type === 'ticket' && w.step === 'cat_builder') {
      const idx = w.data.current_cat_idx;
      if (idx != null && w.data.categories[idx]) {
        (w.data.categories[idx].questions = w.data.categories[idx].questions || []).push(val);
        setW(gid, uid, w);
        return interaction.update(catQBuilderRow(gid, uid, lang, w.data.categories[idx].name, w.data.categories[idx].questions));
      }
    }
  }

  if (action === 'cat_name') {
    w.data = w.data || {};
    w.data.categories = w.data.categories || [];
    const idx = w.data.categories.length;
    w.data.categories.push({ name: val, questions: [] });
    w.data.current_cat_idx = idx;
    w.sub_step = 'cat_questions';
    setW(gid, uid, w);
    return interaction.update(catQBuilderRow(gid, uid, lang, val, []));
  }
}

module.exports = {
  handleWizardInteraction, handleWizardModal,
  getW, setW, delW,
  buildStepMessage,
  // legacy exports for aiChat.js ask_* actions
  chPickerMsg: (guild, gid, uid, lang, prompt) => chRow(guild, gid, uid, lang, prompt),
  rolePickerMsg: (gid, uid, lang, prompt) => rolesRow(gid, uid, lang, prompt),
  confirmMsg: (gid, uid, lang, description, fields) => ({
    embeds: [new EmbedBuilder().setTitle(t(lang,'preview')).setDescription(description||'').addFields(fields||[]).setColor(0x5865F2)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:confirm:${gid}:${uid}`).setLabel(t(lang,'confirm')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:edit:${gid}:${uid}`).setLabel(t(lang,'edit_btn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  }),
  formBuilderMsg: (gid, uid, lang, title, questions) => formBuilderRow(gid, uid, lang, title, questions||[]),
};