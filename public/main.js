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

const ROUND_WIN = 3;

// Input
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

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
    this.hp = 100;
    this.reload = 0;
    this.facing = this.idx === 0 ? 1 : -1;
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
  }
  applyCards() {
    // reset to base
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
    for (const c of this.cards) c.apply(this);
  }
}

class Bullet {
  constructor(owner, x, y, vx, vy, dmg, color) {
    this.owner = owner; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = 4;
    this.dmg = dmg; this.life = 2.5; this.color = color;
  }
}

// Cards
const ALL_CARDS = [
  { id: 'rapid', title: 'Rapid Fire', desc: 'Fire delay -40%', apply: p => p.fireDelay *= 0.6 },
  { id: 'power', title: 'High Caliber', desc: '+50% bullet damage, +recoil', apply: p => { p.bulletDmg *= 1.5; p.knockback *= 1.2; } },
  { id: 'speed', title: 'Sprinter', desc: '+20% move speed', apply: p => { p.moveBoost += 0.2; } },
  { id: 'jumper', title: 'Bunny Hop', desc: '+25% jump power', apply: p => { p.jumpBoost += 0.25; } },
  { id: 'pierce', title: 'Piercing Rounds', desc: 'Bullets pierce once', apply: p => { p.pierce = true; } },
  { id: 'sniper', title: 'Marksman', desc: '+30% bullet speed', apply: p => { p.bulletSpeed *= 1.3; } },
];

// Game state
let players = [
  new Player(0, '#69f0ae', { left: 'KeyA', right: 'KeyD', jump: 'KeyW', fire: 'KeyF' }),
  new Player(1, '#ff8a80', { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', fire: 'Slash' }),
];
let bullets = [];
let winner = null;
let scores = [0, 0];
let state = 'menu'; // menu, playing, between
let lastTime = performance.now() / 1000;

startButton.onclick = () => {
  overlay.classList.add('hidden');
  startMatch();
};

function startMatch() {
  state = 'playing';
  bullets = [];
  makeDefaultPlatforms();
  players[0].reset(); players[1].reset();
  players[0].applyCards(); players[1].applyCards();
}

function endRound(winnerIdx) {
  scores[winnerIdx]++;
  if (scores[winnerIdx] >= ROUND_WIN) {
    state = 'menu';
    overlay.classList.remove('hidden');
    startButton.textContent = `P${winnerIdx + 1} wins! Enter Arena to restart`;
    scores = [0, 0];
    players.forEach(p => { p.cards = []; });
    return;
  }
  // Between rounds: draft
  state = 'between';
  openDraft(winnerIdx === 0 ? 1 : 0); // loser picks first
}

function openDraft(firstPickerIdx) {
  draftOverlay.classList.remove('hidden');
  doDraftFor(firstPickerIdx, () => doDraftFor(firstPickerIdx === 0 ? 1 : 0, () => {
    draftOverlay.classList.add('hidden');
    startMatch();
  }));
}

function doDraftFor(playerIdx, done) {
  draftPlayerLabel.textContent = `Player ${playerIdx + 1} pick`;
  cardGrid.innerHTML = '';
  const pool = pickNCards(ALL_CARDS, 3);
  for (const c of pool) {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<div class="card-title">${c.title}</div><div class="card-desc">${c.desc}</div>`;
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
  if (state !== 'playing') return;

  for (const p of players) {
    const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL);
    if (keys.has(p.controls.left)) p.vx -= accel * dt;
    if (keys.has(p.controls.right)) p.vx += accel * dt;
    p.vx = clamp(p.vx, -MAX_VX * (1 + p.moveBoost), MAX_VX * (1 + p.moveBoost));

    if (keys.has(p.controls.jump) && p.onGround) {
      p.vy = -JUMP_V * (1 + p.jumpBoost);
      p.onGround = false;
    }

    // shooting
    p.reload -= dt;
    if (keys.has(p.controls.fire) && p.reload <= 0) {
      const dir = p.facing;
      bullets.push(new Bullet(p, p.x + p.w / 2 + dir * 28, p.y + p.h * 0.35, dir * p.bulletSpeed, randRange(-60, 60), p.bulletDmg, p.color));
      p.reload = p.fireDelay;
      p.vx -= dir * (p.knockback / 10);
    }

    // gravity
    p.vy += G * dt;

    // integrate
    p.x += p.vx * dt;
    // x collisions
    const bboxX = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const s of platforms) if (rectsIntersect(bboxX, s)) {
      if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w;
      p.vx = 0;
    }

    p.y += p.vy * dt;
    p.onGround = false;
    const bboxY = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const s of platforms) if (rectsIntersect(bboxY, s)) {
      if (p.vy > 0) { p.y = s.y - p.h; p.onGround = true; } else if (p.vy < 0) { p.y = s.y + s.h; }
      p.vy = 0;
    }

    // friction
    if (p.onGround) p.vx -= p.vx * FRICTION * dt;

    // facing
    if (Math.abs(p.vx) > 1) p.facing = Math.sign(p.vx);
  }

  // bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt; if (b.life <= 0) { bullets.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vy += (G * 0.2) * dt;
    // collide with platforms
    const bb = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
    let hitGeom = false;
    for (const s of platforms) if (rectsIntersect(bb, s)) { hitGeom = true; break; }
    if (hitGeom) { bullets.splice(i, 1); continue; }
    // collide with players
    for (const p of players) {
      if (p === b.owner) continue;
      if (rectsIntersect(bb, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        p.hp -= b.dmg;
        p.vx += Math.sign(b.vx) * 80; p.vy -= 120;
        bullets.splice(i, 1);
        break;
      }
    }
  }

  // round end
  let alive = players.map(p => p.hp > 0);
  if (alive.filter(Boolean).length <= 1) {
    const winIdx = alive[0] ? 0 : 1;
    endRound(winIdx);
  }
}

function draw() {
  // bg
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gTop = '#0f172a', gBot = '#1f2b49';
  const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gr.addColorStop(0, gTop); gr.addColorStop(1, gBot);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // platforms
  ctx.fillStyle = '#2d3748';
  for (const s of platforms) ctx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.floor(s.w), Math.floor(s.h));

  // players
  for (const p of players) {
    // hp bar
    ctx.fillStyle = '#00000088'; ctx.fillRect(p.x - 2, p.y - 12, p.w + 4, 6);
    ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 12, (p.w + 4) * clamp(p.hp / 100, 0, 1), 6);
    // body
    ctx.fillStyle = p.color; ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.w, p.h);
    // gun
    ctx.fillStyle = '#ddd';
    const gx = p.x + p.w / 2 + p.facing * 12; const gy = p.y + p.h * 0.35;
    ctx.fillRect(gx, gy, p.facing * 18, 4);
  }

  // bullets
  for (const b of bullets) {
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  // score
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`P1 ${scores[0]} - ${scores[1]} P2`, canvas.width / 2 - 40, 28);
}

function loop() {
  const now = performance.now() / 1000; const dt = Math.min(0.033, now - lastTime); lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
loop();