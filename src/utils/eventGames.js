const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const https = require('https');

const LOG_CHANNEL = '1511008090940641300';
const OWNER_ID = '1266854019767341107';
const MIN_PLAYERS = 10;

const activeEvents = new Map();


async function logEvent(client, text) {
  try {
    const ch = await client.channels.fetch(LOG_CHANNEL).catch(() => null);
    if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(text).setTimestamp()] });
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
// BOMB GAME — 5x5 board
// ═══════════════════════════════════════════════════════════════════════
function createBombGame(players) {
  const size = 5;
  const total = size * size;
  const bombCount = 7;
  const bombs = new Set();
  while (bombs.size < bombCount) bombs.add(Math.floor(Math.random() * total));

  const board = Array(total).fill(false);
  const eliminated = new Set();
  let turnIdx = 0;

  return {
    type: 'bomb',
    name: '💣 משחק הפצצה',
    players: [...players],
    getAlive() { return this.players.filter(p => !eliminated.has(p)); },
    getEmbed() {
      const rows = [];
      for (let r = 0; r < size; r++) {
        let line = '';
        for (let c = 0; c < size; c++) {
          const i = r * size + c;
          line += board[i] ? (bombs.has(i) ? '💥 ' : '✅ ') : '⬛ ';
        }
        rows.push(line);
      }
      const alive = this.getAlive();
      return new EmbedBuilder()
        .setColor(0xFF4444)
        .setTitle('💣 משחק הפצצה — 5x5')
        .setDescription(
          rows.join('\n') + '\n\n' +
          '🎯 תור של: <@' + alive[turnIdx % alive.length] + '>\n' +
          '👥 נותרו: ' + alive.length + ' | 💥 פצצות: ' + bombCount + '\n' +
          '❌ מודחים: ' + (eliminated.size > 0 ? [...eliminated].map(p => '<@' + p + '>').join(', ') : 'אין')
        );
    },
    getButtons() {
      const rows = [];
      for (let r = 0; r < size; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < size; c++) {
          const i = r * size + c;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId('evt_bomb_' + i)
              .setLabel(board[i] ? (bombs.has(i) ? '💥' : '✅') : String(i + 1))
              .setStyle(board[i] ? (bombs.has(i) ? ButtonStyle.Danger : ButtonStyle.Success) : ButtonStyle.Secondary)
              .setDisabled(board[i])
          );
        }
        rows.push(row);
      }
      return rows;
    },
    play(pid, cell) {
      const alive = this.getAlive();
      if (alive.length <= 1) return { done: true, winner: alive[0] };
      if (pid !== alive[turnIdx % alive.length]) return { error: 'not_your_turn' };
      if (board[cell]) return { error: 'already' };
      board[cell] = true;
      if (bombs.has(cell)) {
        eliminated.add(pid);
        const a2 = this.getAlive();
        if (a2.length <= 1) return { done: true, winner: a2[0], hit: true };
        if (turnIdx >= a2.length) turnIdx = 0;
        return { hit: true };
      }
      turnIdx = (turnIdx + 1) % this.getAlive().length;
      return { hit: false };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MEMORY GAME — 4x4
// ═══════════════════════════════════════════════════════════════════════
function createMemoryGame(players) {
  const emojis = ['🍎','🍊','🍋','🍇','🍓','🍑','🥝','🍌'];
  const deck = [];
  for (let i = 0; i < 8; i++) deck.push(emojis[i], emojis[i]);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }

  const revealed = Array(16).fill(false);
  const tempRevealed = new Set();
  const scores = {};
  players.forEach(p => { scores[p] = 0; });
  let turnIdx = 0;
  let firstPick = null;
  let pairsFound = 0;

  return {
    type: 'memory',
    name: '🧠 משחק זיכרון',
    players: [...players],
    getEmbed() {
      const rows = [];
      for (let r = 0; r < 4; r++) {
        let line = '';
        for (let c = 0; c < 4; c++) {
          const i = r * 4 + c;
          line += (revealed[i] || tempRevealed.has(i)) ? deck[i] + ' ' : '❓ ';
        }
        rows.push(line);
      }
      const scoreStr = this.players.map(p => '<@' + p + '>: ' + (scores[p] || 0)).join(' | ');
      return new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🧠 משחק זיכרון — 4x4')
        .setDescription(
          rows.join('\n') + '\n\n' +
          '🎯 תור של: <@' + this.players[turnIdx % this.players.length] + '>\n' +
          '🏆 ניקוד: ' + scoreStr + '\n' +
          '✅ זוגות: ' + pairsFound + '/8'
        );
    },
    getButtons() {
      const rows = [];
      for (let r = 0; r < 4; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 4; c++) {
          const i = r * 4 + c;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId('evt_mem_' + i)
              .setLabel(revealed[i] ? deck[i] : String(i + 1))
              .setStyle(revealed[i] ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(revealed[i])
          );
        }
        rows.push(row);
      }
      return rows;
    },
    play(pid, cell) {
      if (pid !== this.players[turnIdx % this.players.length]) return { error: 'not_your_turn' };
      if (revealed[cell] || tempRevealed.has(cell)) return { error: 'already' };
      if (firstPick === null) {
        firstPick = cell;
        tempRevealed.add(cell);
        return { firstPick: true };
      }
      tempRevealed.add(cell);
      if (deck[firstPick] === deck[cell]) {
        revealed[firstPick] = true;
        revealed[cell] = true;
        scores[pid] = (scores[pid] || 0) + 1;
        pairsFound++;
        tempRevealed.clear();
        firstPick = null;
        if (pairsFound >= 8) {
          const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
          return { done: true, winner, match: true };
        }
        return { match: true };
      }
      const fp = firstPick;
      firstPick = null;
      tempRevealed.clear();
      turnIdx = (turnIdx + 1) % this.players.length;
      return { match: false, shown: [fp, cell] };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// REACTION SPEED GAME
// ═══════════════════════════════════════════════════════════════════════
function createReactionGame(players) {
  const totalRounds = 5;
  const scores = {};
  players.forEach(p => { scores[p] = 0; });
  let round = 0;
  let active = false;
  let lastWinner = null;

  return {
    type: 'reaction',
    name: '⚡ מי מהיר יותר?',
    players: [...players], scores, totalRounds,
    isActive() { return active; },
    getEmbed() {
      const scoreStr = this.players.map(p => '<@' + p + '>: ' + (scores[p] || 0)).join(' | ');
      return new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('⚡ מי מהיר יותר?')
        .setDescription(
          (active ? '🟢 **לחצו עכשיו!**' : '⏳ **מתכוננים...**') + '\n\n' +
          '🔄 סיבוב: ' + (round + 1) + '/' + totalRounds + '\n' +
          '🏆 ניקוד: ' + scoreStr +
          (lastWinner ? '\n\n🏅 לוחץ ראשון: <@' + lastWinner + '>' : '')
        );
    },
    getButtons() {
      return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('evt_react_click')
          .setLabel(active ? '⚡ לחץ!' : '⏳ חכה...')
          .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(!active)
      )];
    },
    startRound() { active = true; lastWinner = null; },
    play(pid) {
      if (!active) return { error: 'not_active' };
      active = false;
      lastWinner = pid;
      scores[pid] = (scores[pid] || 0) + 1;
      round++;
      if (round >= totalRounds) {
        const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
        return { done: true, winner };
      }
      return { roundDone: true };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TRIVIA GAME
// ═══════════════════════════════════════════════════════════════════════
function createTriviaGame(players) {
  const questions = [
    { q: '🌍 מה הבירה של יפן?', a: ['טוקיו','ניו יורק','בנגקוק','סיאול'], c: 0 },
    { q: '🔢 כמה זה 15 × 17?', a: ['245','255','265','235'], c: 1 },
    { q: '🎮 באיזו שנה יצא Minecraft?', a: ['2009','2011','2013','2007'], c: 1 },
    { q: '🧪 מהו הסימן הכימי של זהב?', a: ['Ag','Fe','Au','Zn'], c: 2 },
    { q: '⚽ מי זכה במונדיאל 2022?', a: ['ברזיל','צרפת','ארגנטינה','קרואטיה'], c: 2 },
    { q: '🎵 כמה מיתרים יש לגיטרה?', a: ['4','5','6','8'], c: 2 },
    { q: '🌊 מהו האוקיינוס הגדול?', a: ['האטלנטי','ההודי','השקט','הארקטי'], c: 2 },
    { q: '🐍 מהי שפת תכנות הכי פופולרית?', a: ['Java','C++','Python','JavaScript'], c: 3 },
  ];
  for (let i = questions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [questions[i], questions[j]] = [questions[j], questions[i]]; }

  const rounds = Math.min(5, questions.length);
  const scores = {};
  players.forEach(p => { scores[p] = 0; });
  let round = 0;
  const answered = new Set();

  return {
    type: 'trivia',
    name: '🧩 חידון ידע',
    players: [...players], scores, rounds, questions,
    getEmbed() {
      const q = questions[round];
      const labels = ['🅰️','🅱️','🅲','🅳'];
      const scoreStr = this.players.map(p => '<@' + p + '>: ' + (scores[p] || 0)).join(' | ');
      return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🧩 חידון ידע — סיבוב ' + (round + 1) + '/' + rounds)
        .setDescription(
          '**' + q.q + '**\n\n' +
          q.a.map((a, i) => labels[i] + ' ' + a).join('\n') + '\n\n' +
          '🏆 ניקוד: ' + scoreStr
        );
    },
    getButtons() {
      const q = questions[round];
      const labels = ['🅰️','🅱️','🅲','🅳'];
      return [new ActionRowBuilder().addComponents(
        ...q.a.map((a, i) =>
          new ButtonBuilder()
            .setCustomId('evt_trivia_' + i)
            .setLabel(labels[i] + ' ' + a)
            .setStyle(ButtonStyle.Primary)
        )
      )];
    },
    play(pid, ansIdx) {
      if (answered.has(pid)) return { error: 'already_answered' };
      answered.add(pid);
      const correct = ansIdx === questions[round].c;
      if (correct) scores[pid] = (scores[pid] || 0) + 1;
      if (answered.size >= this.players.length) {
        answered.clear();
        round++;
        if (round >= rounds) {
          const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
          return { done: true, winner, correct };
        }
        return { nextRound: true, correct };
      }
      return { correct, waiting: true };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════
// WINNER BANNER
// ═══════════════════════════════════════════════════════════════════════
async function generateWinnerBanner(winnerId, client) {
  const user = await client.users.fetch(winnerId);
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });

  const prompt = encodeURIComponent(
    'Discord event winner celebration banner, golden trophy, confetti, sparkles, epic victory, ' +
    'dark background with golden glow, champion crown, festive, wide format, no text, no watermark'
  );
  const bannerUrl = 'https://image.pollinations.ai/prompt/' + prompt + '?width=1024&height=384&nologo=true';

  const bannerBuf = await new Promise((resolve, reject) => {
    const doFetch = (url) => {
      https.get(url, { headers: { 'User-Agent': 'PelaBot/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doFetch(res.headers.location);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    doFetch(bannerUrl);
    setTimeout(() => reject(new Error('timeout')), 30000);
  });

  return {
    embed: new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆🎉 המנצח הגדול! 🎉🏆')
      .setDescription(
        '╔══════════════════════════╗\n' +
        '  🥇 <@' + winnerId + '> 🥇\n' +
        '╚══════════════════════════╝\n\n' +
        '🎊 מזל טוב! ניצחת באירוע של פלא!\n' +
        '👑 הפרס: **Pela Premium** לשרת שלך!'
      )
      .setThumbnail(avatarUrl)
      .setImage('attachment://winner-banner.png')
      .setFooter({ text: 'Pela Event • ' + new Date().toLocaleDateString('he-IL') })
      .setTimestamp(),
    file: new AttachmentBuilder(bannerBuf, { name: 'winner-banner.png' })
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT MANAGER
// ═══════════════════════════════════════════════════════════════════════
const GAMES = [createBombGame, createMemoryGame, createReactionGame, createTriviaGame];

async function startEvent(channel, client) {
  const eventId = channel.guild.id;

  const readyEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🎉 הגרלת Pela Premium!')
    .setDescription(
      '**ברוכים הבאים לאירוע של פלא!**\n\n' +
      '🏆 **הפרס:** Pela Premium לשרת שלכם!\n\n' +
      '🎮 **איך זה עובד:**\n' +
      '1️⃣ לחצו על **אני מוכן!** למטה\n' +
      '2️⃣ כשיש ' + MIN_PLAYERS + '+ משתתפים, האירוע מתחיל\n' +
      '3️⃣ תשחקו משחקונים — פצצה, זיכרון, חידון, מהירות\n' +
      '4️⃣ מי שמנצח הכי הרבה — מקבל Premium!\n\n' +
      '👥 **משתתפים:** 0/' + MIN_PLAYERS + '\n\n' +
      '⏳ ממתינים לעוד שחקנים...'
    )
    .setFooter({ text: 'Pela Event' })
    .setTimestamp();

  const readyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('evt_ready').setLabel('✅ אני מוכן!').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('evt_ready_count').setLabel('0/' + MIN_PLAYERS).setStyle(ButtonStyle.Secondary).setDisabled(true),
  );

  const msg = await channel.send({ embeds: [readyEmbed], components: [readyRow] });

  activeEvents.set(eventId, {
    channelId: channel.id,
    messageId: msg.id,
    readyPlayers: new Set(),
    phase: 'waiting',
    currentGame: null,
    gameIndex: 0,
    gameMessage: null,
    overallScores: {},
    client,
  });

  await logEvent(client, '🎉 **אירוע הגרלה התחיל!**\n📍 ערוץ: <#' + channel.id + '>\n⏳ ממתין ל-' + MIN_PLAYERS + ' משתתפים');
  return msg;
}

async function handleEventButton(interaction, client) {
  const eventId = interaction.guild.id;
  let event = activeEvents.get(eventId);

  // Auto-create event if someone clicks ready but no event in memory (e.g. after restart)
  if (!event && cid === 'evt_ready') {
    activeEvents.set(eventId, {
      channelId: interaction.channel.id,
      messageId: interaction.message.id,
      readyPlayers: new Set(),
      phase: 'waiting',
      currentGame: null,
      gameIndex: 0,
      gameMessage: null,
      overallScores: {},
      client,
    });
    event = activeEvents.get(eventId);
    await logEvent(client, '\ud83d\udd04 \u05d0\u05d9\u05e8\u05d5\u05e2 \u05e0\u05d5\u05e6\u05e8 \u05de\u05d7\u05d3\u05e9 \u05d0\u05d7\u05e8\u05d9 \u05e8\u05d9\u05e1\u05d8\u05e8\u05d8 (\u05dc\u05d7\u05d9\u05e6\u05d4 \u05e8\u05d0\u05e9\u05d5\u05e0\u05d4)');
  }
  if (!event) return false;

  const cid = interaction.customId;
  if (!cid.startsWith('evt_')) return false;

  if (cid === 'evt_ready') {
    if (event.phase !== 'waiting') { await interaction.reply({ content: '⏳ האירוע כבר התחיל!', ephemeral: true }); return true; }
    event.readyPlayers.add(interaction.user.id);
    const count = event.readyPlayers.size;

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🎉 הגרלת Pela Premium!')
      .setDescription(
        '**ברוכים הבאים לאירוע של פלא!**\n\n' +
        '🏆 **הפרס:** Pela Premium לשרת שלכם!\n\n' +
        '👥 **משתתפים:** ' + count + '/' + MIN_PLAYERS + '\n' +
        [...event.readyPlayers].map(p => '• <@' + p + '>').join('\n') + '\n\n' +
        (count >= MIN_PLAYERS ? '🚀 **מספיק שחקנים! מתחילים בעוד 10 שניות...**' : '⏳ ממתינים לעוד שחקנים...')
      )
      .setFooter({ text: 'Pela Event' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('evt_ready').setLabel('✅ אני מוכן!').setStyle(ButtonStyle.Success).setDisabled(count >= MIN_PLAYERS),
      new ButtonBuilder().setCustomId('evt_ready_count').setLabel(count + '/' + MIN_PLAYERS).setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    await interaction.update({ embeds: [embed], components: [row] });
    await logEvent(client, '✅ <@' + interaction.user.id + '> הצטרף לאירוע! (' + count + '/' + MIN_PLAYERS + ')');

    if (count >= MIN_PLAYERS) {
      event.phase = 'playing';
      await logEvent(client, '🚀 **האירוע מתחיל!** ' + count + ' משתתפים:\n' + [...event.readyPlayers].map(p => '• <@' + p + '>').join('\n'));
      const ch = await client.channels.fetch(event.channelId);
      setTimeout(() => startNextGame(ch, event), 10000);
    }
    return true;
  }

  if (event.phase !== 'playing' || !event.currentGame) return false;
  const game = event.currentGame;

  // Bomb
  if (cid.startsWith('evt_bomb_')) {
    const cell = parseInt(cid.split('_')[2]);
    const r = game.play(interaction.user.id, cell);
    if (r.error === 'not_your_turn') { await interaction.reply({ content: '❌ זה לא התור שלך!', ephemeral: true }); return true; }
    if (r.error) { await interaction.reply({ content: '❌', ephemeral: true }); return true; }
    if (r.hit) await logEvent(client, '💥 <@' + interaction.user.id + '> פגע בפצצה!');
    if (r.done) {
      event.overallScores[r.winner] = (event.overallScores[r.winner] || 0) + 3;
      await interaction.update({ embeds: [game.getEmbed()], components: [] });
      await logEvent(client, '🏆 <@' + r.winner + '> ניצח במשחק הפצצה! (+3)');
      const ch = await client.channels.fetch(event.channelId);
      setTimeout(() => startNextGame(ch, event), 5000);
      return true;
    }
    await interaction.update({ embeds: [game.getEmbed()], components: game.getButtons() });
    return true;
  }

  // Memory
  if (cid.startsWith('evt_mem_')) {
    const cell = parseInt(cid.split('_')[2]);
    const r = game.play(interaction.user.id, cell);
    if (r.error === 'not_your_turn') { await interaction.reply({ content: '❌ זה לא התור שלך!', ephemeral: true }); return true; }
    if (r.error) { await interaction.reply({ content: '❌', ephemeral: true }); return true; }
    if (r.done) {
      event.overallScores[r.winner] = (event.overallScores[r.winner] || 0) + 3;
      await interaction.update({ embeds: [game.getEmbed()], components: [] });
      await logEvent(client, '🏆 <@' + r.winner + '> ניצח במשחק הזיכרון! (+3)');
      const ch = await client.channels.fetch(event.channelId);
      setTimeout(() => startNextGame(ch, event), 5000);
      return true;
    }
    await interaction.update({ embeds: [game.getEmbed()], components: game.getButtons() });
    return true;
  }

  // Reaction
  if (cid === 'evt_react_click') {
    const r = game.play(interaction.user.id);
    if (r.error) { await interaction.reply({ content: '❌', ephemeral: true }); return true; }
    if (r.done) {
      event.overallScores[r.winner] = (event.overallScores[r.winner] || 0) + 3;
      await interaction.update({ embeds: [game.getEmbed()], components: [] });
      await logEvent(client, '🏆 <@' + r.winner + '> ניצח במשחק המהירות! (+3)');
      const ch = await client.channels.fetch(event.channelId);
      setTimeout(() => startNextGame(ch, event), 5000);
      return true;
    }
    await interaction.update({ embeds: [game.getEmbed()], components: game.getButtons() });
    const ch = await client.channels.fetch(event.channelId);
    setTimeout(async () => {
      const delay = 2000 + Math.random() * 5000;
      setTimeout(async () => {
        game.startRound();
        try {
          const msg = await ch.messages.fetch(event.gameMessage);
          await msg.edit({ embeds: [game.getEmbed()], components: game.getButtons() });
        } catch {}
      }, delay);
    }, 1500);
    return true;
  }

  // Trivia
  if (cid.startsWith('evt_trivia_')) {
    const idx = parseInt(cid.split('_')[2]);
    const r = game.play(interaction.user.id, idx);
    if (r.error) { await interaction.reply({ content: '❌ כבר ענית!', ephemeral: true }); return true; }
    await interaction.reply({ content: r.correct ? '✅ נכון!' : '❌ לא נכון!', ephemeral: true });
    if (r.done) {
      event.overallScores[r.winner] = (event.overallScores[r.winner] || 0) + 3;
      const ch = await client.channels.fetch(event.channelId);
      try { const msg = await ch.messages.fetch(event.gameMessage); await msg.edit({ embeds: [game.getEmbed()], components: [] }); } catch {}
      await logEvent(client, '🏆 <@' + r.winner + '> ניצח בחידון! (+3)');
      setTimeout(() => startNextGame(ch, event), 5000);
      return true;
    }
    if (r.nextRound) {
      const ch = await client.channels.fetch(event.channelId);
      try { const msg = await ch.messages.fetch(event.gameMessage); await msg.edit({ embeds: [game.getEmbed()], components: game.getButtons() }); } catch {}
    }
    return true;
  }

  return false;
}

async function startNextGame(channel, event) {
  const players = [...event.readyPlayers];
  if (event.gameIndex >= GAMES.length) {
    event.phase = 'done';
    const sorted = Object.entries(event.overallScores).sort((a, b) => b[1] - a[1]);
    const winnerId = sorted[0] ? sorted[0][0] : players[0];

    const scoreBoard = sorted.map((s, i) => {
      const medal = ['🥇','🥈','🥉'][i] || '▫️';
      return medal + ' <@' + s[0] + '> — ' + s[1] + ' נקודות';
    }).join('\n');

    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('📊 לוח תוצאות סופי').setDescription(scoreBoard)]
    });

    try {
      const { embed, file } = await generateWinnerBanner(winnerId, event.client);
      await channel.send({ content: '@everyone', embeds: [embed], files: [file] });
    } catch (e) {
      await channel.send({
        embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('🏆🎉 המנצח הגדול! 🎉🏆')
          .setDescription('🥇 <@' + winnerId + '> ניצח באירוע!\n👑 הפרס: **Pela Premium** לשרת שלך!')
          .setTimestamp()]
      });
    }

    await logEvent(event.client, '🏆 **האירוע נגמר!**\n\n' + scoreBoard + '\n\n🥇 **מנצח: <@' + winnerId + '>**');
    // Send prize DM to winner
    try {
      await sendPrizeDM(winnerId, event.client);
      await logEvent(event.client, '🎁 נשלח DM עם הפרס ל-<@' + winnerId + '>');
    } catch (e) {
      await logEvent(event.client, '❌ נכשל לשלוח DM פרס ל-<@' + winnerId + '>: ' + e.message);
    }
    activeEvents.delete(channel.guild.id);
    return;
  }

  const gameFn = GAMES[event.gameIndex];
  event.gameIndex++;
  event.currentGame = gameFn(players);

  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xE74C3C)
      .setTitle('🎮 משחק ' + event.gameIndex + '/' + GAMES.length + ': ' + event.currentGame.name)
      .setDescription('מתחילים בעוד 5 שניות...')]
  });
  await logEvent(event.client, '🎮 **משחק ' + event.gameIndex + ':** ' + event.currentGame.name);

  setTimeout(async () => {
    const game = event.currentGame;
    if (game.type === 'reaction') {
      const msg = await channel.send({ embeds: [game.getEmbed()], components: game.getButtons() });
      event.gameMessage = msg.id;
      const delay = 2000 + Math.random() * 5000;
      setTimeout(async () => {
        game.startRound();
        try { await msg.edit({ embeds: [game.getEmbed()], components: game.getButtons() }); } catch {}
      }, delay);
    } else {
      const msg = await channel.send({ embeds: [game.getEmbed()], components: game.getButtons() });
      event.gameMessage = msg.id;
    }
  }, 5000);
}

const prizeClaimers = new Map();

async function sendPrizeDM(winnerId, client) {
  const user = await client.users.fetch(winnerId);
  const dm = await user.createDM();
  const mutualGuilds = [];
  for (const [, guild] of client.guilds.cache) {
    try {
      const member = await guild.members.fetch(winnerId).catch(() => null);
      if (member) mutualGuilds.push({ id: guild.id, name: guild.name });
    } catch {}
  }
  prizeClaimers.set(winnerId, { winnerId, step: 'pick_server', guilds: mutualGuilds });
  const { EmbedBuilder: EB, ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS, StringSelectMenuBuilder } = require('discord.js');
  const desc = '\ud83c\udf81 **\u05d4\u05e4\u05e8\u05e1 \u05e9\u05dc\u05da:** Pela Premium \u05dc\u05e9\u05e8\u05ea!\n\n' +
    '\ud83d\udccb **\u05d1\u05d7\u05e8 \u05e9\u05e8\u05ea \u05e9\u05d1\u05d5 \u05e4\u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05ea:**\n' +
    (mutualGuilds.length > 0 ? mutualGuilds.map((g, i) => (i+1) + '. ' + g.name).join('\n') : '\u05e4\u05dc\u05d0 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05ea \u05d1\u05d0\u05e3 \u05e9\u05e8\u05ea \u05e9\u05dc\u05da!') +
    '\n\n\ud83d\udc47 \u05d1\u05d7\u05e8 \u05de\u05d4\u05e8\u05e9\u05d9\u05de\u05d4 \u05d0\u05d5 \u05dc\u05d7\u05e5 \u05e9\u05e8\u05ea \u05d0\u05d7\u05e8';
  const embed = new EB().setColor(0xFFD700).setTitle('\ud83c\udfc6 \u05de\u05d6\u05dc \u05d8\u05d5\u05d1! \u05e0\u05d9\u05e6\u05d7\u05ea \u05d1\u05d0\u05d9\u05e8\u05d5\u05e2!').setDescription(desc);
  const components = [];
  if (mutualGuilds.length > 0) {
    components.push(new AR().addComponents(
      new StringSelectMenuBuilder().setCustomId('evt_prize_server').setPlaceholder('\ud83d\udccb \u05d1\u05d7\u05e8 \u05e9\u05e8\u05ea...')
        .addOptions(mutualGuilds.slice(0, 25).map(g => ({ label: g.name.slice(0, 100), value: g.id })))
    ));
  }
  components.push(new AR().addComponents(
    new BB().setCustomId('evt_prize_other').setLabel('\ud83d\udd17 \u05e9\u05e8\u05ea \u05d0\u05d7\u05e8').setStyle(BS.Secondary)
  ));
  await dm.send({ embeds: [embed], components });
  await logEvent(client, '\ud83c\udf81 **DM \u05e4\u05e8\u05e1 \u05dc\u05de\u05e0\u05e6\u05d7:**\n\ud83d\udc64 <@' + winnerId + '>\n\ud83d\udccb \u05e9\u05e8\u05ea\u05d9\u05dd: ' + mutualGuilds.map(g => g.name).join(', '));
}

async function handlePrizeDM(interaction, client, db) {
  const userId = interaction.user.id;
  const claimer = prizeClaimers.get(userId);
  if (!claimer) return false;
  const { EmbedBuilder: EB, ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');

  await logEvent(client, '\ud83d\udd0d **\u05de\u05e0\u05e6\u05d7 \u05dc\u05d7\u05e5:** ' + interaction.customId + '\n\ud83d\udc64 <@' + userId + '>');

  if (interaction.customId === 'evt_prize_server') {
    const guildId = interaction.values[0];
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await interaction.update({ content: '\u274c \u05e4\u05dc\u05d0 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05ea \u05d1\u05e9\u05e8\u05ea. \u05d1\u05d7\u05e8 \u05d0\u05d7\u05e8.', embeds: [], components: [] });
      await logEvent(client, '\u274c \u05de\u05e0\u05e6\u05d7 <@' + userId + '> \u05d1\u05d7\u05e8 \u05e9\u05e8\u05ea \u05e9\u05e4\u05dc\u05d0 \u05dc\u05d0 \u05d1\u05d5: ' + guildId);
      return true;
    }
    db.addPremium(guildId, userId);
    prizeClaimers.delete(userId);
    await interaction.update({
      embeds: [new EB().setColor(0x57F287).setTitle('\u2705 Premium \u05d4\u05d5\u05e4\u05e2\u05dc!')
        .setDescription('\ud83d\udc51 Premium \u05d4\u05d5\u05e4\u05e2\u05dc \u05dc\u05e9\u05e8\u05ea **' + guild.name + '**!\n\n\ud83c\udf89 \u05ea\u05d4\u05e0\u05d4 \u05de\u05db\u05dc \u05d4\u05e4\u05d9\u05e6\u05f3\u05e8\u05d9\u05dd!')],
      components: []
    });
    await logEvent(client, '\ud83d\udc51 **Premium \u05d4\u05d5\u05e4\u05e2\u05dc!**\n\ud83c\udfc6 \u05de\u05e0\u05e6\u05d7: <@' + userId + '>\n\ud83c\udfe0 \u05e9\u05e8\u05ea: **' + guild.name + '** (' + guildId + ')');
    return true;
  }

  if (interaction.customId === 'evt_prize_other') {
    claimer.step = 'waiting_invite';
    await interaction.update({
      embeds: [new EB().setColor(0xF1C40F).setTitle('\ud83d\udd17 \u05e9\u05e8\u05ea \u05d0\u05d7\u05e8')
        .setDescription('\u05e4\u05dc\u05d0 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05ea \u05d1\u05e9\u05e8\u05ea?\n\n' +
          '1\ufe0f\u20e3 **\u05d4\u05d6\u05de\u05df \u05d0\u05ea \u05e4\u05dc\u05d0** — [\u05dc\u05d7\u05e5 \u05db\u05d0\u05df](https://discord.com/api/oauth2/authorize?client_id=1507712315678527558&permissions=8&scope=bot%20applications.commands)\n' +
          '2\ufe0f\u20e3 \u05d0\u05d7\u05e8\u05d9 \u05e9\u05d4\u05d6\u05de\u05e0\u05ea, **\u05dc\u05d7\u05e5 \u05e8\u05e2\u05e0\u05df** \u05d5\u05ea\u05d1\u05d7\u05e8')],
      components: [new AR().addComponents(
        new BB().setCustomId('evt_prize_refresh').setLabel('\ud83d\udd04 \u05e8\u05e2\u05e0\u05df \u05e8\u05e9\u05d9\u05de\u05d4').setStyle(BS.Primary)
      )]
    });
    await logEvent(client, '\ud83d\udd17 \u05de\u05e0\u05e6\u05d7 <@' + userId + '> \u05d1\u05d7\u05e8 \u05e9\u05e8\u05ea \u05d0\u05d7\u05e8 — \u05de\u05d7\u05db\u05d4 \u05e9\u05d9\u05d6\u05de\u05d9\u05df');
    return true;
  }

  if (interaction.customId === 'evt_prize_refresh') {
    const mutualGuilds = [];
    for (const [, guild] of client.guilds.cache) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) mutualGuilds.push({ id: guild.id, name: guild.name });
      } catch {}
    }
    const { StringSelectMenuBuilder } = require('discord.js');
    const components = [];
    if (mutualGuilds.length > 0) {
      components.push(new AR().addComponents(
        new StringSelectMenuBuilder().setCustomId('evt_prize_server').setPlaceholder('\ud83d\udccb \u05d1\u05d7\u05e8 \u05e9\u05e8\u05ea...')
          .addOptions(mutualGuilds.slice(0, 25).map(g => ({ label: g.name.slice(0, 100), value: g.id })))
      ));
    }
    components.push(new AR().addComponents(
      new BB().setCustomId('evt_prize_other').setLabel('\ud83d\udd17 \u05e2\u05d3\u05d9\u05d9\u05df \u05dc\u05d0? \u05d4\u05d6\u05de\u05df \u05e9\u05d5\u05d1').setStyle(BS.Secondary)
    ));
    await interaction.update({
      embeds: [new EB().setColor(0xFFD700).setTitle('\ud83d\udccb \u05e9\u05e8\u05ea\u05d9\u05dd')
        .setDescription(mutualGuilds.length > 0 ? '\u05d1\u05d7\u05e8 \u05e9\u05e8\u05ea:' : '\u274c \u05e4\u05dc\u05d0 \u05e2\u05d3\u05d9\u05d9\u05df \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05ea. \u05d4\u05d6\u05de\u05df \u05e7\u05d5\u05d3\u05dd!')],
      components
    });
    await logEvent(client, '\ud83d\udd04 \u05de\u05e0\u05e6\u05d7 <@' + userId + '> \u05e8\u05d9\u05e2\u05e0\u05df. \u05e9\u05e8\u05ea\u05d9\u05dd: ' + mutualGuilds.map(g => g.name).join(', '));
    return true;
  }
  return false;
}

module.exports = { startEvent, handleEventButton, handlePrizeDM, activeEvents, prizeClaimers, logEvent };
