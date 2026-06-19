require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');
const db      = require('../src/database');
const { buildTranscriptHtml } = require('../src/utils/transcript');

const app  = express();
const PORT = process.env.PORT || 3000;
const DISCORD_API = 'https://discord.com/api/v10';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'change-me',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireGuildAccess(req, res, next) {
  const guildId = req.params.guildId;
  if (!req.session.guilds?.find(g => g.id === guildId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.CLIENT_ID,
    redirect_uri:  process.env.REDIRECT_URI,
    response_type: 'code',
    scope:         'identify guilds',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id:     process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  process.env.REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token } = tokenRes.data;
    const headers = { Authorization: `Bearer ${access_token}` };

    const [userRes, guildsRes] = await Promise.all([
      axios.get(`${DISCORD_API}/users/@me`,        { headers }),
      axios.get(`${DISCORD_API}/users/@me/guilds`, { headers }),
    ]);

    const adminGuilds = guildsRes.data.filter(
      g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8),
    );

    req.session.user   = userRes.data;
    req.session.guilds = adminGuilds;
    res.redirect('/dashboard.html');
  } catch (err) {
    console.error('OAuth error:', err.response?.data ?? err.message);
    res.redirect('/?error=oauth_failed');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ── API ───────────────────────────────────────────────────────────────────────

app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// ── Guilds ────────────────────────────────────────────────────────────────────

app.get('/api/guilds', requireAuth, (req, res) => {
  res.json(req.session.guilds || []);
});

app.get('/api/guild/:guildId/overview', requireAuth, requireGuildAccess, (req, res) => {
  const stats    = db.getTicketStats(req.params.guildId);
  const commands = db.getCustomCommands(req.params.guildId);
  res.json({ stats, commandCount: commands.length });
});

// ── Tickets ───────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/tickets', requireAuth, requireGuildAccess, (req, res) => {
  const { status } = req.query;
  let tickets = db.getTicketsByGuild(req.params.guildId);
  if (status) tickets = tickets.filter(t => t.status === status);
  res.json(tickets);
});

app.get('/api/guild/:guildId/tickets/:ticketId/transcript', requireAuth, requireGuildAccess, (req, res) => {
  const ticket = db.getTicketById(parseInt(req.params.ticketId, 10));
  if (!ticket || ticket.guild_id !== req.params.guildId) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  if (ticket.transcript_path && fs.existsSync(ticket.transcript_path)) {
    return res.sendFile(ticket.transcript_path);
  }
  const messages = db.getTicketMessages(ticket.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildTranscriptHtml(ticket, messages));
});

// ── Commands ──────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/commands', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getCustomCommands(req.params.guildId));
});

app.post('/api/guild/:guildId/commands', requireAuth, requireGuildAccess, (req, res) => {
  const { name, response, admin_only } = req.body;
  if (!name?.trim() || !response?.trim()) {
    return res.status(400).json({ error: 'name and response are required' });
  }
  db.createCustomCommand(
    req.params.guildId,
    name.toLowerCase().replace(/\s+/g, '_'),
    response,
    admin_only || false,
    req.session.user.id,
  );
  res.json({ success: true });
});

app.delete('/api/guild/:guildId/commands/:name', requireAuth, requireGuildAccess, (req, res) => {
  db.deleteCustomCommand(req.params.guildId, req.params.name);
  res.json({ success: true });
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/settings', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getGuildConfig(req.params.guildId));
});

app.put('/api/guild/:guildId/settings', requireAuth, requireGuildAccess, (req, res) => {
  const ALLOWED = [
    'ticket_message', 'max_tickets', 'auto_close_hours',
    'log_channel_id', 'support_role_id', 'ticket_category_id',
    'support_role_id_2', 'support_role_id_3', 'support_role_id_4', 'support_role_id_5',
    'welcome_channel_id', 'welcome_message', 'goodbye_channel_id', 'goodbye_message',
    'welcome_enabled', 'goodbye_enabled',
  ];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length) db.updateGuildConfig(req.params.guildId, updates);
  res.json({ success: true });
});

// ── Warnings ──────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/warnings', requireAuth, requireGuildAccess, (req, res) => {
  const { userId } = req.query;
  const warnings = userId
    ? db.getWarnings(req.params.guildId, userId)
    : db.getAllWarnings(req.params.guildId);
  res.json(warnings);
});

app.delete('/api/guild/:guildId/warnings/:warnId', requireAuth, requireGuildAccess, (req, res) => {
  db.deleteWarning(parseInt(req.params.warnId, 10), req.params.guildId);
  res.json({ success: true });
});

// ── AutoMod ───────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/automod', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getAutomodConfig(req.params.guildId));
});

app.put('/api/guild/:guildId/automod', requireAuth, requireGuildAccess, (req, res) => {
  const ALLOWED = ['anti_spam_enabled', 'link_filter_enabled', 'mention_filter_enabled', 'bad_words', 'max_mentions'];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length) db.updateAutomodConfig(req.params.guildId, updates);
  res.json({ success: true });
});

// ── Levels ────────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/levels', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getLeaderboard(req.params.guildId));
});

app.get('/api/guild/:guildId/level-roles', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getLevelRoles(req.params.guildId));
});

app.post('/api/guild/:guildId/level-roles', requireAuth, requireGuildAccess, (req, res) => {
  const { level, role_id } = req.body;
  if (!level || !role_id) return res.status(400).json({ error: 'level and role_id required' });
  db.setLevelRole(req.params.guildId, parseInt(level, 10), role_id);
  res.json({ success: true });
});

app.delete('/api/guild/:guildId/level-roles/:level', requireAuth, requireGuildAccess, (req, res) => {
  db.deleteLevelRole(req.params.guildId, parseInt(req.params.level, 10));
  res.json({ success: true });
});

// ── Button Roles ──────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/button-roles', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getButtonRoles(req.params.guildId));
});

app.delete('/api/guild/:guildId/button-roles/:id', requireAuth, requireGuildAccess, (req, res) => {
  db.deleteButtonRole(parseInt(req.params.id, 10), req.params.guildId);
  res.json({ success: true });
});

// ── Slash Commands ────────────────────────────────────────────────────────────

const botHeaders = () => ({ Authorization: `Bot ${(process.env.BOT_TOKEN || '').trim()}` });

app.get('/api/guild/:guildId/slash-commands', requireAuth, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params;
  try {
    const [guildRes, globalRes] = await Promise.all([
      axios.get(`${DISCORD_API}/applications/${process.env.CLIENT_ID}/guilds/${guildId}/commands`, { headers: botHeaders() }),
      axios.get(`${DISCORD_API}/applications/${process.env.CLIENT_ID}/commands`,                    { headers: botHeaders() }),
    ]);
    const guild  = guildRes.data.map(c => ({ ...c, scope: 'guild' }));
    const global = globalRes.data.map(c => ({ ...c, scope: 'global' }));
    res.json([...guild, ...global]);
  } catch (err) {
    console.error('Slash commands fetch error:', err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.message ?? err.message });
  }
});

app.delete('/api/guild/:guildId/slash-commands/:commandId', requireAuth, requireGuildAccess, async (req, res) => {
  const { guildId, commandId } = req.params;
  const scope = req.query.scope === 'global' ? 'global' : 'guild';
  const url   = scope === 'global'
    ? `${DISCORD_API}/applications/${process.env.CLIENT_ID}/commands/${commandId}`
    : `${DISCORD_API}/applications/${process.env.CLIENT_ID}/guilds/${guildId}/commands/${commandId}`;
  try {
    await axios.delete(url, { headers: botHeaders() });
    res.json({ success: true });
  } catch (err) {
    console.error('Slash command delete error:', err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.message ?? err.message });
  }
});

// ── Forms ─────────────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/forms', requireAuth, requireGuildAccess, (req, res) => {
  const forms = db.getForms(req.params.guildId).map(f => ({
    ...f,
    form_type: f.mode || 'modal',
    question_count: db.getFormQuestions(f.id).length,
    roles: db.getFormRoles(f.id),
  }));
  res.json(forms);
});

app.get('/api/guild/:guildId/forms/:formId/questions', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getFormQuestions(parseInt(req.params.formId)));
});

app.get('/api/guild/:guildId/forms/:formId/roles', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getFormRoles(parseInt(req.params.formId)));
});

app.post('/api/guild/:guildId/forms/:formId/questions', requireAuth, requireGuildAccess, (req, res) => {
  const { question, position } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: 'question required' });
  db.addFormQuestion(parseInt(req.params.formId), question.trim(), position || 0);
  res.json({ success: true });
});

app.delete('/api/guild/:guildId/forms/:formId/questions/:qId', requireAuth, requireGuildAccess, (req, res) => {
  db.deleteFormQuestion(parseInt(req.params.qId));
  res.json({ success: true });
});

app.get('/api/guild/:guildId/forms/:formId/responses', requireAuth, requireGuildAccess, (req, res) => {
  res.json(db.getFormResponses(parseInt(req.params.formId)));
});

app.patch('/api/guild/:guildId/forms/:formId', requireAuth, requireGuildAccess, (req, res) => {
  const { active } = req.body;
  db.setFormActive(parseInt(req.params.formId), active);
  res.json({ success: true });
});

app.delete('/api/guild/:guildId/forms/:formId', requireAuth, requireGuildAccess, (req, res) => {
  db.deleteForm(parseInt(req.params.formId));
  res.json({ success: true });
});

// ── Guild Info ───────────────────────────────────────────────────────────────

app.get('/api/guild/:guildId/info', requireAuth, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params;
  try {
    const guildRes = await axios.get(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, { headers: botHeaders() });
    res.json({ memberCount: guildRes.data.approximate_member_count, name: guildRes.data.name });
  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 404) {
      return res.json({ bot_not_in_guild: true, guild_id: guildId });
    }
    res.status(500).json({ error: err.response?.data?.message ?? err.message });
  }
});

app.get('/api/guild/:guildId/channels', requireAuth, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params;
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${guildId}/channels`, { headers: botHeaders() });
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message ?? err.message });
  }
});

app.get('/api/guild/:guildId/roles', requireAuth, requireGuildAccess, async (req, res) => {
  const { guildId } = req.params;
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${guildId}/roles`, { headers: botHeaders() });
    res.json(r.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.message ?? err.message });
  }
});


// ── Clone (called by VOID client mod) ────────────────────────────────────────

const _sleep = ms => new Promise(r => setTimeout(r, ms));

app.options('/api/clone', (req, res) => {
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.sendStatus(200);
});

app.post('/api/clone', express.json(), async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  const { guild: guildData, userId } = req.body ?? {};
  if (!guildData?.name || !userId) return res.status(400).json({ error: 'missing guild or userId' });

  const h = botHeaders();
  try {
    // Create new guild
    const created = await axios.post(`${DISCORD_API}/guilds`, { name: guildData.name }, { headers: h });
    const newId = created.data.id;
    await _sleep(800);

    // Delete default channels
    const defRes = await axios.get(`${DISCORD_API}/guilds/${newId}/channels`, { headers: h });
    for (const ch of defRes.data) {
      await axios.delete(`${DISCORD_API}/channels/${ch.id}`, { headers: h }).catch(() => {});
      await _sleep(150);
    }

    // Clone roles
    const roleMap = {};
    for (const r of (guildData.roles ?? []).sort((a, b) => a.position - b.position)) {
      try {
        const nr = await axios.post(`${DISCORD_API}/guilds/${newId}/roles`, {
          name: r.name, color: r.color, hoist: r.hoist,
          mentionable: r.mentionable, permissions: r.permissions,
        }, { headers: h });
        roleMap[r.id] = nr.data.id;
        await _sleep(150);
      } catch {}
    }

    // Clone categories first
    const catMap = {};
    for (const c of (guildData.channels ?? []).filter(c => c.type === 4).sort((a, b) => a.position - b.position)) {
      try {
        const nc = await axios.post(`${DISCORD_API}/guilds/${newId}/channels`,
          { name: c.name, type: 4, position: c.position }, { headers: h });
        catMap[c.id] = nc.data.id;
        await _sleep(150);
      } catch {}
    }

    // Clone other channels
    for (const c of (guildData.channels ?? []).filter(c => c.type !== 4).sort((a, b) => a.position - b.position)) {
      try {
        const body = { name: c.name, type: c.type, position: c.position };
        if (c.parentId && catMap[c.parentId]) body.parent_id = catMap[c.parentId];
        if (c.topic)            body.topic             = c.topic;
        if (c.nsfw)             body.nsfw              = true;
        if (c.bitrate)          body.bitrate           = c.bitrate;
        if (c.userLimit)        body.user_limit        = c.userLimit;
        if (c.rateLimitPerUser) body.rate_limit_per_user = c.rateLimitPerUser;
        await axios.post(`${DISCORD_API}/guilds/${newId}/channels`, body, { headers: h });
        await _sleep(150);
      } catch {}
    }

    // Create invite from first text channel
    let inviteCode = null;
    try {
      const chRes = await axios.get(`${DISCORD_API}/guilds/${newId}/channels`, { headers: h });
      const textCh = chRes.data.find(c => c.type === 0);
      if (textCh) {
        const inv = await axios.post(`${DISCORD_API}/channels/${textCh.id}/invites`,
          { max_age: 0, max_uses: 0 }, { headers: h });
        inviteCode = inv.data.code;
      }
    } catch {}

    // DM the user
    const dmRes = await axios.post(`${DISCORD_API}/users/@me/channels`, { recipient_id: userId }, { headers: h });
    const dmId  = dmRes.data.id;
    await axios.post(`${DISCORD_API}/channels/${dmId}/messages`, { embeds: [{
      title: `✅ "${guildData.name}" cloned!`,
      description:
        (inviteCode ? `🔗 **Join your new server:**\ndiscord.gg/${inviteCode}\n\n` : '') +
        `All channels, categories and roles have been copied.\n*(Pela is the owner — transfer ownership inside the server settings)*`,
      color: 0x7c5af7,
      footer: { text: 'Cloned by VOID × Pela' },
      timestamp: new Date().toISOString(),
    }]}, { headers: h });

    res.json({ success: true, inviteCode });
  } catch (err) {
    console.error('[/api/clone]', err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.message ?? err.message });
  }
});
// ── Invite ────────────────────────────────────────────────────────────────────

app.get('/api/invite', (req, res) => {
  const params = new URLSearchParams({
    client_id:   process.env.CLIENT_ID,
    permissions: '1099780189206',
    scope:       'bot applications.commands',
  });
  if (req.query.guild_id) params.set('guild_id', req.query.guild_id);
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Dashboard → http://localhost:${PORT}`);

  // Self-ping every 5 minutes to keep Render free tier alive
  const url = process.env.REDIRECT_URI?.replace('/auth/callback', '/health');
  if (url) {
    setInterval(() => {
      fetch(url).catch(() => {});
    }, 5 * 60 * 1000);
  }
});
