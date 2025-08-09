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

    this.hp = Math.min(this.hp, this.maxHp);
  }
}

class Bullet {
  constructor(owner, x, y, vx, vy, dmg, color) {
    this.owner = owner; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = 4;
    this.dmg = dmg; this.life = 2.5; this.color = color; this.pierces = owner.pierceLevel; this.bounces = owner.bounceLevel;
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

const ALL_CARDS = [
  { id: 'rapid', title: 'Rapid Fire', desc: 'Reduce fire delay', rarity: RARITY.Common },
  { id: 'power', title: 'High Caliber', desc: 'Increase bullet damage', rarity: RARITY.Rare },
  { id: 'speed', title: 'Sprinter', desc: 'Increase move speed', rarity: RARITY.Common },
  { id: 'jumper', title: 'Bunny Hop', desc: 'Increase jump power', rarity: RARITY.Common },
  { id: 'doublejump', title: 'Double Jump', desc: 'Gain extra jumps', rarity: RARITY.Rare },
  { id: 'pierce', title: 'Piercing Rounds', desc: 'Bullets pierce', rarity: RARITY.Rare },
  { id: 'bounce', title: 'Bouncy Bullets', desc: 'Bullets bounce', rarity: RARITY.Epic },
  { id: 'sniper', title: 'Marksman', desc: 'Increase bullet speed', rarity: RARITY.Rare },
  { id: 'explosive', title: 'Explosive Rounds', desc: 'Bullets explode', rarity: RARITY.Legendary },
  { id: 'shield', title: 'Personal Shield', desc: 'Block a bullet periodically', rarity: RARITY.Epic },
  { id: 'lifesteal', title: 'Vampiric Rounds', desc: 'Heal on hit', rarity: RARITY.Rare },
  { id: 'hp', title: 'Toughness', desc: 'Increase max HP', rarity: RARITY.Common },
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
  const groundY = h - 60;
  const step = Math.min(140, Math.max(110, (JUMP_V * JUMP_V) / (2 * G) - 20));
  const top1 = groundY - step; const top2 = top1 - step; const top3 = top2 - step;
  if (idx === 0) {
    // Classic reachable tiers
    platforms = [
      { x: 0, y: groundY, w, h: 60 },
      { x: w * 0.20, y: top1, w: 220, h: 16 },
      { x: w * 0.58, y: top1 - 10, w: 260, h: 16 },
      { x: w * 0.14, y: top2, w: 180, h: 16 },
      { x: w * 0.56, y: top2 - 10, w: 220, h: 16 },
    ];
  } else if (idx === 1) {
    // Towers reachable by steps
    const pw = 180, ph = 16;
    platforms = [
      { x: 0, y: groundY, w, h: 60 },
      { x: w * 0.18, y: top1, w: pw, h: ph },
      { x: w * 0.18, y: top2, w: pw, h: ph },
      { x: w * 0.64, y: top1 + 10, w: pw, h: ph },
      { x: w * 0.64, y: top2 + 10, w: pw, h: ph },
      { x: w * 0.40, y: top1 - 20, w: 220, h: ph },
    ];
  } else if (idx === 2) {
    // Bridges reachable from ground
    platforms = [
      { x: 0, y: groundY, w, h: 60 },
      { x: w * 0.05, y: top1, w: w * 0.9, h: 14 },
      { x: w * 0.2, y: top2, w: 180, h: 14 },
      { x: w * 0.6, y: top2 - 10, w: 200, h: 14 },
    ];
  } else {
    // Pyramids reachable
    const ph = 16;
    platforms = [
      { x: 0, y: groundY, w, h: 60 },
      { x: w * 0.2, y: top1 + 10, w: 160, h: ph },
      { x: w * 0.17, y: top2 + 10, w: 220, h: ph },
      { x: w * 0.14, y: top3 + 10, w: 280, h: ph },
      { x: w * 0.66, y: top1, w: 200, h: ph },
      { x: w * 0.62, y: top2, w: 260, h: ph },
      { x: w * 0.58, y: top3, w: 320, h: ph },
    ];
  }
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

  // Choose an upper platform toward enemy and jump when roughly aligned
  const upperPlatforms = platforms.filter(s => s.y + 1 < p.y && s.h < 40);
  let targetPlat = null; let bestDY = Infinity;
  for (const s of upperPlatforms) {
    const cx = s.x + s.w / 2; const dy = p.y - s.y;
    if (Math.abs((p.x + p.w / 2) - cx) < 160 && dy < bestDY) { bestDY = dy; targetPlat = s; }
  }
  const enemyAbove = (enemy.y + enemy.h) < (p.y - 24);
  if (p.onGround && p.aiJumpCd === 0 && (enemyAbove || targetPlat) ) {
    const closeToPlat = targetPlat ? Math.abs((p.x + p.w/2) - (targetPlat.x + targetPlat.w/2)) < 140 : true;
    if (closeToPlat) {
      p.vy = -JUMP_V * (0.98);
      p.onGround = false;
      p.aiJumpCd = 0.5;
    }
  }

  // Predictive aim and fire towards enemy with jitter and bullet drop compensation
  const gunX = p.x + p.w / 2 + p.facing * 12;
  const gunY = p.y + p.h * 0.35;
  const ex = enemy.x + enemy.w / 2;
  const ey = enemy.y + enemy.h * 0.4;
  const relX = ex - gunX;
  const relY = ey - gunY;
  const dist = Math.hypot(relX, relY) || 1;
  let t = clamp(dist / p.bulletSpeed, 0.05, 0.8);
  // one-iter lead using enemy velocity
  const gEff = G * 0.2; // bullet gravity factor
  const leadX = ex + enemy.vx * t;
  const leadY = ey + enemy.vy * t - 0.5 * gEff * t * t; // aim slightly above to compensate drop
  let aimX = leadX - gunX;
  let aimY = leadY - gunY;
  const n = Math.hypot(aimX, aimY) || 1;
  aimX /= n; aimY /= n;
  // jitter for human-like aim
  aimX += randRange(-AI.aimJitter, AI.aimJitter);
  aimY += randRange(-AI.aimJitter, AI.aimJitter);
  const n2 = Math.hypot(aimX, aimY) || 1; aimX/=n2; aimY/=n2;
  p.facing = Math.sign(aimX) || 1;

  p.reload -= dt;
  if (p.reload <= 0 && Math.abs(dx) < canvas.width * 0.7) {
    const vx = aimX * p.bulletSpeed;
    const vy = aimY * p.bulletSpeed;
    bullets.push(new Bullet(p, gunX, gunY, vx, vy, p.bulletDmg, p.color));
    p.reload = p.fireDelay * (0.9 + AI.react * 0.6);
    addShake(0.05);
  }
}

// Mobile controls
const mobileControls = document.getElementById('mobileControls');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnJump = document.getElementById('btnJump');
const btnShoot = document.getElementById('btnShoot');
const aimStick = document.getElementById('aimStick');
const aimKnob = document.getElementById('aimKnob');
let isMobile = false;
function checkMobile() {
  isMobile = window.innerWidth <= 900 || ('ontouchstart' in window);
  if (!isMobile) mobileControls.classList.add('hidden'); else mobileControls.classList.remove('hidden');
}
window.addEventListener('resize', checkMobile); checkMobile();

let mobileMoveLeft = false, mobileMoveRight = false, mobileShoot = false;
let aimVec = { x: 1, y: 0 };

function bindHold(el, on, off) {
  const start = (e) => { e.preventDefault(); on(); };
  const end = (e) => { e.preventDefault(); off(); };
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend', end, { passive: false });
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', end);
  el.addEventListener('mouseleave', end);
}

bindHold(btnLeft, () => mobileMoveLeft = true, () => mobileMoveLeft = false);
bindHold(btnRight, () => mobileMoveRight = true, () => mobileMoveRight = false);
bindHold(btnShoot, () => mobileShoot = true, () => mobileShoot = false);
btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); jumpPressed = true; });
btnJump.addEventListener('mousedown', (e) => { e.preventDefault(); jumpPressed = true; });

let aiming = false; let aimId = null;
function stickPosToVec(clientX, clientY) {
  const rect = aimStick.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const dx = clientX - cx; const dy = clientY - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len; const ny = dy / len;
  aimVec.x = nx; aimVec.y = ny;
  const radius = rect.width/2 - 24;
  aimKnob.style.left = `${rect.width/2 - 24 + nx * radius}px`;
  aimKnob.style.top = `${rect.height/2 - 24 + ny * radius}px`;
}
aimStick.addEventListener('touchstart', (e) => { aiming = true; aimId = e.changedTouches[0].identifier; stickPosToVec(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });
aimStick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === aimId) stickPosToVec(t.clientX, t.clientY); }, { passive: false });
aimStick.addEventListener('touchend', (e) => { aiming = false; aimId = null; aimKnob.style.left = '36px'; aimKnob.style.top = '36px'; }, { passive: false });
aimStick.addEventListener('mousedown', (e) => { aiming = true; stickPosToVec(e.clientX, e.clientY); });
window.addEventListener('mousemove', (e) => { if (aiming) stickPosToVec(e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { if (aiming) { aiming = false; aimKnob.style.left = '36px'; aimKnob.style.top = '36px'; } });

// Visual effects: muzzle flashes and bullet trails
const muzzleFlashes = [];
function spawnMuzzle(x, y) { muzzleFlashes.push({ x, y, t: 0 }); }
const trails = [];
function spawnTrail(x, y, color) { trails.push({ x, y, life: 0.25, color }); }

function update(dt) {
  if (state !== 'playing' || paused) { jumpPressed = false; return; }
  shakeT = Math.max(0, shakeT - dt);

  for (let pi = 0; pi < players.length; pi++) {
    const p = players[pi];
    const isAI = !!p.controls.ai;

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
      }

      // Aim
      let dirX, dirY;
      if (isMobile && (aiming || true)) { dirX = aimVec.x || p.facing; dirY = aimVec.y || 0; }
      else {
        const ax = mouseX - (p.x + p.w / 2);
        const ay = mouseY - (p.y + p.h * 0.35);
        const len = Math.hypot(ax, ay) || 1; dirX = ax / len; dirY = ay / len;
      }
      p.facing = Math.sign(dirX) || p.facing;

      p.reload -= dt;
      const wantShoot = mouseDown || mobileShoot;
      if (wantShoot && p.reload <= 0) {
        const vx = dirX * p.bulletSpeed;
        const vy = dirY * p.bulletSpeed;
        bullets.push(new Bullet(p, p.x + p.w / 2 + p.facing * 12, p.y + p.h * 0.35, vx, vy, p.bulletDmg, p.color));
        p.reload = p.fireDelay;
        p.vx -= Math.sign(vx) * (p.knockback / 14);
        addShake(0.05);
        spawnMuzzle(p.x + p.w / 2 + p.facing * 12, p.y + p.h * 0.35);
        spawnTrail(p.x + p.w / 2 + p.facing * 12, p.y + p.h * 0.35, p.color);
      }
    } else {
      updateAI(p, dt);
    }

    if (p.shieldCooldownMax > 0) {
      p.shieldCooldown -= dt; if (p.shieldCooldown <= 0) { p.shieldCooldown = p.shieldCooldownMax; p.shieldCharges = Math.min((p.shieldCharges||0) + 1, p.shieldCapacity || 1); }
    }

    p.vy += G * dt;
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

    p.x = clamp(p.x, 0, canvas.width - p.w);
    if (p.onGround) p.vx -= p.vx * FRICTION * dt;
  }

  // Bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt; if (b.life <= 0) { bullets.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vy += (G * 0.2) * dt;
    const bb = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
    let hitGeom = false;
    for (const s of platforms) if (rectsIntersect(bb, s)) { hitGeom = true; if (b.bounces > 0) { b.vy = -Math.abs(b.vy) * 0.7; b.bounces--; hitGeom = false; } else if (b.owner.explosiveLevel > 0) { spawnExplosion(b.x, b.y, b.owner); } break; }
    if (hitGeom) { bullets.splice(i, 1); continue; }
    if (b.x < -50 || b.x > canvas.width + 50 || b.y > canvas.height + 200) { bullets.splice(i, 1); continue; }
    for (const p of players) {
      if (p === b.owner) continue;
      if (rectsIntersect(bb, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        if (p.shieldCharges && p.shieldCharges > 0) { p.shieldCharges--; spawnParticle(b.x, b.y, '#9ad7ff'); bullets.splice(i, 1); break; }
        p.hp -= b.dmg;
        if (b.owner.lifesteal) b.owner.hp = clamp((b.owner.hp||100) + b.owner.lifesteal, 0, b.owner.maxHp||100);
        p.vx += Math.sign(b.vx) * 80; p.vy -= 120;
        spawnParticle(b.x, b.y, b.color);
        addShake(0.07);
        if (b.pierces > 0) { b.pierces--; } else { bullets.splice(i, 1); }
        break;
      }
    }
  }

  // Explosions
  if (explosions.length) {
    for (let ei = explosions.length - 1; ei >= 0; ei--) {
      const e = explosions[ei];
      e.t += dt; if (e.t > 0.25) { explosions.splice(ei,1); continue; }
      for (const p of players) {
        const cx = p.x + p.w/2, cy = p.y + p.h/2;
        const d2 = (cx - e.x)**2 + (cy - e.y)**2;
        const radius = 80 + 20 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
        const dmgBase = 20 + 8 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
        if (d2 < radius*radius) { p.hp -= dmgBase * dt * 4; }
      }
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 800 * dt;
  }

  // Update trails
  for (let i = trails.length - 1; i >= 0; i--) { trails[i].life -= dt; if (trails[i].life <= 0) trails.splice(i, 1); }
  // Update muzzle flashes
  for (let i = muzzleFlashes.length - 1; i >= 0; i--) { muzzleFlashes[i].t += dt; if (muzzleFlashes[i].t > 0.08) muzzleFlashes.splice(i, 1); }

  const alive = players.map(p => p.hp > 0);
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
  // nicer background
  const gTop = '#0e1a2a', gBot = '#1a2d4f';
  const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gr.addColorStop(0, gTop); gr.addColorStop(1, gBot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

  let sx = 0, sy = 0; if (shakeT > 0) { sx = (Math.random()-0.5)*10*shakeT; sy=(Math.random()-0.5)*10*shakeT; ctx.save(); ctx.translate(sx, sy); }

  // platforms with shadows
  for (const s of platforms) drawPlatform(s);

  // explosions
  for (const e of explosions) {
    const radius = 80 + 20 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
    const alpha = Math.max(0, 1 - e.t / 0.25);
    const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, radius);
    grd.addColorStop(0, `rgba(255,200,80,${alpha})`);
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, Math.PI*2); ctx.fill();
  }

  for (const p of players) drawPlayer(p);

  for (const b of bullets) {
    const grd2 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.8);
    grd2.addColorStop(0, b.color); grd2.addColorStop(1, '#ffffff00');
    ctx.fillStyle = grd2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life / 0.6); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2, 2); ctx.globalAlpha = 1; }

  // Draw trails
  for (const tr of trails) {
    ctx.globalAlpha = Math.max(0, tr.life / 0.25);
    const g = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 30);
    g.addColorStop(0, tr.color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tr.x, tr.y, 30, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Draw muzzle flashes
  for (const m of muzzleFlashes) {
    const a = Math.max(0, 1 - m.t / 0.08);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffd27d';
    ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (shakeT > 0) ctx.restore();

  drawVignette();

  // HUD (without engagement text)
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`Round ${seriesRoundIndex}/${SERIES_ROUNDS_TOTAL}  |  Series: P1 ${scores[0]} - ${scores[1]} AI`,
    Math.max(12, canvas.width/2 - 180), 28);
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
  // top
  const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
  g.addColorStop(0, '#3b4258'); g.addColorStop(1, '#2b3346');
  ctx.fillStyle = g; drawRoundedRect(Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h), 8); ctx.fill();
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; drawRoundedRect(Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h), 8); ctx.stroke();
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