require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, Events, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const db   = require('./src/database');
const { calculateLevel } = require('./src/utils/levels');
const { checkAndSendUpdate } = require('./src/utils/botUpdates');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [
    Partials.Channel, // required for DM channel objects to hydrate
    Partials.Message,
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
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`✅ Registered ${commands.length} global slash command(s)`);

    // Clear any stale guild-specific commands from the dev guild
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: [] },
      ).catch(() => {});
      console.log('✅ Cleared old guild-specific slash commands');
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }

  // ── One-time apology message to all servers ──────────────────────────────
  if (!process.env.APOLOGY_SENT) {
    const { EmbedBuilder } = require('discord.js');
    const apologyEmbed = new EmbedBuilder()
      .setColor(0x7c5af7)
      .setTitle('💜 פלא חזר!')
      .setDescription(
        '**היי לכולם!** 👋\n\n' +
        'מתנצל על התקופה שפלא היה אופליין — הייתה בעיה בשרת שלנו, והכל תוקן עכשיו.\n\n' +
        'פלא חזר לפעולה מלאה 24/7! 🚀\n\n' +
        '**חדש:** יש פקודה חדשה `/report`\n' +
        'אם יש לכם בעיה, באג, או בקשה — כתבו `/report` ואחריו טקסט, וזה ישלח ישירות ליוצר.\n' +
        'הוא יעזור לכם בהכל! 💪'
      )
      .setFooter({ text: 'Pela Bot • תודה על הסבלנות ❤️' })
      .setTimestamp();

    for (const [, guild] of c.guilds.cache) {
      try {
        const ch = guild.systemChannel
          || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
        if (ch) await ch.send({ embeds: [apologyEmbed] });
      } catch {}
    }
    console.log(`✅ Apology sent to ${c.guilds.cache.size} guild(s)`);
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
    // Expire temp roles
    const expired = db.getExpiredTempRoles();
    for (const tr of expired) {
      const g = client.guilds.cache.get(tr.guild_id);
      if (g) {
        const member = await g.members.fetch(tr.user_id).catch(() => null);
        if (member) await member.roles.remove(tr.role_id).catch(() => {});
      }
      db.deleteTempRole(tr.id);
    }
  }, 3_600_000);

  // Bot updates channel
  await checkAndSendUpdate(client, db).catch(err => console.error('[BotUpdates]', err.message));

  // Auto-configure Pela's home server (guild 1510637146074120342)
  const { startAutonomousPosts, ensureHomeServerConfig } = require('./src/utils/pelaAI');
  await ensureHomeServerConfig(client, db).catch(e => console.error('[Pela] home config:', e.message));

  // Autonomous server scan: AI checks for missing structure, runs on startup then every 6h
  const { startServerScan } = require('./src/utils/pelaAI');
  startServerScan(client, db);
  startAutonomousPosts(client, db);

  // Daily ticket summary to owner
  setInterval(async () => {
    const { sendTicketSummary } = require('./src/utils/pelaAI');
    await sendTicketSummary(client, db).catch(() => {});
  }, 24 * 3_600_000);
});

// ── Welcome / Goodbye ─────────────────────────────────────────────────────────

client.on(Events.GuildMemberAdd, async member => {
  const config = db.getGuildConfig(member.guild.id);

  if (config.welcome_enabled && config.welcome_channel_id) {
    const ch = member.guild.channels.cache.get(config.welcome_channel_id);
    if (ch) {
      try {
        const { generateWelcomeCard } = require('./src/utils/welcomeCard');
        const cardBuf = await generateWelcomeCard(member, config);
        await ch.send({
          content: `Hey ${member}! 👋`,
          files: [{ attachment: cardBuf, name: 'welcome.png' }],
        });
      } catch (err) {
        console.error('[WelcomeCard] Error generating card:', err.message);
        const msg = (config.welcome_message || 'Welcome {user} to {server}!')
          .replace('{user}',        `<@${member.id}>`)
          .replace('{username}',    member.user.username)
          .replace('{server}',      member.guild.name)
          .replace('{membercount}', String(member.guild.memberCount));
        await ch.send(msg).catch(console.error);
      }
    }
  }

  if (config.auto_role_id) {
    await member.roles.add(config.auto_role_id).catch(() => {});
  }
});

client.on(Events.GuildMemberRemove, async member => {
  const config = db.getGuildConfig(member.guild.id);
  if (!config.goodbye_enabled || !config.goodbye_channel_id) return;
  const ch = member.guild.channels.cache.get(config.goodbye_channel_id);
  if (!ch) return;
  try {
    const { generateGoodbyeCard } = require('./src/utils/welcomeCard');
    const cardBuf = await generateGoodbyeCard(member, config);
    await ch.send({
      content: `Goodbye ${member.user.username}! 👋`,
      files: [{ attachment: cardBuf, name: 'goodbye.png' }],
    });
  } catch (err) {
    console.error('[GoodbyeCard] Error generating card:', err.message);
    const msg = (config.goodbye_message || 'Goodbye {user}, we will miss you!')
      .replace('{user}',     member.user.username)
      .replace('{username}', member.user.username)
      .replace('{server}',   member.guild.name);
    await ch.send(msg).catch(console.error);
  }
});

// ── New server join: DM the owner ───────────────────────────────────────────

client.on(Events.GuildCreate, async guild => {
  try {
    const owner = await guild.fetchOwner();
    await owner.user.send({
      content: `Hi! 👋 I'm Pela — an AI community manager. Thanks for adding me to **${guild.name}**!\n\nI can help with tickets, roles, custom forms, and more. Run \`/pela-setup\` to set up the server structure automatically, or just chat with me here anytime!\n\nLooking forward to working with you! 🚀`,
    });
    console.log(`[Pela] Welcome DM sent to owner of ${guild.name}`);
  } catch (e) {
    console.error('[Pela] Could not DM guild owner:', e.message);
  }
});

// ── Interactions ──────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction, db);
      return;
    }

    // ── Pela: approval, self-role and task buttons
    if (interaction.isButton() && interaction.customId && interaction.customId.startsWith('aprv:')) {
      const { handleApprovalButton } = require('./src/utils/approvals');
      await handleApprovalButton(interaction, db); return;
    }
    if (interaction.isButton() && interaction.customId && interaction.customId.startsWith('task:')) {
      const { handleTaskButton } = require('./src/utils/approvals');
      await handleTaskButton(interaction, db); return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId && interaction.customId.startsWith('self_role:')) {
      const { handleSelfRoleSelect } = require('./src/utils/approvals');
      await handleSelfRoleSelect(interaction, db, client); return;
    }

    // ── Wizard interactions (AI chat interactive components) ────────────────────
    if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) && interaction.customId?.startsWith('wiz:')) {
      const { handleWizardInteraction } = require('./src/utils/wizard');
      await handleWizardInteraction(interaction, db);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId?.startsWith('wizmod:')) {
      const { handleWizardModal } = require('./src/utils/wizard');
      await handleWizardModal(interaction, db);
      return;
    }

    if (interaction.isButton() || interaction.isRoleSelectMenu() || interaction.isStringSelectMenu()) {
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
  if (message.author.bot) return;

  // Glow webhook — resend message as styled webhook
  if (message.guild && message.content && !message.content.startsWith('/')) {
    const gd = db.getGlow && db.getGlow(message.author.id, message.guild.id);
    if (gd) {
      const emo = { purple: '💜', blue: '💙', green: '💚', red: '❤️', gold: '💛', pink: '🩷', cyan: '🩵', rainbow: '🌈' };
      const dn = (message.member && message.member.displayName) || message.author.username;
      const sn = (emo[gd.color] || '✨') + ' ' + dn;
      try {
        const whs = await message.channel.fetchWebhooks().catch(() => null);
        let wh = whs && whs.find(w => w.name === 'VOID Glow');
        if (!wh) wh = await message.channel.createWebhook({ name: 'VOID Glow', avatar: message.author.displayAvatarURL() }).catch(() => null);
        if (wh) {
          await message.delete().catch(() => {});
          await wh.send({ content: message.content, username: sn, avatarURL: message.author.displayAvatarURL(), allowedMentions: { parse: ['users', 'roles'] } });
          return;
        }
      } catch (e) { /* no permission */ }
    }
  }


  // ── DMs: always use Pela personality (admins still get full capability) ──────
  // Server management is done via @mention or AI-chat channel inside a server.
  // Routing admins to aiChat caused the 'pick a server' prompt for casual chat.
  if (!message.guild) {
    const { handleDmMessage: pelaDm } = require('./src/utils/pelaAI');
    await pelaDm(message, client, db).catch(console.error);
    return;
  }

  // ── AI chat channel or bot mention ───────────────────────────────────────────
  const aiCfg      = db.getGuildConfig(message.guild.id);
  const isAiCh     = aiCfg.ai_chat_channel_id && message.channel.id === aiCfg.ai_chat_channel_id;
  const isMentioned = message.mentions.users.has(client.user.id);
  if (isAiCh || isMentioned) {
    const isAdminUser = message.author.id === '1266854019767341107'
                     || !!message.member?.permissions.has(PermissionFlagsBits.Administrator);
    if (isAdminUser) {
      const { handleGuildMessage } = require('./src/utils/aiChat');
      await handleGuildMessage(message, db).catch(console.error);
    } else {
      const { handleGuildMessage: pelaGuild, detectPermLevel } = require('./src/utils/pelaAI');
      const perm = await detectPermLevel(message.author.id, client, db).catch(() => 'user');
      await pelaGuild(message, client, db, perm).catch(console.error);
    }
    return;
  }

  // Record messages inside open tickets for transcripts + Pela participates
  const ticket = db.getTicketByChannel(message.channel.id);
  if (ticket?.status === 'open') {
    db.addTicketMessage(
      ticket.id,
      message.author.id,
      message.author.tag,
      message.content || '[attachment/embed]',
      message.createdAt.toISOString(),
    );
    // Pela responds to the ticket opener automatically (rate-limited internally)
    const { handleTicketMessage } = require('./src/utils/pelaAI');
    handleTicketMessage(message, ticket, db).catch(() => {});
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
