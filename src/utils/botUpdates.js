const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { execSync } = require('child_process');

const UPDATE_GUILD_ID = '1501908080584298557';
const CATEGORY_NAME   = '📢 עדכוני בוט';
const CHANNEL_NAME    = 'עדכונים';

function getCurrentCommit() {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.trim();
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); }
  catch { return null; }
}

function getCommitLog(sinceHash) {
  try {
    const fmt = '--pretty=format:%s';
    const cmd = sinceHash
      ? `git log ${fmt} "${sinceHash}..HEAD"`
      : `git log ${fmt} -10`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    return out ? out.split('\n').filter(l => l && !l.startsWith('Merge ')).slice(0, 15) : [];
  } catch { return []; }
}

function hebrewDate() {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());
}

async function ensureUpdatesChannel(guild) {
  // Find or create category
  let cat = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
  );
  if (!cat) {
    cat = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory });
  }

  // Find or create text channel inside category
  let ch = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.name === CHANNEL_NAME && c.parentId === cat.id,
  );
  if (!ch) {
    ch = await guild.channels.create({
      name:                 CHANNEL_NAME,
      type:                 ChannelType.GuildText,
      parent:               cat.id,
      topic:                'עדכוני בוט אוטומטיים — כל פריסה חדשה תופיע כאן',
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.SendMessages] },
      ],
    });
  }

  return ch;
}

async function checkAndSendUpdate(client, db) {
  const guild = client.guilds.cache.get(UPDATE_GUILD_ID);
  if (!guild) return;

  const currentHash = getCurrentCommit();
  if (!currentHash) return;

  const config   = db.getGuildConfig(UPDATE_GUILD_ID);
  const lastHash = config.last_deploy_hash;
  if (lastHash === currentHash) return;

  try {
    const channel = await ensureUpdatesChannel(guild);
    const commits = getCommitLog(lastHash || null);
    const short   = currentHash.substring(0, 7);
    const date    = hebrewDate();

    const commitBlock = commits.length > 0
      ? commits.map(c => `• ${c}`).join('\n')
      : '• שיפורי ביצועים ותיקוני באגים כלליים';

    const embed = new EmbedBuilder()
      .setTitle('🚀 VECTOR עודכן לגרסה חדשה!')
      .setDescription(
        `הבוט הופעל מחדש ופועל כעת בגרסה עדכנית.\n\n` +
        `**📋 שינויים בפריסה זו:**\n${commitBlock}`,
      )
      .setColor(0x7c5af7)
      .addFields(
        { name: '🏷️ גרסה',         value: `\`${short}\``, inline: true },
        { name: '📅 תאריך',        value: date,            inline: true },
        { name: '✅ סטטוס',        value: 'פועל ✔️',      inline: true },
      )
      .setFooter({ text: '⚡ VECTOR • מערכת עדכונים אוטומטית' })
      .setTimestamp();

    await channel.send({ content: '📣 **עדכון בוט חדש!**', embeds: [embed] });
    db.updateGuildConfig(UPDATE_GUILD_ID, { last_deploy_hash: currentHash });
    console.log(`[BotUpdates] Update message sent for commit ${short}`);
  } catch (err) {
    console.error('[BotUpdates] Failed to send update:', err.message);
  }
}

module.exports = { checkAndSendUpdate };