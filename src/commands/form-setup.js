const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('form-setup')
    .setDescription('Create or manage form/survey panels')
    .addSubcommand(s => s.setName('create')
      .setDescription('Create a new form panel')
      .addStringOption(o => o.setName('title').setDescription('Form title').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Embed description'))
      .addChannelOption(o => o.setName('log-channel').setDescription('Channel to log responses'))
      .addStringOption(o => o.setName('button-label').setDescription('Button text (default: Open Form)'))
      .addStringOption(o => o.setName('mode').setDescription('Interaction mode').addChoices(
        { name: 'Form — text questions via modal', value: 'form' },
        { name: 'Yes / No buttons', value: 'yesno' },
        { name: 'Role only — single click assigns a role', value: 'role' },
      ))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign on submission/click'))
      .addStringOption(o => o.setName('accept-message').setDescription('Message to DM on Yes / submission'))
      .addStringOption(o => o.setName('decline-message').setDescription('Message to DM on No answer')),
    )
    .addSubcommand(s => s.setName('delete')
      .setDescription('Delete a form')
      .addIntegerOption(o => o.setName('id').setDescription('Form ID').setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const title         = interaction.options.getString('title');
      const channel       = interaction.options.getChannel('channel');
      const description   = interaction.options.getString('description') || '';
      const logChannel    = interaction.options.getChannel('log-channel');
      const buttonLabel   = interaction.options.getString('button-label') || 'Open Form';
      const mode          = interaction.options.getString('mode') || 'form';
      const role          = interaction.options.getRole('role');
      const acceptMsg     = interaction.options.getString('accept-message') || '';
      const declineMsg    = interaction.options.getString('decline-message') || '';

      const formId = db.createForm(
        interaction.guild.id, title, description,
        channel.id, logChannel?.id ?? null, buttonLabel, mode,
        role?.id ?? null, acceptMsg, declineMsg,
      );

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description || '​')
        .setColor(0x5865f2)
        .setFooter({ text: `Form ID: ${formId} • Add questions via the dashboard` });

      let row;
      if (mode === 'yesno') {
        row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`form:yes:${formId}`).setLabel('✅ Yes').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`form:no:${formId}`).setLabel('❌ No').setStyle(ButtonStyle.Danger),
        );
      } else {
        row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`form:open:${formId}`).setLabel(buttonLabel).setStyle(ButtonStyle.Primary),
        );
      }

      const msg = await channel.send({ embeds: [embed], components: [row] });
      db.setFormMessageId(formId, msg.id);

      await interaction.reply({
        content: `✅ Form **"${title}"** created (ID: ${formId}).\nPosted in ${channel}.\nAdd text questions from the **Dashboard → Forms** section.`,
        ephemeral: true,
      });
    }

    if (sub === 'delete') {
      const formId = interaction.options.getInteger('id');
      const form = db.getForm(formId);
      if (!form || form.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Form not found.', ephemeral: true });
      }
      db.deleteForm(formId);
      await interaction.reply({ content: `✅ Form **"${form.title}"** deleted.`, ephemeral: true });
    }
  },
};