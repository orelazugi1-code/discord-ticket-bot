const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure auto-moderation settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(o => o.setName('spam').setDescription('Enable/disable anti-spam filter'))
    .addBooleanOption(o => o.setName('links').setDescription('Enable/disable link filter'))
    .addBooleanOption(o => o.setName('mentions').setDescription('Enable/disable max-mention filter'))
    .addIntegerOption(o => o.setName('max_mentions').setDescription('Max mentions per message (1-20)').setMinValue(1).setMaxValue(20))
    .addStringOption(o => o.setName('badword_add').setDescription('Add a word to the bad-word filter'))
    .addStringOption(o => o.setName('badword_remove').setDescription('Remove a word from the bad-word filter')),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId) && !db.isUserPremium(interaction.user.id)) return interaction.reply({ content: '👑 **Premium בלבד!** כתבו /shop לפרטים.', ephemeral: true });

    const cfg = db.getAutomodConfig(interaction.guild.id);

    const spam       = interaction.options.getBoolean('spam');
    const links      = interaction.options.getBoolean('links');
    const mentions   = interaction.options.getBoolean('mentions');
    const maxMentions = interaction.options.getInteger('max_mentions');
    const addWord    = interaction.options.getString('badword_add')?.toLowerCase().trim();
    const removeWord = interaction.options.getString('badword_remove')?.toLowerCase().trim();

    const hasChanges = spam !== null || links !== null || mentions !== null || maxMentions !== null || addWord || removeWord;

    if (!hasChanges) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🤖 AutoMod Settings')
          .setColor(0x5865F2)
          .addFields(
            { name: 'Anti-Spam',      value: cfg.anti_spam_enabled      ? '✅ On' : '❌ Off', inline: true },
            { name: 'Link Filter',    value: cfg.link_filter_enabled    ? '✅ On' : '❌ Off', inline: true },
            { name: 'Mention Filter', value: cfg.mention_filter_enabled ? '✅ On' : '❌ Off', inline: true },
            { name: 'Max Mentions',   value: String(cfg.max_mentions),                        inline: true },
            { name: 'Bad Words',      value: cfg.bad_words.length ? cfg.bad_words.join(', ') : 'None' },
          )
          .setFooter({ text: 'Use options to change settings.' })],
        ephemeral: true,
      });
    }

    const updates = {};
    if (spam     !== null) updates.anti_spam_enabled      = spam     ? 1 : 0;
    if (links    !== null) updates.link_filter_enabled    = links    ? 1 : 0;
    if (mentions !== null) updates.mention_filter_enabled = mentions ? 1 : 0;
    if (maxMentions !== null) updates.max_mentions        = maxMentions;

    if (addWord || removeWord) {
      let words = [...cfg.bad_words];
      if (addWord && !words.includes(addWord)) words.push(addWord);
      if (removeWord) words = words.filter(w => w !== removeWord);
      updates.bad_words = words;
    }

    db.updateAutomodConfig(interaction.guild.id, updates);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription('✅ AutoMod settings updated!')], ephemeral: true });
  },
};
