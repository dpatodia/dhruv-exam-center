// Original game sounds, synthesised in the browser (no audio files, nothing copyrighted).
let ctx = null;
const KEY = 'dec-muted';
export const isMuted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ } };

function ac() {
  if (isMuted()) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(c, freq, start, dur, { type = 'square', vol = 0.12, slide = 0 } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination); o.start(start); o.stop(start + dur + 0.05);
}

function drum(c, start, { vol = 0.25, hi = false } = {}) {
  const len = hi ? 0.05 : 0.18;
  const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** (hi ? 4 : 2);
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = hi ? 'highpass' : 'lowpass'; f.frequency.value = hi ? 6000 : 180;
  s.buffer = buf; g.gain.value = vol; s.connect(f).connect(g).connect(c.destination); s.start(start);
  if (!hi) tone(c, 140, start, 0.15, { type: 'sine', vol: vol * 1.2, slide: 0.35 });
}

const N = (s) => 440 * 2 ** ((s - 69) / 12); // MIDI note → Hz

/** Correct answer: bright rising "ding-ding!" */
export function playCorrect(combo = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime, lift = Math.min(combo, 6); // pitch climbs with the combo
  [76, 79, 84].forEach((n, i) => tone(c, N(n + lift), t + i * 0.07, 0.18, { type: 'square', vol: 0.09 }));
  tone(c, N(88 + lift), t + 0.21, 0.35, { type: 'triangle', vol: 0.14 });
}

/** Wrong answer: low "bwomp" */
export function playWrong() {
  const c = ac(); if (!c) return;
  const t = c.currentTime;
  tone(c, 220, t, 0.22, { type: 'sawtooth', vol: 0.08, slide: 0.8 });
  tone(c, 165, t + 0.2, 0.45, { type: 'sawtooth', vol: 0.08, slide: 0.6 });
}

// Four original ~5-second victory themes (chiptune style); one is picked at random.
const THEMES = [
  { bpm: 150, lead: [72, 72, 72, 72, 68, 70, 72, 0, 70, 72, 0, 0, 79, 77, 76, 74, 72, 74, 76, 79, 84, 0, 84, 0], bass: [48, 48, 44, 46, 48, 55, 53, 48] },
  { bpm: 140, lead: [67, 71, 74, 79, 0, 74, 79, 0, 81, 79, 76, 74, 76, 0, 79, 81, 83, 0, 86, 0, 83, 86, 91, 0], bass: [43, 43, 47, 50, 45, 45, 50, 55] },
  { bpm: 156, lead: [76, 0, 76, 79, 81, 0, 79, 76, 74, 76, 79, 0, 84, 83, 81, 79, 81, 0, 83, 0, 88, 0, 88, 0], bass: [52, 52, 57, 57, 50, 50, 55, 60] },
  { bpm: 146, lead: [60, 64, 67, 72, 76, 79, 84, 0, 83, 79, 76, 79, 81, 77, 74, 77, 79, 76, 72, 76, 84, 0, 84, 0], bass: [36, 43, 41, 43, 45, 41, 43, 48] },
];

/** Big win: random original fanfare with drums, about 5 seconds. */
export function playFanfare() {
  const c = ac(); if (!c) return;
  const th = THEMES[Math.floor(Math.random() * THEMES.length)];
  const step = 60 / th.bpm / 2, t0 = c.currentTime + 0.05;
  th.lead.forEach((n, i) => { if (n) tone(c, N(n), t0 + i * step, step * 1.6, { type: 'square', vol: 0.07 }); });
  th.lead.forEach((n, i) => { if (n) tone(c, N(n + 12), t0 + i * step, step * 1.2, { type: 'triangle', vol: 0.03 }); });
  th.bass.forEach((n, i) => tone(c, N(n), t0 + i * step * 3, step * 2.8, { type: 'triangle', vol: 0.16 }));
  for (let i = 0; i < th.lead.length; i++) { if (i % 4 === 0) drum(c, t0 + i * step); drum(c, t0 + i * step, { hi: true, vol: 0.06 }); }
  // final chord
  const end = t0 + th.lead.length * step;
  [th.lead[th.lead.length - 4] || 72, (th.lead[th.lead.length - 4] || 72) + 4, (th.lead[th.lead.length - 4] || 72) + 7].forEach((n) => tone(c, N(n), end, 1.2, { type: 'square', vol: 0.06 }));
  drum(c, end, { vol: 0.35 });
}
