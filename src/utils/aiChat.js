const {
  ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const axios = require('axios');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const CONV_TTL   = 30 * 60 * 1000; // 30 min inactivity

// ── Conversation store (in-memory) ────────────────────────────────────────────
// key: "guild:guildId:userId"  or  "dm:userId"
// value: { messages: [{role,content}], guildId: string|null, expiresAt: number }

const conversations = new Map();

function getConv(key) {
  const c = conversations.get(key);
  if (!c || Date.now() > c.expiresAt) {
    const fresh = { messages: [], guildId: null, expiresAt: Date.now() + CONV_TTL };
    conversations.set(key, fresh);
    return fresh;
  }
  c.expiresAt = Date.now() + CONV_TTL;
  return c;
}

function pushMsg(key, role, content) {
  const c = getConv(key);
  c.messages.push({ role, content });
  if (c.messages.length > 24) c.messages.splice(0, c.messages.length - 24);
}

function clearConv(guildId, userId) {
  conversations.delete(`guild:${guildId}:${userId}`);
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(guild) {
  const cats = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position)
    .slice(0, 40)
    .map(c => `  • "${c.name}"`)
    .join('\n') || '  (none)';

  const chs = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position)
    .slice(0, 80)
    .map(c => `  • #${c.name} [${c.type === ChannelType.GuildText ? 'text' : 'voice'}]${c.parent ? ` → ${c.parent.name}` : ''}`)
    .join('\n') || '  (none)';

  const roles = [...guild.roles.cache.values()]
    .filter(r => !r.managed && r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .slice(0, 40)
    .map(r => `  • @${r.name}`)
    .join('\n') || '  (none)';

  return `You are a smart Discord server manager AI for "${guild.name}". You help admins manage their server through natural conversation.

CURRENT SERVER STATE
Categories:
${cats}

Channels:
${chs}

Roles:
${roles}

RESPONSE FORMAT — return ONLY a raw JSON object, no markdown, no extra text:
{"reply":"…","actions":[]}

ACTIONS REFERENCE:
{"type":"create_category","name":"🎮 Gaming"}
{"type":"create_text_channel","name":"📢-announcements","category":"Category Name or null","topic":"optional"}
{"type":"create_voice_channel","name":"🔊 General VC","category":"Category Name or null"}
{"type":"delete_channel","name":"channel-name"}
{"type":"delete_category","name":"Category Name"}
{"type":"create_role","name":"🎮 Gamer","color":"#FF5733","hoist":true,"mentionable":true}
{"type":"delete_role","name":"Role Name"}
{"type":"setup_ticket","channel":"channel-name","support_roles":["Role1"],"title":"🎫 Support","message":"Click to open a ticket","questions":["What is your username?"]}

RULES
1. Reply in the SAME LANGUAGE as the admin (Hebrew → Hebrew, English → English).
2. Channel/category names MUST include a thematic emoji (e.g. "🎮 Gaming", "#💬-general").
3. NEVER perform delete actions unless the admin explicitly uses a word like "delete", "remove", or "מחק".
4. When you need clarification (which channel? which roles?) ASK and list the existing options from the server state above.
5. You may return multiple actions in one response.
6. After executing actions summarise what was done in a friendly sentence.
7. For ticket setup: if the admin asks, collect channel + support roles + optional custom questions before acting.
8. Return ONLY valid JSON — nothing outside the JSON object.`;
}

// ── Groq ──────────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt, history, userMessage) {
  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       GROQ_MODEL,
      temperature: 0.4,
      max_tokens:  1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
    },
    {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 25_000,
    },
  );
  return resp.data.choices[0].message.content;
}

function parseResponse(raw) {
  try {
    let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a !== -1 && b !== -1) {
      const parsed = JSON.parse(s.slice(a, b + 1));
      return { reply: String(parsed.reply || '✅'), actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
    }
  } catch {}
  return { reply: raw.trim() || '✅', actions: [] };
}

// ── Action executor ───────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findChannel(guild, name) {
  const n = name.toLowerCase().replace(/^#/, '');
  return guild.channels.cache.find(c =>
    c.name.toLowerCase() === n ||
    c.name.toLowerCase().replace(/[^\w]/g, '') === n.replace(/[^\w]/g, '')
  ) ?? null;
}

function findCategory(guild, name) {
  if (!name) return null;
  const n = name.toLowerCase();
  return guild.channels.cache.find(c =>
    c.type === ChannelType.GuildCategory &&
    (c.name.toLowerCase() === n || c.name.toLowerCase().replace(/[^\w\s]/g, '').trim() === n.replace(/[^\w\s]/g, '').trim())
  ) ?? null;
}

function findRole(guild, name) {
  const n = name.toLowerCase().replace(/^@/, '');
  return guild.roles.cache.find(r =>
    r.name.toLowerCase() === n ||
    r.name.toLowerCase().replace(/[^\w]/g, '') === n.replace(/[^\w]/g, '')
  ) ?? null;
}

function safeHex(c) {
  if (!c) return 0;
  const h = String(c).replace('#', '');
  return /^[0-9A-Fa-f]{6}$/.test(h) ? parseInt(h, 16) : 0;
}

async function executeActions(guild, actions, db) {
  const done = [], fails = [];

  for (const act of actions) {
    try {
      switch (act.type) {

        case 'create_category':
          await guild.channels.create({ name: act.name.slice(0, 100), type: ChannelType.GuildCategory, reason: 'AI chat' });
          done.push(`Created category **${act.name}**`);
          break;

        case 'create_text_channel': {
          const parent = findCategory(guild, act.category);
          await guild.channels.create({ name: act.name.slice(0, 100), type: ChannelType.GuildText, parent: parent?.id, topic: act.topic?.slice(0, 1024), reason: 'AI chat' });
          done.push(`Created #**${act.name}**${parent ? ` in ${parent.name}` : ''}`);
          break;
        }

        case 'create_voice_channel': {
          const parent = findCategory(guild, act.category);
          await guild.channels.create({ name: act.name.slice(0, 100), type: ChannelType.GuildVoice, parent: parent?.id, reason: 'AI chat' });
          done.push(`Created voice **${act.name}**${parent ? ` in ${parent.name}` : ''}`);
          break;
        }

        case 'delete_channel': {
          const ch = findChannel(guild, act.name);
          if (!ch) { fails.push(`Channel not found: ${act.name}`); break; }
          await ch.delete('AI chat — admin requested');
          done.push(`Deleted channel **${act.name}**`);
          break;
        }

        case 'delete_category': {
          const cat = findCategory(guild, act.name);
          if (!cat) { fails.push(`Category not found: ${act.name}`); break; }
          await cat.delete('AI chat — admin requested');
          done.push(`Deleted category **${act.name}**`);
          break;
        }

        case 'create_role':
          await guild.roles.create({ name: act.name.slice(0, 100), color: safeHex(act.color), hoist: act.hoist ?? false, mentionable: act.mentionable ?? false, reason: 'AI chat' });
          done.push(`Created role **${act.name}**`);
          break;

        case 'delete_role': {
          const role = findRole(guild, act.name);
          if (!role) { fails.push(`Role not found: ${act.name}`); break; }
          await role.delete('AI chat — admin requested');
          done.push(`Deleted role **${act.name}**`);
          break;
        }

        case 'setup_ticket': {
          const ch = findChannel(guild, act.channel);
          if (!ch) { fails.push(`Channel not found: ${act.channel}`); break; }

          const roleIds = (act.support_roles || []).map(n => findRole(guild, n)?.id).filter(Boolean);
          db.updateGuildConfig(guild.id, {
            support_role_id:   roleIds[0] ?? null,
            support_role_id_2: roleIds[1] ?? null,
            support_role_id_3: roleIds[2] ?? null,
            support_role_id_4: roleIds[3] ?? null,
            support_role_id_5: roleIds[4] ?? null,
            ticket_message:    act.message || 'Click below to open a support ticket.',
          });

          if (act.questions?.length) db.setTicketQuestions(guild.id, act.questions.slice(0, 5));

          const embed = new EmbedBuilder()
            .setTitle(act.title || '🎫 Support Tickets')
            .setDescription(act.message || 'Click below to open a support ticket.')
            .setColor(0x5865F2);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
          );
          await ch.send({ embeds: [embed], components: [row] });
          done.push(`Ticket panel set up in **#${ch.name}**`);
          break;
        }

        default:
          fails.push(`Unknown action: ${act.type}`);
      }
    } catch (e) {
      fails.push(`${act.type} "${act.name ?? ''}" failed: ${e.message}`);
    }
    await sleep(500);
  }
  return { done, fails };
}

// ── Reply helper (handles Discord 2000-char limit) ────────────────────────────

async function sendReply(message, text) {
  if (text.length <= 1990) return message.reply({ content: text });
  // Split on newlines, keeping chunks ≤ 1990
  const lines = text.split('\n');
  let chunk = '';
  let first = true;
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 1990) {
      if (first) { await message.reply({ content: chunk }); first = false; }
      else        { await message.channel.send({ content: chunk }); }
      chunk = line;
    } else {
      chunk = chunk ? chunk + '\n' + line : line;
    }
  }
  if (chunk) {
    if (first) await message.reply({ content: chunk });
    else        await message.channel.send({ content: chunk });
  }
}

// ── Guild message handler ─────────────────────────────────────────────────────

async function handleGuildMessage(message, db) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

  const userText = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!userText) {
    return message.reply({ content: '👋 Hi! Tell me what you want to do with this server and I\'ll handle it.' });
  }

  const convKey = `guild:${message.guild.id}:${message.author.id}`;
  const conv    = getConv(convKey);

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    const raw = await callGroq(buildSystemPrompt(message.guild), conv.messages, userText);
    const { reply, actions } = parseResponse(raw);

    pushMsg(convKey, 'user',      userText);
    pushMsg(convKey, 'assistant', raw);

    let extra = '';
    if (actions.length) {
      const { done, fails } = await executeActions(message.guild, actions, db);
      if (done.length)  extra += '\n\n✅ ' + done.join('\n✅ ');
      if (fails.length) extra += '\n\n⚠️ ' + fails.join('\n⚠️ ');
    }

    await sendReply(message, reply + extra);
  } catch (e) {
    const detail = e.response?.data?.error?.message ?? e.message;
    console.error('[aiChat] guild error:', detail);
    await message.reply({ content: `❌ AI error: \`${detail}\`` });
  } finally {
    clearInterval(typingPulse);
  }
}

// ── DM handler ────────────────────────────────────────────────────────────────

async function handleDmMessage(message, client, db) {
  if (!process.env.GROQ_API_KEY) {
    return message.reply({ content: '❌ `GROQ_API_KEY` is not configured.' });
  }

  const userId  = message.author.id;
  const convKey = `dm:${userId}`;
  const conv    = getConv(convKey);

  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    // Phase 1: pick a server if none selected yet
    if (!conv.guildId) {
      const sharedGuilds = [...client.guilds.cache.values()];
      if (sharedGuilds.length === 0) {
        await message.reply({ content: 'I\'m not in any server we share.' });
        return;
      }

      // Try to match a number or name from the message
      const input = message.content.trim();
      const num   = parseInt(input, 10);

      if (!isNaN(num) && num >= 1 && num <= sharedGuilds.length) {
        conv.guildId = sharedGuilds[num - 1].id;
      } else if (input) {
        const match = sharedGuilds.find(g => g.name.toLowerCase().includes(input.toLowerCase()));
        if (match) conv.guildId = match.id;
      }

      if (!conv.guildId) {
        const list = sharedGuilds.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n');
        await message.reply({ content: `Which server do you want to manage? Reply with a number:\n\n${list}` });
        return;
      }

      const g = client.guilds.cache.get(conv.guildId);
      await message.reply({ content: `✅ Managing **${g.name}**. What would you like to do?` });
      return;
    }

    // Phase 2: handle as normal AI chat
    const guild = client.guilds.cache.get(conv.guildId);
    if (!guild) {
      conv.guildId = null;
      await message.reply({ content: 'That server is no longer available. Please start over.' });
      return;
    }

    const userText = message.content.trim();
    if (!userText) return;

    const raw = await callGroq(buildSystemPrompt(guild), conv.messages, userText);
    const { reply, actions } = parseResponse(raw);

    pushMsg(convKey, 'user',      userText);
    pushMsg(convKey, 'assistant', raw);

    let extra = '';
    if (actions.length) {
      const { done, fails } = await executeActions(guild, actions, db);
      if (done.length)  extra += '\n\n✅ ' + done.join('\n✅ ');
      if (fails.length) extra += '\n\n⚠️ ' + fails.join('\n⚠️ ');
    }

    await sendReply(message, reply + extra);
  } catch (e) {
    const detail = e.response?.data?.error?.message ?? e.message;
    console.error('[aiChat] DM error:', detail);
    await message.reply({ content: `❌ AI error: \`${detail}\`` });
  } finally {
    clearInterval(typingPulse);
  }
}

module.exports = { handleGuildMessage, handleDmMessage, clearConv };