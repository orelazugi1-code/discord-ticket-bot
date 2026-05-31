'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

// ── Approval button handler ───────────────────────────────────────────────────

async function handleApprovalButton(interaction, db) {
  const parts      = interaction.customId.split(':');
  const decision   = parts[1];
  const approvalId = parseInt(parts[2]);
  if (!approvalId) return;

  const approval = db.getPendingApproval(approvalId);
  if (!approval) return interaction.reply({ content: '⚠️ This request no longer exists.', ephemeral: true });
  if (approval.status !== 'pending') return interaction.reply({ content: `⚠️ Already **${approval.status}**.`, ephemeral: true });

  const cfg     = db.getGuildConfig(interaction.guild.id);
  const isStaff = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                  (cfg.staff_role_id && interaction.member.roles.cache.has(cfg.staff_role_id));
  if (!isStaff) return interaction.reply({ content: '❌ Only staff members can approve or deny requests.', ephemeral: true });

  await interaction.deferUpdate();
  const approved = decision === 'approve';

  db.updatePendingApproval(approvalId, approved ? 'approved' : 'denied', interaction.user.id);

  const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(approved ? 0x57F287 : 0xf75a5a)
    .setTitle(approved ? '✅ Approved' : '❌ Denied')
    .setFooter({ text: `${approved ? 'Approved' : 'Denied'} by ${interaction.user.tag}` });
  await interaction.editReply({ embeds: [newEmbed], components: [] });

  // Notify requesting user
  const user = await interaction.client.users.fetch(approval.user_id).catch(() => null);
  if (user) {
    const dm = approved
      ? `✅ Great news! Your request was **approved** by the staff team.\n\n> ${approval.description}`
      : `❌ Your request was reviewed and unfortunately **not approved**.\n\n> ${approval.description}`;
    await user.send({ content: dm }).catch(() => {});
  }

  // Log to Pela's log channel if configured
  try {
    const logChId = db.getPelaConfig('pela_logs_channel_id');
    if (logChId) {
      const logCh = interaction.guild.channels.cache.get(logChId);
      if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setTitle('📝 Approval Resolved').setColor(approved ? 0x57F287 : 0xf75a5a)
        .addFields({ name: 'User', value: `<@${approval.user_id}>`, inline: true }, { name: 'Decision', value: approved ? '✅ Approved' : '❌ Denied', inline: true }, { name: 'By', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Request', value: approval.description })
        .setTimestamp()] });
    }
  } catch {}
}

// ── Task button handler ───────────────────────────────────────────────────────

async function handleTaskButton(interaction, db) {
  const parts  = interaction.customId.split(':');
  const action = parts[1];
  const taskId = parseInt(parts[2]);

  const task = db.getPelaTask(taskId);
  if (!task) return interaction.reply({ content: '⚠️ Task not found.', ephemeral: true });

  if (action === 'complete') {
    const canComplete = interaction.user.id === task.assigned_to
                     || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!canComplete) return interaction.reply({ content: '❌ Only the assigned person or an admin can complete this task.', ephemeral: true });

    db.updatePelaTask(taskId, 'completed');
    const oldFields = interaction.message.embeds[0]?.fields || [];
    const updFields = oldFields.map((f, i) => i === 1 ? { name: 'Status', value: '✅ Completed', inline: true } : f);
    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setFields(updFields);
    await interaction.update({ embeds: [newEmbed], components: [] });

    if (task.created_by && task.created_by !== interaction.user.id) {
      const creator = await interaction.client.users.fetch(task.created_by).catch(() => null);
      if (creator) await creator.send({ content: `✅ Task #${taskId} was marked complete by <@${interaction.user.id}>:\n> ${task.description}` }).catch(() => {});
    }
    return;
  }

  if (action === 'reassign') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only admins can reassign tasks.', ephemeral: true });
    }
    return interaction.reply({ content: '✏️ To reassign, use `/pela-server task @user description`.', ephemeral: true });
  }
}

// ── Self-role select handler (from DM or guild) ───────────────────────────────

async function handleSelfRoleSelect(interaction, db, client) {
  const parts   = interaction.customId.split(':');
  const guildId = parts[2];
  const userId  = parts[3];
  const roleId  = interaction.values[0];

  if (interaction.user.id !== userId) return interaction.reply({ content: '❌ This selector is for someone else.', ephemeral: true });

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.update({ content: '❌ Server not found.', components: [] });

  const cfg       = db.getGuildConfig(guildId);
  const selfRoles = JSON.parse(cfg.self_assignable_roles || '[]');
  if (!selfRoles.includes(roleId)) return interaction.update({ content: '❌ That role is no longer self-assignable.', components: [] });

  const role   = guild.roles.cache.get(roleId);
  if (!role) return interaction.update({ content: '❌ Role no longer exists.', components: [] });

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return interaction.update({ content: '❌ Could not find you in that server.', components: [] });

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.update({ content: `✅ Removed **${role.name}** in **${guild.name}**!`, components: [] });
    } else {
      await member.roles.add(roleId);
      await interaction.update({ content: `✅ Gave you **${role.name}** in **${guild.name}**!`, components: [] });
    }
  } catch (e) {
    await interaction.update({ content: `❌ Failed: ${e.message}`, components: [] });
  }
}

module.exports = { handleApprovalButton, handleTaskButton, handleSelfRoleSelect };