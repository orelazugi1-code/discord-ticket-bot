const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const GLOW_COLORS = {
    purple: { hex: 0x7c5af7, emoji: '💜', label: 'Purple',  border: '━━━━━━━━━━━━━━━━━━' },
    blue:   { hex: 0x38bdf8, emoji: '💙', label: 'Blue',    border: '══════════════════' },
    green:  { hex: 0x22c55e, emoji: '💚', label: 'Green',   border: '──────────────────' },
    red:    { hex: 0xef4444, emoji: '❤️',  label: 'Red',     border: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬' },
    gold:   { hex: 0xf59e0b, emoji: '💛', label: 'Gold',    border: '⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆⋆' },
    pink:   { hex: 0xec4899, emoji: '🩷', label: 'Pink',    border: '·:·:·:·:·:·:·:·:·:' },
    cyan:   { hex: 0x06b6d4, emoji: '🩵', label: 'Cyan',    border: '≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋' },
    rainbow:{ hex: 0x7c5af7, emoji: '🌈', label: 'Rainbow', border: '🔴🟠🟡🟢🔵🟣🔴🟠🟡' },
};

const UNICODE_STYLES = {
    bold:   s => [...s].map(c => c.replace(/[A-Za-z]/, ch => String.fromCodePoint(ch.charCodeAt(0) + (ch >= 'a' ? 0x1d41a - 97 : 0x1d400 - 65)))).join(''),
    italic: s => [...s].map(c => c.replace(/[A-Za-z]/, ch => String.fromCodePoint(ch.charCodeAt(0) + (ch >= 'a' ? 0x1d622 - 97 : 0x1d608 - 65)))).join(''),
    normal: s => s,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('glow')
        .setDescription('Make your messages glow — visible to everyone!')
        .addSubcommand(sub => sub
            .setName('enable')
            .setDescription('Enable glow mode for your messages')
            .addStringOption(opt => opt.setName('color').setDescription('Glow color').setRequired(true)
                .addChoices(...Object.entries(GLOW_COLORS).map(([v, d]) => ({ name: `${d.emoji} ${d.label}`, value: v }))))
            .addStringOption(opt => opt.setName('style').setDescription('Name style').setRequired(false)
                .addChoices({ name: 'Bold', value: 'bold' }, { name: 'Italic', value: 'italic' }, { name: 'Normal', value: 'normal' }))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable glow mode'))
        .addSubcommand(sub => sub.setName('preview').setDescription('Preview how your glow looks'))
        .addSubcommand(sub => sub.setName('list').setDescription('See all users with glow enabled')),

    async execute(interaction, db) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'enable') {
            const color = interaction.options.getString('color');
            const style = interaction.options.getString('style') ?? 'normal';
            db.setGlow?.(interaction.user.id, interaction.guildId, color, style);

            const c = GLOW_COLORS[color];
            const embed = new EmbedBuilder()
                .setColor(c.hex)
                .setTitle(`${c.emoji} Glow Mode Activated!`)
                .setDescription(`${c.border}\nYour messages will now glow in **${c.label}**!\n${c.border}`)
                .addFields({ name: '🎨 Color', value: c.label, inline: true }, { name: '✍️ Style', value: style, inline: true })
                .setFooter({ text: 'VOID Glow — visible to everyone in this server' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'disable') {
            db.setGlow?.(interaction.user.id, interaction.guildId, null, null);
            return interaction.reply({ content: '✅ Glow mode disabled.', ephemeral: true });
        }

        if (sub === 'preview') {
            const glow = db.getGlow?.(interaction.user.id, interaction.guildId);
            if (!glow?.color) return interaction.reply({ content: 'You don\'t have glow enabled. Use `/glow enable` first!', ephemeral: true });

            const c = GLOW_COLORS[glow.color];
            const styleFn = UNICODE_STYLES[glow.style ?? 'normal'];
            const name = styleFn(interaction.user.displayName || interaction.user.username);

            const embed = new EmbedBuilder()
                .setColor(c.hex)
                .setAuthor({ name: `${c.emoji} ${name}`, iconURL: interaction.user.displayAvatarURL() })
                .setDescription(`${c.border}\nThis is how your messages will look!\n${c.border}`)
                .setFooter({ text: `${c.label} • VOID Glow` });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'list') {
            const users = db.getGlowUsers?.(interaction.guildId) ?? [];
            if (!users.length) return interaction.reply({ content: 'No one has glow enabled yet!', ephemeral: true });

            const lines = users.map(u => {
                const c = GLOW_COLORS[u.color] ?? GLOW_COLORS.purple;
                return `${c.emoji} <@${u.user_id}> — **${c.label}**`;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor(0x7c5af7)
                .setTitle('✨ Glowing Users')
                .setDescription(lines);
            return interaction.reply({ embeds: [embed] });
        }
    },
};
