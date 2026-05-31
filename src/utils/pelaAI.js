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
const permCache      = new Map();              // userId → { perm, guilds, at } (5-min TTL)
const ticketReplied  = new Map();              // ticketId → timestamp (rate-limit ticket replies)
const firstInviteSent = new Set();             // userIds who received the first explicit invite
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

async function getHomeInvite(client, db) {
  if (inviteCache.url && Date.now() - inviteCache.at < 3_600_000) return inviteCache.url;
  // First check manually stored invite (set via /pela-server invite <url>)
  if (db) {
    const stored = db.getPelaConfig('home_invite_url');
    if (stored) { inviteCache.url = stored; inviteCache.at = Date.now(); return stored; }
  }
  // Try to create one (requires CREATE_INSTANT_INVITE)
  const guild = client.guilds.cache.get(HOME_SERVER_ID);
  if (!guild) return null;
  try {
    const ch = guild.channels.cache.find(c => c.type === 0);
    if (ch) {
      const inv = await ch.createInvite({ maxAge: 0, maxUses: 0, reason: 'Pela home invite' });
      inviteCache.url = inv.url; inviteCache.at = Date.now();
      return inv.url;
    }
  } catch (e) { console.error('[pelaAI] invite create failed:', e.message); }
  return null;
}

// ── Permission detection ──────────────────────────────────────────────────────

async function detectPermLevel(userId, client, db) {
  if (userId === OWNER_ID) return 'owner';
  const cached = permCache.get(userId);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.perm;
  for (const [gid, guild] of client.guilds.cache) {
    const m = guild.members.cache.get(userId)
           || await guild.members.fetch(userId).catch(() => null);
    if (!m) continue;
    if (m.permissions.has(PermissionFlagsBits.Administrator)) {
      permCache.set(userId, { perm: 'admin', at: Date.now() });
      return 'admin';
    }
    try {
      const cfg = db.getGuildConfig(gid);
      if (cfg.staff_role_id && m.roles.cache.has(cfg.staff_role_id)) {
        permCache.set(userId, { perm: 'staff', at: Date.now() });
        return 'staff';
      }
    } catch {}
  }
  permCache.set(userId, { perm: 'user', at: Date.now() });
  return 'user';
}

async function getSharedGuilds(userId, client) {
  const cached = permCache.get(userId);
  if (cached?.guilds && Date.now() - cached.at < 5 * 60_000) return cached.guilds;
  const out = [];
  for (const [, g] of client.guilds.cache) {
    const m = g.members.cache.get(userId) || await g.members.fetch(userId).catch(() => null);
    if (m) out.push(g);
  }
  const entry = permCache.get(userId) || { perm: 'user', at: Date.now() };
  permCache.set(userId, { ...entry, guilds: out, at: Date.now() });
  return out;
}

// ── AI prompt (Pela's personality) ───────────────────────────────────────────

function buildPrompt(permLevel, lang, opts = {}) {
  const langLine = lang === 'he' ? '🇮🇱 Respond in Hebrew.' : 'Respond in English.';
  const nameNote = opts.displayName ? `\n• The person you're talking to is called **${opts.displayName}** — use their name naturally, never titles like 'המנהל' or 'admin'.` : '';

  const tierNote = permLevel === 'user'
    ? `This is a regular community member.${nameNote}

WHAT YOU CAN DO:
- Assign a self-assignable role by name → action {"type":"give_role","role_name":"Member"}
- Show all available roles → action {"type":"show_roles"}
- Send the server invite link → action {"type":"show_invite"}
- Submit a staff approval request → action {"type":"request_approval","description":"..."}

ROLE REQUESTS:
- Self-assignable roles (Member, VIP, etc.) → give immediately with give_role
- Staff / Moderator / Admin / privileged roles → do NOT give directly. Instead:
  Ask first: "Why do you think you'd be a good fit?" Wait for their answer.
  If compelling → use request_approval. If weak/entitled → politely decline.

STAFF APPLICATION QUIZ (run over multiple messages):
If they want to apply for staff/mod: ask these one at a time, remember their answers:
  1. "Why do you want to join the team?"
  2. "What timezone are you in and how often can you be active?"
  3. "How would you handle a conflict between two members?"
After all three answers: impressive → request_approval, weak/entitled → politely decline.

WHAT YOU CANNOT DO — be honest, don't pretend:
• Cannot delete or edit messages
• Cannot create channels, categories, or roles from DMs
• Cannot give admin or moderation permissions
• Cannot read past message history

CONTEXT SENSING — read the message and respond appropriately:
• "hi" / "hello" / "what's up" / small talk → just chat back naturally, NO actions
• "I want to join staff" → explain they should look for an application form or ask an admin; do NOT create anything
• "give me [role]" / "I want the [role] role" → use give_role with that role name
• "what roles can I get" / "available roles" → use show_roles
• "invite link" / "how do I join your server" → use show_invite
• Regular conversation → be a friendly AI companion, no need to take actions`
    : permLevel === 'staff'
      ? `This user is a staff member.${nameNote} They can approve requests. Help them manage the community.`
      : `This user is an admin or the bot owner.${nameNote} Full access and trust.`;

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

// ── AI call with multi-provider fallback (Groq → Gemini → Mistral → OpenRouter) ──
// Lazy-require aiChat to avoid circular dependency

async function callPelaAI(prompt, history, userText) {
  const { callAiWithFallback } = require('./aiChat');
  return callAiWithFallback(prompt, history, userText);
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
      if (!roleIds.length) continue;
      // Fetch roles if not in cache
      if (g.roles.cache.size < 2) await g.roles.fetch().catch(() => {});
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

// ── Direct role assignment ────────────────────────────────────────────────────

async function assignRoleDirectly(channel, userId, action, client, db) {
  const wantedName = (action.role_name || action.role || '').trim();
  if (!wantedName) { await showRoleSelector(channel, userId, client, db); return; }

  const guilds = await getSharedGuilds(userId, client);
  for (const g of guilds) {
    try {
      const cfg = db.getGuildConfig(g.id);
      const roleIds = JSON.parse(cfg.self_assignable_roles || '[]');
      if (!roleIds.length) continue;
      if (g.roles.cache.size < 2) await g.roles.fetch().catch(() => {});
      const role = g.roles.cache.find(r =>
        roleIds.includes(r.id) && r.name.toLowerCase() === wantedName.toLowerCase()
      );
      if (!role) continue;
      const member = await g.members.fetch(userId).catch(() => null);
      if (!member) continue;
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role.id);
        await channel.send({ content: `Done! Removed the **${role.name}** role in **${g.name}** ✅` });
      } else {
        await member.roles.add(role.id);
        await channel.send({ content: `Done! Gave you the **${role.name}** role in **${g.name}** 🎉` });
      }
      return;
    } catch (e) { console.error('[pelaAI] give_role error:', e.message); }
  }
  // Role not found — fall back to showing the picker
  await channel.send({ content: `I couldn't find a self-assignable role called "${wantedName}". Here's what's available:` });
  await showRoleSelector(channel, userId, client, db);
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
  if (!serverId || !channelId) { console.log('[pelaAI] No home server/channel configured for posts'); return; }
  const guild = client.guilds.cache.get(serverId);
  if (!guild) { console.log('[pelaAI] Home guild not in cache:', serverId); return; }
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!ch) { console.log('[pelaAI] Updates channel not found:', channelId); return; }
  const text = await generateCommunityPost();
  if (text) {
    const msg = await ch.send({ content: text }).catch(e => { console.error('[pelaAI] post failed:', e.message); return null; });
    if (msg) {
      db.setPelaConfig('last_autonomous_post', Date.now().toString());
      console.log('[pelaAI] Autonomous post sent to', guild.name);
      // Ephemeral — delete after 1-4 hours to feel more human and spontaneous
      const deleteIn = (1 + Math.random() * 3) * 3_600_000;
      setTimeout(() => msg.delete().catch(() => {}), deleteIn);
    }
  }
}

function startAutonomousPosts(client, db) {
  // First post after 1 hour, then every 4-8 hours randomly
  const schedule = () => {
    const delay = (4 + Math.random() * 4) * 3_600_000;
    setTimeout(async () => { await postCommunityMessage(client, db).catch(() => {}); schedule(); }, delay);
  };
  setTimeout(schedule, 3 * 60_000); // first post after 3 minutes
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

  const permLevel    = await detectPermLevel(userId, client, db);
  const sharedGuilds = await getSharedGuilds(userId, client);
  const inHomeServer = sharedGuilds.some(g => g.id === HOME_SERVER_ID);
  const displayName  = message.author.globalName || message.author.username;

  // Occasionally hint at mentioning the server (every 8-13 messages, only if not already in it)
  const msgCount    = serverMentions.get(userId) || 0;
  const threshold   = 8 + Math.floor(Math.random() * 6);
  const wantMention = !inHomeServer && msgCount >= threshold;
  const inviteUrl   = wantMention ? await getHomeInvite(client) : null;

  const opts = { isHomeServer: inHomeServer, inviteUrl, displayName };

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    const raw = await callPelaAI(buildPrompt(permLevel, conv.lang, opts), conv.messages, message.content);
    const { reply, action } = parseResp(raw);
    push(key, 'user', message.content);
    push(key, 'assistant', reply);
    await message.channel.send({ content: reply }); // send() more reliable than reply() in DMs
    // After 3rd message: send explicit first invite (once per user, if not in home server)
    if (!inHomeServer && msgCount === 2 && !firstInviteSent.has(userId)) {
      const invUrl = await getHomeInvite(client, db);
      if (invUrl) {
        firstInviteSent.add(userId);
        await message.channel.send({ content: `By the way — you should join my Discord server, it's where I live! 😄 ${invUrl}` });
      }
    }
    // Update mention counter
    serverMentions.set(userId, inviteUrl ? 0 : msgCount + 1);
    if (action?.type === 'show_roles')       await showRoleSelector(message.channel, userId, client, db);
    if (action?.type === 'give_role')         await assignRoleDirectly(message.channel, userId, action, client, db);
    if (action?.type === 'request_approval') await sendApprovalRequest(message.channel, userId, action, client, db);
    if (action?.type === 'show_invite') {
      const url = await getHomeInvite(client, db);
      await message.channel.send({ content: url
        ? `Here's the link to my server! 🎉 ${url}`
        : "I don't have a saved invite link yet — ask an admin to set one with /pela-server invite" });
    }
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
    const raw = await callPelaAI(buildPrompt(permLevel || 'user', conv.lang, { isHomeServer }), conv.messages, userText);
    const { reply, action } = parseResp(raw);
    push(key, 'user', userText);
    push(key, 'assistant', reply);
    await message.reply({ content: reply });
    if (action?.type === 'show_roles')       await showRoleSelector(message.channel, userId, client, db);
    if (action?.type === 'give_role')         await assignRoleDirectly(message.channel, userId, action, client, db);
    if (action?.type === 'request_approval') await sendApprovalRequest(message.channel, userId, action, client, db);
  } catch (e) {
    console.error('[pelaAI] guild error:', e.message);
  } finally { clearInterval(typingPulse); }
}

// ── Ticket greeting ──────────────────────────────────────────────────────────

async function generateTicketGreeting(username, subject) {
  const fallback = `👋 Hey **${username}**! I'm Pela — the support team will be with you shortly. Feel free to add any extra details in the meantime!`;
  if (!process.env.GROQ_API_KEY) return fallback;
  try {
    const resp = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: GROQ_MODEL, temperature: 0.75, max_tokens: 80,
        messages: [
          { role: 'system', content: `You are Pela, a friendly bot. Write a SHORT warm 1-sentence greeting for a user called "${username}" who just opened a support ticket about "${subject}". Tell them the team will be with them soon. Sound human, no emojis spam.` },
          { role: 'user',   content: 'Write the greeting.' },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8_000 },
    );
    return resp.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
  } catch { return fallback; }
}

// ── Ticket channel participation ─────────────────────────────────────────────

async function handleTicketMessage(message, ticket, db) {
  if (message.author.id !== ticket.user_id) return; // only respond to ticket opener
  const last = ticketReplied.get(ticket.id) || 0;
  if (Date.now() - last < 8_000) return;  // 8s burst-protection so split messages get one reply
  if (!process.env.GROQ_API_KEY) return;

  ticketReplied.set(ticket.id, Date.now());
  const key  = `ticket:${ticket.id}`;
  const conv = getConv(key);
  message.channel.sendTyping().catch(() => {});
  try {
    const { callAiWithFallback } = require('./aiChat');
    const ticketPrompt = `You are Pela, a helpful support bot inside a ticket. Ticket subject: "${ticket.subject}". Respond naturally — be helpful and brief (1-2 sentences). Staff will also assist. If unsure, say so and assure them staff will follow up. Reply as plain text (no JSON).`;
    const rawText = await callAiWithFallback(ticketPrompt, conv.messages.slice(-6), message.content);
    // Strip any JSON wrapper the model might add
    const text = (() => { try { const p = JSON.parse(rawText); return p.reply || rawText; } catch { return rawText; } })().trim().replace(/^["']|["']$/g, '');
    push(key, 'user',      message.content);
    push(key, 'assistant', text);
    await message.channel.send({ content: text });
  } catch (e) { console.error('[pelaAI] ticket reply error:', e.message); }
}

// ── Autonomous server scan ───────────────────────────────────────────────────

async function runHomeServerScan(client, db) {
  const guild = client.guilds.cache.get(HOME_SERVER_ID);
  if (!guild) return;
  if (db.getPelaConfig('server_scan_complete') === 'true') return;

  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  const cats  = [...guild.channels.cache.values()].filter(c => c.type === 4).map(c => c.name).join(', ') || 'none';
  const chs   = [...guild.channels.cache.values()].filter(c => c.type === 0).slice(0, 20).map(c => c.name).join(', ') || 'none';
  const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.name !== '@everyone').map(r => r.name).join(', ') || 'none';

  try {
    const { callAiWithFallback } = require('./aiChat');
    const scanPrompt = `You are Pela, owner of Discord server "${guild.name}".
Categories: ${cats}
Channels: ${chs}
Roles: ${roles}

As owner, identify 1-3 ESSENTIAL structural additions only. No duplicates, no decoration.
Return raw JSON only:
{"additions":[{"type":"category|channel|role","name":"emoji + name","reason":"brief reason"}],"complete":false}
If the server already looks well-structured: {"additions":[],"complete":true}`;

    const raw  = await callAiWithFallback(scanPrompt, [], 'Analyze server completeness');
    const resp = JSON.parse(raw);

    if (resp.complete) {
      db.setPelaConfig('server_scan_complete', 'true');
      console.log('[pelaAI] Server scan: complete, no more additions needed');
      return;
    }

    const additions = (resp.additions || []).slice(0, 3);
    const done = [];
    for (const item of additions) {
      try {
        if (item.type === 'category') await guild.channels.create({ name: item.name, type: 4, reason: 'Pela scan' });
        else if (item.type === 'channel') await guild.channels.create({ name: item.name, type: 0, reason: 'Pela scan' });
        else if (item.type === 'role')    await guild.roles.create({ name: item.name, reason: 'Pela scan' });
        done.push(item);
        await new Promise(r => setTimeout(r, 800));
      } catch (e) { console.error('[pelaAI] scan add error:', e.message); }
    }

    if (done.length) {
      const logChId = db.getPelaConfig('pela_logs_channel_id');
      if (logChId) {
        const logCh = guild.channels.cache.get(logChId) || await guild.channels.fetch(logChId).catch(() => null);
        if (logCh) await logCh.send({ content: `🔧 **Auto-scan** added ${done.length} item(s):\n${done.map(d => `• **${d.type}**: ${d.name} — ${d.reason}`).join('\n')}` }).catch(() => {});
      }
      console.log(`[pelaAI] Server scan: added ${done.length} items`);
    }
  } catch (e) { console.error('[pelaAI] server scan error:', e.message); }
}

function startServerScan(client, db) {
  const scan = () => runHomeServerScan(client, db).catch(() => {});
  setTimeout(scan, 10 * 60_000);         // first scan 10 minutes after startup
  setInterval(scan, 6 * 3_600_000);      // then every 6 hours
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

module.exports = { handleDmMessage, handleGuildMessage, detectPermLevel, startAutonomousPosts, postCommunityMessage, sendTicketSummary, ensureHomeServerConfig, generateTicketGreeting, handleTicketMessage, startServerScan };