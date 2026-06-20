const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const COLORS = {
  red: 0xE74C3C, blue: 0x3498DB, green: 0x2ECC71, yellow: 0xF1C40F,
  purple: 0x9B59B6, pink: 0xE91E63, orange: 0xE67E22, cyan: 0x1ABC9C,
  white: 0xFFFFFF, black: 0x2C2F33, gold: 0xFFD700,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Create a custom embed message with optional image')
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Color name or hex (#FF0000)').setRequired(false))
    .addStringOption(o => o.setName('image').setDescription('Image URL (full size)').setRequired(false))
    .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL (small, top-right)').setRequired(false))
    .addStringOption(o => o.setName('footer').setDescription('Footer text').setRequired(false))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send to (default: current)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const colorInput = interaction.options.getString('color');
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');
    const footer = interaction.options.getString('footer');
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    let color = 0x7C5AF7;
    if (colorInput) {
      const lower = colorInput.toLowerCase().replace(/\s/g, '');
      if (COLORS[lower]) color = COLORS[lower];
      else if (/^#?[0-9a-f]{6}$/i.test(lower)) color = parseInt(lower.replace('#', ''), 16);
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter({ text: footer });

    try {
      await channel.send({ embeds: [embed] });
      await interaction.reply({
        content: channel.id === interaction.channel.id
          ? '✅ Embed sent!'
          : `✅ Embed sent to ${channel}!`,
        ephemeral: true,
      });
    } catch {
      await interaction.reply({ content: '❌ Failed to send embed. Check bot permissions in that channel.', ephemeral: true });
    }
  },
};
