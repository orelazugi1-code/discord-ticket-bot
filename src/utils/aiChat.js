const {
  ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const axios = require('axios');

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const CONV_TTL   = 30 * 60 * 1000;

// ── Conversation store ────────────────────────────────────────────────────────

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
    .sort((a, b) => a.position - b.position).slice(0, 40)
    .map(c => `  • "${c.name}"`)
    .join('\n') || '  (none)';

  const chs = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position).slice(0, 80)
    .map(c => `  • "${c.name}" [${c.type === ChannelType.GuildText ? 'text' : 'voice'}]${c.parent ? ` → ${c.parent.name}` : ''}`)
    .join('\n') || '  (none)';

  const roles = [...guild.roles.cache.values()]
    .filter(r => !r.managed && r.name !== '@everyone')
    .sort((a, b) => b.position - a.position).slice(0, 40)
    .map(r => `  • "${r.name}"`)
    .join('\n') || '  (none)';

  return `You are a smart Discord server manager AI for "${guild.name}". Help admins manage their server through natural conversation.

SERVER STATE
Categories:
${cats}

Channels:
${chs}

Roles:
${roles}

RESPONSE FORMAT — return ONLY a JSON object, no text outside it:
{"reply":"…","actions":[]}

ACTIONS:
{"type":"create_category","name":"🎮 Gaming"}
{"type":"create_text_channel","name":"📢-announcements","category":"exact category name or null","topic":"optional"}
{"type":"create_voice_channel","name":"🔊 General VC","category":"exact category name or null"}
{"type":"delete_channel","name":"exact channel name from the list above"}
{"type":"delete_category","name":"exact category name from the list above"}
{"type":"create_role","name":"🎮 Gamer","color":"#FF5733","hoist":true,"mentionable":true}
{"type":"delete_role","name":"exact role name"}
{"type":"setup_ticket","channel":"exact channel name","support_roles":["exact role name"],"title":"🎫 Support","message":"Click to open","questions":["Q1"]}

RULES
1. Reply in the SAME LANGUAGE as the admin (Hebrew → Hebrew, English → English).
2. Channel/category names MUST include a thematic emoji (e.g. "🎮 Gaming", "#💬-general").
3. When specifying channel, category, or role names in actions use the EXACT name shown in the server state above.
4. NEVER perform delete actions unless the admin clearly uses a word like "delete", "remove", or "מחק".
5. When you need clarification, ASK and list existing options from the server state.
6. You may return multiple actions in one response.
7. For ticket setup: collect channel + support roles + optional questions before acting.
8. Return ONLY valid JSON — nothing outside the JSON object.`;
}

// ── Groq ──────────────────────────────────────────────────────────────────────

async function callGroq(systemPrompt, history, userMessage) {
  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:           GROQ_MODEL,
      temperature:     0.4,
      max_tokens:      1024,
      response_format: { type: 'json_object' }, // guarantees valid JSON — fixes raw JSON showing in chat
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

// With response_format:json_object the model always returns valid JSON,
// so JSON.parse will succeed. The fallback handles edge cases.
function parseResponse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      reply:   String(parsed.reply   || '✅'),
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    };
  } catch {
    // Fallback: strip fences and find outermost {}
    try {
      const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a !== -1 && b > a) {
        const parsed = JSON.parse(s.slice(a, b + 1));
        return {
          reply:   String(parsed.reply   || '✅'),
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
      }
    } catch {}
    // Last resort: strip any JSON-like block so the user sees the text, not raw JSON
    return { reply: raw.replace(/\{[\s\S]*\}/g, '').trim() || '✅', actions: [] };
  }
}

// ── Finder helpers (3-tier: exact → strip-non-alpha → includes) ───────────────

function stripNonAlpha(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function findChannel(guild, name) {
  if (!name) return null;
  const n  = name.toLowerCase().replace(/^#/, '').trim();
  const ns = stripNonAlpha(n);
  return (
    guild.channels.cache.find(c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === n) ??
    guild.channels.cache.find(c => c.type !== ChannelType.GuildCategory && stripNonAlpha(c.name) === ns) ??
    guild.channels.cache.find(c => c.type !== ChannelType.GuildCategory && (
      stripNonAlpha(c.name).includes(ns) || ns.includes(stripNonAlpha(c.name))
    )) ??
    null
  );
}

function findCategory(guild, name) {
  if (!name) return null;
  const n  = name.toLowerCase();
  const ns = stripNonAlpha(n);
  return (
    guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === n) ??
    guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && stripNonAlpha(c.name) === ns) ??
    guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (
      stripNonAlpha(c.name).includes(ns) || ns.includes(stripNonAlpha(c.name))
    )) ??
    null
  );
}

function findRole(guild, name) {
  if (!name) return null;
  const n  = name.toLowerCase().replace(/^@/, '').trim();
  const ns = stripNonAlpha(n);
  return (
    guild.roles.cache.find(r => r.name.toLowerCase() === n) ??
    guild.roles.cache.find(r => stripNonAlpha(r.name) === ns) ??
    null
  );
}

function safeHex(c) {
  if (!c) return 0;
  const h = String(c).replace('#', '');
  return /^[0-9A-Fa-f]{6}$/.test(h) ? parseInt(h, 16) : 0;
}

// ── Action executor ───────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
          if (!ch) { fails.push(`Channel not found: "${act.name}"`); break; }
          const chName = ch.name;
          await ch.delete('AI chat — admin requested');
          done.push(`Deleted channel **${chName}**`);
          break;
        }

        case 'delete_category': {
          const cat = findCategory(guild, act.name);
          if (!cat) { fails.push(`Category not found: "${act.name}"`); break; }
          const catName = cat.name;
          await cat.delete('AI chat — admin requested');
          done.push(`Deleted category **${catName}**`);
          break;
        }

        case 'create_role':
          await guild.roles.create({ name: act.name.slice(0, 100), color: safeHex(act.color), hoist: act.hoist ?? false, mentionable: act.mentionable ?? false, reason: 'AI chat' });
          done.push(`Created role **${act.name}**`);
          break;

        case 'delete_role': {
          const role = findRole(guild, act.name);
          if (!role) { fails.push(`Role not found: "${act.name}"`); break; }
          const roleName = role.name;
          await role.delete('AI chat — admin requested');
          done.push(`Deleted role **${roleName}**`);
          break;
        }

        case 'setup_ticket': {
          const ch = findChannel(guild, act.channel);
          if (!ch) { fails.push(`Channel not found: "${act.channel}"`); break; }
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
      fails.push(`${act.type} "${act.name ?? act.channel ?? ''}" failed: ${e.message}`);
    }
    await sleep(500);
  }
  return { done, fails };
}

// ── Reply helper ──────────────────────────────────────────────────────────────

async function sendReply(message, text) {
  if (text.length <= 1990) return message.reply({ content: text });
  const lines = text.split('\n');
  let chunk = '', first = true;
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 1990) {
      if (first) { await message.reply({ content: chunk }); first = false; }
      else          await message.channel.send({ content: chunk });
      chunk = line;
    } else {
      chunk = chunk ? chunk + '\n' + line : line;
    }
  }
  if (chunk) {
    if (first) await message.reply({ content: chunk });
    else          await message.channel.send({ content: chunk });
  }
}

// ── Shared AI round-trip ──────────────────────────────────────────────────────

async function runAiRound(convKey, guild, userText, db) {
  const conv = getConv(convKey);
  const raw  = await callGroq(buildSystemPrompt(guild), conv.messages, userText);
  const { reply, actions } = parseResponse(raw);

  // Store clean text in history — keeps context concise and natural for the model
  const actionSummary = [];
  let extra = '';
  if (actions.length) {
    const { done, fails } = await executeActions(guild, actions, db);
    if (done.length)  { extra += '\n\n✅ ' + done.join('\n✅ '); actionSummary.push(...done); }
    if (fails.length) { extra += '\n\n⚠️ ' + fails.join('\n⚠️ '); }
  }

  // Push clean text (not raw JSON) so history stays readable for future turns
  pushMsg(convKey, 'user',      userText);
  pushMsg(convKey, 'assistant', reply + (actionSummary.length ? ' [Done: ' + actionSummary.join(', ') + ']' : ''));

  return reply + extra;
}

// ── Guild message handler ─────────────────────────────────────────────────────

async function handleGuildMessage(message, db) {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

  if (!process.env.GROQ_API_KEY) {
    return message.reply({ content: '❌ `GROQ_API_KEY` is not configured.' });
  }

  const userText = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!userText) {
    return message.reply({ content: '👋 Hi! Tell me what you want to do with this server.' });
  }

  const convKey    = `guild:${message.guild.id}:${message.author.id}`;
  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    const fullReply = await runAiRound(convKey, message.guild, userText, db);
    await sendReply(message, fullReply);
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

  const userId   = message.author.id;
  const convKey  = `dm:${userId}`;
  const conv     = getConv(convKey);
  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    if (!conv.guildId) {
      const sharedGuilds = [...client.guilds.cache.values()];
      if (sharedGuilds.length === 0) { await message.reply({ content: "I'm not in any server we share." }); return; }

      const input = message.content.trim();
      const num   = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= sharedGuilds.length) {
        conv.guildId = sharedGuilds[num - 1].id;
      } else {
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

    const guild = client.guilds.cache.get(conv.guildId);
    if (!guild) {
      conv.guildId = null;
      await message.reply({ content: 'That server is no longer available. Please start over.' });
      return;
    }

    const userText = message.content.trim();
    if (!userText) return;

    const fullReply = await runAiRound(convKey, guild, userText, db);
    await sendReply(message, fullReply);
  } catch (e) {
    const detail = e.response?.data?.error?.message ?? e.message;
    console.error('[aiChat] DM error:', detail);
    await message.reply({ content: `❌ AI error: \`${detail}\`` });
  } finally {
    clearInterval(typingPulse);
  }
}

module.exports = { handleGuildMessage, handleDmMessage, clearConv };