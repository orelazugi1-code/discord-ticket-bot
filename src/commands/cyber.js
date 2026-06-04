const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────
function encrypt(text) {
    const map = { a:'@',b:'8',c:'(',d:'|)',e:'3',f:'|=',g:'9',h:'#',i:'!',j:']',k:'|<',l:'1',m:'|v|',
        n:'|\\|',o:'0',p:'|>',q:'(,)',r:'|2',s:'5',t:'+',u:'|_|',v:'\\/',w:'\\^/',x:'><',y:'`/',z:'2' };
    return text.toLowerCase().split('').map(c => map[c] || c).join('');
}

function decrypt(text) {
    const map = {'@':'a','8':'b','(':'c','|)':'d','3':'e','|=':'f','9':'g','#':'h','!':'i',']':'j',
        '|<':'k','1':'l','|v|':'m','|\\|':'n','0':'o','|>':'p','(,)':'q','|2':'r','5':'s','+':'t',
        '|_|':'u','\\/':'v','\\^/':'w','><':'x','`/':'y','2':'z'};
    let result = text;
    Object.entries(map).forEach(([k,v]) => { result = result.split(k).join(v); });
    return result;
}

// ── Hacker typing effect (chunked embed edits) ───────────────────────────────
const HACKER_LINES = [
    '```ansi\n[32m[VOID]>[0m Initializing secure connection...',
    '```ansi\n[32m[VOID]>[0m Bypassing firewall... [33m[OK][0m',
    '```ansi\n[32m[VOID]>[0m Establishing tunnel... [33m[OK][0m',
    '```ansi\n[32m[VOID]>[0m [31mACCESS GRANTED[0m ⚡',
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cyber')
        .setDescription('Cyberpunk-style commands ⚡')
        .addSubcommand(sub => sub
            .setName('sudo')
            .setDescription('Execute a dramatic hacker command')
            .addStringOption(opt => opt.setName('action').setDescription('What to sudo?').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('encrypt')
            .setDescription('Encrypt a message in hacker style')
            .addStringOption(opt => opt.setName('text').setDescription('Text to encrypt').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('decrypt')
            .setDescription('Decrypt a hacker-encoded message')
            .addStringOption(opt => opt.setName('code').setDescription('Code to decrypt').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('signal')
            .setDescription('Send an intercepted signal')
            .addStringOption(opt => opt.setName('message').setDescription('Signal content').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('secret')
            .setDescription('Send a message that self-destructs')
            .addStringOption(opt => opt.setName('message').setDescription('Secret message').setRequired(true))
            .addIntegerOption(opt => opt.setName('seconds').setDescription('Seconds before delete (5-60)').setMinValue(5).setMaxValue(60))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'sudo') {
            const action = interaction.options.getString('action');
            await interaction.deferReply();
            const embed = new EmbedBuilder().setColor(0x22c55e).setDescription('```ansi\n[32m[VOID]>[0m Connecting...```');
            const msg = await interaction.editReply({ embeds: [embed] });

            for (let i = 0; i < HACKER_LINES.length; i++) {
                await new Promise(r => setTimeout(r, 600));
                const lines = HACKER_LINES.slice(0, i + 1).join('\n') + '```';
                embed.setDescription(lines);
                await msg.edit({ embeds: [embed] }).catch(() => {});
            }

            await new Promise(r => setTimeout(r, 500));
            embed
                .setColor(0xef4444)
                .setTitle('⚡ SUDO EXECUTED')
                .setDescription(`\`\`\`ansi\n[31m[ROOT@VOID]#[0m sudo ${action}\n[32mCommand executed successfully.[0m\n[33mAll systems nominal.[0m\`\`\``)
                .setFooter({ text: `Executed by ${interaction.user.tag} • VOID Terminal` });
            await msg.edit({ embeds: [embed] });
            return;
        }

        if (sub === 'encrypt') {
            const text = interaction.options.getString('text');
            const encoded = encrypt(text);
            const embed = new EmbedBuilder()
                .setColor(0x7c5af7)
                .setTitle('🔐 Message Encrypted')
                .addFields(
                    { name: '📝 Original', value: `\`${text}\`` },
                    { name: '🔒 Encrypted', value: `\`\`\`${encoded}\`\`\`` }
                )
                .setFooter({ text: 'Use /cyber decrypt to decode • VOID Crypto' });
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'decrypt') {
            const code = interaction.options.getString('code');
            const decoded = decrypt(code);
            const embed = new EmbedBuilder()
                .setColor(0x22c55e)
                .setTitle('🔓 Message Decrypted')
                .addFields(
                    { name: '🔒 Encrypted', value: `\`${code}\`` },
                    { name: '📝 Decoded', value: `\`\`\`${decoded}\`\`\`` }
                )
                .setFooter({ text: 'VOID Crypto Engine' });
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'signal') {
            const message = interaction.options.getString('message');
            const embed = new EmbedBuilder()
                .setColor(0x38bdf8)
                .setTitle('📡 Signal Intercepted')
                .setDescription(`\`\`\`ansi\n[36m[SIGNAL][0m Origin: UNKNOWN\n[36m[SIGNAL][0m Timestamp: ${new Date().toISOString()}\n[36m[SIGNAL][0m Content decrypted:[0m\n\n${message}\`\`\``)
                .setAuthor({ name: `⚡ ${interaction.user.displayName ?? interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setFooter({ text: 'VOID Signal Engine • Transmission complete' });
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'secret') {
            const message = interaction.options.getString('message');
            const secs = interaction.options.getInteger('seconds') ?? 15;
            await interaction.deferReply();

            const embed = new EmbedBuilder()
                .setColor(0xef4444)
                .setTitle('💣 Self-Destruct Message')
                .setDescription(`> ${message}`)
                .addFields({ name: '⏳ Deletes in', value: `**${secs}s**`, inline: true })
                .setFooter({ text: `Sent by ${interaction.user.tag} • This message will self-destruct` });
            const msg = await interaction.editReply({ embeds: [embed] });

            // Countdown
            for (let t = secs - 5; t > 0; t -= 5) {
                await new Promise(r => setTimeout(r, 5000));
                embed.spliceFields(0, 1, { name: '⏳ Deletes in', value: `**${t}s**`, inline: true });
                await msg.edit({ embeds: [embed] }).catch(() => {});
            }

            await new Promise(r => setTimeout(r, 5000));
            embed.setDescription('~~[MESSAGE DESTROYED]~~').setColor(0x444444).spliceFields(0, 1);
            await msg.edit({ embeds: [embed] }).catch(() => {});
            await new Promise(r => setTimeout(r, 2000));
            await msg.delete().catch(() => {});
        }
    },
};
