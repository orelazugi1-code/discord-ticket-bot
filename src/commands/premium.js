const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const OWNER_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Manage premium access (owner only)')
    .addSubcommand(s => s.setName('grant').setDescription('Grant premium to this server'))
    .addSubcommand(s => s.setName('revoke').setDescription('Revoke premium from this server'))
    .addSubcommand(s => s.setName('check').setDescription('Check if this server has premium')),
  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'check') {
      const has = db.isPremium(interaction.guildId);
      return interaction.reply({ content: has ? '👑 לשרת הזה יש **Premium** פעיל!' : '❌ לשרת הזה אין Premium. כתבו `/shop` לפרטים.', ephemeral: true });
    }

    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ רק היוצר יכול לנהל Premium.', ephemeral: true });
    }

    if (sub === 'grant') {
      db.addPremium(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('👑 Premium הופעל!')
        .setDescription('השרת הזה שודרג ל-**Pela Premium**!\n\nכל הפיצ\'רים המתקדמים זמינים עכשיו:\n🤖 AI | 🎨 Welcome/Goodbye | 🎫 טיקטים | 📋 טפסים | 🛡️ AutoMod | ⭐ XP | 🎨 Glow | 🔧 Banners');
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'revoke') {
      db.removePremium(interaction.guildId);
      return interaction.reply({ content: '❌ Premium הוסר מהשרת הזה.', ephemeral: true });
    }
  },
};
