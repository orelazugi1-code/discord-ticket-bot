'use strict';
const {
  ChannelType, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');

// ── Language strings ──────────────────────────────────────────────────────────

const T = {
  en: {
    pick_ch:    'Select a channel',
    pick_roles: 'Select roles (you can pick multiple)',
    no_roles:   '⏭️ No roles — skip',
    add_q:      '➕ Add Question',
    rm_q:       '🗑️ Remove Last',
    q_done:     '▶️ Continue',
    confirm:    '✅ Confirm & Create',
    edit_btn:   '✏️ Edit',
    cancel:     '❌ Cancel',
    preview:    '📋 Preview',
    form_wiz:   '📋 Form Builder',
    q_label:    (n) => `Questions (${n}/5)`,
    no_q:       '*(none — click Add Question)*',
    q_modal_t:  'Add a Question',
    q_modal_l:  'Question text',
    q_modal_ph: 'e.g. What is your username?',
    cancelled:  '❌ Wizard cancelled.',
    confirmed:  '⏳ Confirmed — building…',
    expired:    '⏱️ Wizard session expired.',
    selected:   (v) => `✅ ${v}`,
  },
  he: {
    pick_ch:    'בחר ערוץ',
    pick_roles: 'בחר תפקידים (ניתן לבחור מספר)',
    no_roles:   '⏭️ ללא תפקידים — דלג',
    add_q:      '➕ הוסף שאלה',
    rm_q:       '🗑️ הסר אחרון',
    q_done:     '▶️ המשך',
    confirm:    '✅ אישור וצור',
    edit_btn:   '✏️ עריכה',
    cancel:     '❌ ביטול',
    preview:    '📋 תצוגה מקדימה',
    form_wiz:   '📋 בניית טופס',
    q_label:    (n) => `שאלות (${n}/5)`,
    no_q:       '*(אין — לחץ הוסף שאלה)*',
    q_modal_t:  'הוספת שאלה',
    q_modal_l:  'טקסט השאלה',
    q_modal_ph: 'לדוגמה: מה שם המשתמש שלך?',
    cancelled:  '❌ הקסם בוטל.',
    confirmed:  '⏳ מאושר — בונה…',
    expired:    '⏱️ פג תוקף הקסם.',
    selected:   (v) => `✅ ${v}`,
  },
};

function tr(lang, key, ...args) {
  const tbl = T[lang] ?? T.en;
  const v   = tbl[key] ?? T.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

// ── Wizard store ──────────────────────────────────────────────────────────────

const store = new Map();
const TTL   = 15 * 60_000;

function getW(guildId, userId) {
  const k = `${guildId}:${userId}`;
  const w = store.get(k);
  if (!w || Date.now() > w.expiresAt) { store.delete(k); return null; }
  w.expiresAt = Date.now() + TTL;
  return w;
}

function setW(guildId, userId, data) {
  store.set(`${guildId}:${userId}`, { ...data, guildId, userId, expiresAt: Date.now() + TTL });
}

function delW(guildId, userId) { store.delete(`${guildId}:${userId}`); }

// ── Component builders (exported for use by aiChat.js) ────────────────────────

function chPickerMsg(guild, guildId, userId, lang, prompt) {
  const channels = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position)
    .slice(0, 25);

  const sel = new StringSelectMenuBuilder()
    .setCustomId(`wiz:ch:${guildId}:${userId}`)
    .setPlaceholder(prompt || tr(lang, 'pick_ch'))
    .addOptions(channels.map(ch =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`#${ch.name}`.slice(0, 100))
        .setValue(ch.id)
        .setDescription((ch.parent?.name || '').slice(0, 100) || ' '),
    ));

  return {
    embeds:     [new EmbedBuilder().setDescription(prompt || tr(lang, 'pick_ch')).setColor(0x5865F2)],
    components: [
      new ActionRowBuilder().addComponents(sel),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wiz:cancel:${guildId}:${userId}`).setLabel(tr(lang,'cancel')).setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

function rolePickerMsg(guildId, userId, lang, prompt) {
  const sel = new RoleSelectMenuBuilder()
    .setCustomId(`wiz:roles:${guildId}:${userId}`)
    .setPlaceholder(prompt || tr(lang, 'pick_roles'))
    .setMinValues(0).setMaxValues(10);

  return {
    embeds:     [new EmbedBuilder().setDescription(prompt || tr(lang, 'pick_roles')).setColor(0x5865F2)],
    components: [
      new ActionRowBuilder().addComponents(sel),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wiz:skip_roles:${guildId}:${userId}`).setLabel(tr(lang,'no_roles')).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`wiz:cancel:${guildId}:${userId}`).setLabel(tr(lang,'cancel')).setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

function confirmMsg(guildId, userId, lang, description, fields) {
  const embed = new EmbedBuilder()
    .setTitle(tr(lang, 'preview'))
    .setDescription(description || '')
    .setColor(0x5865F2);
  if (fields?.length) embed.addFields(fields.slice(0, 25));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:confirm:${guildId}:${userId}`).setLabel(tr(lang,'confirm')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:edit:${guildId}:${userId}`).setLabel(tr(lang,'edit_btn')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wiz:cancel:${guildId}:${userId}`).setLabel(tr(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function formBuilderMsg(guildId, userId, lang, title, questions) {
  const qText = questions.length
    ? questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n')
    : tr(lang, 'no_q');

  const embed = new EmbedBuilder()
    .setTitle(tr(lang, 'form_wiz') + (title ? ` — ${title}` : ''))
    .addFields({ name: tr(lang, 'q_label', questions.length), value: qText })
    .setColor(0x7c5af7);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wiz:q_add:${guildId}:${userId}`).setLabel(tr(lang,'add_q')).setStyle(ButtonStyle.Primary).setDisabled(questions.length >= 5),
      new ButtonBuilder().setCustomId(`wiz:q_rm:${guildId}:${userId}`).setLabel(tr(lang,'rm_q')).setStyle(ButtonStyle.Secondary).setDisabled(questions.length === 0),
      new ButtonBuilder().setCustomId(`wiz:q_done:${guildId}:${userId}`).setLabel(tr(lang,'q_done')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wiz:cancel:${guildId}:${userId}`).setLabel(tr(lang,'cancel')).setStyle(ButtonStyle.Danger),
    )],
  };
}

function qModal(guildId, userId, lang) {
  const m = new ModalBuilder()
    .setCustomId(`wizmod:q_submit:${guildId}:${userId}`)
    .setTitle(tr(lang, 'q_modal_t'));
  m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('q_text')
      .setLabel(tr(lang, 'q_modal_l'))
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(tr(lang, 'q_modal_ph'))
      .setRequired(true)
      .setMaxLength(200),
  ));
  return m;
}

// ── Interaction handler ───────────────────────────────────────────────────────

async function handleWizardInteraction(interaction, db) {
  // customId: wiz:{action}:{guildId}:{userId}
  const parts   = interaction.customId.split(':');
  const action  = parts[1];
  const guildId = parts[2];
  const userId  = parts[3];
  if (!guildId || !userId) return;

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: '❌', ephemeral: true });
  }

  const guild = interaction.guild;
  const w     = getW(guildId, userId);
  const lang  = w?.lang || 'en';

  if (!w && action !== 'cancel') {
    return interaction.update({ content: tr(lang, 'expired'), embeds: [], components: [] }).catch(() => {});
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    if (w) delW(guildId, userId);
    return interaction.update({ content: tr(lang, 'cancelled'), embeds: [], components: [] });
  }

  // ── Channel selected ──────────────────────────────────────────────────────
  if (action === 'ch') {
    const chId = interaction.values[0];
    const ch   = guild?.channels.cache.get(chId);
    if (!ch) return interaction.update({ content: '❌ Channel not found.', components: [] });

    w.data = w.data || {};
    w.data[w.pendingField || 'channel'] = { id: chId, name: ch.name };
    setW(guildId, userId, w);

    await interaction.update({
      embeds:     [new EmbedBuilder().setDescription(tr(lang, 'selected', ch.toString())).setColor(0x57F287)],
      components: [],
    });
    await continueFromWizard(interaction, db,
      `Selected channel: #${ch.name} (purpose: ${w.pendingField || 'channel'})`,
      guildId, userId);
    return;
  }

  // ── Roles selected ────────────────────────────────────────────────────────
  if (action === 'roles') {
    const roleIds   = interaction.values;
    const roleNames = roleIds.map(id => guild?.roles.cache.get(id)?.name).filter(Boolean);

    w.data = w.data || {};
    w.data[w.pendingField || 'roles'] = roleIds;
    setW(guildId, userId, w);

    const disp = roleNames.length ? roleNames.map(r => `@${r}`).join(', ') : tr(lang, 'no_roles');
    await interaction.update({
      embeds:     [new EmbedBuilder().setDescription(tr(lang, 'selected', disp)).setColor(0x57F287)],
      components: [],
    });
    await continueFromWizard(interaction, db,
      `Selected roles: ${roleNames.join(', ') || 'none'} (purpose: ${w.pendingField || 'roles'})`,
      guildId, userId);
    return;
  }

  // ── Skip roles ────────────────────────────────────────────────────────────
  if (action === 'skip_roles') {
    w.data = w.data || {};
    w.data[w.pendingField || 'roles'] = [];
    setW(guildId, userId, w);

    await interaction.update({
      embeds:     [new EmbedBuilder().setDescription(tr(lang, 'selected', tr(lang, 'no_roles'))).setColor(0x57F287)],
      components: [],
    });
    await continueFromWizard(interaction, db,
      `Skipped role selection — no roles (purpose: ${w.pendingField || 'roles'})`,
      guildId, userId);
    return;
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    await interaction.update({ content: tr(lang, 'confirmed'), embeds: [], components: [] });
    await continueFromWizard(interaction, db,
      'User confirmed the preview — proceed with creation now',
      guildId, userId);
    return;
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  if (action === 'edit') {
    await interaction.update({ embeds: [], components: [] });
    await continueFromWizard(interaction, db,
      'User wants to edit — ask what to change and update the plan',
      guildId, userId);
    return;
  }

  // ── Form builder: add question ────────────────────────────────────────────
  if (action === 'q_add') {
    return interaction.showModal(qModal(guildId, userId, lang));
  }

  // ── Form builder: remove last question ───────────────────────────────────
  if (action === 'q_rm') {
    w.data = w.data || {};
    if (!Array.isArray(w.data.questions)) w.data.questions = [];
    w.data.questions.pop();
    setW(guildId, userId, w);
    return interaction.update(formBuilderMsg(guildId, userId, lang, w.data.title, w.data.questions));
  }

  // ── Form builder: done with questions ────────────────────────────────────
  if (action === 'q_done') {
    const qs = w.data?.questions || [];
    await interaction.update({ embeds: [], components: [] });
    await continueFromWizard(interaction, db,
      `Form questions set: ${qs.length > 0 ? qs.map((q,i) => `${i+1}. ${q}`).join(' | ') : 'none (no questions)'}. Proceed to next step.`,
      guildId, userId);
    return;
  }
}

// ── Modal handler ─────────────────────────────────────────────────────────────

async function handleWizardModal(interaction, db) {
  // customId: wizmod:{action}:{guildId}:{userId}
  const parts   = interaction.customId.split(':');
  const action  = parts[1];
  const guildId = parts[2];
  const userId  = parts[3];
  if (!guildId || !userId) return;
  if (interaction.user.id !== userId) return interaction.reply({ content: '❌', ephemeral: true });

  const w    = getW(guildId, userId);
  const lang = w?.lang || 'en';

  if (action === 'q_submit') {
    if (!w) return interaction.reply({ content: tr(lang, 'expired'), ephemeral: true });
    const qText = interaction.fields.getTextInputValue('q_text').trim();
    if (!w.data) w.data = {};
    if (!Array.isArray(w.data.questions)) w.data.questions = [];
    w.data.questions.push(qText);
    setW(guildId, userId, w);
    return interaction.update(formBuilderMsg(guildId, userId, lang, w.data.title, w.data.questions));
  }
}

// ── Callback into AI chat ─────────────────────────────────────────────────────

async function continueFromWizard(interaction, db, userInput, guildId, userId) {
  // Lazy-require to break circular dependency with aiChat.js
  const { continueConvFromWizard } = require('./aiChat');
  await continueConvFromWizard(interaction, db, userInput, guildId, userId);
}

module.exports = {
  handleWizardInteraction, handleWizardModal,
  getW, setW, delW,
  chPickerMsg, rolePickerMsg, confirmMsg, formBuilderMsg,
};