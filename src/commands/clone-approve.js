const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const OWNER_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clone-approve')
    .setDescription('Grant or revoke permission to use /clone-server')
    .addUserOption(o => o.setName('user').setDescription('User to approve or revoke').setRequired(true))
    .addBooleanOption(o => o.setName('revoke').setDescription('Revoke access instead of granting').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Only the bot owner can use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const revoke = interaction.options.getBoolean('revoke') ?? false;

    if (revoke) {
      db.removeCloneApproval(target.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xf75a5a)
          .setDescription(`🚫 Removed clone permission from **${target.tag}** (\`${target.id}\`)`)],
        ephemeral: true,
      });
    }

    db.addCloneApproval(target.id, interaction.user.id);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`✅ Granted clone permission to **${target.tag}** (\`${target.id}\`)`)],
      ephemeral: true,
    });
  },
};