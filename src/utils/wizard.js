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

    // form customization
    fm_title_prompt: 'Form title',
    fm_title_ph: 'Application Form',
    fm_desc_prompt: 'Form description',
    fm_desc_ph: 'Click below to submit your application.',
    fm_btn_label_prompt: 'Button label',
    fm_btn_label_ph: 'Apply',
    fm_prev_title: '📋 Title', fm_prev_desc: '📝 Description', fm_prev_btn: '🔘 Button Label',
    // ticket customization
    tk_title_prompt: 'Panel title',
    tk_title_ph: '🎫 Support Tickets',
    tk_desc_prompt: 'Panel description',
    tk_desc_ph: 'Click below to open a ticket.',
    tk_btn_label_prompt: 'Button label',
    tk_btn_label_ph: '🎫 Open a Ticket',
    tk_color_prompt: '🎨 Choose embed color for the panel',
    tk_prev_title: '📋 Title', tk_prev_desc: '📝 Description',
    tk_prev_btn: '🔘 Button Label', tk_prev_color: '🎨 Color',
    // role panel wizard
    rp_title_prompt: '📝 What should the panel title be?',
    rp_desc_prompt: '📝 Description text (below the title)',
    rp_ch_prompt: '📢 Which channel should the role panel be in?',
    rp_add_btn: '➕ Add Button', rp_rm_btn: '🗑️ Remove Last', rp_done: '▶️ Continue',
    rp_btn_label: (n) => `Buttons (${n}/5)`,
    rp_no_btns: '*(none — click Add Button)*',
    rp_wiz: '🎭 Role Panel Builder',
    rp_btn_modal_t: 'Add a Role Button',
    rp_btn_label_l: 'Button label (e.g. 🎮 Gamer)',
    rp_btn_label_ph: 'e.g. 🎮 Gamer',
    rp_role_prompt: '🎭 Which role for this button?',
    rp_color_prompt: '🎨 Choose panel embed color',
    rp_prev_title: '📋 Title', rp_prev_desc: '📝 Description',
    rp_prev_btns: (n) => `🔘 Buttons (${n})`,
    rp_prev_color: '🎨 Color',
    // welcome/goodbye wizard
    wg_ch_prompt_w: '📢 Which channel for welcome messages?',
    wg_ch_prompt_g: '📢 Which channel for goodbye messages?',
    wg_msg_modal_t_w: 'Welcome Message', wg_msg_modal_t_g: 'Goodbye Message',
    wg_msg_label: 'Message text',
    wg_msg_ph_w: 'Welcome {user} to {server}! 🎉',
    wg_msg_ph_g: 'Goodbye {user}, we will miss you!',
    wg_wiz_w: '👋 Welcome Setup', wg_wiz_g: '👋 Goodbye Setup',
    wg_prev_msg: '💬 Message', wg_prev_placeholders: '📎 Placeholders',
    wg_placeholders: '{user} = mention, {username} = name, {server} = server, {membercount} = count',
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

    // form customization
    fm_title_prompt: 'שם הטופס',
    fm_title_ph: 'טופס הרשמה',
    fm_desc_prompt: 'תיאור הטופס',
    fm_desc_ph: 'לחצו למטה כדי להגיש בקשה.',
    fm_btn_label_prompt: 'טקסט הכפתור',
    fm_btn_label_ph: 'הגש בקשה',
    fm_prev_title: '📋 שם', fm_prev_desc: '📝 תיאור', fm_prev_btn: '🔘 טקסט כפתור',
    // ticket customization
    tk_title_prompt: 'כותרת הפאנל',
    tk_title_ph: '🎫 מערכת כרטיסים',
    tk_desc_prompt: 'תיאור הפאנל',
    tk_desc_ph: 'לחצו למטה כדי לפתוח כרטיס.',
    tk_btn_label_prompt: 'טקסט הכפתור',
    tk_btn_label_ph: '🎫 פתח כרטיס',
    tk_color_prompt: '🎨 בחר צבע להודעת הפאנל',
    tk_prev_title: '📋 כותרת', tk_prev_desc: '📝 תיאור',
    tk_prev_btn: '🔘 טקסט כפתור', tk_prev_color: '🎨 צבע',
    // role panel wizard
    rp_title_prompt: '📝 מה יהיה כותרת הפאנל?',
    rp_desc_prompt: '📝 טקסט תיאור (מתחת לכותרת)',
    rp_ch_prompt: '📢 באיזה ערוץ לשים את פאנל התפקידים?',
    rp_add_btn: '➕ הוסף כפתור', rp_rm_btn: '🗑️ הסר אחרון', rp_done: '▶️ המשך',
    rp_btn_label: (n) => `כפתורים (${n}/5)`,
    rp_no_btns: '*(אין — לחץ הוסף כפתור)*',
    rp_wiz: '🎭 בניית פאנל תפקידים',
    rp_btn_modal_t: 'הוספת כפתור תפקיד',
    rp_btn_label_l: 'תווית הכפתור (לדוגמה: 🎮 גיימר)',
    rp_btn_label_ph: 'לדוגמה: 🎮 גיימר',
    rp_role_prompt: '🎭 איזה תפקיד לכפתור הזה?',
    rp_color_prompt: '🎨 בחר צבע להודעה',
    rp_prev_title: '📋 כותרת', rp_prev_desc: '📝 תיאור',
    rp_prev_btns: (n) => `🔘 כפתורים (${n})`,
    rp_prev_color: '🎨 צבע',
    // welcome/goodbye wizard
    wg_ch_prompt_w: '📢 באיזה ערוץ הודעות קבלת פנים?',
    wg_ch_prompt_g: '📢 באיזה ערוץ הודעות פרידה?',
    wg_msg_modal_t_w: 'הודעת קבלת פנים', wg_msg_modal_t_g: 'הודעת פרידה',
    wg_msg_label: 'טקסט ההודעה',
    wg_msg_ph_w: 'ברוכים הבאים {user} ל-{server}! 🎉',
    wg_msg_ph_g: 'להתראות {user}, נתגעגע!',
    wg_wiz_w: '👋 הגדרת קבלת פנים', wg_wiz_g: '👋 הגדרת פרידה',
    wg_prev_msg: '💬 הודעה', wg_prev_placeholders: '📎 מילות מפתח',
    wg_placeholders: '{user} = אזכור, {username} = שם, {server} = שרת, {membercount} = מספר חברים',
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
    const map = { questions:'fm_title', fm_title:'fm_desc', fm_desc:'fm_btn_label', fm_btn_label:'channel', channel:'log_channel', log_channel:'approval',
                  approval: data.approval ? 'approval_role' : 'confirm',
                  approval_role:'confirm' };
    return map[step] ?? 'confirm';
  }
  if (type === 'ticket') {
    const map = { channel:'roles', roles:'tk_title',
                  tk_title:'tk_message', tk_message:'tk_btn_label', tk_btn_label:'tk_color',
                  tk_color:'categories_q',
                  categories_q: data.categories_enabled ? 'cat_builder' : 'confirm',
                  cat_builder:'confirm' };
    return map[step] ?? 'confirm';
  }

  if (type === 'role_panel') {
    const map = { channel:'button_builder', button_builder:'color', color:'title', title:'description', description:'confirm' };
    return map[step] ?? 'confirm';
  }
  if (type === 'welcome' || type === 'goodbye') {
    const map = { channel:'message', message:'confirm' };
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
    { name: t(lang,'fm_prev_title'), value: d.title || t(lang,'fm_title_ph'), inline: true },
    { name: t(lang,'fm_prev_desc'), value: d.description || t(lang,'fm_desc_ph'), inline: true },
    { name: t(lang,'fm_prev_btn'), value: d.button_label || t(lang,'fm_btn_label_ph'), inline: true },
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
    { name: t(lang,'tk_prev_title'), value: d.title || t(lang,'tk_title_ph'), inline: true },
    { name: t(lang,'tk_prev_desc'), value: d.message || t(lang,'tk_desc_ph'), inline: true },
    { name: t(lang,'prev_channel'), value: d.channel_name ? `#${d.channel_name}` : '?', inline: true },
    { name: t(lang,'tk_prev_btn'), value: d.button_label || t(lang,'tk_btn_label_ph'), inline: true },
    { name: t(lang,'tk_prev_color'), value: d.color ? `#${d.color}` : '#5865F2', inline: true },
    { name: t(lang,'prev_roles'), value: roles.length ? roles.map(r=>`@${r}`).join(', ') : t(lang,'none'), inline: true },
    { name: t(lang,'prev_cats',cats.length), value: cats.length
        ? cats.map((c,i) => `${i+1}. ${c.name}${c.questions?.length ? ` (${c.questions.length} q)` : ''}`).join('\n')
        : t(lang,'none') },
  ];
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'preview')).setDescription(`\ud83c\udf9f\ufe0f **${d.title || 'Ticket Panel'}**`)
      .addFields(fields).setColor(parseInt(d.color || '5865F2', 16))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:confirm:${gid}:${uid}`).setLabel(t(lang,'confirm')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:edit:${gid}:${uid}`).setLabel(t(lang,'edit_btn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}


// ── Role panel wizard builders ───────────────────────────────────────────

function rpButtonBuilderRow(gid, uid, lang, buttons) {
  const btnText = buttons.length
    ? buttons.map((b,i) => `**${i+1}.** ${b.label} → @${b.roleName}`).join('\n')
    : t(lang,'rp_no_btns');
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'rp_wiz'))
      .addFields({ name: t(lang,'rp_btn_label',buttons.length), value: btnText })
      .setColor(0x7c5af7)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:rp_add:${gid}:${uid}`).setLabel(t(lang,'rp_add_btn')).setStyle(ButtonStyle.Primary).setDisabled(buttons.length>=5),
      new ButtonBuilder().setCustomId(`wiz:rp_rm:${gid}:${uid}`).setLabel(t(lang,'rp_rm_btn')).setStyle(ButtonStyle.Secondary).setDisabled(!buttons.length),
      new ButtonBuilder().setCustomId(`wiz:rp_done:${gid}:${uid}`).setLabel(t(lang,'rp_done')).setStyle(ButtonStyle.Success).setDisabled(!buttons.length),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function colorPickerRow(gid, uid, lang) {
  const sel = new StringSelectMenuBuilder()
    .setCustomId(`wiz:color_pick:${gid}:${uid}`)
    .setPlaceholder(t(lang,'rp_color_prompt'))
    .addOptions([{"label":"🔵 Blue","value":"5865F2"},{"label":"🟣 Purple","value":"7c5af7"},{"label":"🔴 Red","value":"ED4245"},{"label":"🟢 Green","value":"57F287"},{"label":"🟡 Yellow","value":"FEE75C"},{"label":"🟠 Orange","value":"E67E22"},{"label":"⚪ White","value":"FFFFFF"},{"label":"⚫ Dark","value":"2C2F33"}].map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.value)
    ));
  return {
    embeds: [new EmbedBuilder().setDescription(t(lang,'rp_color_prompt')).setColor(0x5865F2)],
    components: [
      new ActionRowBuilder().addComponents(sel),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

function rpPreviewRow(gid, uid, guild, lang, w) {
  const d = w.data;
  const btns = d.buttons || [];
  const fields = [
    { name: t(lang,'rp_prev_title'), value: d.title || '?', inline: true },
    { name: t(lang,'rp_prev_desc'), value: d.description || '-', inline: true },
    { name: t(lang,'prev_channel'), value: d.channel_name ? `#${d.channel_name}` : '?', inline: true },
    { name: t(lang,'rp_prev_color'), value: d.color ? `#${d.color}` : '#5865F2', inline: true },
    { name: t(lang,'rp_prev_btns',btns.length), value: btns.map((b,i) => `${i+1}. ${b.label} \u2192 @${b.roleName}`).join('\n') || '-' },
  ];
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'preview')).setDescription(`**${d.title || 'Role Panel'}**`)
      .addFields(fields).setColor(parseInt(d.color || '5865F2', 16))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:confirm:${gid}:${uid}`).setLabel(t(lang,'confirm')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:edit:${gid}:${uid}`).setLabel(t(lang,'edit_btn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

// ── Welcome/Goodbye wizard builders ──────────────────────────────────────

function wgMessageRow(gid, uid, lang, wType) {
  const isW = wType === 'welcome';
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang, isW ? 'wg_wiz_w' : 'wg_wiz_g'))
      .setDescription(t(lang,'wg_prev_placeholders') + '\n' + t(lang,'wg_placeholders'))
      .setColor(isW ? 0x57F287 : 0xED4245)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:wg_msg:${gid}:${uid}`).setLabel('\u270f\ufe0f ' + t(lang,'wg_msg_label')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`wiz:wg_skip_msg:${gid}:${uid}`).setLabel(t(lang,'skip')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function wgPreviewRow(gid, uid, guild, lang, w) {
  const d = w.data;
  const isW = w.type === 'welcome';
  const fields = [
    { name: t(lang,'prev_channel'), value: d.channel_name ? `#${d.channel_name}` : '?', inline: true },
    { name: t(lang,'wg_prev_msg'), value: d.message || '(default)' },
    { name: t(lang,'wg_prev_placeholders'), value: t(lang,'wg_placeholders') },
  ];
  return {
    embeds: [new EmbedBuilder()
      .setTitle(t(lang,'preview') + ' \u2014 ' + t(lang, isW ? 'wg_wiz_w' : 'wg_wiz_g'))
      .addFields(fields).setColor(isW ? 0x57F287 : 0xED4245)],
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

    case 'form:fm_title':     { const m = new ModalBuilder().setCustomId(`wizmod:fm_title:${gid}:${uid}`).setTitle(t(lang,'fm_title_prompt')); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'fm_title_prompt')).setStyle(TextInputStyle.Short).setPlaceholder(t(lang,'fm_title_ph')).setRequired(true).setMaxLength(100))); return { __modal: m }; }
    case 'form:fm_desc':      { const m = new ModalBuilder().setCustomId(`wizmod:fm_desc:${gid}:${uid}`).setTitle(t(lang,'fm_desc_prompt')); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'fm_desc_prompt')).setStyle(TextInputStyle.Paragraph).setPlaceholder(t(lang,'fm_desc_ph')).setRequired(false).setMaxLength(500))); return { __modal: m }; }
    case 'form:fm_btn_label': { const m = new ModalBuilder().setCustomId(`wizmod:fm_btn_label:${gid}:${uid}`).setTitle(t(lang,'fm_btn_label_prompt')); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'fm_btn_label_prompt')).setStyle(TextInputStyle.Short).setPlaceholder(t(lang,'fm_btn_label_ph')).setRequired(true).setMaxLength(80))); return { __modal: m }; }
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

    case 'ticket:tk_title':     { const m = new ModalBuilder().setCustomId(`wizmod:tk_title:${gid}:${uid}`).setTitle(t(lang,'tk_title_prompt')); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'tk_title_prompt')).setStyle(TextInputStyle.Short).setPlaceholder(t(lang,'tk_title_ph')).setRequired(true).setMaxLength(100))); return { __modal: m }; }
    case 'ticket:tk_message':   { const m = new ModalBuilder().setCustomId(`wizmod:tk_message:${gid}:${uid}`).setTitle(t(lang,'tk_desc_prompt')); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'tk_desc_prompt')).setStyle(TextInputStyle.Paragraph).setPlaceholder(t(lang,'tk_desc_ph')).setRequired(false).setMaxLength(500))); return { __modal: m }; }
    case 'ticket:tk_btn_label': { const m = new ModalBuilder().setCustomId(`wizmod:tk_btn_label:${gid}:${uid}`).setTitle(t(lang,'tk_btn_label_prompt')); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'tk_btn_label_prompt')).setStyle(TextInputStyle.Short).setPlaceholder(t(lang,'tk_btn_label_ph')).setRequired(true).setMaxLength(80))); return { __modal: m }; }
    case 'ticket:tk_color':     return colorPickerRow(gid, uid, lang);
    case 'ticket:confirm':     return ticketPreviewRow(gid, uid, guild, lang, w);

    // role panel
    case 'role_panel:title':          { const m = new ModalBuilder().setCustomId(`wizmod:rp_title:${gid}:${uid}`).setTitle(t(lang,'rp_title_prompt').slice(0,45)); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'rp_title_prompt').slice(0,45)).setStyle(TextInputStyle.Short).setPlaceholder('\ud83c\udfad Choose Your Roles').setRequired(true).setMaxLength(100))); return { __modal: m }; }
    case 'role_panel:description':    { const m = new ModalBuilder().setCustomId(`wizmod:rp_desc:${gid}:${uid}`).setTitle(t(lang,'rp_desc_prompt').slice(0,45)); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel(t(lang,'rp_desc_prompt').slice(0,45)).setStyle(TextInputStyle.Paragraph).setPlaceholder('Click a button to get a role!').setRequired(false).setMaxLength(500))); return { __modal: m }; }
    case 'role_panel:channel':        return chRow(guild, gid, uid, lang, t(lang,'rp_ch_prompt'));
    case 'role_panel:button_builder': return rpButtonBuilderRow(gid, uid, lang, data.buttons || []);
    case 'role_panel:color':          return colorPickerRow(gid, uid, lang);
    case 'role_panel:confirm':        return rpPreviewRow(gid, uid, guild, lang, w);
    // welcome/goodbye
    case 'welcome:channel':           return chRow(guild, gid, uid, lang, t(lang,'wg_ch_prompt_w'));
    case 'welcome:message':           return wgMessageRow(gid, uid, lang, 'welcome');
    case 'welcome:confirm':           return wgPreviewRow(gid, uid, guild, lang, w);
    case 'goodbye:channel':           return chRow(guild, gid, uid, lang, t(lang,'wg_ch_prompt_g'));
    case 'goodbye:message':           return wgMessageRow(gid, uid, lang, 'goodbye');
    case 'goodbye:confirm':           return wgPreviewRow(gid, uid, guild, lang, w);
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
      new ButtonBuilder().setCustomId('ticket:open').setLabel(d.button_label || 'Open a Ticket').setEmoji('\ud83c\udf9f\ufe0f').setStyle(ButtonStyle.Primary)
    );
  }
  const embed = new EmbedBuilder()
    .setTitle(d.title || '\ud83c\udf9f\ufe0f Support Tickets')
    .setDescription(d.message || 'Click below to open a ticket.')
    .setColor(parseInt(d.color || '5865F2', 16));
  const msg = await ch.send({ embeds: [embed], components: [panelRow] });
  db.updateGuildConfig(guild.id, { panel_message_id: msg.id });
  return { channelName: ch.name, catCount: allCats.length };
}


async function executeRolePanelWizard(guild, w, db) {
  const d = w.data;
  if (!d.channel_id) throw new Error('No channel selected');
  if (!d.buttons?.length) throw new Error('No buttons defined');

  const ch = guild.channels.cache.get(d.channel_id);
  if (!ch) throw new Error('Channel not found');

  const validBtns = d.buttons.map(b => {
    const role = guild.roles.cache.get(b.roleId);
    return role ? { ...b, role } : null;
  }).filter(Boolean);
  if (!validBtns.length) throw new Error('No valid roles');

  const roleIds = validBtns.map(b => b.role.id);
  const panelId = db.createButtonRole(guild.id, ch.id, d.title || 'Role Panel', d.description || '', roleIds);

  const embed = new EmbedBuilder()
    .setTitle(d.title || '\ud83c\udfad Role Panel')
    .setDescription(d.description || 'Click a button to toggle your role.')
    .setColor(parseInt(d.color || '5865F2', 16));

  const btns = validBtns.slice(0, 5).map(b => {
    const btn = new ButtonBuilder()
      .setCustomId(`role:toggle::${b.role.id}`)
      .setLabel(b.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary);
    return btn;
  });

  const msg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(...btns)] });
  db.updateButtonRoleMsgId(panelId, msg.id);
  return { channelName: ch.name, btnCount: btns.length };
}

async function executeWelcomeGoodbyeWizard(guild, w, db) {
  const d = w.data;
  if (!d.channel_id) throw new Error('No channel selected');
  const isW = w.type === 'welcome';
  const defaults = isW
    ? { msg: 'Welcome {user} to {server}! \ud83c\udf89', chKey: 'welcome_channel_id', msgKey: 'welcome_message', enKey: 'welcome_enabled' }
    : { msg: 'Goodbye {user}, we will miss you!', chKey: 'goodbye_channel_id', msgKey: 'goodbye_message', enKey: 'goodbye_enabled' };
  db.updateGuildConfig(guild.id, {
    [defaults.chKey]: d.channel_id,
    [defaults.msgKey]: d.message || defaults.msg,
    [defaults.enKey]: 1,
  });
  const ch = guild.channels.cache.get(d.channel_id);
  return { channelName: ch?.name || '?', type: w.type };
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
    if (msg?.__modal) return interaction.showModal(msg.__modal);
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


  // ── role panel: add button (opens modal for label) ────────────────────
  if (action === 'rp_add') {
    const modal = new ModalBuilder().setCustomId(`wizmod:rp_btn_label:${gid}:${uid}`).setTitle(t(lang,'rp_btn_modal_t'));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel(t(lang,'rp_btn_label_l').slice(0,45)).setStyle(TextInputStyle.Short)
        .setPlaceholder(t(lang,'rp_btn_label_ph')).setRequired(true).setMaxLength(80)
    ));
    return interaction.showModal(modal);
  }

  if (action === 'rp_rm') {
    w.data = w.data || {};
    (w.data.buttons = w.data.buttons || []).pop();
    setW(gid, uid, w);
    return interaction.update(rpButtonBuilderRow(gid, uid, lang, w.data.buttons));
  }

  if (action === 'rp_done') {
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── role panel: role selected for pending button ──────────────────────
  if (action === 'rp_role') {
    const roleId = interaction.values[0];
    const role = guild.roles.cache.get(roleId);
    if (!role) return;
    w.data = w.data || {};
    w.data.buttons = w.data.buttons || [];
    const pending = w.data._pendingBtnLabel;
    if (pending) {
      w.data.buttons.push({ label: pending, roleId: role.id, roleName: role.name });
      delete w.data._pendingBtnLabel;
    }
    w.step = 'button_builder';
    setW(gid, uid, w);
    return interaction.update(rpButtonBuilderRow(gid, uid, lang, w.data.buttons));
  }

  // ── color picker ──────────────────────────────────────────────────────
  if (action === 'color_pick') {
    w.data = w.data || {};
    w.data.color = interaction.values[0];
    await advance(nextStep(w.type, w.step, w.data));
    return;
  }

  // ── welcome/goodbye: message button -> show modal ─────────────────────
  if (action === 'wg_msg') {
    const isW = w.type === 'welcome';
    const modal = new ModalBuilder().setCustomId(`wizmod:wg_msg:${gid}:${uid}`).setTitle(t(lang, isW ? 'wg_msg_modal_t_w' : 'wg_msg_modal_t_g'));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel(t(lang,'wg_msg_label')).setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(t(lang, isW ? 'wg_msg_ph_w' : 'wg_msg_ph_g')).setRequired(true).setMaxLength(500)
    ));
    return interaction.showModal(modal);
  }

  if (action === 'wg_skip_msg') {
    w.data = w.data || {};
    const isW = w.type === 'welcome';
    w.data.message = isW ? t(lang,'wg_msg_ph_w') : t(lang,'wg_msg_ph_g');
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
      } else if (w.type === 'ticket') {
        result = await executeTicketWizard(guild, w, db);
        msg = lang === 'he'
          ? `✅ לוח הכרטיסים נוצר ב-#${result.channelName}! (${result.catCount} קטגוריות)`
          : `\u2705 Ticket panel created in #${result.channelName}! (${result.catCount} categories)`;
      } else if (w.type === 'role_panel') {
        result = await executeRolePanelWizard(guild, w, db);
        msg = lang === 'he'
          ? `\u2705 \u05e4\u05d0\u05e0\u05dc \u05ea\u05e4\u05e7\u05d9\u05d3\u05d9\u05dd \u05e0\u05d5\u05e6\u05e8 \u05d1-#${result.channelName} \u05e2\u05dd ${result.btnCount} \u05db\u05e4\u05ea\u05d5\u05e8\u05d9\u05dd!`
          : `\u2705 Role panel created in #${result.channelName} with ${result.btnCount} buttons!`;
      } else if (w.type === 'welcome' || w.type === 'goodbye') {
        result = await executeWelcomeGoodbyeWizard(guild, w, db);
        const typeLabel = w.type === 'welcome' ? (lang === 'he' ? '\u05e7\u05d1\u05dc\u05ea \u05e4\u05e0\u05d9\u05dd' : 'Welcome') : (lang === 'he' ? '\u05e4\u05e8\u05d9\u05d3\u05d4' : 'Goodbye');
        msg = lang === 'he'
          ? `\u2705 \u05d4\u05d5\u05d3\u05e2\u05ea ${typeLabel} \u05d4\u05d5\u05d2\u05d3\u05e8\u05d4 \u05d1-#${result.channelName}!`
          : `\u2705 ${typeLabel} message set up in #${result.channelName}!`;
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
    w.data     = w.type === 'role_panel' ? { buttons: [] } : (w.type === 'welcome' || w.type === 'goodbye') ? {} : { title: w.data?.title, message: w.data?.message, questions: [], categories: [], support_role_ids: [] };
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




  // form title modal
  if (action === 'fm_title') {
    w.data = w.data || {};
    w.data.title = val;
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg?.__modal) return interaction.showModal(msg.__modal);
    if (msg) return interaction.update(msg);
    return;
  }

  // form description modal
  if (action === 'fm_desc') {
    w.data = w.data || {};
    w.data.description = val || '';
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg?.__modal) return interaction.showModal(msg.__modal);
    if (msg) return interaction.update(msg);
    return;
  }

  // form button label modal
  if (action === 'fm_btn_label') {
    w.data = w.data || {};
    w.data.button_label = val;
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg) return interaction.update(msg);
    return;
  }

  // ticket title modal
  if (action === 'tk_title') {
    w.data = w.data || {};
    w.data.title = val;
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg?.__modal) return interaction.showModal(msg.__modal);
    if (msg) return interaction.update(msg);
    return;
  }

  // ticket message/description modal
  if (action === 'tk_message') {
    w.data = w.data || {};
    w.data.message = val || '';
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg?.__modal) return interaction.showModal(msg.__modal);
    if (msg) return interaction.update(msg);
    return;
  }

  // ticket button label modal
  if (action === 'tk_btn_label') {
    w.data = w.data || {};
    w.data.button_label = val;
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg) return interaction.update(msg);
    return;
  }

  // role panel title modal
  if (action === 'rp_title') {
    w.data = w.data || {};
    w.data.title = val;
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg?.__modal) return interaction.showModal(msg.__modal);
    if (msg) return interaction.update(msg);
    return;
  }

  // role panel description modal
  if (action === 'rp_desc') {
    w.data = w.data || {};
    w.data.description = val || '';
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg) return interaction.update(msg);
    return;
  }

  // role panel button label modal -> show role picker
  if (action === 'rp_btn_label') {
    w.data = w.data || {};
    w.data._pendingBtnLabel = val;
    setW(gid, uid, w);
    return interaction.update({
      embeds: [new EmbedBuilder().setDescription(t(lang,'rp_role_prompt') + `\n\n\ud83c\udff7\ufe0f ${val}`).setColor(0x5865F2)],
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder().setCustomId(`wiz:rp_role:${gid}:${uid}`).setPlaceholder(t(lang,'rp_role_prompt')).setMinValues(1).setMaxValues(1)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`wiz:cancel:${gid}:${uid}`).setLabel(t(lang,'cancel')).setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  }

  // welcome/goodbye message modal
  if (action === 'wg_msg') {
    w.data = w.data || {};
    w.data.message = val;
    w.step = nextStep(w.type, w.step, w.data);
    setW(gid, uid, w);
    const msg = buildStepMessage(interaction.guild, gid, uid, w);
    if (msg) return interaction.update(msg);
    return;
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