const https = require('https');
const http  = require('http');

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generates a welcome card image buffer (PNG, 900×300).
 * @param {GuildMember} member  Discord.js GuildMember
 * @param {object}      config  { welcome_message, bg_color? }
 */
async function generateWelcomeCard(member, config = {}) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const W = 900, H = 300;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#07071a');
  bg.addColorStop(0.55, '#0d0d22');
  bg.addColorStop(1, '#100d1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle right-side radial glow
  const rightGlow = ctx.createRadialGradient(W * 0.85, H / 2, 0, W * 0.85, H / 2, 300);
  rightGlow.addColorStop(0, 'rgba(124,90,247,0.12)');
  rightGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, W, H);

  // Left glow behind avatar
  const leftGlow = ctx.createRadialGradient(150, 150, 40, 150, 150, 160);
  leftGlow.addColorStop(0, 'rgba(124,90,247,0.22)');
  leftGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, W, H);

  // Top + bottom accent bars
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0,    'rgba(124,90,247,0.9)');
  bar.addColorStop(0.5,  'rgba(247,90,139,0.7)');
  bar.addColorStop(1,    'rgba(88,101,242,0.9)');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0,   W, 4);
  ctx.fillRect(0, H-4, W, 4);

  // Dot grid pattern (subtle)
  ctx.fillStyle = 'rgba(124,90,247,0.04)';
  for (let x = 30; x < W; x += 40) {
    for (let y = 30; y < H; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const AX = 150, AY = 150, AR = 95;
  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const buf       = await fetchBuffer(avatarUrl);
    const img       = await loadImage(buf);

    // Outer glow ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(124,90,247,0.18)';
    ctx.fill();
    ctx.restore();

    // Clip avatar to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, AX - AR, AY - AR, AR * 2, AR * 2);
    ctx.restore();

    // Purple border ring
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#7c5af7';
    ctx.lineWidth   = 4;
    ctx.stroke();

    // Thin outer ring
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(124,90,247,0.3)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  } catch {
    // Fallback gradient circle if avatar fails
    const g = ctx.createRadialGradient(AX, AY, 0, AX, AY, AR);
    g.addColorStop(0, '#9d80ff');
    g.addColorStop(1, '#4c3abf');
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.font      = `bold ${AR}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(member.user.username[0].toUpperCase(), AX, AY);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Text ────────────────────────────────────────────────────────────────────
  const TX = 290;

  // "WELCOME" label
  ctx.font      = 'bold 15px sans-serif';
  ctx.fillStyle = 'rgba(180,150,255,0.75)';
  ctx.fillText('WELCOME', TX, 74);

  // Decorative line next to WELCOME
  ctx.fillStyle = 'rgba(124,90,247,0.5)';
  ctx.fillRect(TX + ctx.measureText('WELCOME').width + 10, 68, 80, 1.5);

  // Username — truncate to fit
  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = '#ffffff';
  let uname = member.user.username;
  while (ctx.measureText(uname).width > 575 && uname.length > 3) uname = uname.slice(0, -1);
  if (uname !== member.user.username) uname += '…';
  ctx.fillText(uname, TX, 145);

  // Discriminator / global name
  const tag = member.user.discriminator && member.user.discriminator !== '0'
    ? `#${member.user.discriminator}`
    : member.nickname ? `(${member.nickname})` : '';
  if (tag) {
    ctx.font      = '22px sans-serif';
    ctx.fillStyle = 'rgba(180,160,255,0.45)';
    ctx.fillText(tag, TX + ctx.measureText(uname.replace('…','')).width + 8, 145);
  }

  // Welcome message
  const rawMsg = (config.welcome_message || 'Welcome to {server}!')
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{user\}/g,   member.user.username)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{membercount\}/g, String(member.guild.memberCount));

  ctx.font      = '27px sans-serif';
  ctx.fillStyle = 'rgba(200,185,255,0.72)';
  let msg = rawMsg;
  while (ctx.measureText(msg).width > 590 && msg.length > 4) msg = msg.slice(0, -1);
  if (msg !== rawMsg) msg += '…';
  ctx.fillText(msg, TX, 198);

  // Member count badge
  const memberText = `Member #${member.guild.memberCount}`;
  const badgeX     = TX;
  const badgeY     = 240;
  const badgeW     = ctx.measureText(memberText).width + 24;
  ctx.font         = '20px sans-serif';

  ctx.fillStyle    = 'rgba(124,90,247,0.18)';
  roundRect(ctx, badgeX - 2, badgeY - 20, badgeW, 28, 6);
  ctx.fill();
  ctx.strokeStyle  = 'rgba(124,90,247,0.35)';
  ctx.lineWidth    = 1;
  roundRect(ctx, badgeX - 2, badgeY - 20, badgeW, 28, 6);
  ctx.stroke();

  ctx.fillStyle    = 'rgba(180,160,255,0.65)';
  ctx.fillText(memberText, TX + 10, badgeY);

  return canvas.encode('png');
}


/**
 * Generates a goodbye card image buffer (PNG, 900x300).
 * @param {GuildMember} member  Discord.js GuildMember
 * @param {object}      config  { goodbye_message }
 */
async function generateGoodbyeCard(member, config = {}) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const W = 900, H = 300;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1a0707');
  bg.addColorStop(0.55, '#1e0d0d');
  bg.addColorStop(1, '#1e0d10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rightGlow = ctx.createRadialGradient(W * 0.85, H / 2, 0, W * 0.85, H / 2, 300);
  rightGlow.addColorStop(0, 'rgba(247,90,90,0.12)');
  rightGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, W, H);

  const leftGlow = ctx.createRadialGradient(150, 150, 40, 150, 150, 160);
  leftGlow.addColorStop(0, 'rgba(247,90,90,0.22)');
  leftGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, W, H);

  // Top + bottom accent bars (red tones)
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0,   'rgba(247,90,90,0.9)');
  bar.addColorStop(0.5, 'rgba(247,140,90,0.7)');
  bar.addColorStop(1,   'rgba(200,50,50,0.9)');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0,   W, 4);
  ctx.fillRect(0, H-4, W, 4);

  // Dot grid pattern
  ctx.fillStyle = 'rgba(247,90,90,0.04)';
  for (let x = 30; x < W; x += 40) {
    for (let y = 30; y < H; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Avatar
  const AX = 150, AY = 150, AR = 95;
  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const buf       = await fetchBuffer(avatarUrl);
    const img       = await loadImage(buf);

    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR + 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(247,90,90,0.18)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, AX - AR, AY - AR, AR * 2, AR * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(AX, AY, AR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#f75a5a';
    ctx.lineWidth   = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(AX, AY, AR + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(247,90,90,0.3)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  } catch {
    const g = ctx.createRadialGradient(AX, AY, 0, AX, AY, AR);
    g.addColorStop(0, '#ff8080');
    g.addColorStop(1, '#bf3030');
    ctx.beginPath();
    ctx.arc(AX, AY, AR, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.font      = `bold ${AR}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(member.user.username[0].toUpperCase(), AX, AY);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // Text
  const TX = 290;

  ctx.font      = 'bold 15px sans-serif';
  ctx.fillStyle = 'rgba(255,160,160,0.75)';
  ctx.fillText('FAREWELL', TX, 74);

  ctx.fillStyle = 'rgba(247,90,90,0.5)';
  ctx.fillRect(TX + ctx.measureText('FAREWELL').width + 10, 68, 80, 1.5);

  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = '#ffffff';
  let uname = member.user.username;
  while (ctx.measureText(uname).width > 575 && uname.length > 3) uname = uname.slice(0, -1);
  if (uname !== member.user.username) uname += '…';
  ctx.fillText(uname, TX, 145);

  const tag = member.user.discriminator && member.user.discriminator !== '0'
    ? `#${member.user.discriminator}`
    : member.nickname ? `(${member.nickname})` : '';
  if (tag) {
    ctx.font      = '22px sans-serif';
    ctx.fillStyle = 'rgba(255,180,180,0.45)';
    ctx.fillText(tag, TX + ctx.measureText(uname.replace('…','')).width + 8, 145);
  }

  const rawMsg = (config.goodbye_message || 'Goodbye {user}, we will miss you!')
    .replace(/\{server\}/g,   member.guild.name)
    .replace(/\{user\}/g,     member.user.username)
    .replace(/\{username\}/g, member.user.username);

  ctx.font      = '27px sans-serif';
  ctx.fillStyle = 'rgba(255,200,200,0.72)';
  let msg = rawMsg;
  while (ctx.measureText(msg).width > 590 && msg.length > 4) msg = msg.slice(0, -1);
  if (msg !== rawMsg) msg += '…';
  ctx.fillText(msg, TX, 198);

  return canvas.encode('png');
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = { generateWelcomeCard, generateGoodbyeCard };
