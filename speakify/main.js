/* Speakify SPA core logic (extended) */

const AppStorageKeys = {
  profile: 'speakify.profile.v1',
  srs: 'speakify.srs.v1',
  streak: 'speakify.streak.v1',
  progress: 'speakify.progress.v1',
  settings: 'speakify.settings.v1',
  leaderboard: 'speakify.leaderboard.v1',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const diffDays = (a, b) => {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
};

const Leveling = {
  xpForLevel(level) {
    const base = 100;
    return Math.round(base * level * Math.pow(1.35, Math.max(level - 1, 0)));
  },
  totalXpForLevel(level) {
    let total = 0;
    for (let l = 1; l <= level; l++) total += this.xpForLevel(l);
    return total;
  },
  deriveLevel(totalXp) {
    let level = 1;
    let remaining = totalXp;
    while (remaining >= this.xpForLevel(level)) {
      remaining -= this.xpForLevel(level);
      level += 1;
      if (level > 100) break;
    }
    const currentLevelXpNeeded = this.xpForLevel(level);
    const currentLevelProgress = Math.max(0, Math.min(1, 1 - (currentLevelXpNeeded - remaining) / currentLevelXpNeeded));
    return { level, currentLevelXpNeeded, currentLevelProgress, remainingInLevel: remaining };
  },
};

const defaultProfile = () => ({
  name: 'Aprendiz',
  avatar: '🧠',
  xp: 0,
  createdAt: todayIso(),
  lastActiveAt: todayIso(),
});

const defaultSettings = () => ({
  ttsVoice: null,
  ttsRate: 1,
  ttsPitch: 1,
  animations: true,
  speechRecognition: true,
});

const defaultStreak = () => ({
  lastCheckIn: null,
  current: 0,
  best: 0,
  calendar: {},
});

const defaultProgress = () => ({
  lessonsCompleted: {},
  totals: { lessons: 0, wordsLearned: 0, quizzes: 0 },
});

const SRS_SCHEDULE = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };
const defaultSrs = () => ({ items: {} });

const Storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

// Simple API client (same-origin)
const Api = {
  async get(path) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) throw await res.json().catch(()=>({error:res.statusText}));
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}), credentials:'include' });
    if (!res.ok) throw await res.json().catch(()=>({error:res.statusText}));
    return res.json();
  }
};

const AppState = { authUser: null, league: 'Bronze' };

const Settings = {
  load() { return Storage.get(AppStorageKeys.settings, defaultSettings()); },
  save(s) { Storage.set(AppStorageKeys.settings, s); },
  set(partial) { const s = this.load(); this.save({ ...s, ...partial }); },
};

const AudioTTS = {
  voices: [],
  initVoices() {
    const syncVoices = () => {
      this.voices = window.speechSynthesis?.getVoices?.() || [];
    };
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = syncVoices;
      syncVoices();
    }
  },
  pickVoice(preferred) {
    if (!this.voices || this.voices.length === 0) return null;
    if (preferred) {
      const v = this.voices.find(v => v.name === preferred);
      if (v) return v;
    }
    return this.voices.find(v => v.lang?.toLowerCase().startsWith('es')) || this.voices[0];
  },
  speak(text, lang = 'es-ES') {
    try {
      const s = Settings.load();
      const utter = new SpeechSynthesisUtterance(text);
      const voice = this.pickVoice(s.ttsVoice);
      if (voice) utter.voice = voice;
      utter.lang = voice?.lang || lang;
      utter.pitch = s.ttsPitch ?? 1;
      utter.rate = s.ttsRate ?? 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('TTS not available', e);
    }
  },
};

const SpeechReco = {
  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },
  recognizeOnce({ lang = 'es-ES', timeoutMs = 7000 } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return reject(new Error('SpeechRecognition not supported'));
        const rec = new SR();
        rec.lang = lang;
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        const to = setTimeout(() => {
          try { rec.abort(); } catch {}
          reject(new Error('timeout'));
        }, timeoutMs);
        rec.onresult = (e) => {
          clearTimeout(to);
          const text = e.results?.[0]?.[0]?.transcript || '';
          resolve(text.toLowerCase());
        };
        rec.onerror = (e) => { clearTimeout(to); reject(e.error || e); };
        rec.onend = () => clearTimeout(to);
        rec.start();
      } catch (e) { reject(e); }
    });
  }
};

const ContentDB = {
  units: [
    // Basics
    { id:'basics-1', title:'Básicos 1', difficulty:1, color:'from-brand-500 to-brand-700',
      words:[
        { id:'w-hola',es:'hola',en:'hello',ipa:'ˈola' },
        { id:'w-adios',es:'adiós',en:'goodbye',ipa:'aðjˈos' },
        { id:'w-porfavor',es:'por favor',en:'please' },
        { id:'w-gracias',es:'gracias',en:'thank you' },
        { id:'w-si',es:'sí',en:'yes' },
        { id:'w-no',es:'no',en:'no' },
      ],
      phrases:[
        { id:'p-buenosdias',es:'Buenos días',en:'Good morning' },
        { id:'p-buenastardes',es:'Buenas tardes',en:'Good afternoon' },
        { id:'p-buenasnoches',es:'Buenas noches',en:'Good night' },
      ],
      quiz:[
        { type:'mc', q:'¿Cómo se dice "hello" en español?', options:['hola','adiós','gracias'], a:0 },
        { type:'type', q:'Traduce: thank you', a:'gracias' },
        { type:'listen', q:'Repite la palabra', a:'hola' },
      ] },
    { id:'basics-2', title:'Básicos 2', difficulty:2, color:'from-emerald-500 to-emerald-700',
      words:[
        { id:'w-hombre', es:'hombre', en:'man' },
        { id:'w-mujer', es:'mujer', en:'woman' },
        { id:'w-nino', es:'niño', en:'boy' },
        { id:'w-nina', es:'niña', en:'girl' },
        { id:'w-amigo', es:'amigo', en:'friend (m)' },
        { id:'w-amiga', es:'amiga', en:'friend (f)' },
      ],
      phrases:[
        { id:'p-comoteLLamas', es:'¿Cómo te llamas?', en:'What is your name?' },
        { id:'p-meLLamo', es:'Me llamo...', en:'My name is...' },
        { id:'p-encantado', es:'Encantado/Encantada', en:'Nice to meet you' },
      ],
      quiz:[
        { type:'mc', q:'¿Qué significa "mujer"?', options:['woman','man','girl'], a:0 },
        { type:'type', q:'Traduce: boy', a:'niño' },
        { type:'listen', q:'Escucha y escribe', a:'amigo' },
      ] },
    // Food
    { id:'food-1', title:'Comida 1', difficulty:2, color:'from-rose-500 to-rose-700',
      words:[
        { id:'w-agua', es:'agua', en:'water' },
        { id:'w-pan', es:'pan', en:'bread' },
        { id:'w-manzana', es:'manzana', en:'apple' },
        { id:'w-leche', es:'leche', en:'milk' },
        { id:'w-cafe', es:'café', en:'coffee' },
        { id:'w-te', es:'té', en:'tea' },
      ],
      phrases:[
        { id:'p-quieroagua', es:'Quiero agua', en:'I want water' },
        { id:'p-tienespan', es:'¿Tienes pan?', en:'Do you have bread?' },
        { id:'p-megusta', es:'Me gusta la manzana', en:'I like the apple' },
      ],
      quiz:[
        { type:'mc', q:'¿Cómo se dice "coffee"?', options:['té','café','leche'], a:1 },
        { type:'type', q:'Traduce: water', a:'agua' },
        { type:'listen', q:'Escribe lo que escuchas', a:'manzana' },
      ] },
    // Numbers
    { id:'numbers-1', title:'Números 1', difficulty:1, color:'from-indigo-500 to-indigo-700',
      words:[
        { id:'w-uno', es:'uno', en:'one' }, { id:'w-dos', es:'dos', en:'two' }, { id:'w-tres', es:'tres', en:'three' },
        { id:'w-cuatro', es:'cuatro', en:'four' }, { id:'w-cinco', es:'cinco', en:'five' }, { id:'w-seis', es:'seis', en:'six' },
      ],
      phrases:[ { id:'p-tengo3', es:'Tengo tres', en:'I have three' } ],
      quiz:[ { type:'mc', q:'¿Cómo se dice "five"?', options:['seis','cinco','cuatro'], a:1 } ] },
    // Colors
    { id:'colors-1', title:'Colores', difficulty:1, color:'from-fuchsia-500 to-fuchsia-700',
      words:[
        { id:'w-rojo', es:'rojo', en:'red' }, { id:'w-azul', es:'azul', en:'blue' }, { id:'w-verde', es:'verde', en:'green' },
        { id:'w-amarillo', es:'amarillo', en:'yellow' }, { id:'w-negro', es:'negro', en:'black' }, { id:'w-blanco', es:'blanco', en:'white' },
      ],
      phrases:[ { id:'p-colorfav', es:'Mi color favorito es azul', en:'My favorite color is blue' } ],
      quiz:[ { type:'type', q:'Traduce: green', a:'verde' } ] },
    // Family
    { id:'family-1', title:'Familia', difficulty:2, color:'from-amber-500 to-amber-700',
      words:[
        { id:'w-madre', es:'madre', en:'mother' }, { id:'w-padre', es:'padre', en:'father' }, { id:'w-hermano', es:'hermano', en:'brother' },
        { id:'w-hermana', es:'hermana', en:'sister' }, { id:'w-hijo', es:'hijo', en:'son' }, { id:'w-hija', es:'hija', en:'daughter' },
      ],
      phrases:[ { id:'p-familia', es:'Mi familia es grande', en:'My family is big' } ],
      quiz:[ { type:'mc', q:'¿"hermana" significa...?', options:['sister','brother','daughter'], a:0 } ] },
    // Travel
    { id:'travel-1', title:'Viajes', difficulty:3, color:'from-teal-500 to-teal-700',
      words:[
        { id:'w-aeropuerto', es:'aeropuerto', en:'airport' }, { id:'w-hotel', es:'hotel', en:'hotel' }, { id:'w-billete', es:'billete', en:'ticket' },
        { id:'w-mapa', es:'mapa', en:'map' }, { id:'w-taxi', es:'taxi', en:'taxi' }, { id:'w-metro', es:'metro', en:'subway' },
      ],
      phrases:[ { id:'p-dondehotel', es:'¿Dónde está el hotel?', en:'Where is the hotel?' } ],
      quiz:[ { type:'listen', q:'Escucha y escribe', a:'aeropuerto' } ] },
    // Weather
    { id:'weather-1', title:'Clima', difficulty:2, color:'from-cyan-500 to-cyan-700',
      words:[
        { id:'w-lluvia', es:'lluvia', en:'rain' }, { id:'w-sol', es:'sol', en:'sun' }, { id:'w-nublado', es:'nublado', en:'cloudy' },
        { id:'w-frio', es:'frío', en:'cold' }, { id:'w-calor', es:'calor', en:'heat' }, { id:'w-viento', es:'viento', en:'wind' },
      ],
      phrases:[ { id:'p-hacefrio', es:'Hace frío hoy', en:'It is cold today' } ],
      quiz:[ { type:'type', q:'Traduce: rain', a:'lluvia' } ] },
    // Time
    { id:'time-1', title:'Tiempo', difficulty:2, color:'from-purple-500 to-purple-700',
      words:[
        { id:'w-hora', es:'hora', en:'hour' }, { id:'w-minuto', es:'minuto', en:'minute' }, { id:'w-dia', es:'día', en:'day' },
        { id:'w-semana', es:'semana', en:'week' }, { id:'w-mes', es:'mes', en:'month' }, { id:'w-ano', es:'año', en:'year' },
      ],
      phrases:[ { id:'p-queshora', es:'¿Qué hora es?', en:'What time is it?' } ],
      quiz:[ { type:'mc', q:'"mes" significa...', options:['month','week','minute'], a:0 } ] },
    // Verbs Present
    { id:'verbs-pres-1', title:'Verb. Presente', difficulty:3, color:'from-sky-500 to-sky-700',
      words:[
        { id:'w-comer', es:'(yo) como', en:'I eat' }, { id:'w-bebo', es:'(yo) bebo', en:'I drink' }, { id:'w-vivo', es:'(yo) vivo', en:'I live' },
        { id:'w-hablo', es:'(yo) hablo', en:'I speak' }, { id:'w-leo', es:'(yo) leo', en:'I read' }, { id:'w-escribo', es:'(yo) escribo', en:'I write' },
      ],
      phrases:[ { id:'p-habloingles', es:'Hablo inglés', en:'I speak English' } ],
      quiz:[ { type:'type', q:'Traduce: I eat', a:'como' } ] },
    // House
    { id:'house-1', title:'Casa', difficulty:1, color:'from-lime-500 to-lime-700',
      words:[
        { id:'w-cocina', es:'cocina', en:'kitchen' }, { id:'w-bano', es:'baño', en:'bathroom' }, { id:'w-dormitorio', es:'dormitorio', en:'bedroom' },
        { id:'w-salon', es:'salón', en:'living room' }, { id:'w-puerta', es:'puerta', en:'door' }, { id:'w-ventana', es:'ventana', en:'window' },
      ],
      phrases:[ { id:'p-enlacocina', es:'Estoy en la cocina', en:'I am in the kitchen' } ],
      quiz:[ { type:'mc', q:'Traduce "window"', options:['puerta','ventana','cocina'], a:1 } ] },
    // Professions
    { id:'jobs-1', title:'Profesiones', difficulty:3, color:'from-stone-500 to-stone-700',
      words:[
        { id:'w-medico', es:'médico', en:'doctor' }, { id:'w-maestro', es:'maestro', en:'teacher' }, { id:'w-ingeniero', es:'ingeniero', en:'engineer' },
        { id:'w-cocinero', es:'cocinero', en:'cook' }, { id:'w-abogado', es:'abogado', en:'lawyer' }, { id:'w-enfermera', es:'enfermera', en:'nurse' },
      ],
      phrases:[ { id:'p-soymaestro', es:'Soy maestro', en:'I am a teacher' } ],
      quiz:[ { type:'type', q:'Traduce: doctor', a:'médico' } ] },
    // Clothes
    { id:'clothes-1', title:'Ropa', difficulty:2, color:'from-pink-500 to-pink-700',
      words:[
        { id:'w-camisa', es:'camisa', en:'shirt' }, { id:'w-pantalon', es:'pantalón', en:'pants' }, { id:'w-zapatos', es:'zapatos', en:'shoes' },
        { id:'w-abrigo', es:'abrigo', en:'coat' }, { id:'w-vestido', es:'vestido', en:'dress' }, { id:'w-sombrero', es:'sombrero', en:'hat' },
      ],
      phrases:[ { id:'p-llevocamisa', es:'Llevo una camisa', en:'I am wearing a shirt' } ],
      quiz:[ { type:'mc', q:'"abrigo" es...', options:['coat','dress','hat'], a:0 } ] },
    // Emotions
    { id:'emotions-1', title:'Emociones', difficulty:2, color:'from-red-500 to-red-700',
      words:[
        { id:'w-feliz', es:'feliz', en:'happy' }, { id:'w-triste', es:'triste', en:'sad' }, { id:'w-enojado', es:'enojado', en:'angry' },
        { id:'w-nervioso', es:'nervioso', en:'nervous' }, { id:'w-cansado', es:'cansado', en:'tired' }, { id:'w-emocionado', es:'emocionado', en:'excited' },
      ],
      phrases:[ { id:'p-estoyfeliz', es:'Estoy feliz', en:'I am happy' } ],
      quiz:[ { type:'type', q:'Traduce: sad', a:'triste' } ] },
    // Animals
    { id:'animals-1', title:'Animales', difficulty:1, color:'from-orange-500 to-orange-700',
      words:[
        { id:'w-gato', es:'gato', en:'cat' }, { id:'w-perro', es:'perro', en:'dog' }, { id:'w-pajaro', es:'pájaro', en:'bird' },
        { id:'w-vaca', es:'vaca', en:'cow' }, { id:'w-caballo', es:'caballo', en:'horse' }, { id:'w-pez', es:'pez', en:'fish' },
      ],
      phrases:[ { id:'p-megustaelperro', es:'Me gusta el perro', en:'I like the dog' } ],
      quiz:[ { type:'mc', q:'"gato" es...', options:['dog','cat','bird'], a:1 } ] },
  ]
};

function ensureSrsForWord(srs, wordId) {
  if (!srs.items[wordId]) {
    srs.items[wordId] = {
      box: 1,
      lastReviewed: null,
      nextReview: todayIso(),
      stats: { correct: 0, incorrect: 0 },
    };
  }
}

function scheduleSrs(item, answeredCorrect) {
  if (answeredCorrect) {
    item.box = Math.min(5, item.box + 1);
    item.stats.correct += 1;
  } else {
    item.box = 1;
    item.stats.incorrect += 1;
  }
  item.lastReviewed = todayIso();
  const nextInDays = SRS_SCHEDULE[item.box] ?? 3;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + nextInDays);
  item.nextReview = nextDate.toISOString().slice(0, 10);
}

const Profile = {
  load() { return Storage.get(AppStorageKeys.profile, defaultProfile()); },
  save(p) { Storage.set(AppStorageKeys.profile, p); },
  async addXp(amount) {
    // Local update
    const p = this.load();
    p.xp += amount;
    p.lastActiveAt = todayIso();
    this.save(p);
    Leaderboard.upsert(p);
    // Remote update if logged in
    if (AppState.authUser) {
      try {
        const { xp, xpWeek } = await Api.post('/api/xp/add', { amount });
        const np = this.load();
        np.xp = xp; this.save(np);
      } catch {}
    }
  },
};

const Streak = {
  load() { return Storage.get(AppStorageKeys.streak, defaultStreak()); },
  save(s) { Storage.set(AppStorageKeys.streak, s); },
  checkIn() {
    const s = this.load();
    const today = todayIso();
    if (s.lastCheckIn === today) return s;
    if (!s.lastCheckIn) s.current = 1; else {
      const gap = diffDays(s.lastCheckIn, today);
      if (gap === 1) s.current += 1; else if (gap > 1) s.current = 1;
    }
    s.best = Math.max(s.best, s.current);
    s.lastCheckIn = today;
    s.calendar[today] = true;
    this.save(s);
    Profile.addXp(10);
    return s;
  },
};

const Progress = {
  load() { return Storage.get(AppStorageKeys.progress, defaultProgress()); },
  save(p) { Storage.set(AppStorageKeys.progress, p); },
  completeLesson(lessonId, score, wordsLearnedIncrement) {
    const p = this.load();
    p.lessonsCompleted[lessonId] = { score, completedAt: todayIso() };
    p.totals.lessons = Object.keys(p.lessonsCompleted).length;
    p.totals.wordsLearned += wordsLearnedIncrement;
    p.totals.quizzes += 1;
    this.save(p);
  },
};

const Srs = {
  load() { return Storage.get(AppStorageKeys.srs, defaultSrs()); },
  save(s) { Storage.set(AppStorageKeys.srs, s); },
  getDueItems() {
    const s = this.load();
    const today = todayIso();
    return Object.entries(s.items)
      .filter(([, item]) => !item.nextReview || item.nextReview <= today)
      .map(([id, item]) => ({ id, ...item }));
  },
};

const Leaderboard = {
  load() { return Storage.get(AppStorageKeys.leaderboard, []); },
  save(list) { Storage.set(AppStorageKeys.leaderboard, list); },
  upsert(profile) {
    const list = this.load();
    const idx = list.findIndex(x => x.name === profile.name);
    const entry = { name: profile.name, avatar: profile.avatar, xp: profile.xp, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    list.sort((a,b) => b.xp - a.xp);
    this.save(list.slice(0, 50));
  }
};

function renderHeaderProfile() {
  const p = Profile.load();
  const { level, currentLevelProgress } = Leveling.deriveLevel(p.xp);
  document.getElementById('user-level').textContent = `Lvl ${level}`;
  document.getElementById('user-xp').textContent = `${p.xp} XP`;
  document.getElementById('xp-bar').style.width = `${Math.round(currentLevelProgress * 100)}%`;
  document.getElementById('user-streak').textContent = `🔥 ${Streak.load().current} días`;
  // Gems and auth buttons
  const gemsEl = document.getElementById('user-gems');
  const btnLogin = document.getElementById('btn-login');
  const btnProfile = document.getElementById('btn-profile');
  if (AppState.authUser) {
    gemsEl.textContent = AppState.authUser.gems ?? 0;
    btnLogin.classList.add('hidden');
    btnProfile.classList.remove('hidden');
  } else {
    gemsEl.textContent = '0';
    btnLogin.classList.remove('hidden');
    btnProfile.classList.add('hidden');
  }
}

function renderStatsCards() {
  const p = Profile.load();
  const prog = Progress.load();
  const cardsRoot = document.getElementById('stats-cards');
  const stats = [
    { label: 'Lecciones', value: prog.totals.lessons, icon: '📘', color: 'from-brand-500 to-brand-700' },
    { label: 'Palabras', value: prog.totals.wordsLearned, icon: '🧠', color: 'from-emerald-500 to-emerald-700' },
    { label: 'Cuestionarios', value: prog.totals.quizzes, icon: '📝', color: 'from-rose-500 to-rose-700' },
    { label: 'Mejor Racha', value: Streak.load().best, icon: '🔥', color: 'from-amber-500 to-amber-700' },
    { label: 'Nivel', value: Leveling.deriveLevel(p.xp).level, icon: '🎯', color: 'from-violet-500 to-violet-700' },
    { label: 'XP', value: p.xp, icon: '⚡', color: 'from-cyan-500 to-cyan-700' },
  ];
  cardsRoot.innerHTML = stats.map(s => `
    <div class="rounded-2xl bg-gradient-to-br ${s.color} p-0.5">
      <div class="rounded-[14px] glass p-4 flex items-center gap-3">
        <div class="text-xl">${s.icon}</div>
        <div>
          <div class="text-xl font-extrabold">${s.value}</div>
          <div class="text-xs text-slate-300">${s.label}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderLessonGrid() {
  const prog = Progress.load();
  const root = document.getElementById('lesson-grid');
  root.innerHTML = ContentDB.units.map(u => {
    const completed = !!prog.lessonsCompleted[u.id];
    const completedBadge = completed ? '<span class="text-emerald-400 text-xs font-semibold">Completado</span>' : '';
    const xpReward = 30 + u.difficulty * 10;
    return `
      <div class="rounded-2xl bg-gradient-to-br ${u.color} p-0.5">
        <div class="rounded-[14px] glass p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="font-bold">${u.title}</div>
            <div class="text-xs text-slate-300">Dificultad: ${u.difficulty}</div>
          </div>
          <div class="text-sm text-slate-300">${u.words.length} palabras • ${u.phrases.length} frases</div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">${completedBadge}</div>
            <button data-lesson="${u.id}" class="btn-start-lesson px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Empezar · +${xpReward} XP</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  root.querySelectorAll('.btn-start-lesson').forEach(btn => {
    btn.addEventListener('click', () => startLessonFlow(btn.dataset.lesson));
  });
}

function renderFlashcardsPanel() {
  const srs = Srs.load();
  const root = document.getElementById('flashcard-panel');
  const allWords = ContentDB.units.flatMap(u => u.words);
  allWords.forEach(w => ensureSrsForWord(srs, w.id));
  Srs.save(srs);

  const due = Srs.getDueItems();
  const dueCount = due.length;
  root.innerHTML = `
    <div class="glass rounded-xl border border-slate-700/60 p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="text-slate-300 text-sm">Debes repasar</div>
        <div class="text-xs text-slate-400">Cajas: 1–5</div>
      </div>
      <div class="text-2xl font-extrabold">${dueCount} tarjetas</div>
      <div class="flex gap-2">
        <button id="btn-review-now" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Revisar ahora</button>
        <button id="btn-add-random" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm">Añadir 5 nuevas</button>
      </div>
    </div>
    <div id="flashcard-session" class="mt-4"></div>
  `;

  document.getElementById('btn-add-random').addEventListener('click', () => {
    const unknown = allWords.filter(w => !srs.items[w.id]);
    const pick = unknown.sort(() => 0.5 - Math.random()).slice(0, 5);
    pick.forEach(w => ensureSrsForWord(srs, w.id));
    Srs.save(srs);
    renderFlashcardsPanel();
  });

  document.getElementById('btn-review-now').addEventListener('click', () => startFlashcardSession());
}

function startFlashcardSession() {
  const srs = Srs.load();
  const due = Srs.getDueItems();
  const allWords = ContentDB.units.flatMap(u => u.words);
  const dict = new Map(allWords.map(w => [w.id, w]));
  const panel = document.getElementById('flashcard-session');

  if (due.length === 0) {
    panel.innerHTML = '<div class="text-slate-400 text-sm">No hay tarjetas pendientes. ¡Añade nuevas o vuelve más tarde!</div>';
    return;
  }

  let idx = 0;

  const renderCard = () => {
    const item = due[idx];
    const word = dict.get(item.id);
    panel.innerHTML = `
      <div class="rounded-2xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 p-0.5">
        <div class="rounded-[14px] glass p-6 flex flex-col gap-4">
          <div class="text-sm text-slate-300">Caja ${item.box} · Próximo: ${item.nextReview || 'hoy'}</div>
          <div class="text-4xl font-black tracking-tight">${word.es}</div>
          <div class="text-slate-400">${word.en}${word.ipa ? ` · /${word.ipa}/` : ''}</div>
          <div class="flex gap-2">
            <button id="speak" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Escuchar</button>
            <button id="again" class="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm">De nuevo</button>
            <button id="good" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Bien</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('speak').onclick = () => AudioTTS.speak(word.es);
    document.getElementById('again').onclick = () => grade(false);
    document.getElementById('good').onclick = () => grade(true);
  };

  const grade = (correct) => {
    const item = srs.items[due[idx].id];
    scheduleSrs(item, correct);
    Srs.save(srs);
    Profile.addXp(correct ? 5 : 1);
    idx += 1;
    if (idx >= due.length) {
      panel.innerHTML = '<div class="text-slate-300">¡Sesión completada! 🎉</div>';
      tryConfetti();
      renderHeaderProfile();
      renderFlashcardsPanel();
      return;
    }
    renderCard();
  };

  renderCard();
}

function startLessonFlow(lessonId) {
  const unit = ContentDB.units.find(u => u.id === lessonId);
  if (!unit) return;

  async function ensureGemAndProceed() {
    if (!AppState.authUser) return renderOverlay();
    try {
      const { gems } = await Api.post('/api/lessons/start', {});
      AppState.authUser.gems = gems; renderHeaderProfile();
      renderOverlay();
    } catch (e) {
      if (e?.error === 'no_gems') {
        if (confirm('No tienes 💎 suficientes. ¿Ver un anuncio para ganar +1?')) {
          try { const r = await Api.post('/api/ads/reward', {}); AppState.authUser.gems = r.gems; renderHeaderProfile(); }
          catch(err){ alert('Espera antes de ver otro anuncio.'); }
        }
      } else {
        renderOverlay();
      }
    }
  }

  function renderOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-50 p-4 md:p-10';
    overlay.innerHTML = `
      <div class="absolute inset-0 bg-slate-950/70"></div>
      <div class="relative max-w-3xl mx-auto">
        <div class="rounded-2xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 p-0.5">
          <div class="rounded-[14px] glass p-4 md:p-6">
            <div class="flex items-center justify-between">
              <div class="font-bold">${unit.title}</div>
              <button id="close-lesson" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs">Salir</button>
            </div>
            <div id="lesson-step" class="mt-4"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('close-lesson').onclick = () => document.body.removeChild(overlay);

    let stepIndex = 0;
    const steps = [];
    unit.words.forEach(w => steps.push({ type: 'intro-word', word: w }));
    unit.phrases.forEach(p => steps.push({ type: 'intro-phrase', phrase: p }));
    unit.quiz.forEach(q => steps.push({ type: 'quiz', q }));

    let correctCount = 0;

    const renderStep = () => {
      if (stepIndex >= steps.length) return finishLesson();
      const step = steps[stepIndex];
      const host = overlay.querySelector('#lesson-step');

      if (step.type === 'intro-word') {
        host.innerHTML = `
          <div class="flex flex-col gap-2">
            <div class="text-sm text-slate-300">Nueva palabra</div>
            <div class="text-4xl font-black">${step.word.es}</div>
            <div class="text-slate-400">${step.word.en}${step.word.ipa ? ` · /${step.word.ipa}/` : ''}</div>
            <div class="flex gap-2 mt-2">
              <button id="speak" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Escuchar</button>
              <button id="next" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm">Siguiente</button>
            </div>
          </div>
        `;
        document.getElementById('speak').onclick = () => AudioTTS.speak(step.word.es);
        document.getElementById('next').onclick = () => { stepIndex++; renderStep(); };
      } else if (step.type === 'intro-phrase') {
        host.innerHTML = `
          <div class="flex flex-col gap-2">
            <div class="text-sm text-slate-300">Nueva frase</div>
            <div class="text-3xl font-black">${step.phrase.es}</div>
            <div class="text-slate-400">${step.phrase.en}</div>
            <div class="flex gap-2 mt-2">
              <button id="speak" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Escuchar</button>
              <button id="next" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm">Siguiente</button>
            </div>
          </div>
        `;
        document.getElementById('speak').onclick = () => AudioTTS.speak(step.phrase.es);
        document.getElementById('next').onclick = () => { stepIndex++; renderStep(); };
      } else if (step.type === 'quiz') {
        if (step.q.type === 'mc') {
          const opts = step.q.options.map((o, i) => `<button class="opt px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm" data-i="${i}">${o}</button>`).join(' ');
          host.innerHTML = `
            <div class="flex flex-col gap-3">
              <div class="text-sm text-slate-300">Pregunta</div>
              <div class="text-xl font-bold">${step.q.q}</div>
              <div class="flex flex-wrap gap-2">${opts}</div>
            </div>
          `;
          host.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
            const i = Number(b.dataset.i);
            const ok = i === step.q.a;
            correctCount += ok ? 1 : 0;
            Profile.addXp(ok ? 10 : 2);
            b.classList.add(ok ? 'bg-emerald-700' : 'bg-rose-700');
            setTimeout(() => { stepIndex++; renderStep(); }, 500);
          }));
        } else if (step.q.type === 'type') {
          host.innerHTML = `
            <div class="flex flex-col gap-3">
              <div class="text-sm text-slate-300">Escribe tu respuesta</div>
              <div class="text-xl font-bold">${step.q.q}</div>
              <input id="answer" class="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none" placeholder="Tu respuesta" />
              <div class="flex gap-2">
                <button id="submit" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Enviar</button>
                <button id="hint" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm">Pista</button>
              </div>
            </div>
          `;
          document.getElementById('submit').onclick = () => {
            const val = (document.getElementById('answer').value || '').trim().toLowerCase();
            const ok = val === step.q.a.toLowerCase();
            correctCount += ok ? 1 : 0;
            Profile.addXp(ok ? 12 : 2);
            stepIndex++; renderStep();
          };
          document.getElementById('hint').onclick = () => alert(`Empieza con: ${step.q.a.slice(0, 2)}...`);
        } else if (step.q.type === 'listen') {
          const srOk = Settings.load().speechRecognition && SpeechReco.isSupported();
          host.innerHTML = `
            <div class="flex flex-col gap-3">
              <div class="text-sm text-slate-300">Escucha y responde</div>
              <div class="flex gap-2">
                <button id="play" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Reproducir</button>
                ${srOk ? '<button id="speak" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Hablar</button>' : ''}
              </div>
              <input id="answer" class="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none" placeholder="Escribe lo que escuchas" />
              <button id="submit" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Comprobar</button>
            </div>
          `;
          document.getElementById('play').onclick = () => AudioTTS.speak(step.q.a);
          const submit = () => {
            const val = (document.getElementById('answer').value || '').trim().toLowerCase();
            const ok = similarity(val, step.q.a) >= 0.8;
            correctCount += ok ? 1 : 0;
            Profile.addXp(ok ? 12 : 2);
            stepIndex++; renderStep();
          };
          document.getElementById('submit').onclick = submit;
          const speakBtn = document.getElementById('speak');
          if (speakBtn) speakBtn.onclick = async () => {
            speakBtn.disabled = true; speakBtn.textContent = 'Escuchando…';
            try {
              const text = await SpeechReco.recognizeOnce({ lang: 'es-ES' });
              document.getElementById('answer').value = text;
            } catch {}
            speakBtn.disabled = false; speakBtn.textContent = 'Hablar';
          };
        }
      }
    };

    const finishLesson = async () => {
      const score = Math.round((correctCount / unit.quiz.length) * 100);
      Progress.completeLesson(unit.id, score, unit.words.length);
      await Profile.addXp(30 + unit.difficulty * 10);
      // Remote lesson complete
      if (AppState.authUser) {
        try { await Api.post('/api/lessons/complete', { lessonId: unit.id, score, xpGain: 30 + unit.difficulty * 10 }); } catch {}
      }
      // Seed SRS and refresh
      const srs = Srs.load(); unit.words.forEach(w => ensureSrsForWord(srs, w.id)); Srs.save(srs);
      renderHeaderProfile(); renderStatsCards(); renderLessonGrid(); renderFlashcardsPanel();
      tryConfetti(); alert(`Lección completada: ${unit.title} — Puntuación: ${score}%`);
      document.body.removeChild(overlay);
    };

    renderStep();
  }

  ensureGemAndProceed();
}

function renderStreakSidebar() {
  const s = Streak.load();
  document.getElementById('streak-days').textContent = s.current;
  const cal = document.getElementById('streak-calendar');
  const today = new Date();
  const start = new Date(); start.setDate(today.getDate() - 27);
  const days = [];
  for (let d = 0; d < 28; d++) {
    const dt = new Date(start); dt.setDate(start.getDate() + d);
    const iso = dt.toISOString().slice(0, 10);
    const hit = !!s.calendar[iso];
    days.push(`<div class="aspect-square rounded-md ${hit ? 'bg-accent-600' : 'bg-slate-800 border border-slate-700'}"></div>`);
  }
  cal.innerHTML = days.join('');

  document.getElementById('btn-checkin').onclick = () => {
    Streak.checkIn();
    renderHeaderProfile();
    renderStreakSidebar();
  };
}

function renderChallengesAndAchievements() {
  const p = Profile.load();
  const { level } = Leveling.deriveLevel(p.xp);
  const challenges = [
    { id: 'ch-50xp', label: 'Gana 50 XP hoy', target: 50, progress: p.xp % 50 },
    { id: 'ch-streak-3', label: 'Racha de 3 días', target: 3, progress: Streak.load().current },
    { id: 'ch-lesson-1', label: 'Completa 1 lección', target: 1, progress: Progress.load().totals.lessons },
  ];
  const achievements = [
    { id: 'a-lvl-5', label: 'Nivel 5 alcanzado', unlocked: level >= 5 },
    { id: 'a-100-words', label: '100 palabras', unlocked: Progress.load().totals.wordsLearned >= 100 },
    { id: 'a-streak-7', label: 'Racha de 7 días', unlocked: Streak.load().best >= 7 },
  ];

  const chRoot = document.getElementById('challenges');
  chRoot.innerHTML = challenges.map(c => {
    const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
    return `
      <li class="glass rounded-xl border border-slate-700/60 p-3">
        <div class="text-sm">${c.label}</div>
        <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
          <div class="h-full bg-gradient-to-r from-accent-500 to-accent-700" style="width:${pct}%"></div>
        </div>
      </li>
    `;
  }).join('');

  const aRoot = document.getElementById('achievements');
  aRoot.innerHTML = achievements.map(a => `
    <li class="glass rounded-xl border border-slate-700/60 p-3 flex items-center justify-between">
      <div class="text-sm">${a.label}</div>
      <div class="text-xs ${a.unlocked ? 'text-emerald-400' : 'text-slate-500'}">${a.unlocked ? 'Desbloqueado' : 'Bloqueado'}</div>
    </li>
  `).join('');
}

function renderLeaderboard() {
  const root = document.getElementById('leaderboard');
  const you = Profile.load().name;
  if (AppState.authUser) {
    Api.get(`/api/leaderboard?scope=weekly&league=${encodeURIComponent(AppState.league)}`)
      .then(({ top }) => {
        root.innerHTML = (top||[]).slice(0, 10).map((e, i) => `
          <li class="glass rounded-xl border border-slate-700/60 p-3 flex items-center justify-between ${e.name===you?'ring-1 ring-brand-600/50':''}">
            <div class="flex items-center gap-2"><span class="text-slate-400 text-xs w-5">${i+1}</span><span>${e.avatar||'🙂'}</span><span class="font-semibold">${e.name}</span></div>
            <div class="text-xs text-slate-300">${e.xp} XP</div>
          </li>
        `).join('') || '<li class="text-slate-500 text-sm">Aún no hay datos</li>';
      })
      .catch(()=>{
        // fallback local
        const list = Leaderboard.load();
        root.innerHTML = list.slice(0, 10).map((e, i) => `
          <li class="glass rounded-xl border border-slate-700/60 p-3 flex items-center justify-between ${e.name===you?'ring-1 ring-brand-600/50':''}">
            <div class="flex items-center gap-2"><span class="text-slate-400 text-xs w-5">${i+1}</span><span>${e.avatar||'🙂'}</span><span class="font-semibold">${e.name}</span></div>
            <div class="text-xs text-slate-300">${e.xp} XP</div>
          </li>
        `).join('') || '<li class="text-slate-500 text-sm">Aún no hay datos</li>';
      });
  } else {
    const list = Leaderboard.load();
    root.innerHTML = list.slice(0, 10).map((e, i) => `
      <li class="glass rounded-xl border border-slate-700/60 p-3 flex items-center justify-between ${e.name===you?'ring-1 ring-brand-600/50':''}">
        <div class="flex items-center gap-2"><span class="text-slate-400 text-xs w-5">${i+1}</span><span>${e.avatar||'🙂'}</span><span class="font-semibold">${e.name}</span></div>
        <div class="text-xs text-slate-300">${e.xp} XP</div>
      </li>
    `).join('') || '<li class="text-slate-500 text-sm">Inicia sesión para ver ligas</li>';
  }
}

function renderMiniGamesPanel() {
  const games = [
    { id:'mg-match', name:'Emparejar', desc:'Relaciona palabras', color:'from-amber-500 to-amber-700' },
    { id:'mg-order', name:'Ordenar', desc:'Ordena la frase', color:'from-indigo-500 to-indigo-700' },
    { id:'mg-blank', name:'Huecos', desc:'Completa la frase', color:'from-emerald-500 to-emerald-700' },
    { id:'mg-speak', name:'Pronunciación', desc:'Habla en voz alta', color:'from-rose-500 to-rose-700' },
  ];
  const root = document.getElementById('minigames-panel');
  root.innerHTML = games.map(g => `
    <div class="rounded-2xl bg-gradient-to-br ${g.color} p-0.5">
      <div class="rounded-[14px] glass p-4">
        <div class="font-bold">${g.name}</div>
        <div class="text-xs text-slate-300">${g.desc}</div>
        <button data-game="${g.id}" class="mt-3 px-3 py-2 rounded-xl bg-slate-900/70 hover:bg-slate-900 border border-slate-700 text-sm">Jugar</button>
      </div>
    </div>
  `).join('');
  root.querySelectorAll('button[data-game]').forEach(b => b.onclick = () => startMiniGame(b.dataset.game));
}

function sampleWords(n=6) {
  const all = ContentDB.units.flatMap(u => u.words);
  return all.sort(() => 0.5 - Math.random()).slice(0, n);
}

function startMiniGame(gameId) {
  if (gameId === 'mg-match') return gameMatch();
  if (gameId === 'mg-order') return gameOrder();
  if (gameId === 'mg-blank') return gameBlank();
  if (gameId === 'mg-speak') return gameSpeak();
}

function openOverlay(title) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 z-50 p-4 md:p-10';
  overlay.innerHTML = `
    <div class="absolute inset-0 bg-slate-950/70"></div>
    <div class="relative max-w-3xl mx-auto">
      <div class="rounded-2xl bg-gradient-to-br from-slate-700/40 to-slate-800/40 p-0.5">
        <div class="rounded-[14px] glass p-4 md:p-6">
          <div class="flex items-center justify-between">
            <div class="font-bold">${title}</div>
            <button id="close-ov" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs">Salir</button>
          </div>
          <div id="ov-body" class="mt-4"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-ov').onclick = () => document.body.removeChild(overlay);
  return { overlay, body: overlay.querySelector('#ov-body') };
}

function gameMatch() {
  const words = sampleWords(6);
  const left = words.map(w => ({ k:w.id, label:w.es }));
  const right = words.map(w => ({ k:w.id, label:w.en })).sort(() => 0.5 - Math.random());
  const { body, overlay } = openOverlay('Emparejar');
  let selectedL = null; let matched = new Set();

  const render = () => {
    body.innerHTML = `
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">${left.map((x,i)=>`<button data-side="L" data-k="${x.k}" class="w-full text-left px-3 py-2 rounded-xl ${matched.has(x.k)?'bg-emerald-800/50 text-emerald-200':'bg-slate-900 border border-slate-700'}">${x.label}</button>`).join('')}</div>
        <div class="space-y-2">${right.map((x,i)=>`<button data-side="R" data-k="${x.k}" class="w-full text-left px-3 py-2 rounded-xl ${matched.has(x.k)?'bg-emerald-800/50 text-emerald-200':'bg-slate-900 border border-slate-700'}">${x.label}</button>`).join('')}</div>
      </div>
    `;
    body.querySelectorAll('button').forEach(b => b.onclick = () => {
      const side = b.dataset.side; const k = b.dataset.k;
      if (matched.has(k)) return;
      if (side === 'L') { selectedL = k; b.classList.add('ring-2','ring-brand-600'); return; }
      if (side === 'R' && selectedL) {
        if (selectedL === k) {
          matched.add(k); Profile.addXp(6);
          if (matched.size === words.length) { tryConfetti(); alert('¡Genial! Emparejaste todas.'); document.body.removeChild(overlay); renderHeaderProfile(); }
          else render();
        } else {
          b.classList.add('bg-rose-800'); setTimeout(()=>{ b.classList.remove('bg-rose-800'); }, 400);
        }
        selectedL = null;
      }
    });
  };
  render();
}

function gameOrder() {
  const phrase = ContentDB.units.flatMap(u=>u.phrases)[Math.floor(Math.random()*ContentDB.units.flatMap(u=>u.phrases).length)] || { es:'Hola', en:'Hello' };
  const words = phrase.es.split(' ');
  const shuffled = [...words].sort(()=>0.5 - Math.random());
  const { body, overlay } = openOverlay('Ordena la frase');
  const picked = [];

  const render = () => {
    body.innerHTML = `
      <div class="text-slate-300 text-sm">${phrase.en}</div>
      <div class="min-h-[48px] mt-2 p-2 rounded-xl bg-slate-900 border border-slate-700" id="assembled">${picked.join(' ')}</div>
      <div class="mt-3 flex flex-wrap gap-2" id="pool">${shuffled.map((w,i)=>`<button data-w="${w}" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm">${w}</button>`).join('')}</div>
      <div class="mt-3"><button id="check" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Comprobar</button></div>
    `;
    body.querySelectorAll('#pool button').forEach(b => b.onclick = () => { picked.push(b.dataset.w); b.remove(); body.querySelector('#assembled').textContent = picked.join(' '); });
    body.querySelector('#check').onclick = () => {
      const ok = picked.join(' ') === words.join(' ');
      if (ok) { Profile.addXp(15); tryConfetti(); alert('¡Perfecto!'); document.body.removeChild(overlay); renderHeaderProfile(); }
      else alert('Casi. Intenta de nuevo.');
    };
  };
  render();
}

function gameBlank() {
  const phrase = ContentDB.units.flatMap(u=>u.phrases)[0] || { es:'Hola mundo', en:'Hello world' };
  const tokens = phrase.es.split(' ');
  const holeIdx = Math.max(0, Math.min(tokens.length-1, 1));
  const correct = tokens[holeIdx];
  tokens[holeIdx] = '_____';
  const options = [correct, ...sampleWords(3).map(w=>w.es)].sort(()=>0.5 - Math.random());
  const { body, overlay } = openOverlay('Completa la frase');

  body.innerHTML = `
    <div class="text-slate-300 text-sm">${phrase.en}</div>
    <div class="mt-2 text-xl font-bold">${tokens.join(' ')}</div>
    <div class="mt-3 flex flex-wrap gap-2">${options.map((o,i)=>`<button class="opt px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm" data-i="${i}">${o}</button>`).join('')}</div>
  `;
  body.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const ok = b.textContent === correct;
    if (ok) { Profile.addXp(10); tryConfetti(); alert('¡Bien hecho!'); document.body.removeChild(overlay); renderHeaderProfile(); }
    else { b.classList.add('bg-rose-800'); setTimeout(()=>b.classList.remove('bg-rose-800'), 400); }
  });
}

function gameSpeak() {
  const word = sampleWords(1)[0];
  const { body, overlay } = openOverlay('Pronunciación');
  const srOk = Settings.load().speechRecognition && SpeechReco.isSupported();
  body.innerHTML = `
    <div class="text-4xl font-black">${word.es}</div>
    <div class="text-slate-400">${word.en}</div>
    <div class="flex gap-2 mt-2">
      <button id="play" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Escuchar</button>
      ${srOk?'<button id="speak" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Pronunciar</button>':''}
    </div>
    <div class="mt-2 text-sm text-slate-400" id="result"></div>
  `;
  body.querySelector('#play').onclick = () => AudioTTS.speak(word.es);
  const speakBtn = body.querySelector('#speak');
  if (speakBtn) speakBtn.onclick = async () => {
    speakBtn.disabled = true; speakBtn.textContent = 'Escuchando…';
    try {
      const heard = await SpeechReco.recognizeOnce({ lang:'es-ES' });
      const sim = similarity(heard, word.es);
      const ok = sim >= 0.8;
      body.querySelector('#result').textContent = `Oí: "${heard}" · Similitud: ${(sim*100)|0}%`;
      if (ok) { Profile.addXp(15); tryConfetti(); alert('¡Excelente pronunciación!'); document.body.removeChild(overlay); renderHeaderProfile(); }
    } catch (e) { body.querySelector('#result').textContent = 'No se pudo reconocer.'; }
    speakBtn.disabled = false; speakBtn.textContent = 'Pronunciar';
  };
}

function similarity(a, b) {
  a = (a||'').toLowerCase().normalize('NFD').replace(/[^a-zñáéíóúü\s]/g,'');
  b = (b||'').toLowerCase().normalize('NFD').replace(/[^a-zñáéíóúü\s]/g,'');
  const da = a.split(/\s+/).join(' '); const db = b.split(/\s+/).join(' ');
  const dist = levenshtein(da, db);
  return 1 - dist / Math.max(da.length, db.length, 1);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0]=i;
  for (let j=0;j<=n;j++) dp[0][j]=j;
  for (let i=1;i<=m;i++) {
    for (let j=1;j<=n;j++) {
      const cost = a[i-1]===b[j-1]?0:1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function attachGlobalHandlers() {
  document.getElementById('btn-continue').onclick = () => startLessonFlow(ContentDB.units[0].id);
  document.getElementById('btn-profile').onclick = openProfileModal;
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.onclick = openSettingsModal;
  const btnLogin = document.getElementById('btn-login');
  if (btnLogin) btnLogin.onclick = openAuthModal;
  const btnAd = document.getElementById('btn-watch-ad');
  if (btnAd) btnAd.onclick = async () => {
    if (!AppState.authUser) return openAuthModal();
    try { const r = await Api.post('/api/ads/reward', {}); AppState.authUser.gems = r.gems; renderHeaderProfile(); }
    catch(e){ alert(e?.error==='cooldown'?'Espera unos segundos antes de otro anuncio.':'Límite diario alcanzado.'); }
  };
}

function openProfileModal() {
  const p = Profile.load();
  const { level, currentLevelXpNeeded, remainingInLevel } = Leveling.deriveLevel(p.xp);
  const { overlay, body } = openOverlay('Perfil');
  body.innerHTML = `
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <div class="text-3xl">${p.avatar}</div>
        <input id="name" value="${p.name}" class="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none" />
      </div>
      <div class="text-sm text-slate-300">Nivel ${level} · ${p.xp} XP · Próximo nivel en ${currentLevelXpNeeded - remainingInLevel} XP</div>
      <div class="flex gap-2">
        <button id="save" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Guardar</button>
        <button id="reset" class="px-3 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-sm">Reiniciar datos</button>
      </div>
    </div>
  `;
  body.querySelector('#save').onclick = () => {
    const np = Profile.load();
    np.name = body.querySelector('#name').value || 'Aprendiz';
    Profile.save(np); Leaderboard.upsert(np);
    renderHeaderProfile(); renderLeaderboard();
    document.body.removeChild(overlay);
  };
  body.querySelector('#reset').onclick = () => {
    if (!confirm('¿Seguro que deseas borrar tu progreso?')) return;
    localStorage.clear();
    Profile.save(defaultProfile());
    Progress.save(defaultProgress());
    Streak.save(defaultStreak());
    Srs.save(defaultSrs());
    Settings.save(defaultSettings());
    Leaderboard.save([]);
    boot();
    document.body.removeChild(overlay);
  };
}

function openSettingsModal() {
  const s = Settings.load();
  const { overlay, body } = openOverlay('Ajustes');
  const voices = (window.speechSynthesis?.getVoices?.() || []).map(v => v.name);
  body.innerHTML = `
    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <div class="text-sm text-slate-300 mb-1">Voz TTS</div>
        <select id="voice" class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700">
          <option value="">Auto</option>
          ${voices.map(v=>`<option ${s.ttsVoice===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div>
        <div class="text-sm text-slate-300 mb-1">Velocidad</div>
        <input id="rate" type="range" min="0.6" max="1.4" step="0.1" value="${s.ttsRate}" class="w-full" />
      </div>
      <div>
        <div class="text-sm text-slate-300 mb-1">Tono</div>
        <input id="pitch" type="range" min="0.8" max="1.4" step="0.1" value="${s.ttsPitch}" class="w-full" />
      </div>
      <div class="flex items-center gap-2">
        <input id="anim" type="checkbox" ${s.animations?'checked':''} />
        <label for="anim" class="text-sm">Animaciones (confeti)</label>
      </div>
      <div class="flex items-center gap-2">
        <input id="sr" type="checkbox" ${s.speechRecognition?'checked':''} />
        <label for="sr" class="text-sm">Reconocimiento de voz</label>
      </div>
    </div>
    <div class="mt-4 flex gap-2">
      <button id="save" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Guardar</button>
      <button id="test" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm">Probar voz</button>
    </div>
  `;
  body.querySelector('#save').onclick = () => {
    Settings.set({
      ttsVoice: body.querySelector('#voice').value || null,
      ttsRate: Number(body.querySelector('#rate').value),
      ttsPitch: Number(body.querySelector('#pitch').value),
      animations: body.querySelector('#anim').checked,
      speechRecognition: body.querySelector('#sr').checked,
    });
    document.body.removeChild(overlay);
  };
  body.querySelector('#test').onclick = () => AudioTTS.speak('Este es un ejemplo de voz en español.');
}

function openAuthModal() {
  const { overlay, body } = openOverlay('Entrar / Registrarse');
  body.innerHTML = `
    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <div class="font-semibold mb-2">Entrar</div>
        <input id="lemail" type="email" placeholder="Email" class="w-full mb-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700" />
        <input id="lpass" type="password" placeholder="Contraseña" class="w-full mb-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700" />
        <button id="login" class="w-full px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Entrar</button>
      </div>
      <div>
        <div class="font-semibold mb-2">Registrarse</div>
        <input id="rname" placeholder="Nombre" class="w-full mb-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700" />
        <input id="remail" type="email" placeholder="Email" class="w-full mb-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700" />
        <input id="rpass" type="password" placeholder="Contraseña" class="w-full mb-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700" />
        <button id="register" class="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Crear cuenta</button>
      </div>
    </div>
  `;
  body.querySelector('#login').onclick = async () => {
    try {
      const data = await Api.post('/api/auth/login', { email: body.querySelector('#lemail').value, password: body.querySelector('#lpass').value });
      AppState.authUser = data.user; // sync local XP to server value if desired
      const p = Profile.load(); p.xp = data.user.xp; Profile.save(p);
      renderAll(); document.body.removeChild(overlay);
    } catch (e) { alert('Credenciales inválidas'); }
  };
  body.querySelector('#register').onclick = async () => {
    try {
      const data = await Api.post('/api/auth/register', { name: body.querySelector('#rname').value||'Aprendiz', email: body.querySelector('#remail').value, password: body.querySelector('#rpass').value });
      AppState.authUser = data.user;
      const p = Profile.load(); p.xp = data.user.xp; Profile.save(p);
      renderAll(); document.body.removeChild(overlay);
    } catch (e) { alert(e?.error==='email_taken'?'Este email ya existe':'No se pudo registrar'); }
  };
}

// Confetti animation
function tryConfetti() {
  const s = Settings.load();
  if (!s.animations) return;
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width = window.innerWidth; const H = canvas.height = window.innerHeight;
  const pieces = Array.from({length: 150}, () => ({
    x: Math.random()*W,
    y: -20 - Math.random()*H*0.5,
    r: 4 + Math.random()*6,
    c: `hsl(${Math.random()*360}, 90%, 60%)`,
    vy: 2 + Math.random()*3,
    vx: -1 + Math.random()*2,
    rot: Math.random()*Math.PI,
    vr: -0.2 + Math.random()*0.4,
  }));
  let t = 0; const dur = 120;
  const draw = () => {
    ctx.clearRect(0,0,W,H);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.02;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
      ctx.restore();
    });
    t++; if (t<dur) requestAnimationFrame(draw); else ctx.clearRect(0,0,W,H);
  };
  draw();
}

function renderAll() {
  renderHeaderProfile();
  renderStatsCards();
  renderLessonGrid();
  renderFlashcardsPanel();
  renderStreakSidebar();
  renderChallengesAndAchievements();
  renderLeaderboard();
  renderMiniGamesPanel();
}

async function boot() {
  document.getElementById('year').textContent = String(new Date().getFullYear());
  AudioTTS.initVoices();
  // Try restore session
  try { const { user } = await Api.get('/api/profile'); AppState.authUser = user; const p = Profile.load(); p.xp = user.xp; Profile.save(p); } catch {}
  Leaderboard.upsert(Profile.load());
  renderAll();
  attachGlobalHandlers();
}

window.addEventListener('load', boot);