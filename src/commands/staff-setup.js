const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff-setup')
    .setDescription('Configure staff roles and self-assignable roles')
    .addSubcommand(s => s.setName('staff-role').setDescription('Set the staff role for the approval system')
      .addRoleOption(o => o.setName('role').setDescription('The staff role').setRequired(true)))
    .addSubcommand(s => s.setName('self-roles').setDescription('Set roles users can self-assign via Pela DM')
      .addRoleOption(o => o.setName('role1').setDescription('Role 1').setRequired(true))
      .addRoleOption(o => o.setName('role2').setDescription('Role 2'))
      .addRoleOption(o => o.setName('role3').setDescription('Role 3'))
      .addRoleOption(o => o.setName('role4').setDescription('Role 4'))
      .addRoleOption(o => o.setName('role5').setDescription('Role 5')))
    .addSubcommand(s => s.setName('staff-channel').setDescription('Set a channel where approval requests are sent')
      .addChannelOption(o => o.setName('channel').setDescription('Staff/approval channel').setRequired(true)))
    .addSubcommand(s => s.setName('view').setDescription('View current staff configuration'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **Premium בלבד!** כתבו /shop לפרטים.', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'staff-role') {
      const role = interaction.options.getRole('role');
      db.updateGuildConfig(interaction.guildId, { staff_role_id: role.id });
      return interaction.reply({ content: `✅ Staff role set to <@&${role.id}>.\nMembers with this role can approve requests from regular users.`, ephemeral: true });
    }

    if (sub === 'self-roles') {
      const ids = ['role1','role2','role3','role4','role5'].map(k => interaction.options.getRole(k)?.id).filter(Boolean);
      db.updateGuildConfig(interaction.guildId, { self_assignable_roles: JSON.stringify(ids) });
      return interaction.reply({ content: `✅ Self-assignable roles: ${ids.map(id => `<@&${id}>`).join(', ')}\nUsers can get these via DM with Pela.`, ephemeral: true });
    }

    if (sub === 'staff-channel') {
      const ch = interaction.options.getChannel('channel');
      db.updateGuildConfig(interaction.guildId, { staff_channel_id: ch.id });
      return interaction.reply({ content: `✅ Approval requests will be sent to ${ch}.`, ephemeral: true });
    }

    if (sub === 'view') {
      const cfg       = db.getGuildConfig(interaction.guildId);
      const selfRoles = JSON.parse(cfg.self_assignable_roles || '[]');
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('👮 Staff Configuration').setColor(0x5865F2).addFields(
          { name: 'Staff Role',          value: cfg.staff_role_id    ? `<@&${cfg.staff_role_id}>` : 'Not set', inline: true },
          { name: 'Approval Channel',    value: cfg.staff_channel_id ? `<#${cfg.staff_channel_id}>` : 'Not set (uses first staff channel found)', inline: true },
          { name: 'Self-Assignable Roles', value: selfRoles.length ? selfRoles.map(id => `<@&${id}>`).join(', ') : 'None configured' },
        )],
        ephemeral: true,
      });
    }
  },
};