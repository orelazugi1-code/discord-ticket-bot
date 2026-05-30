const { SlashCommandBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
  let ch = guild.channels.cache.find(
    c => c.name === LOG_CH_NAME && c.type === ChannelType.GuildText,
  );
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
      // Need Manage Server permission to create templates
      if (!src.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply({
          content: '❌ The bot needs **Manage Server** permission in this server to create a template.',
        });
      }

      // Create or sync the server template
      let template;
      const existing = await src.fetchTemplates().catch(() => null);
      if (existing?.size > 0) {
        // Sync existing template to latest server state
        template = await existing.first().sync();
      } else {
        template = await src.createTemplate(src.name, 'Created by Pela Bot — /clone-server');
      }

      const templateUrl = `https://discord.new/${template.code}`;

      // Download icon as attachment so user can apply it to the new server
      const iconUrl = src.iconURL({ extension: 'png', size: 512, forceStatic: true });
      const files   = [];
      if (iconUrl) {
        try {
          files.push({ attachment: await fetchBuf(iconUrl), name: 'server-icon.png' });
        } catch {}
      }

      const catCount = src.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const chCount  = src.channels.cache.filter(
        c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice,
      ).size;

      // DM the user
      await interaction.user.send({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Server Template Ready!')
          .setDescription(
            `**${src.name}** template is ready to use.\n\n` +
            `**Click the link to create your new server:**\n` +
            `🔗 ${templateUrl}\n\n` +
            `Discord will prompt you to choose a name and icon.\n` +
            `The server icon is attached below — upload it when prompted.`,
          )
          .setColor(0x57F287)
          .addFields(
            { name: 'Categories', value: String(catCount),        inline: true },
            { name: 'Channels',   value: String(chCount),         inline: true },
            { name: 'Template',   value: `\`${template.code}\``, inline: true },
          )
          .setFooter({ text: 'Template link is permanent and can be reused.' })
          .setTimestamp()],
        files,
      }).catch(() => {});

      await interaction.editReply({ content: '✅ Template created! Check your DMs for the link.' });

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