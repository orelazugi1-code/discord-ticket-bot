const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const OWNER_ID = '1266854019767341107';
const UPDATE_CHANNEL_NAMES = ['updates', 'עדכונים', 'announcements', 'הודעות', 'news', 'חדשות', 'bot-updates'];
const GENERAL_CHANNEL_NAMES = ['general', 'כללי', 'chat', 'צאט', 'lobby'];

function findBestChannel(guild) {
  const text = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has('SendMessages'));
  for (const name of UPDATE_CHANNEL_NAMES) {
    const ch = text.find(c => c.name.toLowerCase().includes(name));
    if (ch) return ch;
  }
  for (const name of GENERAL_CHANNEL_NAMES) {
    const ch = text.find(c => c.name.toLowerCase().includes(name));
    if (ch) return ch;
  }
  return text.first() || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('שלח הודעת עדכון לכל השרתים ולמנויים (יוצר בלבד)')
    .addStringOption(o => o.setName('text').setDescription('תוכן ההודעה').setRequired(true)),
  async execute(interaction, db) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ רק היוצר יכול לשלוח עדכונים.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const text = interaction.options.getString('text');
    const embed = new EmbedBuilder()
      .setColor(0x7C5AF7)
      .setTitle('📢 עדכון מפלא')
      .setDescription(text)
      .setTimestamp()
      .setFooter({ text: 'Pela Bot Updates' });

    const subRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pela_subscribe').setLabel('📬 המשך לקבל עדכונים מפלא').setStyle(ButtonStyle.Success),
    );

    const unsubRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pela_unsubscribe').setLabel('🔕 הפסק עדכונים מפלא').setStyle(ButtonStyle.Secondary),
    );

    let serversSent = 0;
    let serversFailed = 0;
    for (const [, guild] of interaction.client.guilds.cache) {
      const ch = findBestChannel(guild);
      if (ch) {
        try {
          await ch.send({ embeds: [embed], components: [subRow] });
          serversSent++;
        } catch { serversFailed++; }
      } else { serversFailed++; }
    }

    let dmSent = 0;
    let dmFailed = 0;
    const subs = db.getAllSubscribers();
    for (const { user_id } of subs) {
      try {
        const user = await interaction.client.users.fetch(user_id);
        await user.send({ embeds: [embed], components: [unsubRow] });
        dmSent++;
      } catch { dmFailed++; }
    }

    await interaction.editReply({
      content: `✅ **עדכון נשלח!**\n` +
        `📡 שרתים: ${serversSent} הצליחו, ${serversFailed} נכשלו\n` +
        `📬 מנויים: ${dmSent} הצליחו, ${dmFailed} נכשלו`,
    });
  },
};
