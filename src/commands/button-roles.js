const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('button-roles')
    .setDescription('Create a self-role panel with toggle buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post the panel in').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true).setMaxLength(256))
    .addRoleOption(o => o.setName('role1').setDescription('First role').setRequired(true))
    .addRoleOption(o => o.setName('role2').setDescription('Second role'))
    .addRoleOption(o => o.setName('role3').setDescription('Third role'))
    .addRoleOption(o => o.setName('role4').setDescription('Fourth role'))
    .addRoleOption(o => o.setName('role5').setDescription('Fifth role'))
    .addStringOption(o => o.setName('description').setDescription('Embed description').setMaxLength(1000)),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **פיצ'ר Premium!** כתבו /shop לפרטים.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel('channel');
    const title   = interaction.options.getString('title');
    const desc    = interaction.options.getString('description') ?? 'Click a button below to assign or remove the role.';

    const roles = [1, 2, 3, 4, 5]
      .map(i => interaction.options.getRole(`role${i}`))
      .filter(Boolean);

    const panelId = db.createButtonRole(interaction.guild.id, channel.id, title, desc, roles.map(r => r.id));

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setColor(0x5865F2)
      .addFields(roles.map(r => ({ name: r.name, value: `<@&${r.id}>`, inline: true })))
      .setFooter({ text: 'Click a button to toggle the role.' });

    // Up to 5 buttons per row
    const buttons = roles.map(r =>
      new ButtonBuilder()
        .setCustomId(`role:toggle:${panelId}:${r.id}`)
        .setLabel(r.name)
        .setStyle(ButtonStyle.Secondary),
    );
    const row = new ActionRowBuilder().addComponents(buttons);

    const msg = await channel.send({ embeds: [embed], components: [row] });
    db.updateButtonRoleMsgId(panelId, msg.id);

    await interaction.editReply(`✅ Role panel created in ${channel}!`);
  },
};
