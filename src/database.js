require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'bot.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

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
};
