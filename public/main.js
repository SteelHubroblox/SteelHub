const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('startButton');
const draftOverlay = document.getElementById('draftOverlay');
const draftPlayerLabel = document.getElementById('draftPlayerLabel');
const cardGrid = document.getElementById('cardGrid');

// Resize
function fit() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fit);
fit();

// Game constants
const G = 1800; // gravity px/s^2
const JUMP_V = 750;
const MOVE_A = 3000;
const MAX_VX = 380;
const AIR_CTRL = 0.7;
const FRICTION = 12;

const SERIES_WINS_TARGET = 3; // best of 5 (first to 3)
const ROUND_BEST_OF = 3; // best of 3 per round (first to 2)
let roundWins = [0, 0];

// Input
const keys = new Set();
let jumpPressed = false;
window.addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') jumpPressed = true; });
window.addEventListener('keyup', (e) => keys.delete(e.code));
let mouseDown = false;
window.addEventListener('mousedown', (e) => { if (e.button === 0) mouseDown = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });

// World platforms (side view)
let platforms = [];
function makeDefaultPlatforms() {
  const w = canvas.width, h = canvas.height;
  platforms = [
    // ground
    { x: 0, y: h - 60, w: w, h: 60 },
    // mid platforms
    { x: w * 0.2, y: h * 0.68, w: 220, h: 16 },
    { x: w * 0.6, y: h * 0.56, w: 260, h: 16 },
    { x: w * 0.15, y: h * 0.44, w: 180, h: 16 },
    { x: w * 0.55, y: h * 0.34, w: 220, h: 16 },
  ];
}
makeDefaultPlatforms();

// Utils
function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function randRange(a, b) { return a + Math.random() * (b - a); }

// Player, bullets
class Player {
  constructor(idx, color, controls) {
    this.idx = idx;
    this.color = color;
    this.controls = controls;
    this.w = 36; this.h = 54;
    this.reset();
    this.cards = [];
  }
  reset(spawnX, spawnY) {
    this.x = spawnX ?? (this.idx === 0 ? canvas.width * 0.18 : canvas.width * 0.82);
    this.y = spawnY ?? (canvas.height - 60 - this.h);
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.hp = this.maxHp || 100;
    this.reload = 0;
    this.facing = this.idx === 0 ? 1 : -1;
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
    this.maxJumps = this.maxJumps || 1;
    this.jumpsUsed = 0;
    this.shieldCooldownMax = this.shieldCooldownMax || 0;
    this.shieldCooldown = 0;
    this.shieldCharges = this.shieldCharges || 0;
    this.pierce = !!this.pierce;
    this.bounceBullets = !!this.bounceBullets;
    this.explosive = !!this.explosive;
    this.lifesteal = this.lifesteal || 0;
  }
  applyCards() {
    // reset to base and reapply
    const saved = { maxHp: this.maxHp || 100, maxJumps: this.maxJumps || 1, shieldCooldownMax: this.shieldCooldownMax||0, bounceBullets: !!this.bounceBullets, explosive: !!this.explosive, pierce: !!this.pierce, lifesteal: this.lifesteal||0 };
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
    this.maxHp = saved.maxHp; this.hp = Math.min(this.hp + (this.maxHp - (this.hp||100)), this.maxHp);
    this.maxJumps = saved.maxJumps; this.shieldCooldownMax = saved.shieldCooldownMax; this.bounceBullets = saved.bounceBullets; this.explosive = saved.explosive; this.pierce = saved.pierce; this.lifesteal = saved.lifesteal;
    for (const c of this.cards) c.apply(this);
  }
}

class Bullet {
  constructor(owner, x, y, vx, vy, dmg, color) {
    this.owner = owner; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = 4;
    this.dmg = dmg; this.life = 2.5; this.color = color; this.pierces = owner.pierce ? 1 : 0; this.bounces = owner.bounceBullets ? 1 : 0;
  }
}

// Cards with rarities
const RARITY = { Common: 'Common', Rare: 'Rare', Epic: 'Epic', Legendary: 'Legendary' };
const RARITY_WEIGHTS = [
  { r: RARITY.Common, w: 0.6 },
  { r: RARITY.Rare, w: 0.28 },
  { r: RARITY.Epic, w: 0.1 },
  { r: RARITY.Legendary, w: 0.02 },
];
const RARITY_COLOR = { Common: '#9aa6b2', Rare: '#53b3f3', Epic: '#c77dff', Legendary: '#ffd166' };

function weightedRarity() {
  const x = Math.random();
  let acc = 0;
  for (const e of RARITY_WEIGHTS) { acc += e.w; if (x <= acc) return e.r; }
  return RARITY.Common;
}

// Expand abilities repertoire
const ALL_CARDS = [
  { id: 'rapid', title: 'Rapid Fire', desc: 'Fire delay -40%', rarity: RARITY.Common, apply: p => p.fireDelay *= 0.6 },
  { id: 'power', title: 'High Caliber', desc: '+50% bullet damage, +recoil', rarity: RARITY.Rare, apply: p => { p.bulletDmg *= 1.5; p.knockback *= 1.2; } },
  { id: 'speed', title: 'Sprinter', desc: '+20% move speed', rarity: RARITY.Common, apply: p => { p.moveBoost += 0.2; } },
  { id: 'jumper', title: 'Bunny Hop', desc: '+25% jump power', rarity: RARITY.Common, apply: p => { p.jumpBoost += 0.25; } },
  { id: 'pierce', title: 'Piercing Rounds', desc: 'Bullets pierce once', rarity: RARITY.Rare, apply: p => { p.pierce = true; } },
  { id: 'sniper', title: 'Marksman', desc: '+30% bullet speed', rarity: RARITY.Rare, apply: p => { p.bulletSpeed *= 1.3; } },
  { id: 'doublejump', title: 'Double Jump', desc: 'Gain an extra mid-air jump', rarity: RARITY.Rare, apply: p => { p.maxJumps = Math.max(p.maxJumps || 1, 2); } },
  { id: 'shield', title: 'Personal Shield', desc: 'Block next bullet every 8s', rarity: RARITY.Epic, apply: p => { p.shieldCooldownMax = 8; p.shieldCooldown = 0; p.shieldCharges = (p.shieldCharges||0); } },
  { id: 'lifesteal', title: 'Vampiric Rounds', desc: 'Heal 6 on hit', rarity: RARITY.Rare, apply: p => { p.lifesteal = 6; } },
  { id: 'hp', title: 'Toughness', desc: '+40 max HP', rarity: RARITY.Common, apply: p => { p.maxHp = (p.maxHp||100) + 40; p.hp += 40; } },
  { id: 'bounce', title: 'Bouncy Bullets', desc: 'Bullets bounce off platforms once', rarity: RARITY.Epic, apply: p => { p.bounceBullets = true; } },
  { id: 'explosive', title: 'Explosive Rounds', desc: 'Bullets explode in small radius', rarity: RARITY.Legendary, apply: p => { p.explosive = true; } },
];

function generateDraftPool() {
  const pool = [];
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const rarity = weightedRarity();
    const candidates = ALL_CARDS.filter(c => c.rarity === rarity && !used.has(c.id));
    let pick = candidates[Math.floor(Math.random() * candidates.length)] || ALL_CARDS.filter(c=>!used.has(c.id))[0];
    if (!pick) break;
    used.add(pick.id);
    pool.push(pick);
  }
  return pool;
}

// Game state
let players = [
  new Player(0, '#69f0ae', { left: 'KeyA', right: 'KeyD', jump: 'Space', fire: 'MouseLeft' }),
  new Player(1, '#ff8a80', { ai: true }),
];
let bullets = [];
let winner = null;
let scores = [0, 0];
let state = 'menu'; // menu, playing, between
let lastTime = performance.now() / 1000;

const menu = document.getElementById('menu');
const difficultySel = document.getElementById('difficulty');
startButton.onclick = () => {
  menu.classList.add('hidden');
  overlayHideDraft();
  doStartMatch();
};
function overlayHideDraft() { draftOverlay.classList.add('hidden'); }

// Multiple arenas
let currentArena = 0;
function buildArena(idx) {
  const w = canvas.width, h = canvas.height;
  if (idx === 0) {
    // Classic (lowered platforms for accessibility)
    platforms = [
      { x: 0, y: h - 60, w, h: 60 },
      { x: w * 0.22, y: h * 0.78, w: 220, h: 16 },
      { x: w * 0.60, y: h * 0.70, w: 260, h: 16 },
      { x: w * 0.16, y: h * 0.62, w: 180, h: 16 },
      { x: w * 0.56, y: h * 0.54, w: 220, h: 16 },
    ];
  } else if (idx === 1) {
    // Towers
    const pw = 180, ph = 16;
    platforms = [
      { x: 0, y: h - 60, w, h: 60 },
      { x: w * 0.18, y: h * 0.72, w: pw, h: ph },
      { x: w * 0.18, y: h * 0.52, w: pw, h: ph },
      { x: w * 0.18, y: h * 0.32, w: pw, h: ph },
      { x: w * 0.64, y: h * 0.66, w: pw, h: ph },
      { x: w * 0.64, y: h * 0.46, w: pw, h: ph },
      { x: w * 0.64, y: h * 0.26, w: pw, h: ph },
      { x: w * 0.40, y: h * 0.56, w: 220, h: ph },
    ];
  } else if (idx === 2) {
    // Bridges
    platforms = [
      { x: 0, y: h - 60, w, h: 60 },
      { x: w * 0.05, y: h * 0.62, w: w * 0.9, h: 14 },
      { x: w * 0.2, y: h * 0.48, w: 180, h: 14 },
      { x: w * 0.6, y: h * 0.36, w: 200, h: 14 },
    ];
  } else {
    // Pyramids
    const ph = 16;
    platforms = [
      { x: 0, y: h - 60, w, h: 60 },
      { x: w * 0.2, y: h * 0.74, w: 160, h: ph },
      { x: w * 0.17, y: h * 0.66, w: 220, h: ph },
      { x: w * 0.14, y: h * 0.58, w: 280, h: ph },
      { x: w * 0.66, y: h * 0.70, w: 200, h: ph },
      { x: w * 0.62, y: h * 0.62, w: 260, h: ph },
      { x: w * 0.58, y: h * 0.54, w: 320, h: ph },
    ];
  }
}

function doStartMatch() {
  state = 'playing';
  bullets = [];
  particles.length = 0;
  currentArena = (currentArena + 1) % 4; // rotate arenas each match
  buildArena(currentArena);
  players[0].reset(); players[1].reset();
  players[0].applyCards(); players[1].applyCards();
}

// AI params
const AI = { react: 0.2, aimJitter: 0.15 };
function setDifficulty(label) {
  if (label === 'easy') { AI.react = 0.35; AI.aimJitter = 0.3; }
  else if (label === 'hard') { AI.react = 0.12; AI.aimJitter = 0.06; }
  else { AI.react = 0.2; AI.aimJitter = 0.15; }
}
setDifficulty('normal');
difficultySel?.addEventListener('change', (e) => setDifficulty(e.target.value));

// particles
const particles = [];
function spawnParticle(x, y, color) {
  particles.push({ x, y, vx: randRange(-120, 120), vy: randRange(-220, -60), life: 0.6, color });
}

let shakeT = 0;
function addShake(s) { shakeT = Math.min(0.3, shakeT + s); }

function endRound(winnerIdx) {
  roundWins[winnerIdx]++;
  const need = Math.ceil(ROUND_BEST_OF / 2);
  if (roundWins[winnerIdx] >= need) {
    scores[winnerIdx]++;
    roundWins = [0, 0];
    // Between rounds: draft
    state = 'between';
    openDraft(winnerIdx === 0 ? 1 : 0); // loser picks first
    // Check series end
    if (scores[winnerIdx] >= SERIES_WINS_TARGET) {
      state = 'menu';
      menu.classList.remove('hidden');
      startButton.textContent = `P${winnerIdx + 1} wins the series! Play again`;
      scores = [0, 0];
      players.forEach(p => { p.cards = []; });
      return;
    }
    return;
  }
  // Continue same round without draft
  doStartMatch();
}

function openDraft(firstPickerIdx) {
  draftOverlay.classList.remove('hidden');
  doDraftFor(firstPickerIdx, () => doDraftFor(firstPickerIdx === 0 ? 1 : 0, () => {
    draftOverlay.classList.add('hidden');
    doStartMatch();
  }));
}

function doDraftFor(playerIdx, done) {
  const isAI = !!players[playerIdx].controls.ai;
  if (isAI) {
    const pool = generateDraftPool();
    const choice = pool[Math.floor(Math.random() * pool.length)];
    players[playerIdx].cards.push(choice);
    players[playerIdx].applyCards();
    done();
    return;
  }
  draftPlayerLabel.textContent = `Player ${playerIdx + 1} pick`;
  cardGrid.innerHTML = '';
  const pool = generateDraftPool();
  for (const c of pool) {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div class="card-title" style="color:${RARITY_COLOR[c.rarity]}">${c.title} · ${c.rarity}</div><div class="card-desc">${c.desc}</div>`;
    el.onclick = () => {
      players[playerIdx].cards.push(c);
      players[playerIdx].applyCards();
      done();
    };
    cardGrid.appendChild(el);
  }
}
function pickNCards(pool, n) {
  const tmp = [...pool]; const out = [];
  for (let i = 0; i < n && tmp.length; i++) out.push(tmp.splice(Math.floor(Math.random() * tmp.length), 1)[0]);
  return out;
}

function update(dt) {
  if (state !== 'playing') { jumpPressed = false; return; }

  // screen shake decay
  shakeT = Math.max(0, shakeT - dt);

  for (let pi = 0; pi < players.length; pi++) {
    const p = players[pi];
    const isAI = !!p.controls.ai;

    if (!isAI) {
      const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL);
      if (keys.has('KeyA')) p.vx -= accel * dt;
      if (keys.has('KeyD')) p.vx += accel * dt;
      p.vx = clamp(p.vx, -MAX_VX * (1 + p.moveBoost), MAX_VX * (1 + p.moveBoost));

      if (jumpPressed && (p.onGround || p.jumpsUsed < (p.maxJumps - 0))) {
        if (p.onGround) { p.jumpsUsed = 0; }
        if (p.onGround || p.jumpsUsed < p.maxJumps) {
          p.vy = -JUMP_V * (1 + p.jumpBoost);
          p.onGround = false;
          p.jumpsUsed++;
        }
      }

      // P1 fire with mouse
      p.reload -= dt;
      if (mouseDown && p.reload <= 0) {
        const dir = p.facing;
        bullets.push(new Bullet(p, p.x + p.w / 2 + dir * 28, p.y + p.h * 0.35, dir * p.bulletSpeed, randRange(-60, 60), p.bulletDmg, p.color));
        p.reload = p.fireDelay;
        p.vx -= dir * (p.knockback / 10);
        addShake(0.05);
      }
    } else {
      // AI with less mirroring
      const enemy = players[0];
      const dx = (enemy.x + enemy.w / 2) - (p.x + p.w / 2);
      const wantDir = Math.sign(dx) || (Math.random() < 0.5 ? -1 : 1);
      // occasional strafe change
      if (Math.random() < 0.01) p.facing = wantDir;
      const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL) * (0.85 + (AI.react * 0.25));
      p.vx += wantDir * accel * dt;
      p.vx = clamp(p.vx, -MAX_VX * 0.85, MAX_VX * 0.85);
      // jump logic
      if (p.onGround && ((enemy.y + enemy.h < p.y - 20) || Math.abs(dx) < 50 || Math.random() < 0.02)) {
        p.vy = -JUMP_V * (0.9 + (1 - AI.react) * 0.2);
        p.onGround = false;
      }
      // fire logic
      p.reload -= dt;
      const verticalAlign = Math.abs((enemy.y + enemy.h * 0.4) - (p.y + p.h * 0.35)) < 110;
      if (verticalAlign && Math.abs(dx) < canvas.width * 0.6 && p.reload <= 0) {
        const spread = randRange(-60 - AI.aimJitter * 60, 60 + AI.aimJitter * 60);
        const dir = Math.sign(dx) || p.facing;
        bullets.push(new Bullet(p, p.x + p.w / 2 + dir * 28, p.y + p.h * 0.35, dir * p.bulletSpeed, spread, p.bulletDmg, p.color));
        p.reload = p.fireDelay * (0.9 + AI.react * 0.6);
        addShake(0.05);
      }
    }

    // shield cooldown
    if (p.shieldCooldownMax > 0) {
      p.shieldCooldown -= dt; if (p.shieldCooldown <= 0) { p.shieldCooldown = p.shieldCooldownMax; p.shieldCharges = Math.min((p.shieldCharges||0) + 1, 1); }
    }

    // gravity
    p.vy += G * dt;

    // integrate + collisions
    p.x += p.vx * dt;
    const bboxX = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const s of platforms) if (rectsIntersect(bboxX, s)) {
      if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w;
      p.vx = 0;
    }

    p.y += p.vy * dt;
    p.onGround = false;
    const bboxY = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const s of platforms) if (rectsIntersect(bboxY, s)) {
      if (p.vy > 0) { p.y = s.y - p.h; p.onGround = true; p.jumpsUsed = 0; } else if (p.vy < 0) { p.y = s.y + s.h; }
      p.vy = 0;
    }

    // invisible side barriers
    p.x = clamp(p.x, 0, canvas.width - p.w);

    if (p.onGround) p.vx -= p.vx * FRICTION * dt;
    if (Math.abs(p.vx) > 1) p.facing = Math.sign(p.vx);
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt; if (b.life <= 0) { bullets.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vy += (G * 0.2) * dt;
    const bb = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
    let hitGeom = false;
    for (const s of platforms) if (rectsIntersect(bb, s)) { hitGeom = true; if (b.bounces > 0) { b.vy = -Math.abs(b.vy) * 0.7; b.bounces--; hitGeom = false; } else if (b.owner.explosive) { spawnExplosion(b.x, b.y, b.owner); } break; }
    if (hitGeom) { bullets.splice(i, 1); continue; }
    if (b.x < -50 || b.x > canvas.width + 50 || b.y > canvas.height + 200) { bullets.splice(i, 1); continue; }
    for (const p of players) {
      if (p === b.owner) continue;
      if (rectsIntersect(bb, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        // shield
        if (p.shieldCharges && p.shieldCharges > 0) { p.shieldCharges--; spawnParticle(b.x, b.y, '#9ad7ff'); bullets.splice(i, 1); break; }
        p.hp -= b.dmg;
        if (b.owner.lifesteal) p.owner.hp = clamp((p.owner.hp||100) + b.owner.lifesteal, 0, p.owner.maxHp||100);
        p.vx += Math.sign(b.vx) * 80; p.vy -= 120;
        spawnParticle(b.x, b.y, b.color);
        addShake(0.07);
        if (b.pierces > 0) { b.pierces--; } else { bullets.splice(i, 1); }
        break;
      }
    }
  }

  // explosions apply damage
  if (explosions.length) {
    for (let ei = explosions.length - 1; ei >= 0; ei--) {
      const e = explosions[ei];
      e.t += dt; if (e.t > 0.25) { explosions.splice(ei,1); continue; }
      for (const p of players) {
        const cx = p.x + p.w/2, cy = p.y + p.h/2;
        const d2 = (cx - e.x)**2 + (cy - e.y)**2;
        if (d2 < e.r*e.r) {
          p.hp -= e.dmg * dt * 4; // distributed over brief lifetime
        }
      }
    }
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 800 * dt;
  }

  let alive = players.map(p => p.hp > 0);
  if (alive.filter(Boolean).length <= 1) {
    const winIdx = alive[0] ? 0 : 1;
    endRound(winIdx);
  }
  jumpPressed = false;
}

const explosions = [];
function spawnExplosion(x, y, owner) {
  const r = 80; const dmg = 20;
  explosions.push({ x, y, r, dmg, t: 0, owner });
  for (let i=0;i<16;i++) spawnParticle(x, y, owner.color);
  addShake(0.12);
}

function drawRoundedRect(x, y, w, h, r) {
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

function draw() {
  // bg
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gTop = '#0b1020', gBot = '#141f3b';
  const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gr.addColorStop(0, gTop); gr.addColorStop(1, gBot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // screen shake offset
  let sx = 0, sy = 0;
  if (shakeT > 0) { sx = (Math.random() - 0.5) * 10 * shakeT; sy = (Math.random() - 0.5) * 10 * shakeT; ctx.save(); ctx.translate(sx, sy); }

  // platforms
  ctx.fillStyle = '#2b3346';
  for (const s of platforms) {
    drawRoundedRect(Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h), 8);
    ctx.fill();
  }

  // explosions
  for (const e of explosions) {
    const alpha = Math.max(0, 1 - e.t / 0.25);
    const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
    grd.addColorStop(0, `rgba(255,200,80,${alpha})`);
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
  }

  // players
  for (const p of players) {
    // hp bar
    ctx.fillStyle = '#00000088'; drawRoundedRect(p.x - 2, p.y - 12, p.w + 4, 6, 3); ctx.fill();
    ctx.fillStyle = p.color; drawRoundedRect(p.x - 2, p.y - 12, (p.w + 4) * clamp(p.hp / (p.maxHp||100), 0, 1), 6, 3); ctx.fill();
    // body
    ctx.fillStyle = p.color; drawRoundedRect(Math.floor(p.x), Math.floor(p.y), p.w, p.h, 8); ctx.fill();
    // shield indicator
    if (p.shieldCharges && p.shieldCharges>0) {
      ctx.strokeStyle = '#9ad7ff'; ctx.lineWidth = 2; drawRoundedRect(Math.floor(p.x)-3, Math.floor(p.y)-3, p.w+6, p.h+6, 10); ctx.stroke();
    }
    // gun
    ctx.fillStyle = '#ddd';
    const gx = p.x + p.w / 2 + p.facing * 12; const gy = p.y + p.h * 0.35;
    drawRoundedRect(gx, gy, p.facing * 18, 4, 2); ctx.fill();
  }

  // bullets
  for (const b of bullets) {
    const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.8);
    grd.addColorStop(0, b.color); grd.addColorStop(1, '#ffffff00');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  // particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.6);
    ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2, 2);
    ctx.globalAlpha = 1;
  }

  if (shakeT > 0) ctx.restore();

  // score
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`P1 ${scores[0]} - ${scores[1]} AI`, canvas.width / 2 - 48, 28);
}

function loop() {
  const now = performance.now() / 1000; const dt = Math.min(0.033, now - lastTime); lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
loop();