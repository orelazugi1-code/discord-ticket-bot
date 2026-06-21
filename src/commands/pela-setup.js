const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const OWNER_ID = '1266854019767341107';

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pela-setup')
    .setDescription('.')
    .setDefaultMemberPermissions(0), // invisible to everyone in autocomplete

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId) && !db.isUserPremium(interaction.user.id)) return interaction.reply({ content: '👑 **Premium בלבד!** כתבו /shop לפרטים.', ephemeral: true });

    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const guild   = interaction.guild;
    const results = [];

    try {
      // ── 1. Roles ─────────────────────────────────────────────────────────────
      const roleDefs = [
        { name: 'Staff',  color: 0xE67E22, hoist: true,  mentionable: true  },
        { name: 'VIP',    color: 0x9B59B6, hoist: true,  mentionable: false },
        { name: 'Member', color: 0x2ECC71, hoist: false, mentionable: false },
      ];
      const roles = {};
      for (const def of roleDefs) {
        const existing = guild.roles.cache.find(r => r.name === def.name);
        if (existing) {
          roles[def.name] = existing;
          results.push(`⏭️ Role **@${def.name}** already exists`);
        } else {
          roles[def.name] = await guild.roles.create({ ...def, reason: '/pela-setup' });
          results.push(`✅ Created role **@${def.name}**`);
          await sleep(400);
        }
      }

      // ── 2. Categories + channels ──────────────────────────────────────────────
      const structure = [
        {
          cat: '📢 Announcements',
          channels: [
            { name: '📢-announcements' },
            { name: '👋-welcome' },
          ],
        },
        {
          cat: '📋 Updates',
          channels: [
            { name: '📋-bot-updates', key: 'updates' },
            { name: '📋-changelog' },
          ],
        },
        {
          cat: '🎫 Tickets',
          channels: [
            { name: '🎫-open-a-ticket', key: 'tickets' },
          ],
        },
        {
          cat: '🔒 Staff Only',
          staffOnly: true,
          channels: [
            { name: '🔒-staff-chat' },
            { name: '🔒-approvals', key: 'approvals' },
            { name: '🔒-tasks',     key: 'tasks' },
          ],
        },
        {
          cat: '📊 Logs',
          channels: [
            { name: '📊-logs', key: 'logs' },
          ],
        },
        {
          cat: '🎭 Roles',
          channels: [
            { name: '🎭-get-roles' },
          ],
        },
      ];

      const channels = {};

      for (const { cat, channels: chList, staffOnly } of structure) {
        // Find or create category
        let category = guild.channels.cache.find(
          c => c.type === ChannelType.GuildCategory && c.name === cat,
        );
        if (!category) {
          const opts = { name: cat, type: ChannelType.GuildCategory, reason: '/pela-setup' };
          if (staffOnly && roles.Staff) {
            opts.permissionOverwrites = [
              { id: guild.id,         deny:  [PermissionFlagsBits.ViewChannel] },
              { id: roles.Staff.id,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ];
          }
          category = await guild.channels.create(opts);
          results.push(`✅ Created category **${cat}**`);
          await sleep(500);
        }

        // Find or create each channel
        for (const ch of chList) {
          const existing = guild.channels.cache.find(
            c => c.name === ch.name && c.parentId === category.id,
          );
          if (existing) {
            if (ch.key) channels[ch.key] = existing;
            results.push(`⏭️ **#${ch.name}** already exists`);
          } else {
            const newCh = await guild.channels.create({
              name: ch.name, type: ChannelType.GuildText,
              parent: category.id, reason: '/pela-setup',
            });
            if (ch.key) channels[ch.key] = newCh;
            results.push(`✅ Created **#${ch.name}**`);
            await sleep(500);
          }
        }
      }

      // ── 3. /staff-setup equivalent ────────────────────────────────────────────
      const cfgUpdates = {};
      if (roles.Staff)           cfgUpdates.staff_role_id    = roles.Staff.id;
      if (channels.approvals)    cfgUpdates.staff_channel_id = channels.approvals.id;
      const selfRoles = [roles.Member?.id, roles.VIP?.id].filter(Boolean);
      if (selfRoles.length)      cfgUpdates.self_assignable_roles = JSON.stringify(selfRoles);
      if (roles.Staff)           cfgUpdates.support_role_id  = roles.Staff.id;
      db.updateGuildConfig(guild.id, cfgUpdates);
      results.push('✅ Staff role, approval channel & self-assignable roles configured');

      // ── 4. /pela-server setup equivalent ─────────────────────────────────────
      db.setPelaConfig('pela_server_id', guild.id);
      if (channels.updates)  db.setPelaConfig('pela_updates_channel_id', channels.updates.id);
      if (channels.logs)     db.setPelaConfig('pela_logs_channel_id',    channels.logs.id);
      if (channels.tasks)    db.setPelaConfig('pela_tasks_channel_id',   channels.tasks.id);
      results.push('✅ Pela home server configured (updates, logs, tasks)');

      // ── 5. Post ticket panel ──────────────────────────────────────────────────
      if (channels.tickets) {
        const embed = new EmbedBuilder()
          .setTitle('🎫 Support Tickets')
          .setDescription('Click the button below to open a support ticket.')
          .setColor(0x5865F2);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:open').setLabel('Open a Ticket')
            .setEmoji('🎫').setStyle(ButtonStyle.Primary),
        );
        const panelMsg = await channels.tickets.send({ embeds: [embed], components: [row] });
        db.updateGuildConfig(guild.id, {
          panel_channel_id:  channels.tickets.id,
          panel_message_id:  panelMsg.id,
        });
        results.push(`✅ Ticket panel posted in **#${channels.tickets.name}**`);
      }

      // ── 6. Summary ────────────────────────────────────────────────────────────
      const summary = new EmbedBuilder()
        .setTitle('✅ Pela Setup Complete!')
        .setDescription(results.join('\n'))
        .setColor(0x57F287)
        .addFields(
          { name: 'Staff Role',         value: roles.Staff    ? `<@&${roles.Staff.id}>`  : '—', inline: true },
          { name: 'Updates Channel',    value: channels.updates  ? `<#${channels.updates.id}>`  : '—', inline: true },
          { name: 'Logs Channel',       value: channels.logs     ? `<#${channels.logs.id}>`     : '—', inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [summary] });

    } catch (err) {
      console.error('[pela-setup]', err);
      const done = results.length ? '\n\n**Completed before error:**\n' + results.join('\n') : '';
      await interaction.editReply({ content: `❌ Setup failed: \`${err.message}\`${done}` });
    }
  },
};