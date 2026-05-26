require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const db   = require('./src/database');
const { calculateLevel } = require('./src/utils/levels');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ── In-memory trackers ────────────────────────────────────────────────────────

const xpCooldowns  = new Map(); // `${guildId}:${userId}` → timestamp
const spamTracker  = new Map(); // `${guildId}:${userId}` → [timestamps]

// ── Load slash commands ───────────────────────────────────────────────────────

client.commands = new Collection();
const cmdDir = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(cmdDir, file));
  if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
}

// ── Ready ─────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async c => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  const rest     = new REST().setToken((process.env.BOT_TOKEN || '').trim());
  const commands = client.commands.map(cmd => cmd.data.toJSON());

  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Registered ${commands.length} guild slash command(s)`);

    const existing = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
    if (existing.length > 0) {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
      console.log(`✅ Cleared ${existing.length} global slash command(s) from previous projects`);
    }
  } catch (err) {
    console.error('Failed to register/clean slash commands:', err);
  }

  // Auto-close checker — runs every hour
  setInterval(async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      const config = db.getGuildConfig(guildId);
      if (!config.auto_close_hours || config.auto_close_hours <= 0) continue;

      const cutoff = new Date(Date.now() - config.auto_close_hours * 3_600_000);
      const stale  = db.getTicketsByGuild(guildId).filter(
        t => t.status === 'open' && new Date(t.created_at) < cutoff,
      );

      for (const ticket of stale) {
        const ch = await guild.channels.fetch(ticket.channel_id).catch(() => null);
        if (ch) {
          const { closeTicketChannel } = require('./src/utils/ticketManager');
          await closeTicketChannel(ch, ticket, client.user, db, 'Auto-closed due to inactivity');
        }
      }
    }
  }, 3_600_000);
});

// ── Welcome / Goodbye ─────────────────────────────────────────────────────────

client.on(Events.GuildMemberAdd, async member => {
  const config = db.getGuildConfig(member.guild.id);
  if (!config.welcome_enabled || !config.welcome_channel_id) return;

  const ch = member.guild.channels.cache.get(config.welcome_channel_id);
  if (!ch) return;

  const msg = (config.welcome_message ?? 'Welcome {user} to {server}!')
    .replace('{user}',        `<@${member.id}>`)
    .replace('{username}',    member.user.username)
    .replace('{server}',      member.guild.name)
    .replace('{membercount}', String(member.guild.memberCount));

  await ch.send(msg).catch(console.error);
});

client.on(Events.GuildMemberRemove, async member => {
  const config = db.getGuildConfig(member.guild.id);
  if (!config.goodbye_enabled || !config.goodbye_channel_id) return;

  const ch = member.guild.channels.cache.get(config.goodbye_channel_id);
  if (!ch) return;

  const msg = (config.goodbye_message ?? 'Goodbye {user}, we will miss you!')
    .replace('{user}',     member.user.username)
    .replace('{username}', member.user.username)
    .replace('{server}',   member.guild.name);

  await ch.send(msg).catch(console.error);
});

// ── Interactions ──────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction, db);
      return;
    }

    if (interaction.isButton()) {
      const { handleButton } = require('./src/handlers/buttonHandler');
      await handleButton(interaction, db);
      return;
    }

    if (interaction.isModalSubmit()) {
      const { handleModal } = require('./src/handlers/modalHandler');
      await handleModal(interaction, db);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const msg = { content: '❌ An error occurred. Please try again.', ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  // Record messages inside open tickets for transcripts
  const ticket = db.getTicketByChannel(message.channel.id);
  if (ticket?.status === 'open') {
    db.addTicketMessage(
      ticket.id,
      message.author.id,
      message.author.tag,
      message.content || '[attachment/embed]',
      message.createdAt.toISOString(),
    );
  }

  // ── Auto-Moderation ─────────────────────────────────────────────────────────
  const automod = db.getAutomodConfig(message.guild.id);
  if (automod.anti_spam_enabled || automod.link_filter_enabled || automod.mention_filter_enabled || automod.bad_words.length) {
    const deleted = await runAutomod(message, automod, db);
    if (deleted) return; // don't award XP for deleted messages
  }

  // ── XP / Leveling ───────────────────────────────────────────────────────────
  if (!message.content.startsWith('!')) {
    await handleXp(message, db);
  }

  // ── Custom !commands ────────────────────────────────────────────────────────
  if (!message.content.startsWith('!')) return;
  const cmdName = message.content.slice(1).split(/\s+/)[0].toLowerCase();
  const custom  = db.getCustomCommand(message.guild.id, cmdName);
  if (!custom) return;
  if (custom.admin_only && !message.member.permissions.has('Administrator')) return;
  await message.channel.send(custom.response);
});

// ── Auto-mod logic ────────────────────────────────────────────────────────────

async function runAutomod(message, cfg, db) {
  const content = message.content;
  const key     = `${message.guild.id}:${message.author.id}`;

  // Spam filter — 5+ messages in 5 seconds
  if (cfg.anti_spam_enabled) {
    const now    = Date.now();
    const times  = (spamTracker.get(key) ?? []).filter(t => now - t < 5000);
    times.push(now);
    spamTracker.set(key, times);
    if (times.length >= 5) {
      return await warnAndDelete(message, '🚫 Slow down! Anti-spam triggered.');
    }
  }

  // Link filter
  if (cfg.link_filter_enabled && /https?:\/\//i.test(content)) {
    return await warnAndDelete(message, '🚫 Links are not allowed here.');
  }

  // Mention filter
  if (cfg.mention_filter_enabled && message.mentions.users.size + message.mentions.roles.size > cfg.max_mentions) {
    return await warnAndDelete(message, `🚫 Too many mentions (max ${cfg.max_mentions}).`);
  }

  // Bad word filter
  if (cfg.bad_words.length) {
    const lower = content.toLowerCase();
    const hit   = cfg.bad_words.find(w => lower.includes(w));
    if (hit) return await warnAndDelete(message, '🚫 Your message contained a prohibited word.');
  }

  return false;
}

async function warnAndDelete(message, reason) {
  try {
    await message.delete();
    const warn = await message.channel.send(`<@${message.author.id}> ${reason}`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
  } catch {}
  return true;
}

// ── XP logic ─────────────────────────────────────────────────────────────────

async function handleXp(message, db) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now  = Date.now();
  if (xpCooldowns.has(key) && now - xpCooldowns.get(key) < 60_000) return;
  xpCooldowns.set(key, now);

  const xpGain  = Math.floor(Math.random() * 11) + 15; // 15–25 XP
  const updated = db.addXp(message.guild.id, message.author.id, xpGain);
  const { level: newLevel } = calculateLevel(updated.xp);

  if (newLevel > updated.level) {
    db.updateLevel(message.guild.id, message.author.id, newLevel);
    await message.channel.send(`🎉 <@${message.author.id}> leveled up to **Level ${newLevel}**!`).catch(() => {});

    // Assign level roles
    const levelRoles = db.getLevelRolesUpTo(message.guild.id, newLevel);
    for (const lr of levelRoles) {
      await message.member.roles.add(lr.role_id).catch(() => {});
    }
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

// Trim to strip any invisible chars (newlines, spaces) that cause UND_ERR_INVALID_ARG
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const missing = ['BOT_TOKEN','CLIENT_ID','CLIENT_SECRET','GUILD_ID','SESSION_SECRET']
  .filter(k => !process.env[k]?.trim());
if (missing.length) console.error('⚠️  Missing env vars:', missing.join(', '));
client.login(BOT_TOKEN);
