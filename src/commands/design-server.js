const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const axios = require('axios');

const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractJson(text) {
  let s = text.trim();
  // Strip markdown code fences if the model added them
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = s.indexOf('{');
  const end   = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
  return JSON.parse(s.slice(start, end + 1));
}

function safeColor(hex) {
  if (!hex) return 0;
  const clean = hex.replace('#', '');
  return /^[0-9A-Fa-f]{6}$/.test(clean) ? parseInt(clean, 16) : 0;
}

function sanitizeChannelName(name) {
  // Discord channel names: lowercase, no spaces (use hyphens), max 100 chars
  return (name || 'channel')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9֐-׿\-]/g, '')  // allow Hebrew + ASCII
    .replace(/-{2,}/g, '-')
    .slice(0, 100) || 'channel';
}

// ── Groq API call ─────────────────────────────────────────────────────────────

async function generateStructure(description) {
  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       GROQ_MODEL,
      temperature: 0.7,
      max_tokens:  2048,
      messages: [
        {
          role:    'system',
          content: 'You are a Discord server architect. Output raw valid JSON only — no explanations, no markdown fences.',
        },
        {
          role:    'user',
          content:
            `Design a Discord server for: "${description}"\n\n` +
            `Return ONLY a JSON object with this structure:\n` +
            `{\n` +
            `  "roles": [\n` +
            `    { "name": "Role Name", "color": "#RRGGBB", "hoist": true, "mentionable": true }\n` +
            `  ],\n` +
            `  "categories": [\n` +
            `    {\n` +
            `      "name": "CATEGORY NAME",\n` +
            `      "channels": [\n` +
            `        { "name": "channel-name", "type": "text", "topic": "brief topic" },\n` +
            `        { "name": "voice-name",   "type": "voice" }\n` +
            `      ]\n` +
            `    }\n` +
            `  ]\n` +
            `}\n\n` +
            `Rules:\n` +
            `- Max 6 roles, 6 categories, 8 channels per category\n` +
            `- Channel names: lowercase ASCII, hyphens instead of spaces\n` +
            `- Role names: proper capitalisation, match the server language/theme\n` +
            `- Colors: valid 6-digit hex (e.g. #FF5733)\n` +
            `- Every category needs at least one text channel\n` +
            `- Return ONLY the JSON, nothing else`,
        },
      ],
    },
    {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  );

  return extractJson(resp.data.choices[0].message.content);
}

// ── Apply structure to guild ──────────────────────────────────────────────────

async function applyStructure(guild, structure) {
  const summary = { roles: [], categories: [], textCh: 0, voiceCh: 0, errors: [] };

  for (const r of (structure.roles || []).slice(0, 6)) {
    try {
      const role = await guild.roles.create({
        name:        (r.name || 'Role').slice(0, 100),
        color:       safeColor(r.color),
        hoist:       r.hoist       ?? false,
        mentionable: r.mentionable ?? false,
        reason:      '/design-server',
      });
      summary.roles.push(role.name);
    } catch (e) { summary.errors.push(`Role "${r.name}": ${e.message}`); }
    await sleep(600);
  }

  for (const cat of (structure.categories || []).slice(0, 6)) {
    let category;
    try {
      category = await guild.channels.create({
        name:   (cat.name || 'Category').slice(0, 100),
        type:   ChannelType.GuildCategory,
        reason: '/design-server',
      });
      summary.categories.push(cat.name);
    } catch (e) { summary.errors.push(`Category "${cat.name}": ${e.message}`); continue; }
    await sleep(600);

    for (const ch of (cat.channels || []).slice(0, 8)) {
      const isVoice = ch.type === 'voice';
      try {
        await guild.channels.create({
          name:   sanitizeChannelName(ch.name),
          type:   isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id,
          topic:  (!isVoice && ch.topic) ? String(ch.topic).slice(0, 1024) : undefined,
          reason: '/design-server',
        });
        isVoice ? summary.voiceCh++ : summary.textCh++;
      } catch (e) { summary.errors.push(`Channel "${ch.name}": ${e.message}`); }
      await sleep(600);
    }
  }

  return summary;
}

// ── Command ───────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('design-server')
    .setDescription('AI-generates and builds a complete server structure from your description')
    .addStringOption(o => o
      .setName('description')
      .setDescription('Describe the server you want (e.g. "gaming server with esports sections")')
      .setRequired(true)
      .setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, db) {
    if (!db.isPremium(interaction.guildId)) return interaction.reply({ content: '👑 **פיצ'ר Premium!** כתבו /shop לפרטים.', ephemeral: true });

    if (!process.env.GROQ_API_KEY) {
      return interaction.reply({
        content: '❌ `GROQ_API_KEY` is not configured. Add it to your environment variables.',
        ephemeral: true,
      });
    }

    const description = interaction.options.getString('description');
    await interaction.deferReply();
    await interaction.editReply({ content: '🤖 Asking AI to design your server structure…' });

    // Generate structure via Groq
    let structure;
    try {
      structure = await generateStructure(description);
    } catch (e) {
      const detail = e.response?.data?.error?.message ?? e.message;
      console.error('[design-server] Groq error:', detail);
      return interaction.editReply({ content: `❌ AI failed to generate structure: \`${detail}\`` });
    }

    const totalCh  = (structure.categories || []).reduce((n, c) => n + (c.channels?.length ?? 0), 0);
    const roleCount = (structure.roles || []).length;

    await interaction.editReply({
      content: `🏗️ Building **${(structure.categories || []).length}** categories, **${totalCh}** channels, and **${roleCount}** roles… (this takes ~${Math.ceil((roleCount + totalCh) * 0.6)}s)`,
    });

    const summary = await applyStructure(interaction.guild, structure);

    // Build summary embed
    const rolesValue = summary.roles.length
      ? summary.roles.map(r => `\`${r}\``).join(' ')
      : '—';

    const catsValue = summary.categories.length
      ? summary.categories.map(c => `• ${c}`).join('\n')
      : '—';

    const embed = new EmbedBuilder()
      .setTitle('✅ Server Designed & Built!')
      .setDescription(`Generated from: *"${description}"*`)
      .setColor(0x7c5af7)
      .addFields(
        { name: `🎭 Roles (${summary.roles.length})`,           value: rolesValue, inline: false },
        { name: `📁 Categories (${summary.categories.length})`, value: catsValue,  inline: true  },
        { name: '💬 Channels',
          value: `${summary.textCh} text\n${summary.voiceCh} voice`,
          inline: true },
      )
      .setFooter({ text: `Powered by Groq · ${GROQ_MODEL}` })
      .setTimestamp();

    if (summary.errors.length) {
      embed.addFields({
        name:  `⚠️ ${summary.errors.length} item(s) failed`,
        value: summary.errors.slice(0, 5).join('\n'),
      });
    }

    await interaction.editReply({ content: '', embeds: [embed] });
  },
};