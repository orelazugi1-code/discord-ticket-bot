const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CREATOR_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Send a report to the bot creator')
    .addStringOption(o =>
      o.setName('text')
        .setDescription('Describe the issue briefly')
        .setRequired(true),
    ),
  async execute(interaction) {
    const text = interaction.options.getString('text');
    const user = interaction.user;
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setColor(0x7c5af7)
      .setTitle('📩 New Report')
      .addFields(
        { name: '👤 From', value: `${user.tag} (${user.id})`, inline: true },
        { name: '🏠 Server', value: guild ? `${guild.name} (${guild.id})` : 'DM', inline: true },
        { name: '📝 Report', value: text },
      )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    try {
      const creator = await interaction.client.users.fetch(CREATOR_ID);
      await creator.send({ embeds: [embed] });
      const logCh = await interaction.client.channels.fetch('1517919493534257363').catch(() => null);
      if (logCh) await logCh.send({ embeds: [embed] });
      await interaction.reply({
        content: '✅ Report sent to the creator! They will get back to you soon.',
        ephemeral: true,
      });
    } catch {
      await interaction.reply({
        content: '❌ Failed to send the report. Try again later.',
        ephemeral: true,
      });
    }
  },
};
