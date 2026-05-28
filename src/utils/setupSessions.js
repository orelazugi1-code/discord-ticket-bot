// SQLite-backed session store so sessions survive process restarts.
// Exposes a Map-like interface: get, set, delete, has.
// IMPORTANT: sessions.get() returns a copy; mutations must be followed by sessions.set().
const db = require('../database');

const sessions = {
  get(key) {
    try {
      const row = db.getSetupSession(key);
      if (!row) return undefined;
      if (Date.now() > row.expires_at) {
        db.deleteSetupSession(key);
        return undefined;
      }
      return JSON.parse(row.data);
    } catch {
      return undefined;
    }
  },
  set(key, value) {
    try {
      db.upsertSetupSession(key, JSON.stringify(value), value.expiresAt);
    } catch (err) {
      console.error('[sessions.set]', err.message);
    }
  },
  delete(key) {
    try { db.deleteSetupSession(key); } catch {}
  },
  has(key) {
    return !!this.get(key);
  },
};

// Purge expired sessions every 10 minutes
setInterval(() => {
  try { db.purgeExpiredSetupSessions(); } catch {}
}, 10 * 60_000);

module.exports = sessions;
