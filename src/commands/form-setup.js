const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('form-setup')
    .setDescription('Create and manage form/button panels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // ── Subcommand: modal (text questions) ───────────────────────────────────
    .addSubcommand(s => s
      .setName('modal')
      .setDescription('Form with up to 5 text questions; users fill in a modal')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post the button in').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Button / form name').setRequired(true).setMaxLength(80))
      .addStringOption(o => o.setName('q1').setDescription('Question 1 (required)').setRequired(true).setMaxLength(150))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel where responses are logged').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Embed description').setMaxLength(300))
      .addStringOption(o => o.setName('auto_response').setDescription('Private message sent to user after submission').setMaxLength(500))
      .addStringOption(o => o.setName('q2').setDescription('Question 2').setMaxLength(150))
      .addStringOption(o => o.setName('q3').setDescription('Question 3').setMaxLength(150))
      .addStringOption(o => o.setName('q4').setDescription('Question 4').setMaxLength(150))
      .addStringOption(o => o.setName('q5').setDescription('Question 5').setMaxLength(150))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign after submission'))
      .addRoleOption(o => o.setName('role2').setDescription('Second role to assign'))
      .addRoleOption(o => o.setName('role3').setDescription('Third role to assign'))
      .addStringOption(o => o.setName('yes_label').setDescription('Approve button label shown to staff (default: Accept)').setMaxLength(50))
      .addStringOption(o => o.setName('no_label').setDescription('Reject button label shown to staff (default: Reject)').setMaxLength(50))
      .addStringOption(o => o.setName('yes_response').setDescription('DM sent to user when staff approves').setMaxLength(500))
      .addStringOption(o => o.setName('no_response').setDescription('DM sent to user when staff rejects').setMaxLength(500))
      .addRoleOption(o => o.setName('yes_role').setDescription('Role assigned when staff approves'))
      .addRoleOption(o => o.setName('no_role').setDescription('Role assigned when staff rejects'))
    )

    // ── Subcommand: yesno ────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('yesno')
      .setDescription('Yes/No buttons; Yes opens a modal, No declines immediately')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post the panel in').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(80))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel where responses are logged').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Embed description').setMaxLength(300))
      .addStringOption(o => o.setName('q1').setDescription('Question 1 (shown when user clicks Yes)').setMaxLength(150))
      .addStringOption(o => o.setName('q2').setDescription('Question 2').setMaxLength(150))
      .addStringOption(o => o.setName('q3').setDescription('Question 3').setMaxLength(150))
      .addStringOption(o => o.setName('q4').setDescription('Question 4').setMaxLength(150))
      .addStringOption(o => o.setName('q5').setDescription('Question 5').setMaxLength(150))
      .addStringOption(o => o.setName('yes_response').setDescription('Message sent to user on Yes').setMaxLength(500))
      .addStringOption(o => o.setName('no_response').setDescription('Message sent to user on No').setMaxLength(500))
      .addRoleOption(o => o.setName('yes_role').setDescription('Role to assign on Yes'))
      .addRoleOption(o => o.setName('yes_role2').setDescription('Second role on Yes'))
      .addRoleOption(o => o.setName('no_role').setDescription('Role to assign on No'))
    )

    // ── Subcommand: rolebutton ───────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('rolebutton')
      .setDescription('One-click role assignment — no questions, just click and get role(s)')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post the button in').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Button name').setRequired(true).setMaxLength(80))
      .addRoleOption(o => o.setName('role1').setDescription('Role to assign').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Embed description').setMaxLength(300))
      .addRoleOption(o => o.setName('role2').setDescription('Second role'))
      .addRoleOption(o => o.setName('role3').setDescription('Third role'))
    )

    // ── Subcommand: delete ───────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete a form by its ID')
      .addIntegerOption(o => o.setName('id').setDescription('Form ID (shown when created, or check dashboard)').setRequired(true))
    ),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    // ── delete ───────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const formId = interaction.options.getInteger('id');
      const form   = db.getForm(formId);
      if (!form || form.guild_id !== interaction.guildId) {
        return interaction.reply({ content: '❌ Form not found.', ephemeral: true });
      }
      db.deleteForm(formId);
      return interaction.reply({ content: `✅ Form **"${form.title}"** (ID: ${formId}) deleted.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const channel     = interaction.options.getChannel('channel');
    const title       = interaction.options.getString('title');
    const description = interaction.options.getString('description') || '';

    // ── rolebutton ───────────────────────────────────────────────────────────
    if (sub === 'rolebutton') {
      const roles = ['role1', 'role2', 'role3']
        .map(k => interaction.options.getRole(k))
        .filter(Boolean);

      const formId = db.createForm(interaction.guildId, {
        title, description,
        channel_id: channel.id,
        mode: 'role',
        log_channel_id: null,
        auto_response: null,
      });
      for (const r of roles) db.addFormRole(formId, r.id, 'submit');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || 'Click the button to get your role(s).')
        .setColor(0x7c5af7)
        .setFooter({ text: `Roles: ${roles.map(r => r.name).join(', ')}` });

      const btn = new ButtonBuilder()
        .setCustomId(`form:open:${formId}`)
        .setLabel(title)
        .setStyle(ButtonStyle.Primary);

      const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      db.setFormMessageId(formId, msg.id);

      return interaction.editReply(
        `✅ Role button created in ${channel}!\n**Roles:** ${roles.map(r => r.name).join(', ')}\n**Form ID:** \`${formId}\``
      );
    }

    // ── modal ────────────────────────────────────────────────────────────────
    if (sub === 'modal') {
      const logChannel   = interaction.options.getChannel('log_channel');
      const autoResponse = interaction.options.getString('auto_response') || '✅ Thank you! Your response has been submitted.';
      const yesLabel     = interaction.options.getString('yes_label');
      const noLabel      = interaction.options.getString('no_label');
      const yesResponse  = interaction.options.getString('yes_response');
      const noResponse   = interaction.options.getString('no_response');
      const questions    = ['q1','q2','q3','q4','q5'].map(k => interaction.options.getString(k)).filter(Boolean);
      const submitRoles  = ['role','role2','role3'].map(k => interaction.options.getRole(k)).filter(Boolean);
      const yesRole      = interaction.options.getRole('yes_role');
      const noRole       = interaction.options.getRole('no_role');

      // If any approval option is set, this form uses the staff-review workflow
      const approvalMode = !!(yesLabel || noLabel || yesResponse || noResponse || yesRole || noRole);

      const formId = db.createForm(interaction.guildId, {
        title, description,
        channel_id:    channel.id,
        log_channel_id: logChannel.id,
        mode:          'modal',
        // In approval mode accept_message is the yes DM; otherwise it is the immediate DM
        accept_message:  approvalMode ? (yesResponse || '✅ Your application has been approved!') : autoResponse,
        decline_message: approvalMode ? (noResponse  || '❌ Your application has been declined.') : null,
        yes_label: approvalMode ? (yesLabel || 'Accept') : null,
        no_label:  approvalMode ? (noLabel  || 'Reject') : null,
      });
      questions.forEach((q, i) => db.addFormQuestion(formId, q, i));
      submitRoles.forEach(r => db.addFormRole(formId, r.id, 'submit'));
      if (yesRole) db.addFormRole(formId, yesRole.id, 'yes');
      if (noRole)  db.addFormRole(formId, noRole.id,  'no');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || 'Click the button below to fill out this form.')
        .setColor(0x7c5af7)
        .setFooter({ text: `${questions.length} question(s) · Form ID: ${formId}${approvalMode ? ' · Staff approval required' : ''}` });

      const btn = new ButtonBuilder()
        .setCustomId(`form:open:${formId}`)
        .setLabel(title)
        .setStyle(ButtonStyle.Primary);

      const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      db.setFormMessageId(formId, msg.id);

      const approvalNote = approvalMode
        ? `\n**Approval buttons:** "${yesLabel||'Accept'}" / "${noLabel||'Reject'}"`
        : '';
      return interaction.editReply(
        `✅ Form created in ${channel}!\n**Questions:** ${questions.length}\n**Log:** ${logChannel}${approvalNote}\n**Form ID:** \`${formId}\``
      );
    }

    // ── yesno ────────────────────────────────────────────────────────────────
    if (sub === 'yesno') {
      const logChannel  = interaction.options.getChannel('log_channel');
      const yesResponse = interaction.options.getString('yes_response') || '✅ Thank you for your response!';
      const noResponse  = interaction.options.getString('no_response')  || '❌ Your response has been recorded.';
      const questions   = ['q1','q2','q3','q4','q5'].map(k => interaction.options.getString(k)).filter(Boolean);
      const yesRoles    = ['yes_role','yes_role2'].map(k => interaction.options.getRole(k)).filter(Boolean);
      const noRoles     = ['no_role'].map(k => interaction.options.getRole(k)).filter(Boolean);

      const formId = db.createForm(interaction.guildId, {
        title, description,
        channel_id: channel.id,
        log_channel_id: logChannel.id,
        mode: 'yesno',
        auto_response: yesResponse,
        no_response: noResponse,
        decline_message: noResponse,
      });
      questions.forEach((q, i) => db.addFormQuestion(formId, q, i));
      yesRoles.forEach(r => db.addFormRole(formId, r.id, 'yes'));
      noRoles.forEach(r => db.addFormRole(formId, r.id, 'no'));

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || 'Please click Yes or No below.')
        .setColor(0x7c5af7)
        .setFooter({ text: `Form ID: ${formId}` });

      const yesBtn = new ButtonBuilder().setCustomId(`form:yes:${formId}`).setLabel('✅  Yes').setStyle(ButtonStyle.Success);
      const noBtn  = new ButtonBuilder().setCustomId(`form:no:${formId}`).setLabel('❌  No').setStyle(ButtonStyle.Danger);

      const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(yesBtn, noBtn)] });
      db.setFormMessageId(formId, msg.id);

      const rolesSummary = [
        yesRoles.length ? `Yes roles: ${yesRoles.map(r=>r.name).join(', ')}` : '',
        noRoles.length  ? `No roles: ${noRoles.map(r=>r.name).join(', ')}` : '',
      ].filter(Boolean).join(' | ');

      return interaction.editReply(
        `✅ Yes/No form created in ${channel}!\n**Questions:** ${questions.length}\n**Log:** ${logChannel}${rolesSummary ? `\n${rolesSummary}` : ''}\n**Form ID:** \`${formId}\``
      );
    }
  },
};