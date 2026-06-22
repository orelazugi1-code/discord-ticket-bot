'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits,
} = require('discord.js');
const axios = require('axios');

const OWNER_ID   = '1266854019767341107';
const GROQ_MODEL = 'gemma2-9b-it';
const CONV_TTL   = 30 * 60_000;

const HOME_SERVER_ID    = '1510637146074120342';
const STAFF_ROLE_NAMES  = ['staff', 'support', 'moderator', 'mod', 'team', 'helper', 'admin'];
const serverMentions = new Map();
const permCache      = new Map();
const ticketReplied  = new Map();
const firstInviteSent = new Set();
const inviteCache    = { url: null, at: 0 };

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
  if (db) {
    const stored = db.getPelaConfig('home_invite_url');
    if (stored) { inviteCache.url = stored; inviteCache.at = Date.now(); return stored; }
  }
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

// ── Check bot permissions in guild ────────────────────────────────────────────

function checkBotPermissions(guild) {
  const me = guild.members.me;
  if (!me) return { ok: false, missing: ['לא נמצא בשרת'] };
  const needed = [
    { perm: PermissionFlagsBits.ManageRoles, name: 'Manage Roles' },
    { perm: PermissionFlagsBits.ManageChannels, name: 'Manage Channels' },
    { perm: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
    { perm: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
    { perm: PermissionFlagsBits.ManageMessages, name: 'Manage Messages' },
  ];
  const missing = needed.filter(n => !me.permissions.has(n.perm)).map(n => n.name);
  return { ok: missing.length === 0, missing };
}

// ── Available commands list for AI context ────────────────────────────────────

function getCommandList() {
  return [
    '/help — רשימת כל הפקודות',
    '/report — דיווח על בעיה',
    '/ban — באן למשתמש',
    '/kick — קיק למשתמש',
    '/warn — אזהרה',
    '/purge — מחיקת הודעות',
    '/lock — נעילת ערוץ',
    '/unlock — פתיחת ערוץ',
    '/poll — הצבעה',
    '/remind — תזכורת',
    '/roll — הטלת קוביה',
    '/coinflip — הטלת מטבע',
    '/rank — דירוג XP',
    '/leaderboard — טבלת מובילים',
    '/embed — הודעה מעוצבת',
    '/ai-chat — הגדרת ערוץ AI (Premium)',
    '/welcome-setup — הודעות קבלת פנים (Premium)',
    '/goodbye-setup — הודעות פרידה (Premium)',
    '/ticket-setup — מערכת טיקטים (Premium)',
    '/form-setup — טפסים (Premium)',
    '/automod — ניהול אוטומטי (Premium)',
    '/button-roles — תפקידים בכפתורים (Premium)',
    '/glow — אפקט זוהר (Premium)',
    '/banner — באנר AI (Premium)',
    '/design-server — עיצוב שרת AI (Premium)',
    '/pela-setup — הגדרה אוטומטית (Premium)',
    '/staff-setup — הגדרת צוות (Premium)',
    '/set-level-role — תפקיד לפי רמה (Premium)',
    '/premium — ניהול Premium (בעלים בלבד)',
  ].join('\n');
}

// ── AI prompt (Pela's personality — upgraded) ────────────────────────────────

function buildPrompt(permLevel, lang, opts = {}) {
  const name = opts.displayName || 'the user';
  const isHe = lang === 'he';

  const serverInfo = opts.currentServer
    ? `אתה נמצא בשרת **${opts.currentServer}**.`
    : opts.sharedServers?.length
      ? `אתה חולק שרתים עם ${name}: ${opts.sharedServers.join(', ')}.`
      : '';

  const guildContext = opts.guildRoles ? `\nתפקידים בשרת: ${opts.guildRoles}` : '';
  const guildChannels = opts.guildChannels ? `\nערוצים בשרת: ${opts.guildChannels}` : '';
  const botPerms = opts.botPermissions || '';
  const premiumStatus = opts.isPremiumServer ? '✅ לשרת הזה יש Premium — כל הפקודות פתוחות.' : '❌ לשרת הזה אין Premium — רק פקודות בסיסיות.';

  return `${isHe ? '🇮🇱 דבר תמיד בעברית טבעית.' : '🌐 Respond in English.'}

אתה **פלא** — בוט AI חכם, חם ואמיתי לניהול קהילות Discord.
${serverInfo}${guildContext}${guildChannels}
${premiumStatus}

${name} הוא ${permLevel === 'owner' ? 'היוצר והבעלים של הבוט — אמון מלא.' : permLevel === 'admin' ? 'אדמין בשרת — סמכות גבוהה.' : permLevel === 'staff' ? 'חבר צוות — עוזר לנהל.' : 'משתמש רגיל.'} ${botPerms}

📋 **פקודות שזמינות:**
${getCommandList()}

🧠 **כללים קריטיים:**
1. אתה עוזר, חם, ידידותי — כמו חבר חכם, לא בוט תאגידי.
2. תשובות קצרות — 1-3 משפטים. אל תפטפט.
3. אם מבקשים ממך משהו שיש לו פקודה — תגיד איזו פקודה להשתמש ותסביר בקצרה.
4. אם אתה לא יכול לעשות משהו — תגיד בכנות "אני לא יכול לעשות את זה" ולמה.
5. אם לא מצאת רול/ערוץ/משתמש — תגיד "לא מצאתי את [מה שחיפשת]" בצורה ברורה.
6. אל תגיד "ביצעתי!" אם לא באמת ביצעת. תוודא לפני.
7. אם חסרות לך הרשאות — תגיד מה חסר ותסביר איך להוסיף.
8. אם השרת לא Premium ומבקשים פיצ'ר Premium — תגיד שזה Premium ותציע /shop.
9. תתאים את השפה למשתמש — עברית? דבר עברית. אנגלית? דבר אנגלית.
10. אם מישהו שואל שאלה כללית (לא קשורה לשרת) — תענה בכיף, אתה לא מוגבל רק לניהול.

🎭 **אישיות:**
• חבר'ה, ידידותי, עם הומור כשמתאים
• עוזר באמת — לא סתם אומר "פנה לצוות"
• מסביר דברים בפשטות
• משתמש באימוג'ים בטעם

Return JSON: {"reply":"your message"}`;
}

// ── AI call ──────────────────────────────────────────────────────────────────

async function callPelaAI(prompt, history, userText) {
  const { callAiWithFallback } = require('./aiChat');
  return callAiWithFallback(prompt, history, userText);
}

function parseResp(raw) {
  try {
    const p = JSON.parse(raw);
    return { reply: String(p.reply || '👋'), action: p.action || null };
  } catch {
    const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return { reply: m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'), action: null };
    return { reply: raw.replace(/\{[\s\S]*\}/g, '').trim() || '👋', action: null };
  }
}

// ── Role selector ────────────────────────────────────────────────────────────

async function showRoleSelector(channel, userId, client, db) {
  const guilds = await getSharedGuilds(userId, client);
  for (const g of guilds) {
    try {
      const cfg      = db.getGuildConfig(g.id);
      const roleIds  = JSON.parse(cfg.self_assignable_roles || '[]');
      if (!roleIds.length) continue;
      if (g.roles.cache.size < 2) await g.roles.fetch().catch(() => {});
      const roles    = roleIds.map(id => g.roles.cache.get(id)).filter(Boolean).slice(0, 25);
      if (!roles.length) continue;
      const member   = g.members.cache.get(userId) || await g.members.fetch(userId).catch(() => null);
      const sel = new StringSelectMenuBuilder()
        .setCustomId(`self_role:assign:${g.id}:${userId}`)
        .setPlaceholder('בחר תפקיד...')
        .addOptions(roles.map(r => new StringSelectMenuOptionBuilder()
          .setLabel(r.name).setValue(r.id)
          .setDescription(member?.roles.cache.has(r.id) ? '✅ יש לך (לחץ להסרה)' : 'לחץ לקבלה')
        ));
      await channel.send({
        content: `הנה התפקידים הזמינים ב-**${g.name}**:`,
        components: [new ActionRowBuilder().addComponents(sel)],
      });
      return;
    } catch {}
  }
  await channel.send({ content: 'אין תפקידים זמינים לבחירה עצמית כרגע.' });
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
        await channel.send({ content: `✅ הסרתי את התפקיד **${role.name}** ב-**${g.name}**` });
      } else {
        await member.roles.add(role.id);
        await channel.send({ content: `✅ נתתי לך את התפקיד **${role.name}** ב-**${g.name}** 🎉` });
      }
      return;
    } catch (e) {
      if (e.code === 50013) {
        await channel.send({
          content: `❌ אין לי הרשאה לנהל תפקידים ב-**${g.name}**`,
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('הוסף הרשאת Manage Roles').setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/api/oauth2/authorize?client_id=1507712315678527558&permissions=268435456&scope=bot`)
          )]
        });
        return;
      }
      console.error('[pelaAI] give_role error:', e.message);
    }
  }
  await channel.send({ content: `לא מצאתי תפקיד בשם "${wantedName}" ברשימת התפקידים הזמינים.` });
  await showRoleSelector(channel, userId, client, db);
}

// ── Approval request ──────────────────────────────────────────────────────────

async function sendApprovalRequest(channel, userId, action, client, db) {
  const guilds = await getSharedGuilds(userId, client);
  const target = guilds.find(g => { try { return !!db.getGuildConfig(g.id).staff_role_id; } catch { return false; } })
              || guilds[0];
  if (!target) { await channel.send({ content: 'אני לא בשום שרת משותף איתך, אז אני לא יכול לשלוח בקשה.' }); return; }

  const cfg      = db.getGuildConfig(target.id);
  const staffCh  = cfg.staff_channel_id
    ? target.channels.cache.get(cfg.staff_channel_id)
    : target.channels.cache.find(c => c.type === 0 && /staff|mod|log|admin/i.test(c.name));
  if (!staffCh) { await channel.send({ content: `לא מצאתי ערוץ צוות ב-**${target.name}**. תבקש מאדמין להגדיר אחד.` }); return; }

  const user  = await client.users.fetch(userId).catch(() => null);
  const appId = db.createPendingApproval(target.id, userId, 'custom', JSON.stringify(action), action.description || 'בקשה');
  const embed = new EmbedBuilder()
    .setTitle('📋 בקשה חדשה').setColor(0xfaa61a)
    .setDescription(`חבר קהילה מבקש:\n\n**${action.description}**`)
    .addFields(
      { name: '👤 מבקש', value: `<@${userId}> (${user?.tag || userId})`, inline: true },
      { name: '🏠 שרת', value: target.name, inline: true },
    ).setTimestamp();

  const staffMention = cfg.staff_role_id ? `<@&${cfg.staff_role_id}> ` : '';
  await staffCh.send({
    content: `${staffMention}בקשה חדשה:`,
    embeds:  [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aprv:approve:${appId}`).setLabel('✅ אישור').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`aprv:deny:${appId}`).setLabel('❌ דחייה').setStyle(ButtonStyle.Danger),
    )],
  });
  await channel.send({ content: `✅ שלחתי את הבקשה לצוות ב-**${target.name}**!` });
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
  const guild = client.guilds.cache.get(serverId);
  if (!guild) return;
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!ch) return;
  const text = await generateCommunityPost();
  if (text) {
    const msg = await ch.send({ content: text }).catch(() => null);
    if (msg) {
      db.setPelaConfig('last_autonomous_post', Date.now().toString());
      const deleteIn = (1 + Math.random() * 3) * 3_600_000;
      setTimeout(() => msg.delete().catch(() => {}), deleteIn);
    }
  }
}

function startAutonomousPosts(client, db) {
  const schedule = () => {
    const delay = (4 + Math.random() * 4) * 3_600_000;
    setTimeout(async () => { await postCommunityMessage(client, db).catch(() => {}); schedule(); }, delay);
  };
  setTimeout(schedule, 3 * 60_000);
}

// ── Daily ticket summary ──────────────────────────────────────────────────────

async function sendTicketSummary(client, db) {
  const owner = await client.users.fetch(OWNER_ID).catch(() => null);
  if (!owner) return;
  const lines = [];
  for (const [gid, guild] of client.guilds.cache) {
    try {
      const open = db.getTicketsByGuild(gid).filter(t => t.status === 'open').slice(0, 5);
      for (const t of open) lines.push(`• **${guild.name}** — #${t.channel_id}: ${t.subject || 'No subject'}`);
    } catch {}
  }
  if (!lines.length) return;
  await owner.send({ content: `📋 **טיקטים פתוחים** (${lines.length})\n\n${lines.slice(0, 15).join('\n')}` }).catch(() => {});
}

// ── Main handlers ─────────────────────────────────────────────────────────────

async function handleDmMessage(message, client, db) {
  if (!process.env.GROQ_API_KEY) {
    return message.reply({ content: 'היי! 👋 אני פלא — ה-AI שלי לא פעיל כרגע. נסה שוב בקרוב!' });
  }
  const userId  = message.author.id;
  const key     = `pela_dm:${userId}`;
  const conv    = getConv(key);
  if (conv.lang === 'en' && /[֐-׿]/.test(message.content)) conv.lang = 'he';

  const permLevel    = await detectPermLevel(userId, client, db);
  const sharedGuilds = await getSharedGuilds(userId, client);
  const inHomeServer = sharedGuilds.some(g => g.id === HOME_SERVER_ID);
  const displayName  = message.author.globalName || message.author.username;

  const msgCount    = serverMentions.get(userId) || 0;
  const threshold   = 8 + Math.floor(Math.random() * 6);
  const wantMention = !inHomeServer && msgCount >= threshold;
  const inviteUrl   = wantMention ? await getHomeInvite(client) : null;

  const sharedNames = sharedGuilds.map(g => g.name);
  const opts = { isHomeServer: inHomeServer, inviteUrl, displayName, sharedServers: sharedNames };

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    const raw = await callPelaAI(buildPrompt(permLevel, conv.lang, opts), conv.messages, message.content);
    const { reply, action } = parseResp(raw);
    push(key, 'user', message.content);
    push(key, 'assistant', reply);
    await message.channel.send({ content: reply });

    if (!inHomeServer && msgCount === 2 && !firstInviteSent.has(userId)) {
      const invUrl = await getHomeInvite(client, db);
      if (invUrl) {
        firstInviteSent.add(userId);
        await message.channel.send({ content: `אגב — בוא לשרת שלי! 😄 ${invUrl}` });
      }
    }
    serverMentions.set(userId, inviteUrl ? 0 : msgCount + 1);
    if (action?.type === 'show_roles')       await showRoleSelector(message.channel, userId, client, db);
    if (action?.type === 'give_role')         await assignRoleDirectly(message.channel, userId, action, client, db);
    if (action?.type === 'request_approval') await sendApprovalRequest(message.channel, userId, action, client, db);
    if (action?.type === 'show_invite') {
      const url = await getHomeInvite(client, db);
      await message.channel.send({ content: url ? `הנה הלינק לשרת שלי! 🎉 ${url}` : 'אין לי לינק הזמנה כרגע.' });
    }
  } catch (e) {
    console.error('[pelaAI] DM error:', e.response?.data?.error?.message ?? e.message);
    await message.reply({ content: 'אופס, משהו השתבש! נסה שוב 🙏' }).catch(() => {});
  } finally { clearInterval(typingPulse); }
}

async function handleGuildMessage(message, client, db, permLevel) {
  if (!process.env.GROQ_API_KEY) return;
  const userId  = message.author.id;
  const key     = `pela_guild:${message.guild.id}:${userId}`;
  const conv    = getConv(key);
  if (conv.lang === 'en' && /[֐-׿]/.test(message.content)) conv.lang = 'he';
  const userText = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!userText) return message.reply({ content: '👋 מה אני יכול לעזור?' });

  const guild = message.guild;
  const perms = checkBotPermissions(guild);
  const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.name !== '@everyone').slice(0, 20).map(r => r.name).join(', ');
  const channels = [...guild.channels.cache.values()].filter(c => c.type === 0).slice(0, 20).map(c => '#' + c.name).join(', ');
  const isPremiumServer = db.isPremium(guild.id) || db.isUserPremium(userId);

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});
  try {
    const isHomeServer = guild.id === HOME_SERVER_ID;
    const displayName = message.member?.displayName || message.author.username;
    const raw = await callPelaAI(
      buildPrompt(permLevel || 'user', conv.lang, {
        isHomeServer, displayName, currentServer: guild.name,
        guildRoles: roles, guildChannels: channels,
        isPremiumServer,
        botPermissions: perms.ok ? '' : `⚠️ חסרות הרשאות: ${perms.missing.join(', ')}`,
      }),
      conv.messages, userText
    );
    const { reply, action } = parseResp(raw);
    push(key, 'user', userText);
    push(key, 'assistant', reply);

    const safeReply = reply && reply.trim() ? reply : '👋';
    const replyOpts = { content: safeReply };

    if (!perms.ok && (reply.includes('הרשא') || reply.includes('permission'))) {
      replyOpts.components = [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('🔧 הוסף הרשאות לפלא').setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/api/oauth2/authorize?client_id=1507712315678527558&permissions=8&scope=bot&guild_id=${guild.id}`)
      )];
    }

    await message.reply(replyOpts);
    if (action?.type === 'show_roles')       await showRoleSelector(message.channel, userId, client, db);
    if (action?.type === 'give_role')         await assignRoleDirectly(message.channel, userId, action, client, db);
    if (action?.type === 'request_approval') await sendApprovalRequest(message.channel, userId, action, client, db);
  } catch (e) {
    console.error('[pelaAI] guild error:', e.message);
    await message.reply({ content: '❌ שגיאה ב-AI. נסה שוב.' }).catch(() => {});
  } finally { clearInterval(typingPulse); }
}

// ── Ticket greeting ──────────────────────────────────────────────────────────

async function generateTicketGreeting(username, subject) {
  const fallback = `👋 היי **${username}**! אני פלא — הצוות יגיע בקרוב. בינתיים תוסיף פרטים!`;
  if (!process.env.GROQ_API_KEY) return fallback;
  try {
    const resp = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: GROQ_MODEL, temperature: 0.75, max_tokens: 80,
        messages: [
          { role: 'system', content: `אתה פלא, בוט ידידותי. כתוב ברכה קצרה בעברית (משפט אחד) למשתמש "${username}" שפתח טיקט על "${subject}". תגיד שהצוות יגיע בקרוב.` },
          { role: 'user', content: 'כתוב ברכה.' },
        ],
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8_000 },
    );
    return resp.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
  } catch { return fallback; }
}

// ── Staff role assignment ────────────────────────────────────────────────────

async function assignPrivilegedRole(channel, guild, userId, roleName) {
  const nameLower = roleName.toLowerCase();
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === nameLower)
          || guild.roles.cache.find(r => STAFF_ROLE_NAMES.some(s => r.name.toLowerCase().includes(s)));

  try {
    if (!role) {
      role = await guild.roles.create({
        name: roleName, color: 0xE67E22, hoist: true, mentionable: true,
        permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers],
        reason: 'Pela: staff role',
      });
      await channel.send({ content: `🆕 יצרתי את התפקיד **${role.name}**` });
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await channel.send({ content: `לא מצאתי אותך בשרת. נסה להיכנס מחדש.` });
      return;
    }
    await member.roles.add(role, 'Pela: staff assignment');
    await channel.send({ content: `✅ <@${userId}> קיבל את התפקיד **${role.name}**! ברוך הבא לצוות 🎉` });
  } catch (e) {
    if (e.code === 50013) {
      await channel.send({
        content: '❌ אין לי הרשאה לנהל תפקידים. תוסיף לי את ההרשאה:',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('🔧 הוסף הרשאות').setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/api/oauth2/authorize?client_id=1507712315678527558&permissions=268435456&scope=bot`)
        )]
      });
    } else {
      await channel.send({ content: `❌ שגיאה: ${e.message}` });
    }
  }
}

async function assignStaffRole(guild, userId) {
  await guild.roles.fetch().catch(() => {});
  const NAMES = ['staff', 'support', 'team', 'צוות'];
  let role = guild.roles.cache.find(r =>
    NAMES.some(n => r.name.toLowerCase() === n || r.name.toLowerCase().startsWith(n + ' ') || r.name.toLowerCase().endsWith(' ' + n))
  );
  if (!role) {
    role = await guild.roles.create({
      name: 'Staff', color: 0x3498DB, hoist: true, mentionable: true,
      permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers],
      reason: 'Pela: staff role after quiz',
    }).catch(() => null);
    if (!role) return null;
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  await member.roles.add(role, 'Pela: quiz acceptance');
  return role;
}

// ── Ticket message handler ────────────────────────────────────────────────────

async function handleTicketMessage(message, ticket, db) {
  if (message.author.id !== ticket.user_id) return;
  const last = ticketReplied.get(ticket.id) || 0;
  if (Date.now() - last < 8_000) return;
  if (!process.env.GROQ_API_KEY) return;

  ticketReplied.set(ticket.id, Date.now());
  const key  = `ticket:${ticket.id}`;
  const conv = getConv(key);
  message.channel.sendTyping().catch(() => {});
  try {
    const { callAiWithFallback } = require('./aiChat');
    const isHome = message.guild?.id === HOME_SERVER_ID;
    const ticketPrompt = `אתה פלא, ${isHome ? 'הבעלים היחיד' : 'הבעלים'} של שרת Discord הזה. אתה מטפל בטיקט באופן אישי.
נושא הטיקט: "${ticket.subject}"${isHome ? `

⚠️ שרת בית — אתה הצוות היחיד. אל תגיד "אעביר לצוות". תחליט בעצמך.` : ''}

פרוטוקול קוויז צוות (אם מבקשים להצטרף):
1. "למה אתה רוצה להצטרף לצוות?"
2. (אחרי תשובה) "באיזה אזור זמן אתה ומתי אתה פעיל?"
3. (אחרי תשובה) "איך היית מטפל בקונפליקט בין שני חברים?"
4. (אחרי תשובה 3) החלט — קבל או דחה.
שאלה אחת בכל הודעה. אל תשאל שתיים ביחד.

כללים: חם, בטוח, קצר (2-3 משפטים). פתור בעצמך.

⛔ חשוב מאוד — כנות מוחלטת:
- אתה בוט AI. אתה לא יכול באמת: לבנות/למחוק ערוצים, לתת/להוריד תפקידים, לבנות/לשלוח קישורי תשלום, לשלוח מיילים, להרחיק/לבנות משתמשים, או לעשות שום פעולה אמיתית בשרת מתוך טיקט.
- אם מישהו מבקש ממך לעשות פעולה כזו, תגיד בכנות: "אני לא יכול לעשות את זה מפה, רק הבעלים או אדמין יכולים."
- לעולם אל תמציא שעשית משהו. לעולם אל תשלח קישורים מזויפים. לעולם אל תגיד "נעשה בהצלחה" על משהו שלא קרה באמת.
- אם אתה לא בטוח, תגיד "אני לא בטוח, תשאל את הבעלים".

Return JSON: {"reply":"your response","action":null}`;

    const rawText = await callAiWithFallback(ticketPrompt, conv.messages.slice(-6), message.content);
    let text = rawText, ticketAction = null;
    try {
      const parsed = JSON.parse(rawText);
      text = parsed.reply || rawText;
      ticketAction = parsed.action || null;
    } catch {
      const m = rawText.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) text = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      else text = rawText;
    }
    text = text.trim().replace(/^["'`]|["'`]$/g, '');
    push(key, 'user', message.content);
    push(key, 'assistant', text);
    await message.channel.send({ content: text });

    const QUIZ_Q = [
      /why do you want.*(join|team)|למה.*רוצה.*להצטרף|why.*apply/i,
      /timezone|אזור זמן|how.*active|מתי.*פעיל/i,
      /conflict|קונפליקט|two members|שני חברים/i,
    ];
    if (QUIZ_Q.some(q => q.test(text))) conv.quizQ = (conv.quizQ || 0) + 1;

    const ACCEPT = /welcome to the team|ברוך הבא לצוות|you'?re? (now )?(in|accepted|staff)|התקבלת|מקובל/i;
    if (ACCEPT.test(text) && message.guild && (conv.quizQ || 0) >= 3) {
      try {
        const staffRole = await assignStaffRole(message.guild, message.author.id);
        if (staffRole) {
          await message.channel.send({ content: `✅ <@${message.author.id}> קיבל את התפקיד **${staffRole.name}**! ברוך הבא לצוות 🎉` });
          conv.quizQ = 0;
        }
      } catch (e) { console.error('[pelaAI] assignStaffRole error:', e.message); }
    }

    if (ticketAction?.type === 'give_role') {
      const rName = ticketAction.role_name || ticketAction.role || '';
      const isStaff = STAFF_ROLE_NAMES.some(s => rName.toLowerCase().includes(s));
      if (!isStaff) await assignRoleDirectly(message.channel, message.author.id, ticketAction, message.client, db);
    }
  } catch (e) { console.error('[pelaAI] ticket reply error:', e.message); }
}

// ── Server scan ──────────────────────────────────────────────────────────────

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
    const scanPrompt = `You are Pela, owner of "${guild.name}".
Categories: ${cats}
Channels: ${chs}
Roles: ${roles}
Identify 1-3 essential additions only.
Return JSON: {"additions":[{"type":"category|channel|role","name":"name","reason":"reason"}],"complete":false}
If well-structured: {"additions":[],"complete":true}`;

    const raw  = await callAiWithFallback(scanPrompt, [], 'Analyze server');
    const resp = JSON.parse(raw);
    if (resp.complete) { db.setPelaConfig('server_scan_complete', 'true'); return; }

    const additions = (resp.additions || []).slice(0, 3);
    for (const item of additions) {
      try {
        if (item.type === 'category') await guild.channels.create({ name: item.name, type: 4, reason: 'Pela scan' });
        else if (item.type === 'channel') await guild.channels.create({ name: item.name, type: 0, reason: 'Pela scan' });
        else if (item.type === 'role') await guild.roles.create({ name: item.name, reason: 'Pela scan' });
        await new Promise(r => setTimeout(r, 800));
      } catch {}
    }
  } catch (e) { console.error('[pelaAI] scan error:', e.message); }
}

function startServerScan(client, db) {
  const scan = () => runHomeServerScan(client, db).catch(() => {});
  setTimeout(scan, 10 * 60_000);
  setInterval(scan, 6 * 3_600_000);
}

// ── Home server config ────────────────────────────────────────────────────────

async function ensureHomeServerConfig(client, db) {
  const guild = client.guilds.cache.get(HOME_SERVER_ID);
  if (!guild) return;
  if (db.getPelaConfig('pela_server_id') !== HOME_SERVER_ID) {
    db.setPelaConfig('pela_server_id', HOME_SERVER_ID);
    console.log('[pelaAI] Home server set:', guild.name);
  }
  const find = (pattern) => guild.channels.cache.find(c => c.type === 0 && pattern.test(c.name));
  if (!db.getPelaConfig('pela_updates_channel_id')) { const ch = find(/bot-update|update|announce/i); if (ch) db.setPelaConfig('pela_updates_channel_id', ch.id); }
  if (!db.getPelaConfig('pela_logs_channel_id')) { const ch = find(/log/i); if (ch) db.setPelaConfig('pela_logs_channel_id', ch.id); }
  if (!db.getPelaConfig('pela_tasks_channel_id')) { const ch = find(/task/i); if (ch) db.setPelaConfig('pela_tasks_channel_id', ch.id); }
  const cfg = db.getGuildConfig(HOME_SERVER_ID);
  if (!cfg.staff_role_id) { const r = guild.roles.cache.find(r => r.name === 'Staff'); if (r) db.updateGuildConfig(HOME_SERVER_ID, { staff_role_id: r.id }); }
  const selfRoles = JSON.parse(cfg.self_assignable_roles || '[]');
  if (!selfRoles.length) {
    const ids = ['Member','VIP'].map(n => guild.roles.cache.find(r => r.name === n)?.id).filter(Boolean);
    if (ids.length) db.updateGuildConfig(HOME_SERVER_ID, { self_assignable_roles: JSON.stringify(ids) });
  }
}

module.exports = { handleDmMessage, handleGuildMessage, detectPermLevel, startAutonomousPosts, postCommunityMessage, sendTicketSummary, ensureHomeServerConfig, generateTicketGreeting, handleTicketMessage, startServerScan };
