const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CREATOR_ID = '1266854019767341107';
const LOG_CH_ID = '1517919493534257363';

const KNOWN_ISSUES = [
  { keywords: ['פקודות לא עובדות', 'commands not working', 'לא עובד', 'not working', 'איקס', 'error', 'שגיאה'],
    response: 'נראה שיש בעיה עם הפקודות בשרת שלך. ננסה לרשום אותן מחדש — אם זה לא עוזר, היוצר יטפל בזה בהקדם.',
    canFix: 'commands' },
  { keywords: ['כפולות', 'משוכפלות', 'duplicate', 'כפילויות', 'שכפול', 'פעמיים'],
    response: 'כפילויות בפקודות קורות כשיש גרסה ישנה וחדשה ביחד. ניקינו את הישנות — זה ייעלם תוך עד שעה (קאש של דיסקורד).',
    canFix: 'duplicates' },
  { keywords: ['טיקט', 'ticket', 'לפתוח', 'open ticket'],
    response: 'אם טיקטים לא נפתחים — צריך לוודא שהפעלתם `/ticket-setup` בשרת. אם כבר הפעלתם ועדיין לא עובד, היוצר יבדוק.',
    canFix: null },
  { keywords: ['הרשאה', 'permission', 'אין הרשאה', 'missing permission', 'אין גישה'],
    response: 'נראה שלפלא חסרות הרשאות בשרת. תוודא שלפלא יש את ההרשאות הנדרשות: Manage Messages, Manage Webhooks, Send Messages.',
    canFix: null },
  { keywords: ['glow', 'גלואו', 'זוהר'],
    response: 'הגלואו עובד על ידי webhook — הוא שולח את ההודעה שלך מחדש עם אמוג\'י ליד השם. צריך הרשאות Manage Messages + Manage Webhooks בשרת.',
    canFix: null },
  { keywords: ['embed', 'אמבד', 'אמדאד', 'תמונה', 'image'],
    response: 'לגבי /embed — אפשר להעלות תמונה ישירות או להדביק קישור בשדה image-url. טיפ: שלח תמונה בערוץ כלשהו, לחץ עליה ימנית, בחר "Copy image address" והדבק.',
    canFix: null },
  { keywords: ['ai', 'צאט', 'chat', 'לדבר', 'שיחה'],
    response: 'אפשר לדבר עם פלא ב-3 דרכים:\n1. שלח הודעה בפרטי (DM) ישירות\n2. תייג אותה (@Pela) בכל ערוץ\n3. הגדר ערוץ AI עם `/ai-chat`',
    canFix: null },
  { keywords: ['help', 'עזרה', 'פקודות', 'commands', 'מה אפשר'],
    response: 'כתוב `/help` כדי לראות את כל הפקודות מסודרות לפי קטגוריות!',
    canFix: null },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Send a report to the bot creator')
    .addStringOption(o =>
      o.setName('text')
        .setDescription('Describe the issue briefly')
        .setRequired(true),
    ),
  async execute(interaction, db) {
    const text = interaction.options.getString('text');
    const user = interaction.user;
    const guild = interaction.guild;

    const reportEmbed = new EmbedBuilder()
      .setColor(0x7c5af7)
      .setTitle('📩 New Report')
      .addFields(
        { name: '👤 From', value: `${user.tag} (${user.id})`, inline: true },
        { name: '🏠 Server', value: guild ? `${guild.name} (${guild.id})` : 'DM', inline: true },
        { name: '📝 Report', value: text },
      )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ content: '✅ הדיווח נשלח! פלא תנתח את הבעיה ותחזור אליך בהקדם.', ephemeral: true });

    // Send to creator + log
    try {
      const creator = await interaction.client.users.fetch(CREATOR_ID);
      await creator.send({ embeds: [reportEmbed] });
    } catch {}
    try {
      const logCh = await interaction.client.channels.fetch(LOG_CH_ID).catch(() => null);
      if (logCh) await logCh.send({ embeds: [reportEmbed] });
    } catch {}

    // Auto-analyze and respond
    const lower = text.toLowerCase();
    let matched = KNOWN_ISSUES.find(issue => issue.keywords.some(k => lower.includes(k)));

    let responseText;
    if (matched) {
      responseText = matched.response;
    } else {
      responseText = 'תודה על הדיווח! לא זיהינו בעיה מוכרת — העברנו את זה ליוצר והוא יטפל בזה בהקדם.';
    }

    // Try to auto-fix commands if needed
    if (matched?.canFix === 'commands' && guild) {
      try {
        const { REST, Routes } = require('discord.js');
        const rest = new REST().setToken((process.env.BOT_TOKEN || '').trim());
        const refGuild = '1504881500943024128';
        const existing = await rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID, refGuild));
        if (Array.isArray(existing) && existing.length > 0) {
          const clean = existing.map(c => ({ name: c.name, description: c.description, options: c.options, type: c.type, default_member_permissions: c.default_member_permissions }));
          await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id), { body: clean });
          responseText += '\n\n✅ רשמנו מחדש את כל הפקודות בשרת שלך אוטומטית!';
        }
      } catch (e) {
        console.error('[report] auto-fix commands error:', e.message);
      }
    }

    if (matched?.canFix === 'duplicates') {
      try {
        const { REST, Routes } = require('discord.js');
        const rest = new REST().setToken((process.env.BOT_TOKEN || '').trim());
        const global = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
        if (Array.isArray(global) && global.length > 0) {
          await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
          responseText += '\n\n✅ מחקנו פקודות גלובליות ישנות אוטומטית!';
        }
      } catch (e) {
        console.error('[report] auto-fix duplicates error:', e.message);
      }
    }

    // Send auto-response to reporter via DM
    try {
      const responseEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ הדיווח שלך טופל!')
        .setDescription(`היי ${user.displayName || user.username}! 👋\n\n${responseText}\n\nאם עדיין יש בעיה — לחץ על הכפתור למטה 💪`)
        .setFooter({ text: 'Pela Bot' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('report_solved').setLabel('✅ הבעיה נפתרה').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('report_unsolved').setLabel('❌ הבעיה לא נפתרה').setStyle(ButtonStyle.Danger),
      );

      const dm = await user.createDM();
      await dm.send({ embeds: [responseEmbed], components: [row] });

      // Log the response
      try {
        const logCh = await interaction.client.channels.fetch(LOG_CH_ID).catch(() => null);
        if (logCh) await logCh.send({ embeds: [responseEmbed] });
      } catch {}
    } catch (e) {
      console.error('[report] auto-response DM error:', e.message);
    }
  },
};
