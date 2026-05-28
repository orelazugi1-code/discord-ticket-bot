require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// DATA_DIR env var lets Railway volumes persist DB across redeploys
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath  = path.join(dataDir, 'bot.db');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id       TEXT NOT NULL UNIQUE,
    guild_id         TEXT NOT NULL,
    user_id          TEXT NOT NULL,
    subject          TEXT NOT NULL,
    description      TEXT,
    status           TEXT DEFAULT 'open',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at        DATETIME,
    closed_by        TEXT,
    transcript_path  TEXT
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL,
    author_id  TEXT NOT NULL,
    author_tag TEXT NOT NULL,
    content    TEXT NOT NULL,
    timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_users (
    ticket_id INTEGER NOT NULL,
    user_id   TEXT NOT NULL,
    PRIMARY KEY (ticket_id, user_id),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS custom_commands (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    name       TEXT NOT NULL,
    response   TEXT NOT NULL,
    admin_only INTEGER DEFAULT 0,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (guild_id, name)
  );

  CREATE TABLE IF NOT EXISTS guild_config (
    guild_id           TEXT PRIMARY KEY,
    log_channel_id     TEXT,
    ticket_category_id TEXT,
    support_role_id    TEXT,
    max_tickets        INTEGER DEFAULT 1,
    auto_close_hours   INTEGER DEFAULT 0,
    ticket_message     TEXT DEFAULT 'Click the button below to open a support ticket.',
    panel_channel_id   TEXT,
    panel_message_id   TEXT
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason       TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS automod_config (
    guild_id               TEXT PRIMARY KEY,
    anti_spam_enabled      INTEGER DEFAULT 0,
    link_filter_enabled    INTEGER DEFAULT 0,
    mention_filter_enabled INTEGER DEFAULT 0,
    bad_words              TEXT DEFAULT '[]',
    max_mentions           INTEGER DEFAULT 5
  );

  CREATE TABLE IF NOT EXISTS levels (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    xp        INTEGER DEFAULT 0,
    level     INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS level_roles (
    guild_id  TEXT NOT NULL,
    level     INTEGER NOT NULL,
    role_id   TEXT NOT NULL,
    PRIMARY KEY (guild_id, level)
  );

  CREATE TABLE IF NOT EXISTS button_roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    message_id  TEXT,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    role_ids    TEXT NOT NULL DEFAULT '[]',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Additional tables ────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS forms (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT NOT NULL,
    title            TEXT NOT NULL,
    description      TEXT DEFAULT '',
    channel_id       TEXT NOT NULL,
    log_channel_id   TEXT,
    message_id       TEXT,
    button_label     TEXT DEFAULT 'Open Form',
    mode             TEXT DEFAULT 'form',
    role_id          TEXT,
    accept_message   TEXT DEFAULT '',
    decline_message  TEXT DEFAULT '',
    active           INTEGER DEFAULT 1,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS form_questions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id   INTEGER NOT NULL,
    question  TEXT NOT NULL,
    position  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS form_responses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id    INTEGER NOT NULL,
    user_id    TEXT NOT NULL,
    guild_id   TEXT NOT NULL,
    answers    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS temp_roles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    role_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS form_roles (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id  INTEGER NOT NULL,
    role_id  TEXT NOT NULL,
    trigger  TEXT NOT NULL DEFAULT 'submit'
  );

  CREATE TABLE IF NOT EXISTS ticket_questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    question    TEXT NOT NULL,
    position    INTEGER DEFAULT 0,
    category_id INTEGER DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_categories (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name     TEXT NOT NULL,
    position INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS setup_sessions (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// ── Migrations ────────────────────────────────────────────────────────────────

[
  `ALTER TABLE guild_config ADD COLUMN support_role_id_2 TEXT`,
  `ALTER TABLE guild_config ADD COLUMN support_role_id_3 TEXT`,
  `ALTER TABLE guild_config ADD COLUMN support_role_id_4 TEXT`,
  `ALTER TABLE guild_config ADD COLUMN support_role_id_5 TEXT`,
  `ALTER TABLE guild_config ADD COLUMN welcome_channel_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN welcome_message TEXT DEFAULT 'Welcome {user} to {server}!'`,
  `ALTER TABLE guild_config ADD COLUMN goodbye_channel_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN goodbye_message TEXT DEFAULT 'Goodbye {user}, we will miss you!'`,
  `ALTER TABLE guild_config ADD COLUMN welcome_enabled INTEGER DEFAULT 0`,
  `ALTER TABLE guild_config ADD COLUMN goodbye_enabled INTEGER DEFAULT 0`,
  `ALTER TABLE form_responses ADD COLUMN user_tag TEXT`,
  `ALTER TABLE form_responses ADD COLUMN response_type TEXT DEFAULT 'submit'`,
  `ALTER TABLE forms ADD COLUMN yes_label TEXT DEFAULT 'Accept'`,
  `ALTER TABLE forms ADD COLUMN no_label  TEXT DEFAULT 'Reject'`,
  `ALTER TABLE form_responses ADD COLUMN approved       INTEGER`,
  `ALTER TABLE form_responses ADD COLUMN log_message_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN muted_role_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN auto_role_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN admin_role_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN prefix TEXT DEFAULT '!'`,
  `ALTER TABLE guild_config ADD COLUMN xp_enabled INTEGER DEFAULT 1`,
  `ALTER TABLE guild_config ADD COLUMN levelup_channel_id TEXT`,
  `ALTER TABLE guild_config ADD COLUMN extra_support_roles TEXT`,
  `ALTER TABLE ticket_questions ADD COLUMN category_id INTEGER DEFAULT NULL`,
].forEach(sql => { try { db.exec(sql); } catch {} });

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  createTicket:          db.prepare('INSERT INTO tickets (channel_id, guild_id, user_id, subject, description) VALUES (?, ?, ?, ?, ?)'),
  getTicketByChannel:    db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),
  getTicketById:         db.prepare('SELECT * FROM tickets WHERE id = ?'),
  getOpenByUser:         db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'"),
  getTicketsByGuild:     db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC'),
  getTicketStats:        db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count, SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed_count FROM tickets WHERE guild_id = ?"),
  closeTicket:           db.prepare("UPDATE tickets SET status='closed', closed_at=CURRENT_TIMESTAMP, closed_by=?, transcript_path=? WHERE channel_id=?"),

  addMessage:            db.prepare('INSERT INTO ticket_messages (ticket_id, author_id, author_tag, content, timestamp) VALUES (?, ?, ?, ?, ?)'),
  getMessages:           db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY timestamp ASC'),

  addTicketUser:         db.prepare('INSERT OR IGNORE INTO ticket_users (ticket_id, user_id) VALUES (?, ?)'),
  removeTicketUser:      db.prepare('DELETE FROM ticket_users WHERE ticket_id = ? AND user_id = ?'),

  upsertCommand:         db.prepare('INSERT OR REPLACE INTO custom_commands (guild_id, name, response, admin_only, created_by) VALUES (?, ?, ?, ?, ?)'),
  deleteCommand:         db.prepare('DELETE FROM custom_commands WHERE guild_id = ? AND name = ?'),
  getCommand:            db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?'),
  getCommands:           db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name ASC'),

  getConfig:             db.prepare('SELECT * FROM guild_config WHERE guild_id = ?'),
  insertConfig:          db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)'),

  addWarning:            db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)'),
  getWarnings:           db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC'),
  getAllWarnings:         db.prepare('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100'),
  getWarningById:        db.prepare('SELECT * FROM warnings WHERE id = ?'),
  deleteWarning:         db.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ?'),
  clearWarnings:         db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?'),
  countWarnings:         db.prepare('SELECT COUNT(*) as cnt FROM warnings WHERE guild_id = ? AND user_id = ?'),

  getAutomod:            db.prepare('SELECT * FROM automod_config WHERE guild_id = ?'),
  insertAutomod:         db.prepare('INSERT OR IGNORE INTO automod_config (guild_id) VALUES (?)'),

  insertLevel:           db.prepare('INSERT OR IGNORE INTO levels (guild_id, user_id) VALUES (?, ?)'),
  addXpUpdate:           db.prepare('UPDATE levels SET xp = xp + ? WHERE guild_id = ? AND user_id = ?'),
  getLevel:              db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?'),
  updateLevel:           db.prepare('UPDATE levels SET level = ? WHERE guild_id = ? AND user_id = ?'),
  getLeaderboard:        db.prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 10'),

  setLevelRole:          db.prepare('INSERT OR REPLACE INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?)'),
  getLevelRoles:         db.prepare('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC'),
  getLevelRolesUpTo:     db.prepare('SELECT * FROM level_roles WHERE guild_id = ? AND level <= ? ORDER BY level DESC'),
  deleteLevelRole:       db.prepare('DELETE FROM level_roles WHERE guild_id = ? AND level = ?'),

  createButtonRole:      db.prepare('INSERT INTO button_roles (guild_id, channel_id, title, description, role_ids) VALUES (?, ?, ?, ?, ?)'),
  getButtonRole:         db.prepare('SELECT * FROM button_roles WHERE id = ?'),
  getButtonRoles:        db.prepare('SELECT * FROM button_roles WHERE guild_id = ? ORDER BY created_at DESC'),
  updateButtonRoleMsgId: db.prepare('UPDATE button_roles SET message_id = ? WHERE id = ?'),
  deleteButtonRole:      db.prepare('DELETE FROM button_roles WHERE id = ? AND guild_id = ?'),

  createForm:            db.prepare('INSERT INTO forms (guild_id, title, description, channel_id, log_channel_id, button_label, mode, role_id, accept_message, decline_message, yes_label, no_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getForm:               db.prepare('SELECT * FROM forms WHERE id = ?'),
  getForms:              db.prepare('SELECT * FROM forms WHERE guild_id = ? ORDER BY created_at DESC'),
  updateFormMsgId:       db.prepare('UPDATE forms SET message_id = ? WHERE id = ?'),
  updateForm:            db.prepare('UPDATE forms SET active = ? WHERE id = ?'),
  deleteForm:            db.prepare('DELETE FROM forms WHERE id = ?'),
  deleteFormQuestions:   db.prepare('DELETE FROM form_questions WHERE form_id = ?'),
  deleteFormResponses:   db.prepare('DELETE FROM form_responses WHERE form_id = ?'),
  addFormQuestion:       db.prepare('INSERT INTO form_questions (form_id, question, position) VALUES (?, ?, ?)'),
  getFormQuestions:      db.prepare('SELECT * FROM form_questions WHERE form_id = ? ORDER BY position ASC'),
  deleteFormQuestion:    db.prepare('DELETE FROM form_questions WHERE id = ?'),
  saveFormResponse:      db.prepare('INSERT INTO form_responses (form_id, user_id, guild_id, answers, user_tag, response_type) VALUES (?, ?, ?, ?, ?, ?)'),
  getFormResponses:      db.prepare('SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at DESC LIMIT 100'),
  getFormResponseById:   db.prepare('SELECT * FROM form_responses WHERE id = ?'),
  setResponseDecision:   db.prepare('UPDATE form_responses SET approved = ? WHERE id = ?'),
  setResponseLogMsgId:   db.prepare('UPDATE form_responses SET log_message_id = ? WHERE id = ?'),
  addFormRole:           db.prepare('INSERT INTO form_roles (form_id, role_id, trigger) VALUES (?, ?, ?)'),
  getFormRoles:          db.prepare('SELECT * FROM form_roles WHERE form_id = ?'),
  deleteFormRolesByForm: db.prepare('DELETE FROM form_roles WHERE form_id = ?'),

  addTempRole:           db.prepare('INSERT INTO temp_roles (guild_id, user_id, role_id, expires_at) VALUES (?, ?, ?, ?)'),
  getExpiredTempRoles:   db.prepare("SELECT * FROM temp_roles WHERE expires_at <= datetime('now')"),
  deleteTempRole:        db.prepare('DELETE FROM temp_roles WHERE id = ?'),

  setXpDirect:           db.prepare('INSERT OR REPLACE INTO levels (guild_id, user_id, xp, level) VALUES (?, ?, ?, ?)'),

  getTicketQuestions:    db.prepare('SELECT * FROM ticket_questions WHERE guild_id = ? AND category_id IS NULL ORDER BY position ASC'),
  clearTicketQuestions:  db.prepare('DELETE FROM ticket_questions WHERE guild_id = ?'),
  insertTicketQuestion:  db.prepare('INSERT INTO ticket_questions (guild_id, question, position) VALUES (?, ?, ?)'),

  getSetupSession:       db.prepare('SELECT * FROM setup_sessions WHERE key = ?'),
  upsertSetupSession:    db.prepare('INSERT OR REPLACE INTO setup_sessions (key, data, expires_at) VALUES (?, ?, ?)'),
  deleteSetupSession:    db.prepare('DELETE FROM setup_sessions WHERE key = ?'),
  purgeSetupSessions:    db.prepare('DELETE FROM setup_sessions WHERE expires_at < ?'),

  getTicketCategories:       db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY position ASC'),
  createTicketCategoryStmt:  db.prepare('INSERT INTO ticket_categories (guild_id, name, position) VALUES (?, ?, ?)'),
  clearTicketCategoriesStmt: db.prepare('DELETE FROM ticket_categories WHERE guild_id = ?'),
  getCategoryQuestions:      db.prepare('SELECT * FROM ticket_questions WHERE category_id = ? ORDER BY position ASC'),
  deleteCategoryQuestions:   db.prepare('DELETE FROM ticket_questions WHERE category_id = ?'),
  insertCategoryQuestion:    db.prepare('INSERT INTO ticket_questions (guild_id, question, position, category_id) VALUES (?, ?, ?, ?)'),
  clearGlobalTicketQs:       db.prepare('DELETE FROM ticket_questions WHERE guild_id = ? AND category_id IS NULL'),
  clearAllCategoryQs:        db.prepare('DELETE FROM ticket_questions WHERE guild_id = ? AND category_id IS NOT NULL'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGuildConfig(guildId) {
  stmts.insertConfig.run(guildId);
  return stmts.getConfig.get(guildId);
}

function updateGuildConfig(guildId, updates) {
  getGuildConfig(guildId);
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE guild_config SET ${fields} WHERE guild_id = ?`).run(...Object.values(updates), guildId);
}

function getAutomodConfig(guildId) {
  stmts.insertAutomod.run(guildId);
  const cfg = stmts.getAutomod.get(guildId);
  cfg.bad_words = JSON.parse(cfg.bad_words || '[]');
  return cfg;
}

function updateAutomodConfig(guildId, updates) {
  getAutomodConfig(guildId);
  const patch = { ...updates };
  if (Array.isArray(patch.bad_words)) patch.bad_words = JSON.stringify(patch.bad_words);
  const fields = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE automod_config SET ${fields} WHERE guild_id = ?`).run(...Object.values(patch), guildId);
}

function addXp(guildId, userId, amount) {
  stmts.insertLevel.run(guildId, userId);
  stmts.addXpUpdate.run(amount, guildId, userId);
  return stmts.getLevel.get(guildId, userId);
}

function setXp(guildId, userId, xp) {
  stmts.insertLevel.run(guildId, userId);
  db.prepare('UPDATE levels SET xp = ? WHERE guild_id = ? AND user_id = ?').run(xp, guildId, userId);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createTicket:         (channelId, guildId, userId, subject, description) => stmts.createTicket.run(channelId, guildId, userId, subject, description),
  getTicketByChannel:   channelId => stmts.getTicketByChannel.get(channelId),
  getTicketById:        id => stmts.getTicketById.get(id),
  getOpenTicketsByUser: (guildId, userId) => stmts.getOpenByUser.all(guildId, userId),
  getTicketsByGuild:    guildId => stmts.getTicketsByGuild.all(guildId),
  getTicketStats:       guildId => stmts.getTicketStats.get(guildId),
  closeTicket:          (channelId, closedBy, transcriptPath) => stmts.closeTicket.run(closedBy, transcriptPath, channelId),

  addTicketMessage:     (ticketId, authorId, authorTag, content, timestamp) => stmts.addMessage.run(ticketId, authorId, authorTag, content, timestamp),
  getTicketMessages:    ticketId => stmts.getMessages.all(ticketId),

  addTicketUser:        (ticketId, userId) => stmts.addTicketUser.run(ticketId, userId),
  removeTicketUser:     (ticketId, userId) => stmts.removeTicketUser.run(ticketId, userId),

  createCustomCommand:  (guildId, name, response, adminOnly, createdBy) => stmts.upsertCommand.run(guildId, name, response, adminOnly ? 1 : 0, createdBy),
  deleteCustomCommand:  (guildId, name) => stmts.deleteCommand.run(guildId, name),
  getCustomCommand:     (guildId, name) => stmts.getCommand.get(guildId, name),
  getCustomCommands:    guildId => stmts.getCommands.all(guildId),

  getGuildConfig,
  updateGuildConfig,

  addWarning:           (guildId, userId, moderatorId, reason) => stmts.addWarning.run(guildId, userId, moderatorId, reason),
  getWarnings:          (guildId, userId) => stmts.getWarnings.all(guildId, userId),
  getAllWarnings:        guildId => stmts.getAllWarnings.all(guildId),
  getWarningById:       id => stmts.getWarningById.get(id),
  deleteWarning:        (id, guildId) => stmts.deleteWarning.run(id, guildId),
  clearWarnings:        (guildId, userId) => stmts.clearWarnings.run(guildId, userId),
  countWarnings:        (guildId, userId) => (stmts.countWarnings.get(guildId, userId)?.cnt ?? 0),

  getAutomodConfig,
  updateAutomodConfig,

  addXp,
  getLevel:             (guildId, userId) => stmts.getLevel.get(guildId, userId),
  updateLevel:          (guildId, userId, level) => stmts.updateLevel.run(level, guildId, userId),
  getLeaderboard:       guildId => stmts.getLeaderboard.all(guildId),

  setLevelRole:         (guildId, level, roleId) => stmts.setLevelRole.run(guildId, level, roleId),
  getLevelRoles:        guildId => stmts.getLevelRoles.all(guildId),
  getLevelRolesUpTo:    (guildId, level) => stmts.getLevelRolesUpTo.all(guildId, level),
  deleteLevelRole:      (guildId, level) => stmts.deleteLevelRole.run(guildId, level),

  createButtonRole:     (guildId, channelId, title, description, roleIds) => {
    const r = stmts.createButtonRole.run(guildId, channelId, title, description, JSON.stringify(roleIds));
    return Number(r.lastInsertRowid);
  },
  getButtonRole:        id => {
    const r = stmts.getButtonRole.get(id);
    if (r) r.role_ids = JSON.parse(r.role_ids);
    return r;
  },
  getButtonRoles:       guildId => stmts.getButtonRoles.all(guildId).map(r => ({ ...r, role_ids: JSON.parse(r.role_ids) })),
  updateButtonRoleMsgId:(id, msgId) => stmts.updateButtonRoleMsgId.run(msgId, id),
  deleteButtonRole:     (id, guildId) => stmts.deleteButtonRole.run(id, guildId),

  setXp,

  createForm: (guildId, opts) => {
    const r = stmts.createForm.run(
      guildId,
      opts.title, opts.description || '',
      opts.channel_id, opts.log_channel_id || null,
      opts.button_label || opts.title, opts.mode || opts.form_type || 'modal',
      opts.role_id || null,
      opts.accept_message || opts.auto_response || '',
      opts.decline_message || opts.no_response || '',
      opts.yes_label || null,
      opts.no_label  || null,
    );
    return Number(r.lastInsertRowid);
  },
  getForm:           id => stmts.getForm.get(id),
  getForms:          guildId => stmts.getForms.all(guildId),
  setFormMessageId:  (id, msgId) => stmts.updateFormMsgId.run(msgId, id),
  setFormActive:     (id, active) => stmts.updateForm.run(active ? 1 : 0, id),
  deleteForm:        id => {
    stmts.deleteFormRolesByForm.run(id);
    stmts.deleteFormResponses.run(id);
    stmts.deleteFormQuestions.run(id);
    stmts.deleteForm.run(id);
  },

  addFormQuestion:    (formId, question, position) => stmts.addFormQuestion.run(formId, question, position ?? 0),
  getFormQuestions:   formId => stmts.getFormQuestions.all(formId),
  deleteFormQuestion: id => stmts.deleteFormQuestion.run(id),

  addFormRole:    (formId, roleId, trigger) => stmts.addFormRole.run(formId, roleId, trigger || 'submit'),
  getFormRoles:   formId => stmts.getFormRoles.all(formId),
  deleteFormRoles:formId => stmts.deleteFormRolesByForm.run(formId),

  saveFormResponse:  (formId, userId, guildId, answers, userTag, responseType) => {
    const r = stmts.saveFormResponse.run(formId, userId, guildId, JSON.stringify(answers), userTag || null, responseType || 'submit');
    return Number(r.lastInsertRowid);
  },
  getFormResponses:  formId => stmts.getFormResponses.all(formId).map(r => ({
    ...r,
    answers: (() => { try { return JSON.parse(r.answers); } catch { return []; } })(),
  })),
  getFormResponse:       id => {
    const r = stmts.getFormResponseById.get(id);
    if (!r) return null;
    return { ...r, answers: (() => { try { return JSON.parse(r.answers); } catch { return {}; } })() };
  },
  setResponseDecision:   (id, approved) => stmts.setResponseDecision.run(approved ? 1 : 0, id),
  setResponseLogMessage: (id, msgId) => stmts.setResponseLogMsgId.run(msgId, id),

  addTempRole:         (guildId, userId, roleId, expiresAt) => stmts.addTempRole.run(guildId, userId, roleId, expiresAt),
  getExpiredTempRoles: () => stmts.getExpiredTempRoles.all(),
  deleteTempRole:      id => stmts.deleteTempRole.run(id),

  getTicketQuestions:   guildId => stmts.getTicketQuestions.all(guildId),
  setTicketQuestions:   (guildId, questions) => {
    stmts.clearGlobalTicketQs.run(guildId);
    questions.forEach((q, i) => stmts.insertTicketQuestion.run(guildId, q, i));
  },
  clearTicketQuestions: guildId => stmts.clearTicketQuestions.run(guildId),

  getSetupSession:       key => stmts.getSetupSession.get(key),
  upsertSetupSession:    (key, data, expiresAt) => stmts.upsertSetupSession.run(key, data, expiresAt),
  deleteSetupSession:    key => stmts.deleteSetupSession.run(key),
  purgeExpiredSetupSessions: () => stmts.purgeSetupSessions.run(Date.now()),

  getTicketCategories:  guildId => stmts.getTicketCategories.all(guildId),
  createTicketCategory: (guildId, name, position) => {
    const r = stmts.createTicketCategoryStmt.run(guildId, name, position);
    return Number(r.lastInsertRowid);
  },
  clearTicketCategories: guildId => {
    stmts.clearAllCategoryQs.run(guildId);
    stmts.clearTicketCategoriesStmt.run(guildId);
  },
  getCategoryQuestions:  categoryId => stmts.getCategoryQuestions.all(categoryId),
  setCategoryQuestions:  (guildId, categoryId, questions) => {
    stmts.deleteCategoryQuestions.run(categoryId);
    questions.forEach((q, i) => stmts.insertCategoryQuestion.run(guildId, q, i, categoryId));
  },
};
