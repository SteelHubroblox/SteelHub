const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('startButton');
const draftOverlay = document.getElementById('draftOverlay');
const draftPlayerLabel = document.getElementById('draftPlayerLabel');
const cardGrid = document.getElementById('cardGrid');
const pauseOverlay = document.getElementById('pauseOverlay');
const btnResume = document.getElementById('btnResume');
const btnQuit = document.getElementById('btnQuit');
let paused = false;

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

// Series config: 5 rounds total; each round is best-of-3 engagements
const SERIES_ROUNDS_TOTAL = 5;
const ROUND_BEST_OF = 3; // first to 2
let seriesRoundIndex = 1;
let roundWins = [0, 0];
let scores = [0, 0];

// Mouse aiming
let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

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

// Player with levels map
class Player {
  constructor(idx, color, controls) {
    this.idx = idx;
    this.color = color;
    this.controls = controls;
    this.w = 40; this.h = 56;
    this.levels = {}; // id -> level (1..4)
    this.reset();
  }
  reset(spawnX, spawnY) {
    this.x = spawnX ?? (this.idx === 0 ? canvas.width * 0.18 : canvas.width * 0.82);
    this.y = spawnY ?? (canvas.height - 60 - this.h);
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.maxHp = this.maxHp || 100;
    this.hp = this.maxHp;
    this.reload = 0;
    this.facing = this.idx === 0 ? 1 : -1;
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
    this.maxJumps = 1;
    this.jumpsUsed = 0;
    this.pierceLevel = 0;
    this.bounceLevel = 0;
    this.explosiveLevel = 0;
    this.lifesteal = 0;
    this.shieldCooldownMax = 0; this.shieldCooldown = 0; this.shieldCharges = 0; this.shieldCapacity = 0;
    this.aiJumpCd = 0; this.aiOffsetX = 0;
    // mags/reload defaults
    this.magSize = this.magSize || 8;
    this.reloadTime = this.reloadTime || 1.2;
    this.ammoInMag = (this.ammoInMag == null) ? this.magSize : Math.min(this.ammoInMag, this.magSize);
    this.reloading = false; this.reloadTimer = 0;
    this.multishotLevel = this.multishotLevel || 0;
    this.burstLevel = this.burstLevel || 0; this.burstCount = 1; this.burstShotsLeft = 0; this.burstTimer = 0; this.burstInterval = 0.08;
    this.pellets = 0;
    this.applyCards();
  }
  applyCards() {
    // Reset to base first
    const prevLevels = this.levels;
    this.maxHp = 100;
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
    this.maxJumps = 1;
    this.pierceLevel = 0;
    this.bounceLevel = 0;
    this.explosiveLevel = 0;
    this.lifesteal = 0;
    this.shieldCooldownMax = 0; this.shieldCapacity = 0; this.shieldCharges = Math.min(this.shieldCharges, 0);

    // Apply per-level effects
    const L = (id) => prevLevels[id] || 0;
    const clampLevel = (v) => Math.max(0, Math.min(MAX_LEVEL, v));

    const rapidL = clampLevel(L('rapid')); if (rapidL) this.fireDelay *= Math.pow(0.8, rapidL);
    const powerL = clampLevel(L('power')); if (powerL) this.bulletDmg *= (1 + 0.5 * powerL);
    const speedL = clampLevel(L('speed')); if (speedL) this.moveBoost += 0.2 * speedL;
    const jumperL = clampLevel(L('jumper')); if (jumperL) this.jumpBoost += 0.25 * jumperL;
    const djL = clampLevel(L('doublejump')); if (djL) this.maxJumps = 1 + djL;
    const pierceL = clampLevel(L('pierce')); this.pierceLevel = pierceL;
    const bounceL = clampLevel(L('bounce')); this.bounceLevel = bounceL;
    const sniperL = clampLevel(L('sniper')); if (sniperL) this.bulletSpeed *= Math.pow(1.3, sniperL);
    const explL = clampLevel(L('explosive')); this.explosiveLevel = explL;
    const shieldL = clampLevel(L('shield')); if (shieldL) { this.shieldCooldownMax = 8 / (1 + 0.25 * (shieldL - 1)); this.shieldCapacity = Math.min(2, 1 + Math.floor((shieldL - 1) / 2)); }
    const lsL = clampLevel(L('lifesteal')); if (lsL) this.lifesteal = 6 * lsL;
    const hpL = clampLevel(L('hp')); if (hpL) this.maxHp += 40 * hpL;

    // Tradeoff and shooting abilities
    this.multishotLevel = clampLevel(L('multishot'));
    this.burstLevel = clampLevel(L('burst'));
    const bigMagL = clampLevel(L('bigmag'));
    const heavyMagL = clampLevel(L('heavymag'));
    const fastRelL = clampLevel(L('fastreload'));
    const glassL = clampLevel(L('glasscannon'));
    this.unstoppableLevel = clampLevel(L('unstoppable'));

    // Magazine/reload
    this.magSize = 8 + 4*bigMagL + 6*heavyMagL;
    this.reloadTime = 1.2 * Math.pow(0.85, fastRelL) * (heavyMagL ? (1 + 0.15*heavyMagL) : 1);
    this.ammoInMag = Math.min((this.ammoInMag == null ? this.magSize : this.ammoInMag), this.magSize);
    this.reloading = false; this.reloadTimer = 0;

    // Burst/multishot
    this.burstCount = this.burstLevel ? (2 + this.burstLevel) : 1; // 3..6 total when Lv1..4
    this.burstInterval = 0.08; this.burstShotsLeft = 0; this.burstTimer = 0;
    this.pellets = this.multishotLevel; // extra pellets per shot

    // Tradeoffs
    if (heavyMagL) this.moveBoost -= 0.1 * heavyMagL;
    if (glassL) { this.bulletDmg *= (1 + 0.6 * glassL); this.maxHp = Math.max(40, Math.floor(this.maxHp * (1 - 0.15 * glassL))); }

    this.hp = Math.min(this.hp, this.maxHp);
  }
}

class Bullet {
  constructor(owner, x, y, vx, vy, dmg, color) {
    this.owner = owner; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = 4;
    this.dmg = dmg; this.life = 2.5; this.color = color; this.pierces = 0; this.bounces = owner.bounceLevel;
  }
}

// Leveled abilities (up to 4)
const MAX_LEVEL = 4;

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

// Abilities list includes new tradeoff abilities
const ALL_CARDS = [
  { id: 'rapid', title: 'Rapid Fire', desc: 'Reduce fire delay', rarity: RARITY.Common },
  { id: 'power', title: 'High Caliber', desc: 'Increase bullet damage', rarity: RARITY.Rare },
  { id: 'speed', title: 'Sprinter', desc: 'Increase move speed', rarity: RARITY.Common },
  { id: 'jumper', title: 'Bunny Hop', desc: 'Increase jump power', rarity: RARITY.Common },
  { id: 'doublejump', title: 'Double Jump', desc: 'Gain extra jumps', rarity: RARITY.Rare },
  { id: 'unstoppable', title: 'Unstoppable Bullets', desc: 'Bullets pass through platforms', rarity: RARITY.Legendary },
  { id: 'bounce', title: 'Bouncy Bullets', desc: 'Bullets bounce', rarity: RARITY.Epic },
  { id: 'sniper', title: 'Marksman', desc: 'Increase bullet speed', rarity: RARITY.Rare },
  { id: 'explosive', title: 'Explosive Rounds', desc: 'Bullets explode', rarity: RARITY.Legendary },
  { id: 'shield', title: 'Personal Shield', desc: 'Block a bullet periodically', rarity: RARITY.Epic },
  { id: 'lifesteal', title: 'Vampiric Rounds', desc: 'Heal on hit', rarity: RARITY.Rare },
  { id: 'hp', title: 'Toughness', desc: 'Increase max HP', rarity: RARITY.Common },
  { id: 'multishot', title: 'Multishot', desc: '+1 pellet per level (spread)', rarity: RARITY.Rare },
  { id: 'burst', title: 'Burst Fire', desc: 'Fires bursts of shots', rarity: RARITY.Epic },
  { id: 'bigmag', title: 'Bigger Mag', desc: 'Increase magazine size', rarity: RARITY.Common },
  { id: 'fastreload', title: 'Fast Reload', desc: 'Reduce reload time', rarity: RARITY.Rare },
  { id: 'heavymag', title: 'Heavy Mag', desc: 'Huge mag, slower reload & movement', rarity: RARITY.Epic },
  { id: 'glasscannon', title: 'Glass Cannon', desc: 'Big damage, lower max HP', rarity: RARITY.Epic },
];

function generateDraftPool(forPlayer) {
  const pool = [];
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const rarity = weightedRarity();
    const candidates = ALL_CARDS.filter(c => c.rarity === rarity && !used.has(c.id))
      .filter(c => (forPlayer.levels[c.id] || 0) < MAX_LEVEL);
    if (candidates.length === 0) continue;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    used.add(pick.id);
    const nextLevel = (forPlayer.levels[pick.id] || 0) + 1;
    pool.push({ card: pick, nextLevel });
  }
  // If pool underfilled, backfill with any rarity
  while (pool.length < 3) {
    const rem = ALL_CARDS.filter(c => !pool.find(p => p.card.id === c.id) && (forPlayer.levels[c.id] || 0) < MAX_LEVEL);
    if (!rem.length) break;
    const pick = rem[Math.floor(Math.random() * rem.length)];
    pool.push({ card: pick, nextLevel: (forPlayer.levels[pick.id] || 0) + 1 });
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
let state = 'menu'; // menu, playing, between
let lastTime = performance.now() / 1000;
let simTime = 0;

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
// Dynamic palettes per arena
const PALETTES = [
  { bgTop: '#11243a', bgBot: '#1b3660', platTop: '#4a607a', platBot: '#32465e', accent: '#ffd166', spike: '#ff6b6b' },
  { bgTop: '#1a1633', bgBot: '#312b6b', platTop: '#6b5ca5', platBot: '#4c437a', accent: '#ffdf6e', spike: '#ff8a80' },
  { bgTop: '#0f2a28', bgBot: '#184b46', platTop: '#4f8a83', platBot: '#2f5e59', accent: '#ffe082', spike: '#ff6f61' },
  { bgTop: '#26130f', bgBot: '#4b261c', platTop: '#8a5648', platBot: '#5a3a30', accent: '#ffd54f', spike: '#ff7043' },
];
let currentPalette = PALETTES[0];

// Hazards
let hazards = [];

// Define spike helper before buildArena
function addSpikeRow(x, y, w, h) { hazards.push({ x, y, w, h, type: 'spike' }); }

function rectIntersectObj(p, o) { return p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y; }
function playerHitsHazard(p) {
  const bbox = { x: p.x, y: p.y, w: p.w, h: p.h };
  for (const hz of hazards) { if (rectIntersectObj(bbox, hz)) return true; }
  return false;
}

// Parallax background layers
const parallaxLayers = [];
function setupParallax() {
  parallaxLayers.length = 0;
  // Far layer: big soft shapes
  parallaxLayers.push({ kind: 'hills', speed: 0.02, color: currentPalette.bgTop, seed: 1 });
  // Mid layer: medium shapes
  parallaxLayers.push({ kind: 'hills', speed: 0.05, color: currentPalette.platBot || '#2b3346', seed: 2 });
  // Near layer: small dots/stars
  parallaxLayers.push({ kind: 'dots', speed: 0.1, color: currentPalette.accent, seed: 3 });
}

function drawParallax() {
  const w = canvas.width, h = canvas.height;
  for (const layer of parallaxLayers) {
    if (layer.kind === 'hills') {
      const yBase = h * 0.8;
      const offset = (simTime * layer.speed * 80) % w;
      ctx.fillStyle = layer.color + '55';
      ctx.beginPath();
      ctx.moveTo(-offset, yBase);
      for (let x = -offset; x <= w + 100; x += 100) {
        const peak = yBase - 40 - 30 * Math.sin((x + layer.seed * 73) * 0.01);
        ctx.quadraticCurveTo(x + 50, peak, x + 100, yBase);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    } else if (layer.kind === 'dots') {
      const count = 40;
      for (let i = 0; i < count; i++) {
        const x = ((i * 97 + layer.seed * 131) % w + (simTime * layer.speed * 120)) % w;
        const y = (i * 53 + layer.seed * 77) % (h * 0.6);
        ctx.fillStyle = layer.color + '55';
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
}

// Platform helpers
function addMovingPlat(x, y, w, h, dx, dy, speed = 1) {
  platforms.push({ x, y, w, h, move: true, baseX: x, baseY: y, dx, dy, t: Math.random()*Math.PI*2, speed, active: true });
}
function addCrumblePlat(x, y, w, h, delay = 0.6, respawn = 3) {
  platforms.push({ x, y, w, h, crumble: true, delay, respawn, timer: -1, respawnTimer: 0, active: true });
}

// Arena builder with larger layouts and spike hazards
function buildArena(idx) {
  const w = canvas.width, h = canvas.height;
  currentPalette = PALETTES[idx % PALETTES.length];
  hazards = [];
  platforms = [];
  const groundY = h - 60;
  const step = Math.min(200, Math.max(120, (JUMP_V * JUMP_V) / (2 * G) - 10));
  const top1 = groundY - step; const top2 = top1 - step; const top3 = top2 - step; const top4 = top3 - step;
  const ph = 18;
  // Ground
  platforms.push({ x: 0, y: groundY, w, h: 60, active: true });
  if (idx === 0) {
    platforms.push({ x: w * 0.12, y: top1, w: 260, h: ph, active: true });
    addMovingPlat(w * 0.62, top1 - 10, 240, ph, 120, 0, 0.8);
    platforms.push({ x: w * 0.10, y: top2, w: 220, h: ph, active: true });
    addCrumblePlat(w * 0.55, top2 - 10, 220, ph, 0.6, 3);
    platforms.push({ x: w * 0.32, y: top3, w: 260, h: ph, active: true });
    addSpikeRow(0, groundY - 16, 120, 16);
    addSpikeRow(w - 120, groundY - 16, 120, 16);
  } else if (idx === 1) {
    platforms.push({ x: w * 0.05, y: top1, w: w * 0.9, h: 14, active: true });
    addMovingPlat(w * 0.18, top2 + 10, 240, 14, 140, 0, 1.2);
    platforms.push({ x: w * 0.58, y: top2, w: 280, h: 14, active: true });
    addCrumblePlat(w * 0.38, top3 + 10, 220, 14, 0.5, 2.5);
    addSpikeRow(w * 0.4, groundY - 16, w * 0.2, 16);
  } else if (idx === 2) {
    platforms.push({ x: w * 0.12, y: top1, w: 220, h: ph, active: true });
    addMovingPlat(w * 0.12, top2, 200, ph, 0, 80, 0.9);
    platforms.push({ x: w * 0.12, y: top3, w: 180, h: ph, active: true });
    platforms.push({ x: w * 0.68, y: top1, w: 240, h: ph, active: true });
    addCrumblePlat(w * 0.68, top2, 220, ph, 0.7, 2.8);
    addMovingPlat(w * 0.68, top3, 200, ph, 0, 90, 1.0);
    platforms.push({ x: w * 0.40, y: top2 + 10, w: 260, h: ph, active: true });
    addSpikeRow(w * 0.48, groundY - 16, 100, 16);
  } else {
    platforms.push({ x: w * 0.2, y: top1 + 10, w: 200, h: ph, active: true });
    addCrumblePlat(w * 0.16, top2 + 10, 260, ph, 0.6, 2.6);
    platforms.push({ x: w * 0.12, y: top3 + 10, w: 320, h: ph, active: true });
    addMovingPlat(w * 0.66, top1, 240, ph, 140, 0, 0.8);
    platforms.push({ x: w * 0.62, y: top2, w: 300, h: ph, active: true });
    addMovingPlat(w * 0.58, top3, 360, ph, 160, 0, 0.6);
    addSpikeRow(w * 0.45, groundY - 16, w * 0.1, 16);
  }
  setupParallax();
}

function doStartMatch() {
  state = 'playing';
  bullets = [];
  particles.length = 0;
  buildArena(currentArena);
  currentArena = (currentArena + 1) % 4; // rotate arenas each engagement
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
    // Between rounds: draft unless series is over
    if (seriesRoundIndex >= SERIES_ROUNDS_TOTAL) {
      // Series end
      state = 'menu';
      menu.classList.remove('hidden');
      const msg = scores[0] === scores[1] ? 'Series tied! Play again' : `P${scores[0] > scores[1] ? 1 : 2} wins the series! Play again`;
      startButton.textContent = msg;
      // Reset series
      scores = [0, 0];
      seriesRoundIndex = 1;
      players.forEach(p => { p.levels = {}; p.applyCards(); });
      return;
    } else {
      seriesRoundIndex++;
      state = 'between';
      openDraft(winnerIdx === 0 ? 1 : 0); // loser picks first
      return;
    }
  }
  // Continue same round (next engagement)
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
  const pool = generateDraftPool(players[playerIdx]);
  if (isAI) {
    const choice = pool[Math.floor(Math.random() * pool.length)];
    const id = choice.card.id;
    players[playerIdx].levels[id] = Math.min(MAX_LEVEL, (players[playerIdx].levels[id] || 0) + 1);
    players[playerIdx].applyCards();
    done();
    return;
  }
  draftPlayerLabel.textContent = `Player ${playerIdx + 1} pick`;
  cardGrid.innerHTML = '';
  for (const opt of pool) {
    const c = opt.card; const nextLevel = opt.nextLevel;
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div class="card-title" style="color:${RARITY_COLOR[c.rarity]}">${c.title} · Lv.${nextLevel} · ${c.rarity}</div><div class="card-desc">${c.desc}</div>`;
    el.onclick = () => {
      players[playerIdx].levels[c.id] = Math.min(MAX_LEVEL, (players[playerIdx].levels[c.id] || 0) + 1);
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

// AI improvements
function updateAI(p, dt) {
  const enemy = players[0];
  p.aiJumpCd = Math.max(0, p.aiJumpCd - dt);
  if (p.aiOffsetX === 0 || Math.random() < 0.01) p.aiOffsetX = randRange(-140, 140);
  const targetX = (enemy.x + enemy.w / 2) + p.aiOffsetX;
  const dx = targetX - (p.x + p.w / 2);
  const wantDir = Math.sign(dx) || 0;
  const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL) * 0.9;
  p.vx += wantDir * accel * dt;
  p.vx = clamp(p.vx, -MAX_VX * 0.85, MAX_VX * 0.85);

  // Choose an upper platform toward enemy and jump only when roughly aligned
  const upperPlatforms = platforms.filter(s => s.y + 1 < p.y && s.h < 40);
  let targetPlat = null; let bestDY = Infinity;
  for (const s of upperPlatforms) {
    const cx = s.x + s.w / 2; const dy = p.y - s.y;
    if (Math.abs((p.x + p.w / 2) - cx) < 140 && dy < bestDY) { bestDY = dy; targetPlat = s; }
  }
  const closeToPlat = targetPlat ? Math.abs((p.x + p.w/2) - (targetPlat.x + targetPlat.w/2)) < 120 : false;

  // Detect incoming bullets to dodge occasionally
  let shouldDodge = false;
  for (const b of bullets) {
    if (b.owner === enemy) continue; // only dodge player bullets
    const vx = b.vx, vy = b.vy;
    const toAIx = (p.x + p.w/2) - b.x; const toAIy = (p.y + p.h*0.5) - b.y;
    const dist = Math.hypot(toAIx, toAIy) || 1;
    const tti = dist / (Math.hypot(vx, vy) || 1);
    // If bullet heading towards AI and impact soon
    const dot = (vx * toAIx + vy * toAIy) / ((Math.hypot(vx, vy)||1) * dist);
    if (dot > 0.8 && tti < 0.35) { shouldDodge = Math.random() < 0.5; break; }
  }

  // Hazard ahead check (feet area)
  const lookAhead = 40 * Math.sign(p.vx || 1);
  const feetBox = { x: p.x + lookAhead, y: p.y + p.h - 10, w: 20, h: 10 };
  let dangerAhead = false; for (const hz of hazards) if (rectsIntersect(feetBox, hz)) { dangerAhead = true; break; }

  if (p.onGround && p.aiJumpCd === 0 && (dangerAhead || closeToPlat || shouldDodge)) {
    p.vy = -JUMP_V * 0.98;
    p.onGround = false;
    p.aiJumpCd = 0.7;
  }

  // Predictive aim with drop compensation
  const gunX = p.x + p.w / 2 + p.facing * 12;
  const gunY = p.y + p.h * 0.35;
  const ex = enemy.x + enemy.w / 2;
  const ey = enemy.y + enemy.h * 0.4;
  const relX = ex - gunX;
  const relY = ey - gunY;
  const distA = Math.hypot(relX, relY) || 1;
  let t = clamp(distA / p.bulletSpeed, 0.05, 0.8);
  const gEff = G * 0.2;
  const leadX = ex + enemy.vx * t;
  const leadY = ey + enemy.vy * t - 0.5 * gEff * t * t;
  let aimX = leadX - gunX;
  let aimY = leadY - gunY;
  const n = Math.hypot(aimX, aimY) || 1; aimX/=n; aimY/=n;
  aimX += randRange(-AI.aimJitter, AI.aimJitter); aimY += randRange(-AI.aimJitter, AI.aimJitter);
  const n2 = Math.hypot(aimX, aimY) || 1; aimX/=n2; aimY/=n2;
  p.facing = Math.sign(aimX) || 1;

  p.reload -= dt;
  if (p.reload <= 0 && Math.abs(dx) < canvas.width * 0.7 && !p.reloading && p.ammoInMag > 0) {
    const vx = aimX * p.bulletSpeed;
    const vy = aimY * p.bulletSpeed;
    bullets.push(new Bullet(p, gunX, gunY, vx, vy, p.bulletDmg, p.color));
    p.ammoInMag--;
    p.reload = p.fireDelay * (0.9 + AI.react * 0.6);
    addShake(0.05);
  }
}

// Mobile controls
const mobileControls = document.getElementById('mobileControls');
const moveStick = document.getElementById('moveStick');
const moveKnob = document.getElementById('moveKnob');
let isMobile = false;
function checkMobile() {
  const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  isMobile = touchCapable;
  mobileControls.classList.toggle('show', isMobile);
}
window.addEventListener('resize', checkMobile); checkMobile();

let mobileMoveLeft = false, mobileMoveRight = false; let mobileShootTap = null; // {x,y} when tapped
let aimVec = { x: 1, y: 0 };

// Left joystick handling: x controls left/right, y upward triggers jump
let stickActive = false; let stickId = null;
function stickToVec(clientX, clientY) {
  const rect = moveStick.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  let dx = clientX - cx; let dy = clientY - cy;
  const len = Math.hypot(dx, dy);
  const maxR = rect.width/2 - 28;
  if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
  moveKnob.style.left = `${rect.width/2 - 28 + dx}px`;
  moveKnob.style.top = `${rect.height/2 - 28 + dy}px`;
  const nx = (dx / maxR) || 0; const ny = (dy / maxR) || 0;
  aimVec.x = nx; aimVec.y = ny;
  mobileMoveLeft = nx < -0.25; mobileMoveRight = nx > 0.25;
  // Jump if pushing upwards past threshold
  if (ny < -0.6) jumpPressed = true;
}
function resetStick() { moveKnob.style.left = '42px'; moveKnob.style.top = '42px'; aimVec.x = 0; aimVec.y = 0; mobileMoveLeft = mobileMoveRight = false; }
moveStick?.addEventListener('touchstart', (e) => { stickActive = true; stickId = e.changedTouches[0].identifier; stickToVec(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });
moveStick?.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) stickToVec(t.clientX, t.clientY); }, { passive: false });
moveStick?.addEventListener('touchend', () => { stickActive = false; resetStick(); }, { passive: false });
moveStick?.addEventListener('mousedown', (e) => { stickActive = true; stickToVec(e.clientX, e.clientY); });
window.addEventListener('mousemove', (e) => { if (stickActive) stickToVec(e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { if (stickActive) { stickActive = false; resetStick(); } });

// Right-side tap to shoot toward tap position
function isRightSideTap(e) { const x = (e.touches? e.touches[0].clientX : e.clientX); return x > window.innerWidth * 0.55; }
function tapPos(e) { const t = e.touches? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; }
window.addEventListener('touchstart', (e) => { if (!isMobile) return; if (isRightSideTap(e)) { mobileShootTap = tapPos(e); }}, { passive: false });
window.addEventListener('mousedown', (e) => { if (!isMobile) return; if (isRightSideTap(e)) { mobileShootTap = tapPos(e); } });

// Visual effects: muzzle flashes and bullet trails
const muzzleFlashes = [];
function spawnMuzzle(x, y) { muzzleFlashes.push({ x, y, t: 0 }); }
const trails = [];
function spawnTrail(x, y, color) { trails.push({ x, y, life: 0.25, color }); }
// Explosions VFX store
const explosions = [];
function spawnExplosion(x, y, owner) {
  explosions.push({ x, y, t: 0, owner });
  for (let i = 0; i < 16; i++) spawnParticle(x, y, owner.color);
  addShake(0.12);
}
// VFX rings for impacts/jumps
const rings = [];
function spawnRing(x, y, color, duration=0.2, radius=18) { rings.push({ x, y, t:0, d:duration, r:radius, color }); }

function updatePlatforms(dt) {
  for (const s of platforms) {
    if (s.move) {
      s.t += dt * (s.speed || 1);
      s.x = s.baseX + Math.sin(s.t) * (s.dx || 0);
      s.y = s.baseY + Math.cos(s.t) * (s.dy || 0);
    }
    if (s.crumble) {
      if (!s.active && s.respawnTimer > 0) {
        s.respawnTimer -= dt; if (s.respawnTimer <= 0) { s.active = true; s.timer = -1; }
      }
    }
  }
}

function update(dt) {
  if (state !== 'playing' || paused) { jumpPressed = false; return; }
  simTime += dt;
  shakeT = Math.max(0, shakeT - dt);
  updatePlatforms(dt);

  for (let pi = 0; pi < players.length; pi++) {
    const p = players[pi];
    const isAI = !!p.controls.ai;

    // Reload handling
    if (p.reloading) { p.reloadTimer -= dt; if (p.reloadTimer <= 0) { p.reloading = false; p.ammoInMag = p.magSize; } }

    if (!isAI) {
      const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL);
      const moveLeft = keys.has('KeyA') || mobileMoveLeft;
      const moveRight = keys.has('KeyD') || mobileMoveRight;
      if (moveLeft) p.vx -= accel * dt;
      if (moveRight) p.vx += accel * dt;
      p.vx = clamp(p.vx, -MAX_VX * (1 + p.moveBoost), MAX_VX * (1 + p.moveBoost));

      if (jumpPressed && (p.onGround || p.jumpsUsed < p.maxJumps)) {
        if (p.onGround) p.jumpsUsed = 0;
        p.vy = -JUMP_V * (1 + p.jumpBoost);
        p.onGround = false;
        p.jumpsUsed++;
        spawnRing(p.x + p.w/2, p.y + p.h, currentPalette.accent, 0.25, 14);
        for (let i=0;i<8;i++) spawnParticle(p.x + p.w/2, p.y + p.h, p.color);
      }

      if (keys.has('KeyR') && !p.reloading && p.ammoInMag < p.magSize) { p.reloading = true; p.reloadTimer = p.reloadTime; }

      // Aim and shooting
      let dirX = p.facing, dirY = 0;
      if (isMobile && mobileShootTap) {
        const ax = mobileShootTap.x - (p.x + p.w/2);
        const ay = mobileShootTap.y - (p.y + p.h*0.35);
        const len = Math.hypot(ax, ay) || 1; dirX = ax/len; dirY = ay/len;
      } else if (!isMobile) {
        const ax = mouseX - (p.x + p.w / 2);
        const ay = mouseY - (p.y + p.h * 0.35);
        const len = Math.hypot(ax, ay) || 1; dirX = ax / len; dirY = ay / len;
      } else {
        dirX = (Math.abs(aimVec.x) > 0.1 ? aimVec.x : p.facing); dirY = 0;
      }
      p.facing = Math.sign(dirX) || p.facing;

      p.reload -= dt;
      if (p.burstShotsLeft > 0) { p.burstTimer -= dt; if (p.burstTimer <= 0 && p.ammoInMag > 0) { fireShot(p, dirX, dirY); p.burstShotsLeft--; p.burstTimer = p.burstInterval; } }
      const wantShoot = (!isMobile && mouseDown) || (isMobile && !!mobileShootTap);
      if (wantShoot && p.reload <= 0 && p.ammoInMag > 0 && !p.reloading) {
        fireShot(p, dirX, dirY);
        p.reload = p.fireDelay;
        if (p.burstCount > 1) { p.burstShotsLeft = p.burstCount - 1; p.burstTimer = p.burstInterval; }
      } else if (wantShoot && p.ammoInMag === 0 && !p.reloading) { p.reloading = true; p.reloadTimer = p.reloadTime; }
      mobileShootTap = null; // consume tap
    } else {
      // AI hazard pre-check ahead handled in updateAI; reload when empty
      if (!p.reloading && p.ammoInMag === 0) { p.reloading = true; p.reloadTimer = p.reloadTime; }
      updateAI(p, dt);
    }

    // Shields
    if (p.shieldCooldownMax > 0) { p.shieldCooldown -= dt; if (p.shieldCooldown <= 0) { p.shieldCooldown = p.shieldCooldownMax; p.shieldCharges = Math.min((p.shieldCharges||0) + 1, p.shieldCapacity || 1); } }

    // gravity & integrate
    p.vy += G * dt;
    p.x += p.vx * dt;
    const bboxX = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const s of platforms) {
      if (s.active === false) continue;
      if (rectsIntersect(bboxX, s)) { if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w; p.vx = 0; }
    }
    p.y += p.vy * dt;
    const prevOnGround = p.onGround;
    p.onGround = false;
    const bboxY = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const s of platforms) {
      if (s.active === false) continue;
      if (rectsIntersect(bboxY, s)) {
        if (p.vy > 0) {
          p.y = s.y - p.h; p.onGround = true; p.jumpsUsed = 0;
          if (s.crumble && s.timer < 0) { s.timer = s.delay; }
        } else if (p.vy < 0) {
          p.y = s.y + s.h;
        }
        p.vy = 0;
      }
    }
    // advance crumble timers
    for (const s of platforms) if (s.crumble && s.timer >= 0 && s.active) { s.timer -= dt; if (s.timer <= 0) { s.active = false; s.respawnTimer = s.respawn; } }

    if (!prevOnGround && p.onGround) { spawnRing(p.x + p.w/2, p.y + p.h, '#ffffff', 0.2, 12); for (let i=0;i<10;i++) spawnParticle(p.x + p.w/2, p.y + p.h, p.color); }

    if (playerHitsHazard(p)) { p.hp -= 40*dt; spawnParticle(p.x + p.w/2, p.y + p.h, currentPalette.spike); }

    p.x = clamp(p.x, 0, canvas.width - p.w);
    if (p.onGround) p.vx -= p.vx * FRICTION * dt;
  }

  // Bullets update remains as earlier...
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt; if (b.life <= 0) { bullets.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vy += (G * 0.2) * dt;
    const bb = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
    let hitGeom = false;
    if (!(b.owner.unstoppableLevel > 0)) {
      for (const s of platforms) if (rectsIntersect(bb, s)) { hitGeom = true; if (b.bounces > 0) { b.vy = -Math.abs(b.vy) * 0.7; b.bounces--; hitGeom = false; } else if (b.owner.explosiveLevel > 0) { spawnExplosion(b.x, b.y, b.owner); } break; }
      for (const hz of hazards) if (rectsIntersect(bb, hz)) { hitGeom = true; break; }
    }
    if (hitGeom) { bullets.splice(i, 1); continue; }
    if (b.x < -50 || b.x > canvas.width + 50 || b.y > canvas.height + 200) { bullets.splice(i, 1); continue; }
    for (const p of players) {
      if (p === b.owner) continue;
      if (rectsIntersect(bb, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        if (p.shieldCharges && p.shieldCharges > 0) { p.shieldCharges--; spawnParticle(b.x, b.y, '#9ad7ff'); bullets.splice(i, 1); break; }
        p.hp -= b.dmg;
        if (b.owner.lifesteal) b.owner.hp = clamp((b.owner.hp||100) + b.owner.lifesteal, 0, b.owner.maxHp||100);
        p.vx += Math.sign(b.vx) * 80; p.vy -= 120;
        // Impact VFX
        spawnParticle(b.x, b.y, b.color);
        spawnRing(b.x, b.y, currentPalette.accent, 0.18, 16);
        addShake(0.08);
        if (b.pierces > 0) { b.pierces--; } else { bullets.splice(i, 1); }
        break;
      }
    }
  }

  // Explosions, particles updated already elsewhere
  for (let ei = explosions.length - 1; ei >= 0; ei--) {
    const e = explosions[ei]; e.t += dt; if (e.t > 0.25) { explosions.splice(ei,1); continue; }
    for (const p of players) {
      const cx = p.x + p.w/2, cy = p.y + p.h/2; const d2 = (cx - e.x)**2 + (cy - e.y)**2;
      const radius = 80 + 20 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
      const dmgBase = 20 + 8 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
      if (d2 < radius*radius) { p.hp -= dmgBase * dt * 4; }
    }
  }

  // Trails, muzzle, rings
  for (let i = trails.length - 1; i >= 0; i--) { trails[i].life -= dt; if (trails[i].life <= 0) trails.splice(i, 1); }
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) { muzzleFlashes[i].t += dt; if (muzzleFlashes[i].t > 0.08) muzzleFlashes.splice(i, 1); }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; if (r.t > r.d) rings.splice(i, 1); }

  const alive = players.map(p => p.hp > 0);
  if (alive.filter(Boolean).length <= 1) { const winIdx = alive[0] ? 0 : 1; endRound(winIdx); }
  jumpPressed = false;
}

function fireShot(p, dirX, dirY) {
  if (p.ammoInMag <= 0) return;
  const originX = p.x + p.w / 2 + p.facing * 12;
  const originY = p.y + p.h * 0.35;
  const pellets = 1 + (p.pellets || 0);
  for (let k = 0; k < pellets; k++) {
    const spread = (p.pellets ? randRange(-0.12, 0.12) : 0); // radians approx ±7°
    const ang = Math.atan2(dirY, dirX) + spread;
    const vx = Math.cos(ang) * p.bulletSpeed;
    const vy = Math.sin(ang) * p.bulletSpeed;
    bullets.push(new Bullet(p, originX, originY, vx, vy, p.bulletDmg, p.color));
    spawnTrail(originX, originY, p.color);
  }
  p.ammoInMag--;
  spawnMuzzle(originX, originY);
}

// Drawing helpers
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

// Drawing polish: player head
function drawPlayer(p) {
  // hp bar
  ctx.fillStyle = '#00000088'; drawRoundedRect(p.x - 2, p.y - 16, p.w + 4, 6, 3); ctx.fill();
  ctx.fillStyle = p.color; drawRoundedRect(p.x - 2, p.y - 16, (p.w + 4) * clamp(p.hp / (p.maxHp||100), 0, 1), 6, 3); ctx.fill();
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; drawRoundedRect(Math.floor(p.x)+2, Math.floor(p.y)+6, p.w, p.h, 12); ctx.fill();
  // body
  ctx.fillStyle = p.color; drawRoundedRect(Math.floor(p.x), Math.floor(p.y), p.w, p.h, 12); ctx.fill();
  // head
  ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x + p.w/2, p.y - 10, 10, 0, Math.PI*2); ctx.fill();
  // eye
  ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.arc(p.x + p.w/2 + (p.facing>0?4:-4), p.y - 12, 2, 0, Math.PI*2); ctx.fill();
  // shield outline
  if (p.shieldCharges && p.shieldCharges>0) { ctx.strokeStyle = '#9ad7ff'; ctx.lineWidth = 2; drawRoundedRect(Math.floor(p.x)-3, Math.floor(p.y)-3, p.w+6, p.h+6, 14); ctx.stroke(); }
  // gun
  const gx = p.x + p.w/2 + p.facing * 10; const gy = p.y + p.h * 0.35;
  let aimX = p.facing, aimY = 0;
  if (!p.controls.ai) { aimX = mouseX - gx; aimY = mouseY - gy; } else { const enemy = players[0]; aimX = (enemy.x+enemy.w/2)-gx; aimY = (enemy.y+enemy.h*0.4)-gy; }
  const n = Math.hypot(aimX, aimY) || 1; aimX/=n; aimY/=n;
  drawGunAt(gx, gy, aimX, aimY, 22, 4);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gTop = currentPalette.bgTop, gBot = currentPalette.bgBot;
  const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gr.addColorStop(0, gTop); gr.addColorStop(1, gBot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawParallax();

  let sx = 0, sy = 0; if (shakeT > 0) { sx = (Math.random()-0.5)*10*shakeT; sy=(Math.random()-0.5)*10*shakeT; ctx.save(); ctx.translate(sx, sy); }

  for (const s of platforms) drawPlatform(s);
  drawHazards();

  for (const e of explosions) {
    const radius = 80 + 20 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
    const alpha = Math.max(0, 1 - e.t / 0.25);
    const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, radius);
    grd.addColorStop(0, `rgba(255,200,80,${alpha})`);
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, Math.PI*2); ctx.fill();
  }

  for (const p of players) drawPlayer(p);
  for (const b of bullets) { const grd2 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.8); grd2.addColorStop(0, b.color); grd2.addColorStop(1, '#ffffff00'); ctx.fillStyle = grd2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
  for (const pr of particles) { ctx.globalAlpha = Math.max(0, pr.life / 0.6); ctx.fillStyle = pr.color; ctx.fillRect(pr.x, pr.y, 2, 2); ctx.globalAlpha = 1; }

  // trails
  for (const tr of trails) { ctx.globalAlpha = Math.max(0, tr.life / 0.25); const g2 = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 30); g2.addColorStop(0, tr.color); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(tr.x, tr.y, 30, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
  // muzzle
  for (const m of muzzleFlashes) { const a = Math.max(0, 1 - m.t / 0.08); ctx.globalAlpha = a; ctx.fillStyle = '#ffd27d'; ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
  // rings
  for (const r of rings) { const t = r.t / r.d; ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, 1 - t); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 + t*2), 0, Math.PI*2); ctx.stroke(); ctx.globalAlpha = 1; }

  if (shakeT > 0) ctx.restore();
  drawVignette();

  // HUD (Round & Series) + Ammo
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`Round ${seriesRoundIndex}/${SERIES_ROUNDS_TOTAL}  |  Series: P1 ${scores[0]} - ${scores[1]} AI`, Math.max(12, canvas.width/2 - 180), 28);
  // Ammo HUD bottom-left
  const p1 = players[0];
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui, sans-serif';
  const reloadTxt = p1.reloading ? ' (reloading...)' : '';
  ctx.fillText(`Ammo: ${p1.ammoInMag}/${p1.magSize}${reloadTxt}`, 12, canvas.height - 16);
}

function loop() {
  const now = performance.now() / 1000; const dt = Math.min(0.033, now - lastTime); lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
loop();

// Visual revamp helpers
function drawGunAt(originX, originY, aimDirX, aimDirY, length = 22, thickness = 4) {
  const ang = Math.atan2(aimDirY, aimDirX);
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate(ang);
  drawRoundedRect(0, -thickness/2, length, thickness, 2);
  ctx.fillStyle = '#e5e7eb';
  ctx.fill();
  ctx.restore();
}

function drawPlatform(s) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  drawRoundedRect(Math.floor(s.x)+3, Math.floor(s.y)+6, Math.floor(s.w), Math.floor(s.h), 8); ctx.fill();
  // top gradient from palette
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  g.addColorStop(0, currentPalette.platTop); g.addColorStop(1, currentPalette.platBot || '#2b3346');
  ctx.fillStyle = g; drawRoundedRect(Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h), 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; drawRoundedRect(Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h), 8); ctx.stroke();
}

function drawHazards() {
  for (const hz of hazards) {
    if (hz.type === 'spike') {
      // draw a strip of triangles
      const step = 16; const num = Math.max(1, Math.floor(hz.w / step));
      for (let i = 0; i < num; i++) {
        const x0 = hz.x + i * step;
        ctx.fillStyle = currentPalette.spike;
        ctx.beginPath();
        ctx.moveTo(x0, hz.y + hz.h);
        ctx.lineTo(x0 + step/2, hz.y);
        ctx.lineTo(x0 + step, hz.y + hz.h);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

function drawVignette() {
  const r = Math.max(canvas.width, canvas.height);
  const vg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, r*0.2, canvas.width/2, canvas.height/2, r*0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg; ctx.fillRect(0,0,canvas.width,canvas.height);
}

function setPaused(v) {
  paused = v;
  pauseOverlay.classList.toggle('hidden', !paused);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (state === 'playing') setPaused(!paused);
  }
});
btnResume?.addEventListener('click', () => setPaused(false));
btnQuit?.addEventListener('click', () => { setPaused(false); state = 'menu'; menu.classList.remove('hidden'); });