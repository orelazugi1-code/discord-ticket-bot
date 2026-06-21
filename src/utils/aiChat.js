const {
  ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const axios = require('axios');

// ── AI providers (tried in order; skips rate-limited ones) ──────────────────────

const PROVIDERS = [
  { name: 'Groq',       envKey: 'GROQ_API_KEY',       type: 'openai',  jsonMode: true,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile' },
  { name: 'Gemini',     envKey: 'GEMINI_API_KEY',      type: 'gemini',  jsonMode: true,
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.0-flash' },
  { name: 'Mistral',    envKey: 'MISTRAL_API_KEY',     type: 'openai',  jsonMode: false,
    url: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest' },
  { name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY',  type: 'openai',  jsonMode: false,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free' },
];

function isConfigured(provider) {
  const v = process.env[provider.envKey];
  return v && !v.startsWith('your_');
}
const OWNER_ID   = '1266854019767341107';
const CONV_TTL   = 30 * 60 * 1000;
const DESTRUCTIVE_TYPES = ['delete_channel', 'delete_category', 'delete_role'];

// ── Pending action plans (waiting for button confirmation) ────────────────────
const pendingPlans = new Map();

function storePlan(guildId, userId, actions) {
  const key = `${guildId}:${userId}`;
  pendingPlans.set(key, { actions, createdAt: Date.now() });
  setTimeout(() => pendingPlans.delete(key), 5 * 60_000);
  return key;
}

function popPlan(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const plan = pendingPlans.get(key);
  pendingPlans.delete(key);
  return plan?.actions || null;
}

// ── Conversation store ────────────────────────────────────────────────────────

const conversations = new Map();

function getConv(key) {
  const c = conversations.get(key);
  if (!c || Date.now() > c.expiresAt) {
    const fresh = { messages: [], guildId: null, lang: 'en', expiresAt: Date.now() + CONV_TTL };
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

function detectLang(text) {
  return /[\u0590-\u05FF]/.test(text) ? 'he' : 'en';
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(guild, isOwner, lang = 'en') {
  const allChannels = [...guild.channels.cache.values()];
  const catList = allChannels.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position).slice(0, 40);
  const childCount = {};
  for (const c of allChannels) { if (c.parentId) childCount[c.parentId] = (childCount[c.parentId] || 0) + 1; }
  const cats = catList.map(c => `  • "${c.name}" — ${childCount[c.id] || 0} channels${childCount[c.id] ? '' : ' ⚠️ EMPTY'}`).join('\n') || '  (none)';

  const chs = allChannels
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position).slice(0, 80)
    .map(c => `  • "${c.name}" [${c.type === ChannelType.GuildText ? 'text' : 'voice'}]${c.parent ? ` → ${c.parent.name}` : ' ⚠️ NO CATEGORY'}`)
    .join('\n') || '  (none)';

  const roles = [...guild.roles.cache.values()]
    .filter(r => !r.managed && r.name !== '@everyone')
    .sort((a, b) => b.position - a.position).slice(0, 40)
    .map(r => `  • "${r.name}"`).join('\n') || '  (none)';

  const ownerSection = isOwner ? `

━━━━ OWNER-ONLY ACTIONS ━━━━
  {"type":"clone_server"}
  {"type":"list_guilds"}
  {"type":"create_embed","channel":"name","title":"…","description":"…","color":"#HEX","fields":[{"name":"…","value":"…","inline":false}],"footer":"…"}

9. You are talking to the BOT OWNER — full access, execute any request immediately.` : '';

  return `${lang === 'he' ? '🇮🇱 שפה: עברית. השב תמיד בעברית. כל תוויות הכפתורים בעברית.' : '🌐 Language: English.'}

You are a smart, action-taking Discord server manager AI for "${guild.name}".

━━━━ CRITICAL: HOW ACTIONS WORK ━━━━
The ONLY way things get done is through the "actions" array in your JSON.
If "actions" is empty → NOTHING WILL HAPPEN, regardless of what "reply" says.
NEVER say "Done", "Created X", "Setting up Y" unless X/Y is in your actions array.
If you cannot do something → say so clearly and leave actions empty.
If the request is unclear → ask ONE specific question, do NOT guess.

━━━━ CRITICAL: DESTRUCTIVE ACTIONS ━━━━
Delete actions (delete_channel, delete_category, delete_role) will automatically show a confirmation button to the user.
You can include them in "actions" — the system handles confirmation.
BUT: ORGANIZING ≠ DELETING. When asked to "organize" or "clean up":
1. MOVE channels to correct categories (use move_channel) — this runs immediately.
2. RENAME channels if needed (use rename_channel) — this runs immediately.
3. Only DELETE true duplicates or empty items — these wait for button confirmation.
4. Create missing categories and move orphan channels into them.
5. NEVER say "I'm checking" and then put actions. Either analyze (no actions) or act (with actions). Not both.
6. Actually look at the server state above — use EXACT names, don't invent channels/categories that don't exist.

━━━━ WRITE TO CHANNEL vs CREATE CHANNEL ━━━━
Use send_message → user wants to POST content to an EXISTING channel (rules, announcements, info text).
Use create_text_channel → user explicitly wants a NEW channel created.
CHECK the channel list below before acting. If the channel already exists, use send_message.

━━━━ EXAMPLES OF CORRECT RESPONSES ━━━━
User: "create a gaming section with 3 channels"
{"reply":"יוצר את סקשן הגיימינג!","actions":[
  {"type":"create_category","name":"🎮 Gaming"},
  {"type":"create_text_channel","name":"🎮-general","category":"🎮 Gaming"},
  {"type":"create_text_channel","name":"🏆-competitive","category":"🎮 Gaming"},
  {"type":"create_voice_channel","name":"🔊 Gaming VC","category":"🎮 Gaming"}
]}

User: "תסדר את השרת יש בלאגן" (organize the server)
{"reply":"מסדר את השרת!","actions":[
  {"type":"create_category","name":"📋 Info"},
  {"type":"move_channel","name":"rules","category":"📋 Info"},
  {"type":"move_channel","name":"chat","category":"💬 General"},
  {"type":"delete_channel","name":"📞-introductions"},
  {"type":"delete_channel","name":"📝-suggestions"},
  {"type":"delete_channel","name":"📄-suggestions"}
]}
(move/create run immediately, deletes show a confirmation button automatically)

User: "write server rules in #rules" (rules channel already exists)
{"reply":"שולח חוקים ל-#rules!","actions":[
  {"type":"send_message","channel":"rules","embed":{"title":"📋 Server Rules","description":"1. Be respectful\\n2. No spam\\n3. Follow Discord ToS","color":"#5865F2"}}
]}

User: "set up tickets with 2 categories: bug reports and general support"
{"reply":"מגדיר מערכת טיקטים!","actions":[
  {"type":"setup_ticket","channel":"tickets","support_roles":[],"title":"🎫 Support","message":"Click to open a ticket"},
  {"type":"add_ticket_category","name":"🐛 Bug Report","questions":["Describe the bug","Steps to reproduce"]},
  {"type":"add_ticket_category","name":"❓ General Support","questions":["How can we help?"]}
]}

━━━━ SERVER STATE ━━━━
Categories:
${cats}

Channels:
${chs}

Roles:
${roles}

━━━━ AVAILABLE ACTIONS ━━━━
Channels/Categories:
  {"type":"create_category","name":"🎮 Gaming"}
  {"type":"create_text_channel","name":"💬-general","category":"category name or null","topic":"optional"}
  {"type":"create_voice_channel","name":"🔊 VC","category":"category name or null"}
  {"type":"move_channel","name":"exact channel name","category":"exact category name"}
  {"type":"rename_channel","name":"exact current name","new_name":"new-name"}
  {"type":"delete_channel","name":"exact name from list"}
  {"type":"delete_category","name":"exact name from list"}

Send to existing channel (use this instead of creating a new one):
  {"type":"send_message","channel":"exact-channel-name","content":"optional plain text","embed":{"title":"…","description":"…","color":"#HEX","fields":[{"name":"…","value":"…","inline":false}],"footer":"…","thumbnail":"url","image":"url"}}

Roles:
  {"type":"create_role","name":"🎮 Gamer","color":"#FF5733","hoist":true,"mentionable":false}
  {"type":"delete_role","name":"exact name from list"}

Tickets (multi-category: use setup_ticket once, then add_ticket_category for each type):
  {"type":"setup_ticket","channel":"name","support_roles":["Role1"],"title":"🎫 Support","message":"Click to open","questions":["optional global Q"]}
  {"type":"add_ticket_category","name":"🐛 Bug Report","questions":["Q1","Q2"]}
  {"type":"clear_ticket_questions"} — removes ALL questions from tickets (no questions asked when opening)
  {"type":"set_ticket_questions","questions":["Q1","Q2"]} — replace ticket questions

Forms:
  {"type":"setup_form","channel":"name","log_channel":"log or null","title":"Title","description":"Desc","button_label":"Apply","questions":["Q1"],"mode":"modal"}

Role panels:
  {"type":"setup_button_panel","channel":"name","title":"🎭 Roles","description":"Pick a role","buttons":[{"label":"🎮 Gamer","role":"exact role name"}]}
${ownerSection}

━━━━ INTERACTIVE UI — use these instead of asking in text ━━━━
  {"type":"ask_channel","prompt":"Which channel for the panel?","purpose":"ticket_ch"}
  {"type":"ask_roles","prompt":"Which roles should have access?","purpose":"support_roles"}
  {"type":"ask_confirm","description":"Will create in #support-tickets","fields":[{"name":"Channel","value":"#support-tickets","inline":true}]}
  {"type":"start_form_wizard","title":"Application Form"}
  {"type":"start_ticket_wizard","title":"🎫 Support Tickets","message":"Click to open"}

━━━━ RULES ━━━━
1. Respond in the SAME LANGUAGE as the admin (Hebrew → Hebrew, English → English).
2. When the user asks a QUESTION or says "explain"/"why"/"תסביר"/"למה" → ANSWER IN TEXT in "reply". Do NOT take actions. Just explain clearly in 2-5 sentences.
3. When the user asks to DO something → keep "reply" short, put work in "actions".
4. Channel/category names include a thematic emoji unless they already exist in the list.
5. Use EXACT names from the server state for existing channels/roles/categories.
6. Delete actions automatically require button confirmation — include them when appropriate.
7. Return ONLY valid JSON — nothing outside the JSON object.
8. Prefer start_ticket_wizard over setup_ticket — it guides the admin step by step with Discord UI.
9. Prefer start_form_wizard over setup_form — same reason.
10. NEVER say "I'm checking" or "I'll analyze" and then put actions. Check = reply only, act = next message.
11. When organizing: MOVE first, DELETE only duplicates, CREATE categories for orphans.
12. If the user says "don't do anything"/"אל תעשה כלום"/"stop" → empty actions, just acknowledge.
13. NEVER repeat the same failed action. Try a different approach or explain what went wrong.
14. If you already did something and the user complains it didn't work → EXPLAIN what happened and suggest a fix, don't just redo the same thing.`;
}

// ── Groq ──────────────────────────────────────────────────────────────────────

async function callOpenAiCompat(provider, key, systemPrompt, history, userMessage) {
  const body = {
    model:       provider.model,
    temperature: 0.4,
    max_tokens:  1024,
    messages:    [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }],
  };
  if (provider.jsonMode) body.response_format = { type: 'json_object' };

  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (provider.name === 'OpenRouter') {
    headers['HTTP-Referer'] = 'https://discord.com';
    headers['X-Title']      = 'Discord Server Manager Bot';
  }

  const resp = await axios.post(provider.url, body, { headers, timeout: 30_000 });
  return resp.data.choices[0].message.content;
}

async function callGemini(provider, key, systemPrompt, history, userMessage) {
  const url = `${provider.url}/${provider.model}:generateContent?key=${key}`;

  // Gemini needs strict alternating user/model turns — merge consecutive same-role msgs
  const contents = [];
  for (const m of [...history, { role: 'user', content: userMessage }]) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += '\n' + m.content; // merge
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }

  const resp = await axios.post(url, {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig:  { temperature: 0.4, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 });

  return resp.data.candidates[0].content.parts[0].text;
}

async function callAiWithFallback(systemPrompt, history, userMessage) {
  let lastError;

  for (const provider of PROVIDERS) {
    if (!isConfigured(provider)) continue;
    try {
      const text = provider.type === 'gemini'
        ? await callGemini(provider, process.env[provider.envKey], systemPrompt, history, userMessage)
        : await callOpenAiCompat(provider, process.env[provider.envKey], systemPrompt, history, userMessage);
      if (PROVIDERS.indexOf(provider) > 0) console.log(`[aiChat] Using fallback provider: ${provider.name}`);
      return text;
    } catch (e) {
      const status = e.response?.status;
      const msg    = (e.response?.data?.error?.message || e.response?.data?.error?.status || e.message || '').toLowerCase();
      const isRate = status === 429 || status === 503 || msg.includes('rate') || msg.includes('quota') || msg.includes('exhausted');
      if (isRate) {
        console.warn(`[aiChat] ${provider.name} rate-limited — trying next provider`);
        lastError = e; continue;
      }
      console.error(`[aiChat] ${provider.name} error (${status}): ${e.response?.data?.error?.message ?? e.message}`);
      lastError = e; continue;
    }
  }

  throw new Error(
    lastError
      ? `All AI providers unavailable. Last: ${lastError.response?.data?.error?.message ?? lastError.message}`
      : 'No AI provider configured. Set GROQ_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, or OPENROUTER_API_KEY.'
  );
}

function parseResponse(raw) {
  try {
    const p = JSON.parse(raw);
    return { reply: String(p.reply || '✅'), actions: Array.isArray(p.actions) ? p.actions : [] };
  } catch {
    try {
      const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a !== -1 && b > a) {
        const p = JSON.parse(s.slice(a, b + 1));
        return { reply: String(p.reply || '✅'), actions: Array.isArray(p.actions) ? p.actions : [] };
      }
    } catch {}
    return { reply: raw.replace(/\{[\s\S]*\}/g, '').trim() || '✅', actions: [] };
  }
}

// ── Finders ───────────────────────────────────────────────────────────────────

function norm(s) { return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }

function findChannel(guild, name) {
  if (!name) return null;
  const n = name.toLowerCase().replace(/^#/, '').trim(), nn = norm(n);
  return (
    guild.channels.cache.find(c => c.type !== ChannelType.GuildCategory && c.name.toLowerCase() === n) ??
    guild.channels.cache.find(c => c.type !== ChannelType.GuildCategory && norm(c.name) === nn) ??
    guild.channels.cache.find(c => c.type !== ChannelType.GuildCategory && (norm(c.name).includes(nn) || nn.includes(norm(c.name)))) ??
    null
  );
}

function findCategory(guild, name) {
  if (!name) return null;
  const n = name.toLowerCase(), nn = norm(n);
  return (
    guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === n) ??
    guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && norm(c.name) === nn) ??
    guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (norm(c.name).includes(nn) || nn.includes(norm(c.name)))) ??
    null
  );
}

function findRole(guild, name) {
  if (!name) return null;
  const n = name.toLowerCase().replace(/^@/, '').trim(), nn = norm(n);
  return (
    guild.roles.cache.find(r => r.name.toLowerCase() === n) ??
    guild.roles.cache.find(r => norm(r.name) === nn) ??
    null
  );
}

function safeHex(c) {
  if (!c) return 0;
  const h = String(c).replace('#', '');
  return /^[0-9A-Fa-f]{6}$/.test(h) ? parseInt(h, 16) : 0;
}

// ── Action executor (uses existing bot infrastructure) ────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function handleWizardAction(act, guild, channel, userId, done, fails) {
  if (!channel) { fails.push(act.type + ': no reply channel'); return false; }
  const conv = getConv(`guild:${guild.id}:${userId}`);
  const lang = conv.lang || 'en';
  const wiz  = require('./wizard');
  const existing = wiz.getW(guild.id, userId) || { data: {} };

  if (act.type === 'ask_channel') {
    wiz.setW(guild.id, userId, { ...existing, lang, pendingField: act.purpose || 'channel', pendingPrompt: act.prompt });
    await channel.send(wiz.chPickerMsg(guild, guild.id, userId, lang, act.prompt));
    return true;
  }
  if (act.type === 'ask_roles') {
    wiz.setW(guild.id, userId, { ...existing, lang, pendingField: act.purpose || 'roles', pendingPrompt: act.prompt });
    await channel.send(wiz.rolePickerMsg(guild.id, userId, lang, act.prompt));
    return true;
  }
  if (act.type === 'ask_confirm') {
    wiz.setW(guild.id, userId, { ...existing, lang, pendingField: 'confirm' });
    await channel.send(wiz.confirmMsg(guild.id, userId, lang, act.description, act.fields));
    return true;
  }
  if (act.type === 'start_form_wizard') {
    const fw = { type: 'form', step: 'questions', lang, data: { title: act.title || 'Application Form', button_label: act.button_label || 'Apply', description: act.description || '', questions: [] } };
    wiz.setW(guild.id, userId, fw);
    await channel.send(wiz.buildStepMessage(guild, guild.id, userId, fw));
    return true;
  }
  if (act.type === 'start_ticket_wizard') {
    const tw = { type: 'ticket', step: 'channel', lang, data: { title: act.title || '🎫 Support Tickets', message: act.message || 'Click to open a ticket.', categories: [], support_role_ids: [] } };
    wiz.setW(guild.id, userId, tw);
    await channel.send(wiz.buildStepMessage(guild, guild.id, userId, tw));
    return true;
  }
  return false;
}

async function executeActions(guild, actions, db, isOwner, channel, userId) {
  const done = [], fails = [];

  for (const act of actions) {
    // Wizard UI actions — send interactive component then stop processing
    if (['ask_channel','ask_roles','ask_confirm','start_form_wizard','start_ticket_wizard'].includes(act.type)) {
      const sent = await handleWizardAction(act, guild, channel, userId, done, fails);
      if (sent) break;
      continue;
    }

    // Block dangerous owner-only actions for non-owners
    if (['clone_server', 'list_guilds'].includes(act.type) && !isOwner) {
      fails.push(`"${act.type}" זמין רק לבעלים`);
      continue;
    }

    try {
      switch (act.type) {

        // ── Channels/Categories ──────────────────────────────────────────────
        case 'create_category':
          await guild.channels.create({ name: act.name.slice(0, 100), type: ChannelType.GuildCategory, reason: 'AI chat' });
          done.push(`Created category **${act.name}**`);
          break;

        case 'create_text_channel': {
          const par = findCategory(guild, act.category);
          await guild.channels.create({ name: act.name.slice(0, 100), type: ChannelType.GuildText, parent: par?.id, topic: act.topic?.slice(0, 1024), reason: 'AI chat' });
          done.push(`Created #**${act.name}**${par ? ` in ${par.name}` : ''}`);
          break;
        }

        case 'create_voice_channel': {
          const par = findCategory(guild, act.category);
          await guild.channels.create({ name: act.name.slice(0, 100), type: ChannelType.GuildVoice, parent: par?.id, reason: 'AI chat' });
          done.push(`Created voice **${act.name}**${par ? ` in ${par.name}` : ''}`);
          break;
        }

        case 'move_channel': {
          const ch = findChannel(guild, act.name);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.name}"`); break; }
          const targetCat = findCategory(guild, act.category);
          if (!targetCat) { fails.push(`לא מצאתי קטגוריה: "${act.category}"`); break; }
          await ch.setParent(targetCat.id, { reason: 'AI chat — organize' });
          done.push(`Moved **#${ch.name}** → **${targetCat.name}**`);
          break;
        }

        case 'rename_channel': {
          const ch = findChannel(guild, act.name);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.name}"`); break; }
          const oldName = ch.name;
          await ch.setName(act.new_name.slice(0, 100), { reason: 'AI chat — rename' });
          done.push(`Renamed **#${oldName}** → **#${act.new_name}**`);
          break;
        }

        case 'delete_channel': {
          const ch = findChannel(guild, act.name);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.name}"`); break; }
          const n = ch.name; await ch.delete('AI chat — admin requested');
          done.push(`Deleted channel **${n}**`);
          break;
        }

        case 'delete_category': {
          const cat = findCategory(guild, act.name);
          if (!cat) { fails.push(`לא מצאתי קטגוריה: "${act.name}"`); break; }
          const childrenInCat = [...guild.channels.cache.values()].filter(c => c.parentId === cat.id);
          if (childrenInCat.length > 0) {
            fails.push(`🚫 קטגוריה "${cat.name}" מכילה ${childrenInCat.length} ערוצים — לא מוחק קטגוריה שלא ריקה!`);
            break;
          }
          const n = cat.name; await cat.delete('AI chat — admin requested');
          done.push(`Deleted category **${n}**`);
          break;
        }

        // ── Roles ────────────────────────────────────────────────────────────
        case 'create_role':
          await guild.roles.create({ name: act.name.slice(0, 100), color: safeHex(act.color), hoist: act.hoist ?? false, mentionable: act.mentionable ?? false, reason: 'AI chat' });
          done.push(`Created role **${act.name}**`);
          break;

        case 'delete_role': {
          const role = findRole(guild, act.name);
          if (!role) { fails.push(`לא מצאתי תפקיד: "${act.name}"`); break; }
          const n = role.name; await role.delete('AI chat — admin requested');
          done.push(`Deleted role **${n}**`);
          break;
        }

        // ── Ticket system (uses bot's existing infrastructure) ───────────────
        case 'setup_ticket': {
          const ch = findChannel(guild, act.channel);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.channel}"`); break; }

          const roleIds = (act.support_roles || []).map(n => findRole(guild, n)?.id).filter(Boolean);
          db.updateGuildConfig(guild.id, {
            support_role_id:   roleIds[0] ?? null,
            support_role_id_2: roleIds[1] ?? null,
            support_role_id_3: roleIds[2] ?? null,
            support_role_id_4: roleIds[3] ?? null,
            support_role_id_5: roleIds[4] ?? null,
            ticket_message:    act.message ?? 'Click below to open a support ticket.',
            panel_channel_id:  ch.id,
          });

          if (act.questions?.length) db.setTicketQuestions(guild.id, act.questions.slice(0, 5));

          // Check for existing categories — use select menu if present
          const existingCats = db.getTicketCategories(guild.id);
          let panelRow;
          if (existingCats.length > 0) {
            const select = new StringSelectMenuBuilder()
              .setCustomId('ticket:category_select')
              .setPlaceholder('Select a ticket type...')
              .setMinValues(1).setMaxValues(1)
              .addOptions(existingCats.map(cat =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(cat.name.substring(0, 100))
                  .setValue(String(cat.id))
                  .setEmoji('🎫')
              ));
            panelRow = new ActionRowBuilder().addComponents(select);
          } else {
            panelRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
            );
          }

          const embed = new EmbedBuilder()
            .setTitle(act.title ?? '🎫 Support Tickets')
            .setDescription(act.message ?? 'Click below to open a support ticket.')
            .setColor(0x5865F2);

          const msg = await ch.send({ embeds: [embed], components: [panelRow] });
          db.updateGuildConfig(guild.id, { panel_message_id: msg.id });
          done.push(`Ticket panel created in **#${ch.name}**`);
          break;
        }

        // ── Form system (uses bot's existing form infrastructure) ────────────
        case 'setup_form': {
          const ch    = findChannel(guild, act.channel);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.channel}"`); break; }
          const logCh = act.log_channel ? findChannel(guild, act.log_channel) : null;

          const formId = db.createForm(guild.id, {
            title:           act.title       ?? 'Application Form',
            description:     act.description ?? '',
            channel_id:      ch.id,
            log_channel_id:  logCh?.id       ?? null,
            button_label:    act.button_label ?? 'Apply',
            mode:            act.mode         ?? 'modal',
          });

          (act.questions ?? []).slice(0, 5).forEach((q, i) => db.addFormQuestion(formId, String(q), i));

          const embed = new EmbedBuilder()
            .setTitle(act.title ?? 'Application Form')
            .setDescription(act.description ?? 'Click below to submit a form.')
            .setColor(0x7c5af7);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`form:open:${formId}`).setLabel(act.button_label ?? 'Apply').setStyle(ButtonStyle.Primary)
          );
          const msg = await ch.send({ embeds: [embed], components: [row] });
          db.setFormMessageId(formId, msg.id);
          done.push(`Form panel created in **#${ch.name}**`);
          break;
        }

        // ── Button role panel (uses bot's existing button-roles system) ──────
        case 'setup_button_panel': {
          const ch = findChannel(guild, act.channel);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.channel}"`); break; }

          const validBtns = (act.buttons ?? []).map(b => ({ btn: b, role: findRole(guild, b.role) })).filter(x => x.role);
          if (!validBtns.length) { fails.push('לא מצאתי תפקידים תקינים לפאנל'); break; }

          const roleIds = validBtns.map(x => x.role.id);
          const panelId = db.createButtonRole(guild.id, ch.id, act.title ?? 'Role Panel', act.description ?? '', roleIds);

          const embed = new EmbedBuilder()
            .setTitle(act.title ?? '🎭 Role Panel')
            .setDescription(act.description ?? 'Click a button to toggle your role.')
            .setColor(safeHex(act.color) || 0x7c5af7);

          const btns = validBtns.slice(0, 5).map(({ btn, role }) => {
            const b = new ButtonBuilder()
              .setCustomId(`role:toggle::${role.id}`)
              .setLabel((btn.label ?? role.name).slice(0, 80))
              .setStyle(ButtonStyle.Secondary);
            if (btn.emoji) { try { b.setEmoji(btn.emoji); } catch {} }
            return b;
          });

          const msg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(...btns)] });
          db.updateButtonRoleMsgId(panelId, msg.id);
          done.push(`Role panel created in **#${ch.name}** with ${btns.length} button(s)`);
          break;
        }

        // ── Rich embed (owner + admins) ───────────────────────────────────────
        case 'create_embed': {
          const ch = findChannel(guild, act.channel);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.channel}"`); break; }
          const embed = new EmbedBuilder().setColor(safeHex(act.color) || 0x5865F2);
          if (act.title)       embed.setTitle(String(act.title).slice(0, 256));
          if (act.description) embed.setDescription(String(act.description).slice(0, 4096));
          if (act.footer)      embed.setFooter({ text: String(act.footer).slice(0, 2048) });
          if (act.thumbnail)   embed.setThumbnail(act.thumbnail);
          if (act.image)       embed.setImage(act.image);
          if (act.fields?.length) {
            embed.addFields((act.fields).slice(0, 25).map(f => ({
              name:   String(f.name  ?? 'Field').slice(0, 256),
              value:  String(f.value ?? '—').slice(0, 1024),
              inline: f.inline ?? false,
            })));
          }
          await ch.send({ embeds: [embed] });
          done.push(`Embed sent to **#${ch.name}**`);
          break;
        }

        // ── Owner-only: clone server ─────────────────────────────────────────
        case 'clone_server': {
          if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            fails.push('חסרה הרשאת Manage Server ליצירת תבנית'); break;
          }
          const existing = await guild.fetchTemplates().catch(() => null);
          if (existing?.size > 0) for (const t of existing.values()) await t.delete().catch(() => {});
          const tmpl = await guild.createTemplate(guild.name, 'Created by AI chat');
          done.push(`Template created: https://discord.new/${tmpl.code}`);
          break;
        }

        // ── Owner-only: list all guilds ──────────────────────────────────────
        case 'list_guilds': {
          const guilds = [...guild.client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
          const list = guilds.map((g, i) => `${i + 1}. **${g.name}** — ${g.memberCount} members`).join('\n');
          done.push(`Bot is in **${guilds.length}** servers:\n${list}`);
          break;
        }

        case 'send_message': {
          const ch = findChannel(guild, act.channel);
          if (!ch) { fails.push(`לא מצאתי ערוץ: "${act.channel}"`); break; }
          const opts = {};
          if (act.content) opts.content = String(act.content).slice(0, 2000);
          if (act.embed) {
            const em = new EmbedBuilder().setColor(safeHex(act.embed.color) || 0x5865F2);
            if (act.embed.title)       em.setTitle(String(act.embed.title).slice(0, 256));
            if (act.embed.description) em.setDescription(String(act.embed.description).slice(0, 4096));
            if (act.embed.footer)      em.setFooter({ text: String(act.embed.footer).slice(0, 2048) });
            if (act.embed.thumbnail)   em.setThumbnail(act.embed.thumbnail);
            if (act.embed.image)       em.setImage(act.embed.image);
            if (act.embed.fields?.length) {
              em.addFields(act.embed.fields.slice(0, 25).map(f => ({
                name:   String(f.name  ?? 'Field').slice(0, 256),
                value:  String(f.value ?? '—').slice(0, 1024),
                inline: f.inline ?? false,
              })));
            }
            opts.embeds = [em];
          }
          if (!opts.content && !opts.embeds) { fails.push('send_message: צריך content או embed'); break; }
          await ch.send(opts);
          done.push(`Message sent to **#${ch.name}**`);
          break;
        }

        case 'add_ticket_category': {
          const existing = db.getTicketCategories(guild.id);
          const catId    = db.createTicketCategory(guild.id, String(act.name || 'Category'), existing.length);
          if (act.questions?.length) db.setCategoryQuestions(guild.id, catId, act.questions.slice(0, 5).map(String));
          // Update panel to select menu
          try {
            const cfg     = db.getGuildConfig(guild.id);
            const allCats = db.getTicketCategories(guild.id);
            const pCh     = cfg.panel_channel_id ? guild.channels.cache.get(cfg.panel_channel_id) : null;
            const pMsg    = pCh && cfg.panel_message_id ? await pCh.messages.fetch(cfg.panel_message_id).catch(() => null) : null;
            if (pMsg && allCats.length > 0) {
              const sel = new StringSelectMenuBuilder()
                .setCustomId('ticket:category_select').setPlaceholder('Select a ticket type...')
                .setMinValues(1).setMaxValues(1)
                .addOptions(allCats.map(c =>
                  new StringSelectMenuOptionBuilder().setLabel(c.name.substring(0, 100)).setValue(String(c.id)).setEmoji('🎫')
                ));
              await pMsg.edit({ embeds: pMsg.embeds, components: [new ActionRowBuilder().addComponents(sel)] });
            }
          } catch (err) { console.error('[add_ticket_category]', err.message); }
          done.push(`Added ticket category **${act.name}**`);
          break;
        }

        case 'clear_ticket_questions': {
          db.setTicketQuestions(guild.id, []);
          const allCats = db.getTicketCategories(guild.id);
          for (const cat of allCats) db.setCategoryQuestions(guild.id, cat.id, []);
          done.push('הסרתי את כל השאלות ממערכת הטיקטים');
          break;
        }

        case 'set_ticket_questions': {
          const qs = (act.questions || []).slice(0, 5).map(String);
          db.setTicketQuestions(guild.id, qs);
          done.push(`עדכנתי שאלות טיקט: ${qs.length} שאלות`);
          break;
        }

                default:
          fails.push(`פעולה לא מוכרת: ${act.type}`);
      }
    } catch (e) {
      fails.push(`${act.type} failed: ${e.message}`);
    }
    await sleep(500);
  }
  return { done, fails };
}

// ── Reply helper ──────────────────────────────────────────────────────────────

async function sendReplyWithComponents(message, text, components) {
  if (!text || !text.trim()) text = '👋';
  if (text.length <= 1990) return message.reply({ content: text, components });
  const lines = text.split('\n');
  let chunk = '', first = true;
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 1990) {
      if (first) { await message.reply({ content: chunk }); first = false; }
      else await message.channel.send({ content: chunk });
      chunk = line;
    } else { chunk = chunk ? chunk + '\n' + line : line; }
  }
  if (chunk) {
    if (first) await message.reply({ content: chunk, components });
    else await message.channel.send({ content: chunk, components });
  }
}

async function sendReply(message, text) {
  if (!text || !text.trim()) return message.reply({ content: '👋' });
  if (text.length <= 1990) return message.reply({ content: text });
  const lines = text.split('\n');
  let chunk = '', first = true;
  for (const line of lines) {
    if ((chunk + '\n' + line).length > 1990) {
      if (first) { await message.reply({ content: chunk }); first = false; }
      else          await message.channel.send({ content: chunk });
      chunk = line;
    } else { chunk = chunk ? chunk + '\n' + line : line; }
  }
  if (chunk) { if (first) await message.reply({ content: chunk }); else await message.channel.send({ content: chunk }); }
}

// ── Shared AI round ───────────────────────────────────────────────────────────

async function runAiRound(convKey, guild, userText, db, isOwner, channel, userId) {
  const conv = getConv(convKey);
  if (conv.lang === 'en') { const dl = detectLang(userText); if (dl !== 'en') conv.lang = dl; }
  const raw  = await callAiWithFallback(buildSystemPrompt(guild, isOwner, conv.lang || 'en'), conv.messages, userText);
  const { reply, actions } = parseResponse(raw);

  let extra = '';
  if (actions.length) {
    const hasDestructive = actions.some(a => DESTRUCTIVE_TYPES.includes(a.type));
    const safeActions    = actions.filter(a => !DESTRUCTIVE_TYPES.includes(a.type));
    const dangerActions  = actions.filter(a => DESTRUCTIVE_TYPES.includes(a.type));

    if (safeActions.length) {
      const { done, fails } = await executeActions(guild, safeActions, db, isOwner, channel, userId);
      if (done.length)  extra += '\n\n✅ ' + done.join('\n✅ ');
      if (fails.length) extra += '\n\n⚠️ ' + fails.join('\n⚠️ ');
    }

    if (hasDestructive && dangerActions.length) {
      const maxDelete = 10;
      const capped = dangerActions.slice(0, maxDelete);
      if (dangerActions.length > maxDelete) {
        extra += `\n\n🚫 ה-AI ניסה למחוק ${dangerActions.length} דברים בבת אחת — חתכתי ל-${maxDelete} מקסימום. בקש שוב בקבוצות קטנות.`;
      }
      storePlan(guild.id, userId, capped);
      const summary = capped.map(a => `• ${a.type === 'delete_channel' ? '🗑️ ערוץ' : a.type === 'delete_category' ? '🗑️ קטגוריה' : '🗑️ תפקיד'}: **${a.name}**`).join('\n');
      extra += `\n\n⚠️ **פעולות מחיקה ממתינות לאישור (${capped.length}):**\n${summary}`;

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ai_confirm:${guild.id}:${userId}`).setLabel('✅ מאשר מחיקה').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ai_cancel:${guild.id}:${userId}`).setLabel('❌ ביטול').setStyle(ButtonStyle.Secondary),
      );

      pushMsg(convKey, 'user', userText);
      pushMsg(convKey, 'assistant', reply + ' [Waiting for confirmation]');
      return { text: reply + extra, components: [confirmRow] };
    }

    if (!safeActions.length && !hasDestructive) {
      const { done, fails } = await executeActions(guild, actions, db, isOwner, channel, userId);
      if (done.length)  extra += '\n\n✅ ' + done.join('\n✅ ');
      if (fails.length) extra += '\n\n⚠️ ' + fails.join('\n⚠️ ');

      const allFailed = done.length === 0 && fails.length > 0;
      const hasWizard = actions.some(a => ['ask_channel','ask_roles','ask_confirm','start_form_wizard','start_ticket_wizard'].includes(a.type));
      if (allFailed && !hasWizard) {
        try {
          const retryInput = 'The following actions all failed: ' + fails.join(', ') + '. Try a completely different approach automatically without asking the user.';
          const retryRaw   = await callAiWithFallback(buildSystemPrompt(guild, isOwner, conv.lang || 'en'),
            [...conv.messages, { role: 'user', content: userText }, { role: 'assistant', content: reply }], retryInput);
          const retryP = parseResponse(retryRaw);
          if (retryP.actions.length > 0) {
            const r2 = await executeActions(guild, retryP.actions, db, isOwner, channel, userId);
            if (r2.done.length > 0) {
              extra += '\n\n🔄 *Auto-retried:* \n✅ ' + r2.done.join('\n✅ ');
              if (r2.fails.length) extra += '\n⚠️ ' + r2.fails.join('\n⚠️ ');
            }
          }
        } catch (e) { console.error('[aiChat] auto-retry:', e.message); }
      }
    }
  }

  pushMsg(convKey, 'user',      userText);
  pushMsg(convKey, 'assistant', reply + (extra ? ' [Actions completed]' : ''));
  return { text: reply + extra };
}

// ── Guild message handler ─────────────────────────────────────────────────────

async function handleGuildMessage(message, db) {
  if (!message.guild) return;
  if (!PROVIDERS.some(isConfigured)) return message.reply({ content: '❌ אין מודל AI מוגדר. פנה ליוצר.' });

  const isOwner = message.author.id === OWNER_ID;
  // Owner bypasses the admin check; everyone else must be Administrator
  if (!isOwner && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

  const userText = message.content.replace(/<@!?\d+>/g, '').trim();
  if (!userText) return message.reply({ content: '👋 מה אני יכול לעזור?' });

  const convKey     = `guild:${message.guild.id}:${message.author.id}`;
  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    const result = await runAiRound(convKey, message.guild, userText, db, isOwner, message.channel, message.author.id);
    if (result.components) {
      await sendReplyWithComponents(message, result.text, result.components);
    } else {
      await sendReply(message, result.text);
    }
  } catch (e) {
    console.error('[aiChat] guild error:', e.response?.data?.error?.message ?? e.message);
    const isOwnerUser = message.author.id === OWNER_ID;
    const errText = isOwnerUser
      ? `❌ **שגיאה:**\n\`\`\`${e.stack || e.message}\`\`\``
      : '❌ אופס, משהו השתבש. נסה שוב!';
    await message.reply({ content: errText });
  } finally {
    clearInterval(typingPulse);
  }
}

// ── DM handler ────────────────────────────────────────────────────────────────

async function handleDmMessage(message, client, db) {
  if (!PROVIDERS.some(isConfigured)) return message.reply({ content: '❌ אין מודל AI מוגדר כרגע. נסה שוב מאוחר יותר.' });

  const userId   = message.author.id;
  const isOwner  = userId === OWNER_ID;
  const convKey  = `dm:${userId}`;
  const conv     = getConv(convKey);
  const typingPulse = setInterval(() => message.channel.sendTyping().catch(() => {}), 9000);
  message.channel.sendTyping().catch(() => {});

  try {
    if (!conv.guildId) {
      const guilds = [...client.guilds.cache.values()];
      if (!guilds.length) { await message.reply({ content: 'אני לא בשום שרת כרגע.' }); return; }

      const input = message.content.trim();
      const num   = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= guilds.length) {
        conv.guildId = guilds[num - 1].id;
      } else {
        const match = guilds.find(g => g.name.toLowerCase().includes(input.toLowerCase()));
        if (match) conv.guildId = match.id;
      }

      if (!conv.guildId) {
        const list = guilds.map((g, i) => `**${i + 1}.** ${g.name}`).join('\n');
        await message.reply({ content: `באיזה שרת תרצה לנהל? שלח מספר:\n\n${list}` });
        return;
      }
      await message.reply({ content: `✅ מנהל את **${client.guilds.cache.get(conv.guildId).name}**. מה תרצה לעשות?` });
      return;
    }

    const guild = client.guilds.cache.get(conv.guildId);
    if (!guild) { conv.guildId = null; await message.reply({ content: 'השרת לא זמין. שלח שוב הודעה כדי לבחור שרת.' }); return; }

    const userText = message.content.trim();
    if (!userText) return;

    const result = await runAiRound(convKey, guild, userText, db, isOwner, message.channel, userId);
    if (result.components) {
      await sendReplyWithComponents(message, result.text, result.components);
    } else {
      await sendReply(message, result.text);
    }
  } catch (e) {
    console.error('[aiChat] DM error:', e.response?.data?.error?.message ?? e.message);
    const isOwnerUser = message.author.id === OWNER_ID;
    const errText = isOwnerUser
      ? `❌ **שגיאה:**\n\`\`\`${e.stack || e.message}\`\`\``
      : '❌ אופס, משהו השתבש. נסה שוב!';
    await message.reply({ content: errText });
  } finally {
    clearInterval(typingPulse);
  }
}

async function continueConvFromWizard(interaction, db, userInput, guildId, userId) {
  const convKey = `guild:${guildId}:${userId}`;
  const guild   = interaction.guild;
  const isOwner = userId === '1266854019767341107';
  const conv    = getConv(convKey);

  const typingPulse = setInterval(() => interaction.channel.sendTyping().catch(() => {}), 9000);
  interaction.channel.sendTyping().catch(() => {});

  try {
    const fullReply = await runAiRound(convKey, guild, userInput, db, isOwner, interaction.channel, userId);
    const lines = fullReply.split('\n');
    let chunk = '', first = true;
    for (const line of lines) {
      if ((chunk + '\n' + line).length > 1990) {
        await interaction.channel.send({ content: chunk });
        chunk = line; first = false;
      } else { chunk = chunk ? chunk + '\n' + line : line; }
    }
    if (chunk) await interaction.channel.send({ content: chunk });
  } catch (e) {
    console.error('[aiChat] wizard continuation:', e.message);
    await interaction.channel.send({ content: `❌ AI error: \`${e.message}\`` }).catch(() => {});
  } finally {
    clearInterval(typingPulse);
  }
}

module.exports = { handleGuildMessage, handleDmMessage, clearConv, continueConvFromWizard, callAiWithFallback, popPlan, executeActions };
