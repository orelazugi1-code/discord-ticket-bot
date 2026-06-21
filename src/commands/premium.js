const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');

const OWNER_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Manage premium access'),
  async execute(interaction, db) {
    const isOwner = interaction.user.id === OWNER_ID;
    const serverHas = interaction.guildId ? db.isPremium(interaction.guildId) : false;
    const userHas = db.isUserPremium(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('👑 Premium Manager')
      .setDescription(
        `**שרת:** ${serverHas ? '✅ Premium פעיל' : '❌ אין Premium'}\n` +
        `**אתה:** ${userHas ? '⭐ User Premium פעיל' : '❌ אין User Premium'}\n\n` +
        (isOwner
          ? '🔧 **אתה היוצר — בחר פעולה:**'
          : '👑 רק היוצר יכול לנהל Premium.\nכתבו `/shop` לפרטים.')
      );

    if (!isOwner) {
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prem_server_grant').setLabel('👑 הוסף Premium לשרת').setStyle(serverHas ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('prem_server_revoke').setLabel('❌ הסר Premium מהשרת').setStyle(serverHas ? ButtonStyle.Danger : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('prem_list').setLabel('📋 רשימה').setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('prem_user_select').setPlaceholder('⭐ בחר משתמש לנהל User Premium...').setMinValues(1).setMaxValues(1),
    );

    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  },
};
