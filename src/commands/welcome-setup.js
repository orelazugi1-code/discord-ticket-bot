const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome-setup')
    .setDescription('Configure welcome and goodbye messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('welcome_channel').setDescription('Channel for welcome messages').addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('welcome_message').setDescription('Welcome message ({user}, {server}, {membercount})').setMaxLength(500))
    .addChannelOption(o => o.setName('goodbye_channel').setDescription('Channel for goodbye messages').addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('goodbye_message').setDescription('Goodbye message ({user}, {server})').setMaxLength(500))
    .addBooleanOption(o => o.setName('welcome_enabled').setDescription('Enable/disable welcome messages'))
    .addBooleanOption(o => o.setName('goodbye_enabled').setDescription('Enable/disable goodbye messages')),

  async execute(interaction, db) {
    const updates = {};
    const wCh  = interaction.options.getChannel('welcome_channel');
    const wMsg = interaction.options.getString('welcome_message');
    const gCh  = interaction.options.getChannel('goodbye_channel');
    const gMsg = interaction.options.getString('goodbye_message');
    const wOn  = interaction.options.getBoolean('welcome_enabled');
    const gOn  = interaction.options.getBoolean('goodbye_enabled');

    if (wCh  !== null) updates.welcome_channel_id = wCh.id;
    if (wMsg !== null) updates.welcome_message     = wMsg;
    if (gCh  !== null) updates.goodbye_channel_id  = gCh.id;
    if (gMsg !== null) updates.goodbye_message      = gMsg;
    if (wOn  !== null) updates.welcome_enabled      = wOn ? 1 : 0;
    if (gOn  !== null) updates.goodbye_enabled      = gOn ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      const cfg = db.getGuildConfig(interaction.guild.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('👋 Welcome / Goodbye Config')
          .setColor(0x5865F2)
          .addFields(
            { name: 'Welcome Enabled',  value: cfg.welcome_enabled ? '✅ Yes' : '❌ No',      inline: true },
            { name: 'Welcome Channel',  value: cfg.welcome_channel_id ? `<#${cfg.welcome_channel_id}>` : 'Not set', inline: true },
            { name: 'Welcome Message',  value: cfg.welcome_message  ?? 'Default' },
            { name: 'Goodbye Enabled',  value: cfg.goodbye_enabled  ? '✅ Yes' : '❌ No',      inline: true },
            { name: 'Goodbye Channel',  value: cfg.goodbye_channel_id ? `<#${cfg.goodbye_channel_id}>` : 'Not set', inline: true },
            { name: 'Goodbye Message',  value: cfg.goodbye_message  ?? 'Default' },
          )
          .setFooter({ text: 'Use options to change settings.' })],
        ephemeral: true,
      });
    }

    db.updateGuildConfig(interaction.guild.id, updates);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ Welcome/goodbye settings updated!')], ephemeral: true });
  },
};
