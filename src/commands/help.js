const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CATEGORIES = {
  moderation: {
    emoji: '🛡️',
    label: 'ניהול ומודרציה',
    commands: [
      { name: 'ban', desc: 'באן למשתמש מהשרת' },
      { name: 'kick', desc: 'העף משתמש מהשרת' },
      { name: 'warn', desc: 'תן אזהרה למשתמש' },
      { name: 'warnings', desc: 'צפה באזהרות של משתמש' },
      { name: 'clear-warn', desc: 'מחק אזהרות ממשתמש' },
      { name: 'timeout', desc: 'השתק משתמש לזמן מוגבל' },
      { name: 'unmute', desc: 'בטל השתקה למשתמש' },
      { name: 'tempban', desc: 'באן זמני למשתמש' },
      { name: 'purge', desc: 'מחק הודעות בבאלק' },
      { name: 'lock', desc: 'נעל ערוץ' },
      { name: 'unlock', desc: 'פתח ערוץ נעול' },
      { name: 'slowmode', desc: 'הגדר סלואומוד לערוץ' },
      { name: 'nick', desc: 'שנה כינוי למשתמש' },
      { name: 'role', desc: 'הוסף/הסר תפקיד ממשתמש' },
      { name: 'temprole', desc: 'תן תפקיד זמני למשתמש' },
      { name: 'control', desc: 'שלוט במה שמשתמש כותב' },
    ],
  },
  tickets: {
    emoji: '🎫',
    label: 'טיקטים',
    commands: [
      { name: 'ticket-setup', desc: 'צור פאנל טיקטים בערוץ' },
      { name: 'close', desc: 'סגור טיקט פתוח' },
      { name: 'ticketadd', desc: 'הוסף משתמש לטיקט' },
      { name: 'ticketremove', desc: 'הסר משתמש מטיקט' },
      { name: 'ticket-stats', desc: 'סטטיסטיקות טיקטים' },
    ],
  },
  setup: {
    emoji: '⚙️',
    label: 'הגדרות שרת',
    commands: [
      { name: 'pela-setup', desc: 'הגדרה אוטומטית של מבנה השרת עם AI' },
      { name: 'design-server', desc: 'AI בונה שרת שלם מתיאור שלך' },
      { name: 'welcome-setup', desc: 'הגדר כרטיסי ברוכים הבאים' },
      { name: 'goodbye-setup', desc: 'הגדר כרטיסי שלום' },
      { name: 'automod', desc: 'הגדר מודרציה אוטומטית' },
      { name: 'button-roles', desc: 'צור פאנל תפקידים עם כפתורים' },
      { name: 'form-setup', desc: 'צור טפסים וכפתורי אישור' },
      { name: 'staff-setup', desc: 'הגדר תפקידי צוות ותפקידים עצמיים' },
      { name: 'ai-chat', desc: 'הגדר ערוץ צ\'אט AI' },
      { name: 'set-level-role', desc: 'הגדר תפקיד אוטומטי ללבל' },
    ],
  },
  xp: {
    emoji: '⭐',
    label: 'XP ולבלים',
    commands: [
      { name: 'rank', desc: 'צפה בדרגה שלך או של מישהו' },
      { name: 'leaderboard', desc: 'טבלת המובילים ב-XP' },
      { name: 'give-xp', desc: 'תן XP למשתמש (אדמין)' },
      { name: 'remove-xp', desc: 'הסר XP ממשתמש (אדמין)' },
      { name: 'reset-xp', desc: 'אפס XP ולבל למשתמש (אדמין)' },
      { name: 'glow', desc: 'הפעל אפקט זוהר להודעות שלך' },
    ],
  },
  utility: {
    emoji: '🔧',
    label: 'כלים ופאן',
    commands: [
      { name: 'avatar', desc: 'הצג אווטאר של משתמש' },
      { name: 'whois', desc: 'מידע על משתמש' },
      { name: 'serverinfo', desc: 'מידע על השרת' },
      { name: 'poll', desc: 'צור סקר' },
      { name: 'remind', desc: 'הגדר תזכורת' },
      { name: 'roll', desc: 'הטל קוביות' },
      { name: 'coinflip', desc: 'הטלת מטבע' },
      { name: '8ball', desc: 'שאל את כדור הקסם' },
      { name: 'embed', desc: 'צור הודעה מעוצבת (embed) עם תמונה, צבע ועוד' },
      { name: 'say', desc: 'גרום לבוט לשלוח הודעה' },
      { name: 'cyber', desc: 'פקודות בסגנון האקר' },
      { name: 'report', desc: 'שלח דיווח ליוצר הבוט' },
      { name: 'commands', desc: 'רשימת פקודות !מותאמות' },
      { name: 'add-command', desc: 'הוסף פקודת !טקסט' },
      { name: 'remove-command', desc: 'מחק פקודת !טקסט' },
      { name: 'help', desc: 'ההודעה הזו!' },
    ],
  },
};

function buildCategoryEmbed(key) {
  const cat = CATEGORIES[key];
  const lines = cat.commands.map(c => `\`/${c.name}\` — ${c.desc}`);
  return new EmbedBuilder()
    .setColor(0x7C5AF7)
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Pela Bot • /help' });
}

function buildMainEmbed() {
  const lines = Object.entries(CATEGORIES).map(([, cat]) =>
    `${cat.emoji} **${cat.label}** — ${cat.commands.length} פקודות`
  );
  return new EmbedBuilder()
    .setColor(0x7C5AF7)
    .setTitle('📖 Pela — מרכז העזרה')
    .setDescription(`בחר קטגוריה מהתפריט למטה כדי לראות את כל הפקודות.\n\n${lines.join('\n')}`)
    .setFooter({ text: `סה"כ ${Object.values(CATEGORIES).reduce((s, c) => s + c.commands.length, 0)} פקודות` });
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('הצג את כל הפקודות של פלא'),
  async execute(interaction) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('pela_help_select')
      .setPlaceholder('בחר קטגוריה...')
      .addOptions([
        { label: 'דף ראשי', value: 'main', emoji: '📖' },
        ...Object.entries(CATEGORIES).map(([key, cat]) => ({
          label: cat.label,
          value: key,
          emoji: cat.emoji,
        })),
      ]);
    const row = new ActionRowBuilder().addComponents(menu);
    const msg = await interaction.reply({ embeds: [buildMainEmbed()], components: [row], fetchReply: true });
    const collector = msg.createMessageComponentCollector({ time: 180_000 });
    collector.on('collect', async i => {
      const embed = i.values[0] === 'main' ? buildMainEmbed() : buildCategoryEmbed(i.values[0]);
      await i.update({ embeds: [embed], components: [row] });
    });
    collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
  },
};
