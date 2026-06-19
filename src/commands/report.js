const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CREATOR_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('שלח דיווח ליוצר הבוט — הוא יעזור לך בהכל')
    .addStringOption(o =>
      o.setName('text')
        .setDescription('מה הבעיה? תאר בקצרה')
        .setRequired(true),
    ),
  async execute(interaction) {
    const text = interaction.options.getString('text');
    const user = interaction.user;
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setColor(0x7c5af7)
      .setTitle('📩 דיווח חדש')
      .addFields(
        { name: '👤 מי שלח', value: `${user.tag} (${user.id})`, inline: true },
        { name: '🏠 שרת', value: guild ? `${guild.name} (${guild.id})` : 'DM', inline: true },
        { name: '📝 דיווח', value: text },
      )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    try {
      const creator = await interaction.client.users.fetch(CREATOR_ID);
      await creator.send({ embeds: [embed] });
      await interaction.reply({
        content: '✅ הדיווח נשלח ליוצר! הוא יחזור אליך בהקדם.',
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content: '❌ לא הצלחתי לשלוח את הדיווח. נסה שוב מאוחר יותר.',
        ephemeral: true,
      });
    }
  },
};
