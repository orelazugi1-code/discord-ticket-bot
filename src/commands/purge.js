const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk-delete messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1–100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user')),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    try {
      let messages = await interaction.channel.messages.fetch({ limit: 100 });

      // Discord bulk-delete only works on messages < 14 days old
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      messages = messages.filter(m => m.createdTimestamp > twoWeeksAgo);

      if (filterUser) messages = messages.filter(m => m.author.id === filterUser.id);

      messages = [...messages.values()].slice(0, amount);

      if (messages.length === 0) {
        return interaction.editReply('❌ No eligible messages found (messages must be under 14 days old).');
      }

      const deleted = await interaction.channel.bulkDelete(messages, true);
      await interaction.editReply(`✅ Deleted **${deleted.size}** message(s).`);
    } catch (err) {
      console.error('Purge error:', err);
      await interaction.editReply('❌ Failed to delete messages.');
    }
  },
};
