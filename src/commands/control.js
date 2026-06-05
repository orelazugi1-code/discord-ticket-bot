const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('control')
        .setDescription('Control what a specific user appears to write')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Every message this user sends will be replaced with your text')
            .addUserOption(o => o.setName('user').setDescription('User to control').setRequired(true))
            .addStringOption(o => o.setName('text').setDescription('What their messages will say instead').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Stop controlling this user')
            .addUserOption(o => o.setName('user').setDescription('User to free').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('list').setDescription('Show all controlled users')),

    async execute(interaction, db) {
        const sub = interaction.options.getSubcommand();
        const gid = interaction.guildId;

        if (sub === 'set') {
            const user = interaction.options.getUser('user');
            const text = interaction.options.getString('text');
            db.setUserControl(gid, user.id, text);
            const embed = new EmbedBuilder()
                .setColor(0x7c5af7)
                .setTitle('🎮 User Controlled')
                .setDescription(`Every message from <@${user.id}> will now say:\n\n> ${text}`)
                .setThumbnail(user.displayAvatarURL())
                .setFooter({ text: 'Their name and avatar will stay the same — only the text changes' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'remove') {
            const user = interaction.options.getUser('user');
            db.removeUserControl(gid, user.id);
            return interaction.reply({ content: `✅ <@${user.id}> is no longer controlled.`, ephemeral: true });
        }

        if (sub === 'list') {
            const list = db.getUserControls(gid);
            if (!list.length) return interaction.reply({ content: 'No controlled users.', ephemeral: true });
            const lines = list.map(r => `<@${r.user_id}> → \`${r.replacement}\``).join('\n');
            const embed = new EmbedBuilder().setColor(0x7c5af7).setTitle('🎮 Controlled Users').setDescription(lines);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
