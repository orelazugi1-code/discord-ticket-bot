const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('List all custom !commands'),

  async execute(interaction, db) {
    const all     = db.getCustomCommands(interaction.guild.id);
    const isAdmin = interaction.member.permissions.has('Administrator');
    const list    = isAdmin ? all : all.filter(c => !c.admin_only);

    if (!list.length) {
      return interaction.reply({ content: '📭 No custom commands set up yet.', ephemeral: true });
    }

    const lines = list.map(c => {
      const preview = c.response.length > 60 ? c.response.slice(0, 57) + '…' : c.response;
      return `\`!${c.name}\`${c.admin_only ? ' 🔒' : ''} — ${preview}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📋 Custom Commands')
      .setColor(0x5865F2)
      .setDescription(lines.join('\n'))
      .setFooter({ text: '🔒 = Admin only' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
