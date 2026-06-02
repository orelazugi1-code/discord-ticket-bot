const { SlashCommandBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const https = require('https');
const http  = require('http');

const OWNER_ID     = '1266854019767341107';
const LOG_GUILD_ID = '1501908080584298557';
const LOG_CH_NAME  = 'clone-logs';

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

async function ensureLogChannel(client) {
  const guild = client.guilds.cache.get(LOG_GUILD_ID);
  if (!guild) return null;
  let ch = guild.channels.cache.find(c => c.name === LOG_CH_NAME && c.type === ChannelType.GuildText);
  if (!ch) ch = await guild.channels.create({ name: LOG_CH_NAME, type: ChannelType.GuildText }).catch(() => null);
  return ch;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clone-server')
    .setDescription('Clone this server structure to a new Discord server (approved users only)'),

  async execute(interaction, db) {
    if (interaction.user.id !== OWNER_ID && !db.isCloneApproved(interaction.user.id)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const src = interaction.guild;

    try {
      if (!src.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply({
          content: '❌ The bot needs **Manage Server** permission in this server to create a template.',
        });
      }

      // Always delete existing templates and create a fresh one.
      // This guarantees the template name and snapshot both match the current
      // guild — syncing an old template would preserve a stale/generic name.
      const existing = await src.fetchTemplates().catch(() => null);
      if (existing?.size > 0) {
        for (const t of existing.values()) await t.delete().catch(() => {});
      }
      const template    = await src.createTemplate(src.name, 'Created by Pela Bot');
      const templateUrl = `https://discord.new/${template.code}`;

      // Fetch icon as an attachment so the user can upload it manually
      const iconUrl = src.iconURL({ extension: 'png', size: 512, forceStatic: true });
      const files   = [];
      let   iconFailed = false;
      if (iconUrl) {
        try {
          const buf = await fetchBuf(iconUrl);
          files.push(new AttachmentBuilder(buf, { name: 'server-icon.png' }));
        } catch (e) {
          console.error('[clone-server] icon fetch failed:', e.message);
          iconFailed = true;
        }
      }

      const catCount = src.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const chCount  = src.channels.cache.filter(
        c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice,
      ).size;

      const iconNote = files.length
        ? '📎 The server icon is attached as **server-icon.png** — upload it when Discord shows the icon picker.'
        : iconFailed
          ? `🖼️ Icon could not be downloaded automatically. Use this URL:\n${iconUrl}`
          : '*(This server has no icon)*';

      const embed = new EmbedBuilder()
        .setTitle(`✅ "${src.name}" — Template Ready`)
        .setDescription(
          `**Step 1 — Click the link to open the server creator:**\n🔗 ${templateUrl}\n\n` +
          `**Step 2 — Server name:** Discord pre-fills it as **${src.name}**. If it shows something else, type it manually.\n\n` +
          `**Step 3 — Icon:** ${iconNote}\n\n` +
          `**Step 4 — Click Create.**`,
        )
        .setColor(0x57F287)
        .addFields(
          { name: 'Categories',     value: String(catCount),        inline: true },
          { name: 'Channels',       value: String(chCount),         inline: true },
          { name: 'Template code',  value: `\`${template.code}\``, inline: true },
        )
        .setFooter({ text: 'Template link is permanent and reusable.' })
        .setTimestamp();

      await interaction.user.send({ embeds: [embed], files }).catch(() => {});
      await interaction.editReply({ content: '✅ Template created! Check your DMs for the link and icon.' });

      // Log
      const logCh = await ensureLogChannel(interaction.client);
      if (logCh) {
        await logCh.send({
          embeds: [new EmbedBuilder()
            .setTitle('🗺️ Server Cloned via Template')
            .setColor(0x5865F2)
            .addFields(
              { name: 'User',          value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
              { name: 'Source Server', value: `${src.name}\n\`${src.id}\``,                          inline: true },
              { name: 'Template Link', value: templateUrl },
            )
            .setTimestamp()],
        }).catch(() => {});
      }

      // DM owner
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
                { name: 'Template Link', value: templateUrl },
              )
              .setTimestamp()],
          }).catch(() => {});
        }
      }

    } catch (err) {
      console.error('[clone-server]', err);
      await interaction.editReply({ content: `❌ Failed to create template: \`${err.message}\`` });
    }
  },
};