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
  console.log(`✅ ${c.user.tag} online | ${client.commands.size} commands | ${c.guilds.cache.size} guilds`);

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
  // DM the owner
  try {
    const owner = await guild.fetchOwner();
    await owner.user.send({
      content: `Hi! 👋 I'm Pela — an AI community manager. Thanks for adding me to **${guild.name}**!\n\nI can help with tickets, roles, custom forms, and more. Run \`/pela-setup\` to set up the server structure automatically, or just chat with me here anytime!\n\nLooking forward to working with you! 🚀`,
    });
    console.log(`[Pela] Welcome DM sent to owner of ${guild.name}`);
  } catch (e) {
    console.error('[Pela] Could not DM guild owner:', e.message);
  }

  // Register slash commands in the new guild
  try {
    const rest = new REST().setToken((process.env.BOT_TOKEN || '').trim());
    const cmds = client.commands.map(c => c.data.toJSON());
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: cmds });
    console.log(`[Pela] Registered ${cmds.length} commands in new guild ${guild.name}`);
  } catch (e) {
    console.error('[Pela] Failed to register commands in new guild:', e.message);
  }

  // Send /help announcement to the best channel
  try {
    const { ChannelType: CT, EmbedBuilder: EB, ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
    const text = guild.channels.cache.filter(c => c.type === CT.GuildText && c.permissionsFor(guild.members.me)?.has('SendMessages'));
    const allNames = text.map(c => c.name.toLowerCase());
    const isHebrew = allNames.some(n => /[֐-׿]/.test(n));

    const UPDATE_NAMES = ['updates', 'announcements', 'news', 'bot-updates', 'עדכונים', 'הודעות', 'חדשות'];
    const GENERAL_NAMES = ['general', 'chat', 'כללי', 'צאט', 'lobby'];
    let target = null;
    for (const n of UPDATE_NAMES) { target = text.find(c => c.name.toLowerCase().includes(n)); if (target) break; }
    if (!target) for (const n of GENERAL_NAMES) { target = text.find(c => c.name.toLowerCase().includes(n)); if (target) break; }
    if (!target) target = text.first();

    if (target) {
      const embed = new EB().setColor(0x7C5AF7).setTimestamp().setFooter({ text: 'Pela Bot' });
      let subLabel, unsubLabel;

      if (isHebrew) {
        embed.setTitle('🆕 פקודה חדשה — /help');
        embed.setDescription('**פלא** קיבלה פקודת `/help` חדשה!\n\nהפקודה מציגה את כל הפקודות מסודרות לפי קטגוריות:\n🛡️ ניהול ומודרציה\n🎫 טיקטים\n⚙️ הגדרות שרת\n⭐ XP ולבלים\n🔧 כלים ופאן\n\nתנסו עכשיו: `/help` 🚀');
        subLabel = '📬 המשך לקבל עדכונים מפלא';
        unsubLabel = '🔕 הפסק עדכונים';
      } else {
        embed.setTitle('🆕 New Command — /help');
        embed.setDescription('**Pela** now has a `/help` command!\n\nIt shows all commands organized by category:\n🛡️ Moderation\n🎫 Tickets\n⚙️ Server Setup\n⭐ XP & Levels\n🔧 Tools & Fun\n\nTry it now: `/help` 🚀');
        subLabel = '📬 Get updates from Pela';
        unsubLabel = '🔕 Stop updates';
      }

      const row = new AR().addComponents(
        new BB().setCustomId('pela_subscribe').setLabel(subLabel).setStyle(BS.Success),
        new BB().setCustomId('pela_unsubscribe').setLabel(unsubLabel).setStyle(BS.Secondary),
      );
      await target.send({ embeds: [embed], components: [row] });
      console.log(`[Pela] Sent /help announcement to ${guild.name} (${isHebrew ? 'Hebrew' : 'English'}) in #${target.name}`);
    }
  } catch (e) {
    console.error('[Pela] Failed to send announcement in new guild:', e.message);
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
    // AI ban confirmation buttons
    if (interaction.isButton() && interaction.customId?.startsWith('ai_ban:')) {
      const [, targetId, requesterId] = interaction.customId.split(':');
      if (interaction.user.id !== requesterId) return interaction.reply({ content: '\u274c', ephemeral: true });
      try {
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.update({ content: '\u274c User not found.', embeds: [], components: [] });
        const reason = interaction.message.embeds[0]?.fields?.find(f => f.name.includes('Reason'))?.value || 'AI ban';
        await member.send(`You have been **banned** from **${interaction.guild.name}**. Reason: ${reason}`).catch(() => {});
        await member.ban({ reason: `${interaction.user.tag}: ${reason}` });
        await interaction.update({ content: `\ud83d\udd28 **${member.user.tag}** has been banned.`, embeds: [], components: [] });
      } catch (e) { await interaction.update({ content: `\u274c Ban failed: ${e.message}`, embeds: [], components: [] }); }
      return;
    }
    if (interaction.isButton() && interaction.customId?.startsWith('ai_ban_cancel:')) {
      const requesterId = interaction.customId.split(':')[1];
      if (interaction.user.id !== requesterId) return interaction.reply({ content: '\u274c', ephemeral: true });
      await interaction.update({ content: '\u274c Ban cancelled.', embeds: [], components: [] });
      return;
    }

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

    // ── Event buttons ──────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('evt_')) {
      const { handleEventButton, handlePrizeDM } = require('./src/utils/eventGames');
      const handled = await handleEventButton(interaction, interaction.client);
      if (handled) return;
      // Prize claim (DM interactions)
      if ((interaction.isStringSelectMenu() || interaction.isButton()) && interaction.customId.startsWith('evt_prize_')) {
        const { handlePrizeDM } = require('./src/utils/eventGames');
        const handled2 = await handlePrizeDM(interaction, interaction.client, db);
        if (handled2) return;
      }
    }

    // ── AI confirmation buttons (approve/cancel destructive actions) ─────
    if (interaction.isButton() && interaction.customId.startsWith('ai_confirm:')) {
      const [, guildId, ownerId] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) return interaction.reply({ content: '❌ רק מי שביקש יכול לאשר.', ephemeral: true });
      const { popPlan, executeActions } = require('./src/utils/aiChat');
      const actions = popPlan(guildId, ownerId);
      if (!actions) return interaction.update({ content: '⏰ התוכנית פגה — שלח את הבקשה מחדש.', components: [] });
      await interaction.update({ content: '⏳ מבצע...', components: [] });
      const guild = interaction.client.guilds.cache.get(guildId);
      if (!guild) return interaction.editReply({ content: '❌ לא מצאתי את השרת.' });
      const isOwner = ownerId === '1266854019767341107';
      const { done, fails } = await executeActions(guild, actions, db, isOwner, interaction.channel, ownerId);
      let result = '';
      if (done.length)  result += '✅ ' + done.join('\n✅ ');
      if (fails.length) result += '\n⚠️ ' + fails.join('\n⚠️ ');
      await interaction.editReply({ content: result || '✅ בוצע!' });
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('ai_cancel:')) {
      const [, guildId, ownerId] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) return interaction.reply({ content: '❌ רק מי שביקש יכול לבטל.', ephemeral: true });
      const { popPlan } = require('./src/utils/aiChat');
      popPlan(guildId, ownerId);
      await interaction.update({ content: '❌ בוטל — לא נמחק כלום.', components: [] });
      return;
    }

    // ── Promo "not interested" button ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'pela_promo_no') {
      await interaction.update({ content: '👍 תודה שקראת! אם תשנה דעתך — תמיד אפשר להוסיף את פלא.', embeds: [], components: [] });
      try {
        const logCh = await interaction.client.channels.fetch('1517919493534257363').catch(() => null);
        if (logCh) await logCh.send(`📋 **${interaction.user.tag}** לחץ "לא מעוניין" על הודעת הגיוס`);
      } catch {}
      return;
    }

    // ── Premium management buttons ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'prem_server_grant') {
      if (interaction.user.id !== '1266854019767341107') return interaction.reply({ content: '❌ רק היוצר.', ephemeral: true });
      db.addPremium(interaction.guildId, interaction.user.id);
      await interaction.update({ content: '👑 **Premium הופעל לשרת הזה!**\nכל הפקודות המתקדמות זמינות עכשיו.', embeds: [], components: [] });
      return;
    }
    if (interaction.isButton() && interaction.customId === 'prem_server_revoke') {
      if (interaction.user.id !== '1266854019767341107') return interaction.reply({ content: '❌ רק היוצר.', ephemeral: true });
      db.removePremium(interaction.guildId);
      await interaction.update({ content: '❌ **Premium הוסר מהשרת הזה.**', embeds: [], components: [] });
      return;
    }
    if (interaction.isButton() && interaction.customId === 'prem_list') {
      if (interaction.user.id !== '1266854019767341107') return interaction.reply({ content: '❌ רק היוצר.', ephemeral: true });
      const servers = db.getAllPremiumServers();
      const users = db.getAllPremiumUsers();
      let desc = '**👑 שרתים עם Premium:**\n';
      if (!servers.length) desc += 'אין\n';
      else for (const s of servers) { const g = interaction.client.guilds.cache.get(s.guild_id); desc += `• ${g ? g.name : s.guild_id}\n`; }
      desc += '\n**⭐ משתמשים עם Premium:**\n';
      if (!users.length) desc += 'אין\n';
      else for (const u of users) { try { const usr = await interaction.client.users.fetch(u.user_id).catch(() => null); desc += `• ${usr ? usr.tag : u.user_id}\n`; } catch { desc += `• ${u.user_id}\n`; } }
      const { EmbedBuilder } = require('discord.js');
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('📋 רשימת Premium').setDescription(desc)], ephemeral: true });
      return;
    }
    if (interaction.isUserSelectMenu() && interaction.customId === 'prem_user_select') {
      if (interaction.user.id !== '1266854019767341107') return interaction.reply({ content: '❌ רק היוצר.', ephemeral: true });
      const target = interaction.users.first();
      const has = db.isUserPremium(target.id);
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`prem_ugrant_${target.id}`).setLabel(`⭐ תן Premium ל-${target.displayName}`).setStyle(has ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`prem_urevoke_${target.id}`).setLabel(`❌ הסר Premium מ-${target.displayName}`).setStyle(has ? ButtonStyle.Danger : ButtonStyle.Secondary),
      );
      await interaction.reply({ content: `**${target.displayName}** — ${has ? '⭐ יש User Premium' : '❌ אין User Premium'}`, components: [row], ephemeral: true });
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('prem_ugrant_')) {
      if (interaction.user.id !== '1266854019767341107') return interaction.reply({ content: '❌ רק היוצר.', ephemeral: true });
      const uid = interaction.customId.replace('prem_ugrant_', '');
      db.addUserPremium(uid, interaction.user.id);
      const target = await interaction.client.users.fetch(uid).catch(() => null);
      try { if (target) await target.send('🎉 קיבלת **User Premium** מפלא!\n\n✅ כל הפקודות פתוחות לך\n✅ AI בפרטי\n✅ גישה מלאה בכל שרת'); } catch {}
      await interaction.update({ content: `⭐ **User Premium הופעל ל-${target ? target.tag : uid}!**`, components: [] });
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('prem_urevoke_')) {
      if (interaction.user.id !== '1266854019767341107') return interaction.reply({ content: '❌ רק היוצר.', ephemeral: true });
      const uid = interaction.customId.replace('prem_urevoke_', '');
      db.removeUserPremium(uid);
      const target = await interaction.client.users.fetch(uid).catch(() => null);
      await interaction.update({ content: `❌ **User Premium הוסר מ-${target ? target.tag : uid}.**`, components: [] });
      return;
    }

    // ── Shop free info button
    if (interaction.isButton() && interaction.customId === 'pela_shop_free') {
      await interaction.reply({ content: '🆓 **מה בחינם:**\n\n• /help — רשימת כל הפקודות\n• /report — דיווח ליוצר\n• /ban /kick /warn — ניהול בסיסי\n• /purge /lock /unlock — ניהול ערוצים\n• /poll /remind /roll /coinflip — כלים\n• /rank /leaderboard — XP (צפייה בלבד)\n• /embed — הודעות מעוצבות\n\n👑 **Premium מוסיף:** AI חכם, Welcome/Goodbye, טיקטים, טפסים, AutoMod, Button Roles, Glow, Banner AI, Server Design ועוד!', ephemeral: true });
      return;
    }
    // ── Report feedback buttons ───────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'report_solved') {
      await interaction.update({
        content: '✅ שמחים לשמוע שהבעיה נפתרה! תודה שדיווחת 💪',
        embeds: interaction.message.embeds,
        components: [],
      });
      try {
        const creator = await interaction.client.users.fetch('1266854019767341107');
        await creator.send(`✅ **${interaction.user.tag}** דיווח שהבעיה **נפתרה** בהצלחה!`);
      } catch {}
      try {
        const logCh = await interaction.client.channels.fetch('1517919493534257363').catch(() => null);
        if (logCh) await logCh.send(`✅ **${interaction.user.tag}** — בעיה נפתרה`);
      } catch {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'report_unsolved') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: AR } = require('discord.js');
      const modal = new ModalBuilder()
        .setCustomId('report_unsolved_modal')
        .setTitle('הבעיה לא נפתרה');
      modal.addComponents(
        new AR().addComponents(
          new TextInputBuilder()
            .setCustomId('unsolved_detail')
            .setLabel('מה עדיין לא עובד?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('תפרט מה קורה כשאתה מנסה...')
            .setRequired(true)
            .setMaxLength(500),
        ),
      );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'report_unsolved_modal') {
      const detail = interaction.fields.getTextInputValue('unsolved_detail');
      await interaction.update({
        content: '📝 תודה על הפירוט! העברנו את זה ליוצר והוא יטפל בזה בהקדם.',
        embeds: interaction.message.embeds,
        components: [],
      });
      try {
        const creator = await interaction.client.users.fetch('1266854019767341107');
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ בעיה לא נפתרה')
          .addFields(
            { name: '👤 מדווח', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
            { name: '📝 פירוט', value: detail },
          )
          .setTimestamp();
        await creator.send({ embeds: [embed] });
        const logCh = await interaction.client.channels.fetch('1517919493534257363').catch(() => null);
        if (logCh) await logCh.send({ embeds: [embed] });
      } catch {}
      return;
    }

    // ── Update subscribe/unsubscribe buttons ──────────────────────────────
    if (interaction.isButton() && interaction.customId === 'pela_subscribe') {
      db.addSubscriber(interaction.user.id);
      try {
        const creator = await interaction.client.users.fetch('1266854019767341107');
        await creator.send(`📬 מנוי חדש לעדכונים: **${interaction.user.tag}** (\`${interaction.user.id}\`)`);
      } catch {}
      try {
        const logCh = await interaction.client.channels.fetch('1517919493534257363').catch(() => null);
        if (logCh) await logCh.send(`📬 מנוי חדש: **${interaction.user.tag}** (\`${interaction.user.id}\`)`);
      } catch {}
      await interaction.reply({ content: '✅ נרשמת לעדכונים מפלא! תקבל הודעות על חידושים ועדכונים.', ephemeral: true });
      return;
    }
    if (interaction.isButton() && interaction.customId === 'pela_unsubscribe') {
      const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
      const row = new AR().addComponents(
        new BB().setCustomId('pela_unsub_confirm').setLabel('כן, בטל עדכונים').setStyle(BS.Danger),
        new BB().setCustomId('pela_unsub_cancel').setLabel('לא, תשאיר').setStyle(BS.Secondary),
      );
      await interaction.reply({ content: '⚠️ **אתה בטוח שאתה רוצה להפסיק לקבל עדכונים מפלא?**', components: [row], ephemeral: true });
      return;
    }
    if (interaction.isButton() && interaction.customId === 'pela_unsub_confirm') {
      db.removeSubscriber(interaction.user.id);
      await interaction.update({ content: '🔕 הוסרת מרשימת העדכונים. לא תקבל יותר הודעות.', components: [] });
      return;
    }
    if (interaction.isButton() && interaction.customId === 'pela_unsub_cancel') {
      await interaction.update({ content: '✅ נשארת ברשימת העדכונים!', components: [] });
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
    const errText = interaction.user.id === '1266854019767341107'
      ? `❌ **שגיאה:**\n\`\`\`${err.stack || err.message}\`\`\``
      : '❌ An error occurred. Please try again.';
    const msg = { content: errText, ephemeral: true };
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
    const hasUserPremium = db.isUserPremium(message.author.id);
    const sp = hasUserPremium || client.guilds.cache.some(g => { try { return db.isPremium(g.id) && g.members.cache.has(message.author.id); } catch { return false; } });
    if (!sp && message.author.id !== '1266854019767341107') { await message.reply('\u{1F451} **AI = Premium!** /shop'); return; }
    const { handleDmMessage: pelaDm } = require('./src/utils/pelaAI');
    await pelaDm(message, client, db).catch(console.error);
    return;
  }

  // ── AI chat channel or bot mention ───────────────────────────────────────────
  const aiCfg      = db.getGuildConfig(message.guild.id);
  const isAiCh     = aiCfg.ai_chat_channel_id && message.channel.id === aiCfg.ai_chat_channel_id;
  const isMentioned = message.mentions.users.has(client.user.id);
  if (isAiCh || isMentioned) {
    if (!db.isPremium(message.guild.id) && !db.isUserPremium(message.author.id) && message.author.id !== '1266854019767341107') { await message.reply({ content: '\u{1F451} **AI Premium!** /shop' }); return; }
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
