const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-command')
    .setDescription('Add a custom !text command')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('name').setDescription('Command name (without the ! prefix)').setRequired(true).setMaxLength(32))
    .addStringOption(o => o.setName('response').setDescription('Text the bot replies with').setRequired(true).setMaxLength(2000))
    .addBooleanOption(o => o.setName('admin_only').setDescription('Restrict to admins only')),

  async execute(interaction, db) {
    const name      = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '_');
    const response  = interaction.options.getString('response');
    const adminOnly = interaction.options.getBoolean('admin_only') ?? false;

    db.createCustomCommand(interaction.guild.id, name, response, adminOnly, interaction.user.id);

    await interaction.reply({
      content: `✅ Command \`!${name}\` created${adminOnly ? ' *(admin only)*' : ''}.`,
      ephemeral: true,
    });
  },
};
