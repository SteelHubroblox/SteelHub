import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.join(__dirname, '..');

const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-CHANGE-ME';
const PORT = process.env.PORT || 8080;

// DB
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

// Schema
const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      avatar TEXT DEFAULT '🧠',
      xp INTEGER DEFAULT 0,
      league TEXT DEFAULT 'Bronze',
      xpWeek INTEGER DEFAULT 0,
      weekId TEXT,
      gems INTEGER DEFAULT 5,
      lastGemsReset TEXT,
      lastAdAt INTEGER,
      adCountDay INTEGER DEFAULT 0,
      adDay TEXT,
      createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      lessonId TEXT NOT NULL,
      score INTEGER,
      completedAt TEXT,
      UNIQUE(userId, lessonId)
    );
  `);
};
init();

function isoToday() { return new Date().toISOString().slice(0,10); }
function getWeekId(d=new Date()) {
  const year = d.getUTCFullYear();
  const firstJan = new Date(Date.UTC(year,0,1));
  const days = Math.floor((d - firstJan) / 86400000);
  const week = Math.floor((days + firstJan.getUTCDay()+6)/7); // ISO-ish
  return `${year}-W${week}`;
}

function authMiddleware(req,res,next){
  const token = req.cookies?.token;
  if(!token) return res.status(401).json({error:'unauthorized'});
  try{
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid; next();
  }catch(e){ return res.status(401).json({error:'unauthorized'}); }
}

function resetDailyIfNeeded(user){
  const today = isoToday();
  if(user.lastGemsReset !== today){
    user.gems = 5;
    user.lastGemsReset = today;
    db.prepare('UPDATE users SET gems=?, lastGemsReset=? WHERE id=?').run(user.gems, user.lastGemsReset, user.id);
  }
  // reset ad counters daily
  if(user.adDay !== today){
    user.adDay = today; user.adCountDay = 0;
    db.prepare('UPDATE users SET adDay=?, adCountDay=0 WHERE id=?').run(today, user.id);
  }
  // reset weekly XP
  const weekId = getWeekId();
  if(user.weekId !== weekId){
    user.weekId = weekId; user.xpWeek = 0;
    db.prepare('UPDATE users SET weekId=?, xpWeek=0 WHERE id=?').run(weekId, user.id);
  }
}

function getUserById(id){
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if(user) resetDailyIfNeeded(user);
  return user;
}

// Auth
app.post('/api/auth/register', (req,res)=>{
  const { name, email, password } = req.body || {};
  if(!name || !email || !password) return res.status(400).json({error:'missing'});
  const hash = bcrypt.hashSync(password, 10);
  try{
    const info = db.prepare('INSERT INTO users (name,email,passwordHash,createdAt,weekId,lastGemsReset,adDay) VALUES (?,?,?,?,?,?,?)')
      .run(name, email.toLowerCase(), hash, new Date().toISOString(), getWeekId(), isoToday(), isoToday());
    const uid = info.lastInsertRowid;
    const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    const user = getUserById(uid);
    res.json({ user: { id:user.id, name:user.name, email:user.email, avatar:user.avatar, xp:user.xp, gems:user.gems, league:user.league, xpWeek:user.xpWeek } });
  }catch(e){
    if(String(e).includes('UNIQUE')) return res.status(409).json({error:'email_taken'});
    res.status(500).json({error:'server_error'});
  }
});

app.post('/api/auth/login', (req,res)=>{
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=?').get((email||'').toLowerCase());
  if(!user) return res.status(401).json({error:'invalid_credentials'});
  const ok = bcrypt.compareSync(password||'', user.passwordHash);
  if(!ok) return res.status(401).json({error:'invalid_credentials'});
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  resetDailyIfNeeded(user);
  res.json({ user: { id:user.id, name:user.name, email:user.email, avatar:user.avatar, xp:user.xp, gems:user.gems, league:user.league, xpWeek:user.xpWeek } });
});

app.post('/api/auth/logout', (req,res)=>{
  res.clearCookie('token'); res.json({ ok:true });
});

// Profile
app.get('/api/profile', authMiddleware, (req,res)=>{
  const user = getUserById(req.userId);
  if(!user) return res.status(404).json({error:'not_found'});
  res.json({ user: { id:user.id, name:user.name, email:user.email, avatar:user.avatar, xp:user.xp, gems:user.gems, league:user.league, xpWeek:user.xpWeek } });
});

app.post('/api/profile/update', authMiddleware, (req,res)=>{
  const { name, avatar } = req.body || {};
  db.prepare('UPDATE users SET name=?, avatar=? WHERE id=?').run(name||'Aprendiz', avatar||'🧠', req.userId);
  const user = getUserById(req.userId);
  res.json({ user: { id:user.id, name:user.name, email:user.email, avatar:user.avatar, xp:user.xp, gems:user.gems, league:user.league, xpWeek:user.xpWeek } });
});

// XP and lessons
app.post('/api/xp/add', authMiddleware, (req,res)=>{
  const { amount } = req.body || {}; const inc = Math.max(0, Math.min(1000, Number(amount)||0));
  const user = getUserById(req.userId);
  db.prepare('UPDATE users SET xp = xp + ?, xpWeek = xpWeek + ? WHERE id=?').run(inc, inc, user.id);
  const updated = getUserById(user.id);
  res.json({ xp: updated.xp, xpWeek: updated.xpWeek });
});

app.post('/api/lessons/start', authMiddleware, (req,res)=>{
  const user = getUserById(req.userId);
  if(user.gems <= 0) return res.status(402).json({ error:'no_gems', gems:user.gems });
  db.prepare('UPDATE users SET gems = gems - 1 WHERE id=?').run(user.id);
  const updated = getUserById(user.id);
  res.json({ gems: updated.gems });
});

app.post('/api/lessons/complete', authMiddleware, (req,res)=>{
  const { lessonId, score, xpGain=30 } = req.body || {};
  if(!lessonId) return res.status(400).json({error:'missing'});
  const user = getUserById(req.userId);
  db.prepare('INSERT INTO lessons (userId, lessonId, score, completedAt) VALUES (?,?,?,?) ON CONFLICT(userId,lessonId) DO UPDATE SET score=excluded.score, completedAt=excluded.completedAt')
    .run(user.id, String(lessonId), Number(score)||0, new Date().toISOString());
  const inc = Math.max(0, Math.min(200, Number(xpGain)||0));
  db.prepare('UPDATE users SET xp = xp + ?, xpWeek = xpWeek + ? WHERE id=?').run(inc, inc, user.id);
  const updated = getUserById(user.id);
  res.json({ ok:true, xp:updated.xp, xpWeek:updated.xpWeek });
});

// Ads -> gems reward with basic rate limiting
app.post('/api/ads/reward', authMiddleware, (req,res)=>{
  const user = getUserById(req.userId);
  const now = Date.now();
  const last = user.lastAdAt || 0;
  const day = isoToday();
  if(user.adDay !== day){
    db.prepare('UPDATE users SET adDay=?, adCountDay=0 WHERE id=?').run(day, user.id);
    user.adDay = day; user.adCountDay = 0;
  }
  if (now - last < 30000) return res.status(429).json({ error:'cooldown' }); // 30s cooldown
  if (user.adCountDay >= 20) return res.status(429).json({ error:'daily_cap' }); // max 20 per day
  db.prepare('UPDATE users SET gems = gems + 1, lastAdAt=?, adCountDay=adCountDay+1 WHERE id=?').run(now, user.id);
  const updated = getUserById(user.id);
  res.json({ gems: updated.gems, adCountDay: updated.adCountDay });
});

// Leaderboard: weekly by league
app.get('/api/leaderboard', (req,res)=>{
  const scope = req.query.scope || 'weekly';
  const league = req.query.league || 'Bronze';
  if (scope !== 'weekly') return res.status(400).json({error:'unsupported_scope'});
  const weekId = getWeekId();
  const top = db.prepare('SELECT name, avatar, xpWeek as xp FROM users WHERE weekId=? AND league=? ORDER BY xpWeek DESC LIMIT 50').all(weekId, league);
  res.json({ weekId, league, top });
});

// Serve SPA
app.use(express.static(appRoot, { index: 'index.html' }));
app.get('*', (req,res)=>{
  res.sendFile(path.join(appRoot, 'index.html'));
});

app.listen(PORT, '0.0.0.0', ()=>{
  console.log(`Speakify server running at http://0.0.0.0:${PORT}`);
});