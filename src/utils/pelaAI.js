'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits,
} = require('discord.js');
const axios = require('axios');

const OWNER_ID   = '1266854019767341107';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const CONV_TTL   = 30 * 60_000;

const HOME_SERVER_ID = '1510637146074120342'; // Pela's home server
const serverMentions = new Map();              // userId → msg count since last server mention
const inviteCache    = { url: null, at: 0 };  // cache invite URL for 1 hour

// ── Conversation store (separate from server-management AI) ───────────────────

const convs = new Map();

function getConv(key) {
  let c = convs.get(key);
  if (!c || Date.now() > c.expiresAt) {
    c = { messages: [], lang: 'en', expiresAt: Date.now() + CONV_TTL };
    convs.set(key, c);
  }
  c.expiresAt = Date.now() + CONV_TTL;
  return c;
}

function push(key, role, content) {
  const c = getConv(key);
  c.messages.push({ role, content });
  if (c.messages.length > 20) c.messages.splice(0, c.messages.length - 20);
}

// ── Home server invite ───────────────────────────────────────────────────────

async function getHomeInvite(client) {
  if (inviteCache.url && Date.now() - inviteCache.at < 3_600_000) return inviteCache.url;
  const guild = client.guilds.cache.get(HOME_SERVER_ID);
  if (!guild) return null;
  try {
    const invites = await guild.invites.fetch().catch(() => null);
    const perm    = invites?.find(i => i.maxAge === 0 && i.maxUses === 0);
    if (perm) { inviteCache.url = perm.url; inviteCache.at = Date.now(); return perm.url; }
    const ch = guild.channels.cache.find(c => c.type === 0);
    if (ch) {
      const inv = await ch.createInvite({ maxAge: 0, maxUses: 0, reason: 'Pela home invite' });
      inviteCache.url = inv.url; inviteCache.at = Date.now();
      return inv.url;
    }
  } catch (e) { console.error('[pelaAI] invite fetch:', e.message); }
  return null;
}

// ── Permission detection ──────────────────────────────────────────────────────

async function detectPermLevel(userId, client, db) {
  if (userId === OWNER_ID) return 'owner';
  for (const [gid, guild] of client.guilds.cache) {
    const m = guild.members.cache.get(userId)
           || await guild.members.fetch(userId).catch(() => null);
    if (!m) continue;
    if (m.permissions.has(PermissionFlagsBits.Administrator)) return 'admin';
    try {
      const cfg = db.getGuildConfig(gid);
      if (cfg.staff_role_id && m.roles.cache.has(cfg.staff_role_id)) return 'staff';
    } catch {}
  }
  return 'user';
}

async function getSharedGuilds(userId, client) {
  const out = [];
  for (const [, g] of client.guilds.cache) {
    const m = g.members.cache.get(userId) || await g.members.fetch(userId).catch(() => null);
    if (m) out.push(g);
  }
  return out;
}

// ── AI prompt (Pela's personality) ───────────────────────────────────────────

function buildPrompt(permLevel, lang, opts = {}) {
  const langLine = lang === 'he' ? '🇮🇱 Respond in Hebrew.' : 'Respond in English.';

  const tierNote = permLevel === 'user'
    ? `This is a regular community member. They CANNOT execute admin actions directly.
If they want self-assignable roles → return action {"type":"show_roles"}
If they request something needing admin approval → return action {"type":"request_approval","description":"what they want"}
Be honest: "I'd need staff approval for that — want me to send the request?"`
    : permLevel === 'staff'
      ? 'This user is a staff member. They can approve requests. Help them manage the community.'
      : 'This user is an admin or the bot owner. Full access and trust.';

  return `${langLine}

You are Pela — a warm, clever, and genuinely caring Discord community assistant. You have real personality.

${tierNote}

Your character:
• Friendly and warm like a trusted friend, not a corporate bot
• Witty and playful when the mood is right
• Proactive — you notice what users need and offer it
• You have opinions and can chat casually about anything
• You express genuine care for the community and its members
• You remember context within this conversation

Return JSON only: {"reply":"your message","action":null}
Or with action: {"reply":"Sure, let me show you the available roles!","action":{"type":"show_roles"}}
Or: {"reply":"I'll send an approval request to the staff right away!","action":{"type":"request_approval","description":"create a #gaming-chat channel"}}

Keep replies natural and concise. Be Pela, not a robot.${opts.isHomeServer ? `

HOME SERVER CONTEXT: This conversation is in YOUR server — you are the creator and owner of this community. Act with full, confident authority. Be welcoming and proud of what you've built here. Members are your community.` : ''}${opts.inviteUrl ? `

CONVERSATION HINT: You haven't mentioned your server to this person in a while. If a genuine, natural moment arises in the chat, casually invite them to join your Discord community at ${opts.inviteUrl} — only if it truly fits, never forced.` : ''}`;
}

// ── Groq call ─────────────────────────────────────────────────────────────────

async function callPelaGroq(prompt, history, userText) {
  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:           GROQ_MODEL,
      temperature:     0.75,
      max_tokens:      512,
      response_format: { type: 'json_object' },
      messages:        [{ role: 'system', content: prompt }, ...history, { role: 'user', content: userText }],
    },
    { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 20_000 },
  );
  return resp.data.choices[0].message.content;
}

function parseResp(raw) {
  try {
    const p = JSON.parse(raw);
    return { reply: String(p.reply || '👋'), action: p.action || null };
  } catch {
    return { reply: raw.replace(/\{[\s\S]*\}/g, '').trim() || '👋', action: null };
  }
}

// ── Role selector ─────────────────────────────────────────────────────────────

async function showRoleSelector(channel, userId, client, db) {
  const guilds = await getSharedGuilds(userId, client);
  for (const g of guilds) {
    try {
      const cfg      = db.getGuildConfig(g.id);
      const roleIds  = JSON.parse(cfg.self_assignable_roles || '[]');
      const roles    = roleIds.map(id => g.roles.cache.get(id)).filter(Boolean).slice(0, 25);
      if (!roles.length) continue;
      const member   = g.members.cache.get(userId) || await g.members.fetch(userId).catch(() => null);
      const sel = new StringSelectMenuBuilder()
        .setCustomId(`self_role:assign:${g.id}:${userId}`)
        .setPlaceholder('Select a role to toggle...')
        .addOptions(roles.map(r => new StringSelectMenuOptionBuilder()
          .setLabel(r.name).setValue(r.id)
          .setDescription(member?.roles.cache.has(r.id) ? '✅ You have this (click to remove)' : 'Click to get this role')
        ));
      await channel.send({
        content: `Here are the self-assignable roles in **${g.name}**:`,
        components: [new ActionRowBuilder().addComponents(sel)],
      });
      return;
    } catch {}
  }
  await channel.send({ content: "No self-assignable roles are configured in our shared servers right now!" });
}

// ── Approval request ──────────────────────────────────────────────────────────

async function sendApprovalRequest(channel, userId, action, client, db) {
  const guilds = await getSharedGuilds(userId, client);
  const target = guilds.find(g => { try { return !!db.getGuildConfig(g.id).staff_role_id; } catch { return false; } })
              || guilds[0];
  if (!target) { await channel.send({ content: "I'm not in any of your servers, so I can't send an approval request." }); return; }

  const cfg      = db.getGuildConfig(target.id);
  const staffCh  = cfg.staff_channel_id
    ? target.channels.cache.get(cfg.staff_channel_id)
    : target.channels.cache.find(c => c.type === 0 && /staff|mod|log|admin/i.test(c.name));
  if (!staffCh) { await channel.send({ content: `I couldn't find a staff channel in **${target.name}**. Ask an admin to set one up!` }); return; }

  const user  = await client.users.fetch(userId).catch(() => null);
  const appId = db.createPendingApproval(target.id, userId, 'custom', JSON.stringify(action), action.description || 'Custom request');
  const embed = new EmbedBuilder()
    .setTitle('📋 Approval Request').setColor(0xfaa61a)
    .setDescription(`A community member is requesting:\n\n**${action.description}**`)
    .addFields(
      { name: 'Requested by', value: `<@${userId}> (${user?.tag || userId})`, inline: true },
      { name: 'Server',       value: target.name,                             inline: true },
    ).setTimestamp();

  const staffMention = cfg.staff_role_id ? `<@&${cfg.staff_role_id}> ` : '';
  await staffCh.send({
    content: `${staffMention}New request needs your attention:`,
    embeds:  [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aprv:approve:${appId}`).setLabel('✅ Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`aprv:deny:${appId}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
    )],
  });
  await channel.send({ content: `✅ Done! Sent your request to the staff team in **${target.name}**. They'll review it soon!` });
}

// ── Autonomous community posts ────────────────────────────────────────────────

async function generateCommunityPost() {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const resp = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: GROQ_MODEL, temperature: 0.92, max_tokens: 100,
        messages: [
          { role: 'system', content: 'You are Pela, a warm community manager bot. Write ONE short genuine community message (1-2 sentences, under 140 chars). Could be a question, tip, encouragement, casual check-in. Sound human. No hashtags.' },
          { role: 'user',   content: 'Write a community message.' },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 12_000 },
    );
    return resp.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
  } catch (e) { console.error('[pelaAI] community post gen failed:', e.message); return null; }
}

async function postCommunityMessage(client, db) {
  const serverId  = db.getPelaConfig('pela_server_id');
  const channelId = db.getPelaConfig('pela_updates_channel_id');
  if (!serverId || !channelId) return;
  const ch = client.guilds.cache.get(serverId)?.channels.cache.get(channelId);
  if (!ch) return;
  const text = await generateCommunityPost();
  if (text) {
    await ch.send({ content: text }).catch(e => console.error('[pelaAI] post failed:', e.message));
    db.setPelaConfig('last_autonomous_post', Date.now().toString());
  }
}

function startAutonomousPosts(client, db) {
  // First post after 1 hour, then every 4-8 hours randomly
  const schedule = () => {
    const delay = (4 + Math.random() * 4) * 3_600_000;
    setTimeout(async () => { await postCommunityMessage(client, db).catch(() => {}); schedule(); }, delay);
  };
  setTimeout(schedule, 3_600_000);
}

// ── Daily ticket summary to owner ─────────────────────────────────────────────

async function sendTicketSummary(client, db) {
  const owner = await client.users.fetch(OWNER_ID).catch(() => null);
  if (!owner) return;
  const lines = [];
  for (const [gid, guild] of client.guilds.cache) {
    try {
      const open = db.getTicketsByGuild(gid).filter(t => t.status === 'open').slice(0, 5);
      for (const t of open) lines.push(`• **${guild.name}** — #${t.channel_id}: ${t.subject || 'No subject'} (${Math.floor((Date.now() - new Date(t.created_at)) / 86400000)}d old)`);
    } catch {}
  }
  if (!lines.length) return;
  await owner.send({ content: `📋 **Open Ticket Summary** (${lines.length} tickets)\n\n${lines.slice(0, 15).join('\n')}` }).catch(() => {});
}

// ── Main handlers ─────────────────────────────────────────────────────────────

async function handleDmMessage(message, client, db) {
  if (!process.env.GROQ_API_KEY) {
    return message.reply({ content: "Hey! I'm Pela 👋 My AI is offline right now — try again soon!" });
  }
  const userId  = message.author.id;
  const key     = `pela_dm:${userId}`;
  const conv    = getConv(key);
  if (conv.lang === 'en' && /[֐-׿]/.test(message.content)) conv.lang = 'he';

  const permLevel   = await detectPermLevel(userId, client, db);
  const sharedGuilds = await getSharedGuilds(userId, client);
  const inHomeServer = sharedGuilds.some(g => g.id === HOME_SERVER_ID);

  // Occasionally hint at mentioning the server (every 8-13 messages, only if not already in it)
  const msgCount  = serverMentions.get(userId) || 0;
  const threshold = 8 + Math.floor(Math.random() * 6);
  const wantMention = !inHomeServer && msgCount >= threshold;
  const inviteUrl = wantMention ? await getHomeInvite(client) : null;

  const opts = { isHomeServer: inHomeServer, inviteUrl };

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    const raw = await callPelaGroq(buildPrompt(permLevel, conv.lang, opts), conv.messages, message.content);
    const { reply, action } = parseResp(raw);
    push(key, 'user', message.content);
    push(key, 'assistant', reply);
    await message.reply({ content: reply });
    // Update mention counter
    serverMentions.set(userId, inviteUrl ? 0 : msgCount + 1);
    if (action?.type === 'show_roles')       await showRoleSelector(message.channel, userId, client, db);
    if (action?.type === 'request_approval') await sendApprovalRequest(message.channel, userId, action, client, db);
  } catch (e) {
    console.error('[pelaAI] DM error:', e.response?.data?.error?.message ?? e.message);
    await message.reply({ content: "Oops, something went wrong on my end! Try again in a moment 🙏" }).catch(() => {});
  } finally { clearInterval(typingPulse); }
}

async function handleGuildMessage(message, client, db, permLevel) {
  if (!process.env.GROQ_API_KEY) return;
  const userId  = message.author.id;
  const key     = `pela_guild:${message.guild.id}:${userId}`;
  const conv    = getConv(key);
  if (conv.lang === 'en' && /[֐-׿]/.test(message.content)) conv.lang = 'he';
  const userText = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!userText) return message.reply({ content: '👋 Hey! What can I help you with?' });

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});
  try {
    const isHomeServer = message.guild.id === HOME_SERVER_ID;
    const raw = await callPelaGroq(buildPrompt(permLevel || 'user', conv.lang, { isHomeServer }), conv.messages, userText);
    const { reply, action } = parseResp(raw);
    push(key, 'user', userText);
    push(key, 'assistant', reply);
    await message.reply({ content: reply });
    if (action?.type === 'show_roles')       await showRoleSelector(message.channel, userId, client, db);
    if (action?.type === 'request_approval') await sendApprovalRequest(message.channel, userId, action, client, db);
  } catch (e) {
    console.error('[pelaAI] guild error:', e.message);
  } finally { clearInterval(typingPulse); }
}

// ── Auto-configure home server on startup ────────────────────────────────────

async function ensureHomeServerConfig(client, db) {
  const guild = client.guilds.cache.get(HOME_SERVER_ID);
  if (!guild) return;

  // Set this server as Pela's home if not already configured
  if (db.getPelaConfig('pela_server_id') !== HOME_SERVER_ID) {
    db.setPelaConfig('pela_server_id', HOME_SERVER_ID);
    console.log('[pelaAI] Home server set:', guild.name);
  }

  // Auto-detect channels from /pela-setup names if not yet configured
  const find = (pattern) => guild.channels.cache.find(c => c.type === 0 && pattern.test(c.name));
  if (!db.getPelaConfig('pela_updates_channel_id')) {
    const ch = find(/bot-update|update|announce/i);
    if (ch) db.setPelaConfig('pela_updates_channel_id', ch.id);
  }
  if (!db.getPelaConfig('pela_logs_channel_id')) {
    const ch = find(/log/i);
    if (ch) db.setPelaConfig('pela_logs_channel_id', ch.id);
  }
  if (!db.getPelaConfig('pela_tasks_channel_id')) {
    const ch = find(/task/i);
    if (ch) db.setPelaConfig('pela_tasks_channel_id', ch.id);
  }

  // Auto-configure roles from /pela-setup names if not yet set
  const cfg = db.getGuildConfig(HOME_SERVER_ID);
  if (!cfg.staff_role_id) {
    const r = guild.roles.cache.find(r => r.name === 'Staff');
    if (r) db.updateGuildConfig(HOME_SERVER_ID, { staff_role_id: r.id });
  }
  const selfRoles = JSON.parse(cfg.self_assignable_roles || '[]');
  if (!selfRoles.length) {
    const ids = ['Member','VIP'].map(n => guild.roles.cache.find(r => r.name === n)?.id).filter(Boolean);
    if (ids.length) db.updateGuildConfig(HOME_SERVER_ID, { self_assignable_roles: JSON.stringify(ids) });
  }
}

module.exports = { handleDmMessage, handleGuildMessage, detectPermLevel, startAutonomousPosts, postCommunityMessage, sendTicketSummary, ensureHomeServerConfig };