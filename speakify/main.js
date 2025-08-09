/* Speakify SPA core logic */

const AppStorageKeys = {
  profile: 'speakify.profile.v1',
  srs: 'speakify.srs.v1',
  streak: 'speakify.streak.v1',
  progress: 'speakify.progress.v1',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const diffDays = (a, b) => {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
};

const Leveling = {
  // XP curve: total XP for next level grows quadratically
  xpForLevel(level) {
    // base 100, growth factor 1.35
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
  xp: 0,
  createdAt: todayIso(),
  lastActiveAt: todayIso(),
});

const defaultStreak = () => ({
  lastCheckIn: null,
  current: 0,
  best: 0,
  calendar: {}, // { 'YYYY-MM-DD': true }
});

const defaultProgress = () => ({
  lessonsCompleted: {}, // { lessonId: { score: number, completedAt: string } }
  totals: { lessons: 0, wordsLearned: 0, quizzes: 0 },
});

// Leitner SRS boxes 1..5; next review intervals in days
const SRS_SCHEDULE = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 21 };
const defaultSrs = () => ({
  items: {}, // id -> { box: 1..5, lastReviewed: string, nextReview: string, stats: { correct: number, incorrect: number } }
});

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

const AudioTTS = {
  speak(text, lang = 'es-ES', pitch = 1, rate = 1) {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.pitch = pitch;
      utter.rate = rate;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('TTS not available', e);
    }
  },
};

// Example content database (can be extended massively). Group by units with levels.
const ContentDB = {
  units: [
    {
      id: 'basics-1',
      title: 'Básicos 1',
      difficulty: 1,
      color: 'from-brand-500 to-brand-700',
      words: [
        { id: 'w-hola', es: 'hola', en: 'hello', ipa: 'ˈola' },
        { id: 'w-adios', es: 'adiós', en: 'goodbye', ipa: 'aðjˈos' },
        { id: 'w-porfavor', es: 'por favor', en: 'please' },
        { id: 'w-gracias', es: 'gracias', en: 'thank you' },
        { id: 'w-si', es: 'sí', en: 'yes' },
        { id: 'w-no', es: 'no', en: 'no' },
      ],
      phrases: [
        { id: 'p-buenosdias', es: 'Buenos días', en: 'Good morning' },
        { id: 'p-buenastardes', es: 'Buenas tardes', en: 'Good afternoon' },
        { id: 'p-buenasnoches', es: 'Buenas noches', en: 'Good night' },
      ],
      quiz: [
        { type: 'mc', q: '¿Cómo se dice "hello" en español?', options: ['hola', 'adiós', 'gracias'], a: 0 },
        { type: 'type', q: 'Traduce: thank you', a: 'gracias' },
        { type: 'listen', q: 'Repite la palabra', a: 'hola' },
      ],
    },
    {
      id: 'basics-2',
      title: 'Básicos 2',
      difficulty: 2,
      color: 'from-emerald-500 to-emerald-700',
      words: [
        { id: 'w-hombre', es: 'hombre', en: 'man' },
        { id: 'w-mujer', es: 'mujer', en: 'woman' },
        { id: 'w-nino', es: 'niño', en: 'boy' },
        { id: 'w-nina', es: 'niña', en: 'girl' },
        { id: 'w-amigo', es: 'amigo', en: 'friend (m)' },
        { id: 'w-amiga', es: 'amiga', en: 'friend (f)' },
      ],
      phrases: [
        { id: 'p-comoteLLamas', es: '¿Cómo te llamas?', en: 'What is your name?' },
        { id: 'p-meLLamo', es: 'Me llamo...', en: 'My name is...' },
        { id: 'p-encantado', es: 'Encantado/Encantada', en: 'Nice to meet you' },
      ],
      quiz: [
        { type: 'mc', q: '¿Qué significa "mujer"?', options: ['woman', 'man', 'girl'], a: 0 },
        { type: 'type', q: 'Traduce: boy', a: 'niño' },
        { type: 'listen', q: 'Escucha y escribe', a: 'amigo' },
      ],
    },
    {
      id: 'food-1',
      title: 'Comida 1',
      difficulty: 2,
      color: 'from-rose-500 to-rose-700',
      words: [
        { id: 'w-agua', es: 'agua', en: 'water' },
        { id: 'w-pan', es: 'pan', en: 'bread' },
        { id: 'w-manzana', es: 'manzana', en: 'apple' },
        { id: 'w-leche', es: 'leche', en: 'milk' },
        { id: 'w-cafe', es: 'café', en: 'coffee' },
        { id: 'w-te', es: 'té', en: 'tea' },
      ],
      phrases: [
        { id: 'p-quieroagua', es: 'Quiero agua', en: 'I want water' },
        { id: 'p-tienespan', es: '¿Tienes pan?', en: 'Do you have bread?' },
        { id: 'p-megusta', es: 'Me gusta la manzana', en: 'I like the apple' },
      ],
      quiz: [
        { type: 'mc', q: '¿Cómo se dice "coffee"?', options: ['té', 'café', 'leche'], a: 1 },
        { type: 'type', q: 'Traduce: water', a: 'agua' },
        { type: 'listen', q: 'Escribe lo que escuchas', a: 'manzana' },
      ],
    },
  ],
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
  load() {
    return Storage.get(AppStorageKeys.profile, defaultProfile());
  },
  save(p) {
    Storage.set(AppStorageKeys.profile, p);
  },
  addXp(amount) {
    const p = this.load();
    p.xp += amount;
    p.lastActiveAt = todayIso();
    this.save(p);
  },
};

const Streak = {
  load() { return Storage.get(AppStorageKeys.streak, defaultStreak()); },
  save(s) { Storage.set(AppStorageKeys.streak, s); },
  checkIn() {
    const s = this.load();
    const today = todayIso();
    if (s.lastCheckIn === today) return s; // already
    if (!s.lastCheckIn) {
      s.current = 1;
    } else {
      const gap = diffDays(s.lastCheckIn, today);
      if (gap === 1) s.current += 1; else if (gap > 1) s.current = 1;
    }
    s.best = Math.max(s.best, s.current);
    s.lastCheckIn = today;
    s.calendar[today] = true;
    this.save(s);
    Profile.addXp(10); // daily check-in reward
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

function renderHeaderProfile() {
  const p = Profile.load();
  const { level, currentLevelProgress } = Leveling.deriveLevel(p.xp);
  document.getElementById('user-level').textContent = `Lvl ${level}`;
  document.getElementById('user-xp').textContent = `${p.xp} XP`;
  document.getElementById('xp-bar').style.width = `${Math.round(currentLevelProgress * 100)}%`;
  document.getElementById('user-streak').textContent = `🔥 ${Streak.load().current} días`;
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
    const lock = false; // could gate by difficulty
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
  // ensure all words in SRS
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
    panel.innerHTML = '<div class="text-slate-400 text-sm">No hay tarjetas pendientes. ¡Añade nuevas o vuelve más tarde!'</div>';
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
  document.getElementById('close-lesson').onclick = () => overlay.remove();

  let stepIndex = 0;
  const steps = [];

  // Step: introduce all words with audio
  unit.words.forEach(w => steps.push({ type: 'intro-word', word: w }));
  // Step: introduce phrases
  unit.phrases.forEach(p => steps.push({ type: 'intro-phrase', phrase: p }));
  // Quiz steps
  unit.quiz.forEach(q => steps.push({ type: 'quiz', q }));

  let correctCount = 0;

  const renderStep = () => {
    const step = steps[stepIndex];
    const host = overlay.querySelector('#lesson-step');
    if (!step) return;

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
          const ok = val === step.q.a;
          correctCount += ok ? 1 : 0;
          Profile.addXp(ok ? 12 : 2);
          stepIndex++; renderStep();
        };
        document.getElementById('hint').onclick = () => alert(`Empieza con: ${step.q.a.slice(0, 2)}...`);
      } else if (step.q.type === 'listen') {
        host.innerHTML = `
          <div class="flex flex-col gap-3">
            <div class="text-sm text-slate-300">Escucha y responde</div>
            <div class="flex gap-2">
              <button id="play" class="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm">Reproducir</button>
            </div>
            <input id="answer" class="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none" placeholder="Escribe lo que escuchas" />
            <button id="submit" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Comprobar</button>
          </div>
        `;
        document.getElementById('play').onclick = () => AudioTTS.speak(step.q.a);
        document.getElementById('submit').onclick = () => {
          const val = (document.getElementById('answer').value || '').trim().toLowerCase();
          const ok = val === step.q.a;
          correctCount += ok ? 1 : 0;
          Profile.addXp(ok ? 12 : 2);
          stepIndex++; renderStep();
        };
      }
    }

    // Completed
    if (stepIndex >= steps.length - 1) {
      // show finish button
      const footer = document.createElement('div');
      footer.className = 'mt-6 flex justify-end';
      footer.innerHTML = '<button id="finish" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Terminar</button>';
      host.appendChild(footer);
      footer.querySelector('#finish').onclick = () => finishLesson();
    }
  };

  const finishLesson = () => {
    const score = Math.round((correctCount / unit.quiz.length) * 100);
    Progress.completeLesson(unit.id, score, unit.words.length);
    Profile.addXp(30 + unit.difficulty * 10);

    // Seed SRS items for lesson words
    const srs = Srs.load();
    unit.words.forEach(w => ensureSrsForWord(srs, w.id));
    Srs.save(srs);

    renderHeaderProfile();
    renderStatsCards();
    renderLessonGrid();
    renderFlashcardsPanel();
    overlay.remove();
    alert(`Lección completada: ${unit.title} — Puntuación: ${score}%`);
  };

  renderStep();
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
    { id: 'ch-10xp', label: 'Gana 50 XP hoy', target: 50, progress: p.xp % 50 },
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

function attachGlobalHandlers() {
  document.getElementById('btn-continue').onclick = () => {
    const first = ContentDB.units[0];
    startLessonFlow(first.id);
  };
  document.getElementById('btn-profile').onclick = () => {
    const p = Profile.load();
    const { level, currentLevelXpNeeded, remainingInLevel } = Leveling.deriveLevel(p.xp);
    alert(`Usuario: ${p.name}\nNivel: ${level}\nXP: ${p.xp}\nXP para subir: ${currentLevelXpNeeded - remainingInLevel}`);
  };
}

function boot() {
  document.getElementById('year').textContent = String(new Date().getFullYear());
  renderHeaderProfile();
  renderStatsCards();
  renderLessonGrid();
  renderFlashcardsPanel();
  renderStreakSidebar();
  renderChallengesAndAchievements();
  attachGlobalHandlers();
}

window.addEventListener('load', boot);