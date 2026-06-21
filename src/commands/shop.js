const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Pela Premium — upgrade your server'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('👑 Pela Premium — שדרגו את השרת שלכם')
      .setDescription(
        '**מה מקבלים עם Premium:**\n\n' +
        '🤖 **צ\'אט AI חכם** — פלא עונה בפרטי ובשרת, מנהלת שיחות, מראיינת צוות\n\n' +
        '🎨 **Welcome & Goodbye Cards** — כרטיסים מעוצבים לכניסה ויציאה\n\n' +
        '🎫 **מערכת טיקטים מתקדמת** — שאלות מותאמות, קטגוריות, סגירה אוטומטית\n\n' +
        '📋 **טפסים עם אישור צוות** — מועמדות, דיווחים, בקשות\n\n' +
        '🛡️ **AutoMod חכם** — פילטר ספאם, לינקים, מילים אסורות\n\n' +
        '🎭 **Button Roles** — פאנל תפקידים עם כפתורים\n\n' +
        '⭐ **XP & Levels** — מערכת לבלים עם תפקידים אוטומטיים\n\n' +
        '🎨 **Glow Effects** — אפקט זוהר להודעות\n\n' +
        '🔧 **Embed & Banner** — הודעות מעוצבות + באנרים עם AI\n\n' +
        '🏗️ **Server Design** — AI בונה מבנה שרת שלם\n\n' +
        '💰 **מחיר: החל מ-10 ₪ בלבד!**\n\n' +
        '_לחצו למטה כדי לדבר עם היוצר ולסגור מחיר_'
      )
      .setFooter({ text: 'Pela Bot Premium • תמיכה אישית מהיוצר' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('💳 אני רוצה Premium!').setURL('https://discord.com/users/1266854019767341107'),
      new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId('pela_shop_free').setLabel('🆓 מה בחינם?'),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
