const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-command')
    .setDescription('Remove a custom !text command')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('name').setDescription('Command name to remove').setRequired(true)),

  async execute(interaction, db) {
    const name = interaction.options.getString('name').toLowerCase();
    const cmd  = db.getCustomCommand(interaction.guild.id, name);

    if (!cmd) {
      return interaction.reply({ content: `❌ Command \`!${name}\` not found.`, ephemeral: true });
    }

    db.deleteCustomCommand(interaction.guild.id, name);
    await interaction.reply({ content: `✅ Command \`!${name}\` removed.`, ephemeral: true });
  },
};
