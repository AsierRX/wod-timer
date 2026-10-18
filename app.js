'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ---------- Configuración persistente ---------- */

const STORE_KEY = 'wodtimer.cfg';
const DEFAULTS = {
  mode: 'amrap',
  countdown: 10,
  amrap: { minutes: 12 },
  fortime: { capOn: true, cap: 20 },
  emom: { every: 60, rounds: 10 },
  tabata: { rounds: 8, work: 20, rest: 10 },
};

function loadCfg() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch {}
  const out = {};
  for (const k in DEFAULTS) {
    const def = DEFAULTS[k];
    const val = saved ? saved[k] : undefined;
    out[k] = typeof def === 'object' ? { ...def, ...(val || {}) } : (val ?? def);
  }
  return out;
}
function saveCfg() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch {}
}
function getPath(path) {
  const [a, b] = path.split('.');
  return cfg[a][b];
}
function setPath(path, v) {
  const [a, b] = path.split('.');
  cfg[a][b] = v;
  saveCfg();
}

const cfg = loadCfg();

/* ---------- Utilidades ---------- */

function fmt(totalSec) {
  totalSec = Math.max(0, totalSec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const FORMATTERS = {
  min: (v) => `${v} min`,
  sec: (v) => fmt(v),
  int: (v) => String(v),
};

/* ---------- Navegación entre pantallas ---------- */

let currentScreen = 'menu';

function show(name, push = true) {
  $$('.screen').forEach((el) => el.classList.toggle('active', el.id === `screen-${name}`));
  currentScreen = name;
  if (push) history.pushState({ screen: name }, '');
}

history.replaceState({ screen: 'menu' }, '');

window.addEventListener('popstate', () => {
  if (currentScreen === 'timer') {
    if (timer && timer.started() && !timer.done && !confirm('¿Salir del entrenamiento?')) {
      history.pushState({ screen: 'timer' }, '');
      return;
    }
    stopTimer();
    show('config', false);
  } else if (currentScreen === 'config') {
    show('menu', false);
  }
});

/* ---------- Pantalla de configuración ---------- */

const MODE_TITLES = { amrap: 'AMRAP', fortime: 'FOR TIME', emom: 'EMOM', tabata: 'TABATA' };

function openConfig(mode) {
  cfg.mode = mode;
  saveCfg();
  $('#config-title').textContent = MODE_TITLES[mode];
  $$('.cfg').forEach((el) => el.classList.toggle('active', el.dataset.for === mode));
  refreshConfig();
  show('config');
}

function refreshConfig() {
  $$('.stepper').forEach((el) => {
    el.querySelector('.value').textContent = FORMATTERS[el.dataset.fmt](getPath(el.dataset.key));
  });

  $$('#fortime-cap-toggle button').forEach((b) =>
    b.classList.toggle('on', (b.dataset.cap === 'on') === cfg.fortime.capOn));
  $('#fortime-cap-wrap').classList.toggle('hidden', !cfg.fortime.capOn);

  $('#emom-every').value = String(cfg.emom.every);
  $('#emom-rounds').value = String(cfg.emom.rounds);
  $('#emom-total').innerHTML = `Total: <b>${fmt(cfg.emom.every * cfg.emom.rounds)}</b>`;

  const t = cfg.tabata;
  const tabataSec = t.rounds * t.work + (t.rounds - 1) * t.rest;
  $('#tabata-total').innerHTML = `Total: <b>${fmt(tabataSec)}</b>`;

  $$('#countdown-toggle button').forEach((b) =>
    b.classList.toggle('on', Number(b.dataset.cd) === cfg.countdown));
}

function initSteppers() {
  $$('.stepper').forEach((el) => {
    const min = Number(el.dataset.min);
    const max = Number(el.dataset.max);
    const step = Number(el.dataset.step);
    el.innerHTML = '<button type="button" aria-label="Menos">−</button>'
      + '<div class="value"></div>'
      + '<button type="button" aria-label="Más">+</button>';
    const [minus, plus] = el.querySelectorAll('button');

    const change = (dir) => {
      const v = Math.min(max, Math.max(min, getPath(el.dataset.key) + dir * step));
      setPath(el.dataset.key, v);
      refreshConfig();
    };
    holdToRepeat(minus, () => change(-1));
    holdToRepeat(plus, () => change(1));
  });
}

// Pulsar = un paso; mantener pulsado = repetir cada vez más rápido.
function holdToRepeat(btn, fn) {
  let timeout = null;
  let interval = null;
  const stop = () => { clearTimeout(timeout); clearInterval(interval); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    fn();
    timeout = setTimeout(() => { interval = setInterval(fn, 70); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function initSelects() {
  const every = $('#emom-every');
  for (let s = 15; s <= 720; s += 15) every.add(new Option(fmt(s), String(s)));
  every.addEventListener('change', () => { cfg.emom.every = Number(every.value); saveCfg(); refreshConfig(); });

  const rounds = $('#emom-rounds');
  for (let n = 1; n <= 50; n++) rounds.add(new Option(`${n}x`, String(n)));
  rounds.addEventListener('change', () => { cfg.emom.rounds = Number(rounds.value); saveCfg(); refreshConfig(); });
}

function initToggles() {
  $$('#fortime-cap-toggle button').forEach((b) => b.addEventListener('click', () => {
    cfg.fortime.capOn = b.dataset.cap === 'on';
    saveCfg();
    refreshConfig();
  }));
  $$('#countdown-toggle button').forEach((b) => b.addEventListener('click', () => {
    cfg.countdown = Number(b.dataset.cd);
    saveCfg();
    refreshConfig();
  }));
}

/* ---------- Sonido (Web Audio, sin archivos) ---------- */

let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, dur, vol = 0.35) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.setValueAtTime(vol, t + dur - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

const beepShort = () => tone(880, 0.15);
const beepLong = () => tone(1320, 0.7);
const beepEnd = () => tone(1320, 1.4);

/* ---------- Voz (síntesis del sistema, funciona sin conexión) ---------- */

function initVoice() {
  // Chrome en Android solo permite hablar después de un toque: se "desbloquea" con una frase vacía.
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

function say(text) {
  if (!('speechSynthesis' in window)) { beepLong(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('en'));
  if (voice) u.voice = voice;
  u.rate = 1.1;
  speechSynthesis.speak(u);
}

/* ---------- Mantener la pantalla encendida ---------- */

let wakeLock = null;

async function lockScreen() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}
function unlockScreen() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentScreen === 'timer') lockScreen();
});

/* ---------- Segmentos: cada modo se traduce a una lista de tramos ---------- */
// Tramo: { phase: 'prep'|'work'|'rest', label, dur (s, puede ser Infinity), up (cuenta hacia arriba), sub, perMinute }

function buildSegments() {
  const segs = [{ phase: 'prep', label: 'PREPÁRATE', dur: cfg.countdown, up: false, sub: '' }];

  switch (cfg.mode) {
    case 'amrap': {
      const m = cfg.amrap.minutes;
      segs.push({ phase: 'work', label: 'AMRAP', dur: m * 60, up: false, sub: `${m} min` });
      break;
    }
    case 'fortime': {
      if (cfg.fortime.capOn) {
        const c = cfg.fortime.cap;
        segs.push({ phase: 'work', label: 'FOR TIME', dur: c * 60, up: true, sub: `Límite ${c} min` });
      } else {
        segs.push({ phase: 'work', label: 'FOR TIME', dur: Infinity, up: true, sub: 'Sin límite', perMinute: true });
      }
      break;
    }
    case 'emom': {
      const { every, rounds } = cfg.emom;
      for (let i = 1; i <= rounds; i++) {
        segs.push({ phase: 'work', label: 'EMOM', dur: every, up: false, sub: `Ronda ${i}/${rounds}` });
      }
      break;
    }
    case 'tabata': {
      const { rounds, work, rest } = cfg.tabata;
      for (let i = 1; i <= rounds; i++) {
        segs.push({ phase: 'work', label: 'TRABAJO', dur: work, up: false, sub: `Ronda ${i}/${rounds}`, voice: 'Work' });
        if (rest > 0 && i < rounds) {
          segs.push({ phase: 'rest', label: 'DESCANSO', dur: rest, up: false, sub: `Ronda ${i}/${rounds}`, voice: 'Rest' });
        }
      }
      break;
    }
  }
  return segs;
}

/* ---------- Motor del temporizador ---------- */
// El tiempo se calcula siempre a partir de performance.now(), nunca restando de 1 en 1,
// así no se desajusta aunque el móvil ralentice la app o se vuelva desde segundo plano.

const RING_LEN = 2 * Math.PI * 90;
const ui = {};

class Timer {
  constructor(segs) {
    this.segs = segs;
    this.starts = [];
    let acc = 0;
    for (const s of segs) { this.starts.push(acc); acc += s.dur * 1000; }
    this.acc = 0;          // ms acumulados antes de la última reanudación
    this.runStart = 0;
    this.running = false;
    this.done = false;
    this.lastIdx = -1;
    this.lastBeepKey = '';
    this.lastMinute = 0;
    this.raf = 0;
    this.tick = this.tick.bind(this);
  }

  elapsed() {
    return this.acc + (this.running ? performance.now() - this.runStart : 0);
  }

  // Ya terminó la cuenta atrás inicial
  started() {
    return this.elapsed() >= this.segs[0].dur * 1000;
  }

  locate(ms) {
    for (let i = 0; i < this.segs.length; i++) {
      if (ms < this.starts[i] + this.segs[i].dur * 1000) return i;
    }
    return -1;
  }

  start() {
    this.runStart = performance.now();
    this.running = true;
    this.tick();
  }

  pause() {
    if (!this.running) return;
    this.acc += performance.now() - this.runStart;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resume() {
    if (this.running || this.done) return;
    this.start();
  }

  stop() {
    this.pause();
    this.done = true;
  }

  tick() {
    const ms = this.elapsed();
    const idx = this.locate(ms);
    if (idx === -1) { this.finish(this.starts[this.starts.length - 1] + this.segs.at(-1).dur * 1000, true); return; }

    const seg = this.segs[idx];
    const t = ms - this.starts[idx];

    if (idx !== this.lastIdx) {
      if (this.lastIdx !== -1) {
        if (seg.voice) say(seg.voice); else beepLong();
      }
      this.lastIdx = idx;
      renderSegment(seg);
    }

    let text;
    let progress;
    if (seg.dur === Infinity) {
      text = fmt(Math.floor(t / 1000));
      progress = (t % 60000) / 60000;
      const minute = Math.floor(t / 60000);
      if (minute > this.lastMinute) beepShort();
      this.lastMinute = minute;
    } else {
      const remainingSec = Math.ceil((seg.dur * 1000 - t) / 1000);
      if (remainingSec >= 1 && remainingSec <= 3 && remainingSec < seg.dur) {
        const key = `${idx}:${remainingSec}`;
        if (key !== this.lastBeepKey) { beepShort(); this.lastBeepKey = key; }
      }
      if (seg.phase === 'prep') {
        text = String(remainingSec);
        progress = 1 - t / (seg.dur * 1000);
      } else {
        text = seg.up ? fmt(Math.floor(t / 1000)) : fmt(remainingSec);
        progress = t / (seg.dur * 1000);
      }
    }

    setText(ui.time, text);
    setRing(progress);

    if (this.running) this.raf = requestAnimationFrame(this.tick);
  }

  // endMs: momento (en ms desde el inicio, contando la cuenta atrás) en que acaba
  finish(endMs, natural) {
    this.stop();
    beepEnd();
    const workSec = Math.round((endMs - this.segs[0].dur * 1000) / 1000);
    const isCapped = cfg.mode === 'fortime' && cfg.fortime.capOn && natural;
    document.body.className = 'phase-done';
    setText(ui.phase, 'TERMINADO');
    setText(ui.time, fmt(workSec));
    setText(ui.round, isCapped ? 'TIME CAP' : '');
    setRing(1);
    ui.pause.textContent = 'Otra vez';
    ui.finish.classList.add('invisible');
  }
}

function setText(el, txt) {
  if (el.textContent !== txt) el.textContent = txt;
}

function setRing(p) {
  p = Math.min(1, Math.max(0, p));
  ui.ring.style.strokeDashoffset = String(RING_LEN * (1 - p));
}

function renderSegment(seg) {
  document.body.className = `phase-${seg.phase}`;
  setText(ui.phase, seg.label);
  setText(ui.round, seg.sub);
  ui.finish.classList.toggle('invisible', !(cfg.mode === 'fortime' && seg.phase !== 'prep'));
}

/* ---------- Control de la pantalla del temporizador ---------- */

let timer = null;

function startTimer() {
  initAudio();
  initVoice();
  if (timer) timer.stop();
  timer = new Timer(buildSegments());
  $('#timer-title').textContent = MODE_TITLES[cfg.mode];
  ui.pause.textContent = 'Pausa';
  ui.finish.classList.add('invisible');
  lockScreen();
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
  timer = null;
  document.body.className = '';
  unlockScreen();
}

function onPause() {
  if (!timer) return;
  if (timer.done) { startTimer(); return; }
  if (timer.running) {
    timer.pause();
    ui.pause.textContent = 'Seguir';
  } else {
    initAudio();
    timer.resume();
    ui.pause.textContent = 'Pausa';
  }
}

function onReset() {
  if (timer && timer.started() && !timer.done && !confirm('¿Reiniciar el entrenamiento?')) return;
  startTimer();
}

function onFinish() {
  if (!timer || timer.done || !timer.started()) return;
  timer.finish(timer.elapsed(), false);
}

/* ---------- Arranque ---------- */

function init() {
  ui.ring = $('#ring-progress');
  ui.phase = $('#phase-label');
  ui.time = $('#time-label');
  ui.round = $('#round-label');
  ui.pause = $('#pause-btn');
  ui.finish = $('#finish-btn');

  initSteppers();
  initSelects();
  initToggles();

  $$('.mode-btn').forEach((b) => b.addEventListener('click', () => openConfig(b.dataset.mode)));
  $('[data-action="back"]').addEventListener('click', () => history.back());
  $('[data-action="start"]').addEventListener('click', () => { startTimer(); show('timer'); });
  $('[data-action="exit"]').addEventListener('click', () => history.back());
  $('[data-action="pause"]').addEventListener('click', onPause);
  $('[data-action="reset"]').addEventListener('click', onReset);
  $('[data-action="finish"]').addEventListener('click', onFinish);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
