const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription("Change a user's nickname")
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('nickname').setDescription('New nickname (leave empty to reset)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const nick = interaction.options.getString('nickname') || null;
    await member.setNickname(nick);
    await interaction.reply({ content: `✅ Nickname ${nick ? `set to **${nick}**` : 'reset'} for ${member}.`, ephemeral: true });
  },
};