const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const https = require('https');

function generateImage(prompt) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=384&nologo=true`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'PelaBot/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, res2 => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
          res2.on('error', reject);
        }).on('error', reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Generate an AI banner image for your channel')
    .addStringOption(o => o.setName('description').setDescription('Describe the banner you want').setRequired(true))
    .addStringOption(o => o.setName('style').setDescription('Art style').setRequired(false)
      .addChoices(
        { name: '🎮 Gaming', value: 'gaming esports neon' },
        { name: '🌌 Space', value: 'cosmic galaxy nebula' },
        { name: '🏙️ Cyberpunk', value: 'cyberpunk neon city futuristic' },
        { name: '🌿 Nature', value: 'nature forest peaceful' },
        { name: '🎨 Anime', value: 'anime art style colorful' },
        { name: '⚔️ Medieval', value: 'medieval fantasy epic' },
        { name: '🔥 Fire', value: 'fire flames dark dramatic' },
        { name: '💎 Luxury', value: 'luxury gold premium elegant' },
      ))
    .addChannelOption(o => o.setName('channel').setDescription('Send to this channel (default: current)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **Premium בלבד!** כתבו /shop לפרטים.', ephemeral: true });

    const description = interaction.options.getString('description');
    const style = interaction.options.getString('style') || '';
    const targetChannel = interaction.options.getChannel('channel');
    const channel = targetChannel
      ? await interaction.guild.channels.fetch(targetChannel.id).catch(() => null) || interaction.channel
      : interaction.channel;

    await interaction.reply({ content: '🎨 מייצר באנר... זה יכול לקחת כמה שניות', ephemeral: true });

    const prompt = `Discord server banner, wide format, professional, high quality, ${style}, ${description}, no text, no watermark`;

    try {
      const imgBuffer = await generateImage(prompt);

      if (imgBuffer.length < 5000) {
        return interaction.editReply({ content: '❌ לא הצלחתי לייצר תמונה. נסה תיאור אחר.' });
      }

      const attachment = new AttachmentBuilder(imgBuffer, { name: 'banner.png' });
      const embed = new EmbedBuilder()
        .setColor(0x7C5AF7)
        .setTitle('🎨 Banner Generated')
        .setImage('attachment://banner.png')
        .setFooter({ text: `Prompt: ${description}` });

      await channel.send({ embeds: [embed], files: [attachment] });
      await interaction.editReply({ content: `✅ באנר נשלח ל-${channel}!` });
    } catch (e) {
      console.error('[banner] error:', e.message);
      await interaction.editReply({ content: '❌ שגיאה ביצירת הבאנר. נסה שוב.' });
    }
  },
};
