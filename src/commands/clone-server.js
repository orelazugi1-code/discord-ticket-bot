const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const https = require('https');
const http  = require('http');

const OWNER_ID     = '1266854019767341107';
const LOG_GUILD_ID = '1501908080584298557';
const LOG_CH_NAME  = 'clone-logs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchBuf(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getIconDataUri(guild) {
  try {
    const url = guild.iconURL({ extension: 'png', size: 256, forceStatic: true });
    if (!url) return null;
    const buf = await fetchBuf(url);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { return null; }
}

function mapType(type) {
  if (type === ChannelType.GuildCategory)                                 return 4;
  if (type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice) return 2;
  return 0; // text, announcement, forum → text
}

async function ensureLogChannel(client) {
  const guild = client.guilds.cache.get(LOG_GUILD_ID);
  if (!guild) return null;
  let ch = guild.channels.cache.find(
    c => c.name === LOG_CH_NAME && c.type === ChannelType.GuildText,
  );
  if (!ch) {
    ch = await guild.channels.create({ name: LOG_CH_NAME, type: ChannelType.GuildText })
      .catch(() => null);
  }
  return ch;
}

// ── Command ───────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clone-server')
    .setDescription('Clone this server to a brand-new Discord server (approved users only)'),

  async execute(interaction, db) {
    // Access check
    if (interaction.user.id !== OWNER_ID && !db.isCloneApproved(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const src = interaction.guild;

    try {
      // Build channels payload ──────────────────────────────────────────────
      const CLONEABLE = new Set([
        ChannelType.GuildCategory,
        ChannelType.GuildText,
        ChannelType.GuildVoice,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildStageVoice,
      ]);

      const sorted = [...src.channels.cache.values()]
        .filter(c => CLONEABLE.has(c.type))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const payload = [];
      let   tid     = 1;
      const catMap  = new Map(); // realId → tempId

      // Categories first (preserves their visual order)
      for (const ch of sorted.filter(c => c.type === ChannelType.GuildCategory)) {
        catMap.set(ch.id, tid);
        payload.push({ id: tid++, name: ch.name, type: 4 });
      }

      // Channels (text + voice)
      for (const ch of sorted.filter(c => c.type !== ChannelType.GuildCategory)) {
        const entry = { id: tid++, name: ch.name, type: mapType(ch.type) };
        if (ch.parentId && catMap.has(ch.parentId)) entry.parent_id = catMap.get(ch.parentId);
        payload.push(entry);
      }

      // Icon ────────────────────────────────────────────────────────────────
      const icon = await getIconDataUri(src);

      // Create guild ────────────────────────────────────────────────────────
      const newGuild = await interaction.client.guilds.create({
        name:     src.name,
        icon:     icon ?? undefined,
        channels: payload,
      });

      // Wait for guild to settle
      await new Promise(r => setTimeout(r, 3000));

      // Create invite in the first available text channel
      const textCh  = newGuild.channels.cache.find(c => c.type === ChannelType.GuildText);
      const invite  = textCh
        ? await textCh.createInvite({ maxAge: 0, maxUses: 10, unique: true })
        : null;
      const inviteUrl = invite?.url ?? '(could not generate invite)';

      // DM the user ─────────────────────────────────────────────────────────
      await interaction.user.send({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Server Cloned Successfully!')
          .setDescription(
            `**${src.name}** has been cloned to a new server.\n\n` +
            `🔗 **Invite link:** ${inviteUrl}\n\n` +
            `*The bot is currently the server owner. You can transfer ownership after joining.*`,
          )
          .setColor(0x57F287)
          .addFields(
            { name: 'Channels cloned', value: String(payload.filter(c => c.type !== 4).length), inline: true },
            { name: 'Categories',      value: String(catMap.size),                               inline: true },
          )
          .setTimestamp()],
      }).catch(() => {});

      await interaction.editReply({ content: '✅ Done! Check your DMs for the invite link to your cloned server.' });

      // Log in dedicated channel ────────────────────────────────────────────
      const logCh = await ensureLogChannel(interaction.client);
      if (logCh) {
        await logCh.send({
          embeds: [new EmbedBuilder()
            .setTitle('🗺️ Server Cloned')
            .setColor(0x5865F2)
            .addFields(
              { name: 'User',           value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
              { name: 'Source Server',  value: `${src.name}\n\`${src.id}\``,                          inline: true },
              { name: 'Channels/Cats',  value: `${payload.filter(c => c.type !== 4).length} / ${catMap.size}`, inline: true },
              { name: 'Invite',         value: inviteUrl },
            )
            .setTimestamp()],
        }).catch(() => {});
      }

      // DM owner (if the user isn't the owner) ──────────────────────────────
      if (interaction.user.id !== OWNER_ID) {
        const owner = await interaction.client.users.fetch(OWNER_ID).catch(() => null);
        if (owner) {
          await owner.send({
            embeds: [new EmbedBuilder()
              .setTitle('🗺️ Clone Command Used')
              .setColor(0xfaa61a)
              .addFields(
                { name: 'User',          value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                { name: 'Source Server', value: `${src.name} (\`${src.id}\`)`,                          inline: true },
                { name: 'Invite',        value: inviteUrl },
              )
              .setTimestamp()],
          }).catch(() => {});
        }
      }

    } catch (err) {
      console.error('[clone-server]', err);
      const msg = err.code === 30007
        ? '❌ The bot has reached the maximum number of servers it can own. Contact the bot owner.'
        : `❌ Failed to clone server: \`${err.message}\``;
      await interaction.editReply({ content: msg });
    }
  },
};