const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const OWNER_ID = '1266854019767341107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pela-server')
    .setDescription("Configure Pela's home server and autonomous behavior")
    .addSubcommand(s => s.setName('setup').setDescription("Set this server as Pela's home")
      .addChannelOption(o => o.setName('updates').setDescription('Updates/announcements channel').setRequired(true))
      .addChannelOption(o => o.setName('logs').setDescription('Activity logs channel').setRequired(true))
      .addChannelOption(o => o.setName('tasks').setDescription('Tasks channel (optional)')))
    .addSubcommand(s => s.setName('announce').setDescription('Post an announcement in the updates channel')
      .addStringOption(o => o.setName('message').setDescription('Announcement text').setRequired(true).setMaxLength(2000)))
    .addSubcommand(s => s.setName('task').setDescription('Assign a task to a team member')
      .addUserOption(o => o.setName('user').setDescription('Assign to this person').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Task description').setRequired(true).setMaxLength(500)))
    .addSubcommand(s => s.setName('post-now').setDescription('Trigger an autonomous community post immediately'))
    .addSubcommand(s => s.setName('ticket-summary').setDescription('Send open ticket summary to bot owner'))
    .addSubcommand(s => s.setName('invite').setDescription('Set the permanent invite URL for this server')
      .addStringOption(o => o.setName('url').setDescription('The discord.gg/... invite link').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const updates = interaction.options.getChannel('updates');
      const logs    = interaction.options.getChannel('logs');
      const tasks   = interaction.options.getChannel('tasks');
      db.setPelaConfig('pela_server_id',          interaction.guildId);
      db.setPelaConfig('pela_updates_channel_id', updates.id);
      db.setPelaConfig('pela_logs_channel_id',    logs.id);
      if (tasks) db.setPelaConfig('pela_tasks_channel_id', tasks.id);
      return interaction.reply({
        content: `✅ This server is now Pela's home!\n• Updates: ${updates}\n• Logs: ${logs}${tasks ? `\n• Tasks: ${tasks}` : ''}\n\nPela will autonomously post updates every 4–8 hours.`,
        ephemeral: true,
      });
    }

    if (sub === 'announce') {
      const text = interaction.options.getString('message');
      const chId = db.getPelaConfig('pela_updates_channel_id');
      if (!chId) return interaction.reply({ content: '❌ Run `/pela-server setup` first.', ephemeral: true });
      const ch = interaction.guild.channels.cache.get(chId);
      if (!ch) return interaction.reply({ content: '❌ Updates channel not found.', ephemeral: true });
      await ch.send({ content: `📢 **Announcement**\n\n${text}` });
      return interaction.reply({ content: '✅ Announcement posted!', ephemeral: true });
    }

    if (sub === 'task') {
      const user   = interaction.options.getUser('user');
      const desc   = interaction.options.getString('description');
      const taskId = db.createPelaTask(interaction.guildId, desc, user.id, interaction.user.id);

      const taskChId = db.getPelaConfig('pela_tasks_channel_id');
      if (taskChId) {
        const ch = interaction.guild.channels.cache.get(taskChId);
        if (ch) {
          const embed = new EmbedBuilder().setTitle(`📋 Task #${taskId}`).setDescription(desc).setColor(0x5865F2)
            .addFields({ name: 'Assigned to', value: `<@${user.id}>`, inline: true }, { name: 'Status', value: '🔵 Open', inline: true })
            .setTimestamp();
          await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`task:complete:${taskId}`).setLabel('✅ Mark Complete').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`task:reassign:${taskId}`).setLabel('↗️ Reassign').setStyle(ButtonStyle.Secondary),
          )] });
        }
      }
      await user.send({ content: `📋 You have a new task from <@${interaction.user.id}>:\n\n> ${desc}` }).catch(() => {});
      return interaction.reply({ content: `✅ Task #${taskId} assigned to <@${user.id}>!`, ephemeral: true });
    }

    if (sub === 'post-now') {
      const { postCommunityMessage } = require('../utils/pelaAI');
      await interaction.deferReply({ ephemeral: true });
      await postCommunityMessage(interaction.client, db).catch(e => { throw e; });
      return interaction.editReply({ content: '✅ Community post sent!' });
    }

    if (sub === 'invite') {
      const url = interaction.options.getString('url');
      if (!url.includes('discord.gg/') && !url.includes('discord.com/invite/')) {
        return interaction.reply({ content: '❌ Provide a valid Discord invite link (discord.gg/...).', ephemeral: true });
      }
      db.setPelaConfig('home_invite_url', url);
      const { inviteCache } = require('../utils/pelaAI'); // clear cache
      // reset cache indirectly by having next call re-read from db
      return interaction.reply({ content: `✅ Invite link saved: ${url}\n\nPela will now share this when users ask for the server link.`, ephemeral: true });
    }

    if (sub === 'ticket-summary') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '❌ Only the bot owner can request this.', ephemeral: true });
      const { sendTicketSummary } = require('../utils/pelaAI');
      await sendTicketSummary(interaction.client, db).catch(() => {});
      return interaction.reply({ content: '✅ Summary sent to owner DMs.', ephemeral: true });
    }
  },
};