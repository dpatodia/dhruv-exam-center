import { subjectReadiness, levelFromXp, streak, achievementStats, ACHIEVEMENTS, dayKey, LEVELS } from '../../supabase/functions/_shared/scoring.js';
export { LEVELS, dayKey };

export const pct = (a) => (a?.total ? Math.round((100 * a.score) / a.total) : 0);
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtDateTime = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const fmtDur = (s) => (s == null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);

export function gradeLetter(p) {
  if (p >= 90) return { l: 'S', c: '#ffd43b', t: 'Legendary!' };
  if (p >= 75) return { l: 'A', c: '#3ddc97', t: 'Excellent' };
  if (p >= 60) return { l: 'B', c: '#4dabf7', t: 'Solid' };
  if (p >= 45) return { l: 'C', c: '#ffa94d', t: 'Getting there' };
  return { l: 'D', c: '#ff5c7a', t: 'Training needed' };
}

export function scoreColor(p) {
  if (p == null) return 'var(--dim)';
  return p >= 75 ? 'var(--ok)' : p >= 60 ? '#4dabf7' : p >= 45 ? 'var(--warn)' : 'var(--danger)';
}

/** Everything derived from raw data, computed once per load. */
export function derive(data) {
  const { subjects, topics, attempts, xp } = data;
  const active = subjects.filter((s) => s.active);
  const readiness = Object.fromEntries(subjects.map((s) => [s.id, subjectReadiness(s, topics, attempts)]));
  const totalXp = xp.reduce((s, e) => s + e.amount, 0);
  const level = levelFromXp(totalXp);
  const st = streak(xp);
  const stats = achievementStats(attempts, xp, subjects);
  const achievements = ACHIEVEMENTS.map((a) => ({ ...a, got: a.test(stats) }));
  const graded = attempts.filter((a) => a.status === 'graded');

  // Mistakes: wrong/partial answers not yet fixed by a later retry.
  const fixed = new Set();
  for (const a of graded.filter((x) => x.mode === 'retry')) {
    for (const r of a.results || []) if (r.verdict === 'correct') fixed.add(`${a.retry_of}:${r.qid}`);
  }
  const mistakes = [];
  for (const a of graded.filter((x) => x.mode !== 'retry')) {
    for (const r of a.results || []) {
      if (r.verdict !== 'correct' && !fixed.has(`${a.id}:${r.qid}`)) mistakes.push({ ...r, attempt: a });
    }
  }

  // Daily quests
  const today = dayKey(new Date());
  const todayGraded = graded.filter((a) => dayKey(a.graded_at || a.started_at) === today);
  const ranked = active.map((s) => ({ s, r: readiness[s.id] }))
    .sort((a, b) => (a.r.daysToExam ?? 99) - (b.r.daysToExam ?? 99) || a.r.preparedness - b.r.preparedness);
  const weakest = [...active].filter((s) => readiness[s.id].daysToExam != null)
    .sort((a, b) => readiness[a.id].preparedness - readiness[b.id].preparedness || (readiness[a.id].daysToExam ?? 99) - (readiness[b.id].daysToExam ?? 99))[0];
  const fixedToday = xp.filter((e) => e.kind === 'mistake' && dayKey(e.created_at) === today)
    .reduce((n, e) => n + (Number((e.reason.match(/\d+/) || [0])[0]) || 0), 0);
  const dailyQuizDone = xp.some((e) => e.kind === 'dailyquiz' && dayKey(e.created_at) === today);
  const quests = [
    { id: 'quiz', icon: '⚡', text: 'Daily pop quiz (5 min)', done: dailyQuizDone, reward: '+20 XP' },
    { id: 'paper', icon: '📝', text: 'Clear any paper today', done: todayGraded.some((a) => a.mode !== 'retry' && a.level !== 'quiz'), reward: 'Streak bonus' },
    weakest && { id: 'weak', icon: '🎯', subject: weakest, text: `Attack your weakest world: ${weakest.name}`, done: todayGraded.some((a) => a.subject_id === weakest.id && a.mode !== 'retry' && a.level !== 'quiz'), reward: '+50 XP', link: `#/world/${weakest.id}` },
    { id: 'fix', icon: '🛠️', text: `Fix 3 mistakes (${Math.min(3, fixedToday)}/3)`, done: fixedToday >= 3, reward: '+15 XP each', link: '#/mistakes' },
  ].filter(Boolean);

  const nextExams = active.flatMap((s) => (s.papers || []).map((p) => ({ ...p, subject: s, at: new Date(`${p.date}T${p.time || '09:00'}:00+05:30`) })))
    .filter((p) => p.at > new Date()).sort((a, b) => a.at - b.at);

  return { dailyQuizDone, readiness, totalXp, level, streak: st, stats, achievements, mistakes, quests, ranked, nextExams, active, graded };
}

export async function compressImage(file, max = 1800, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', quality));
}

/** Confetti. ms > 0 = keep it raining over the whole page for that long. */
export function confetti(n = 140, ms = 0) {
  const c = document.createElement('canvas');
  Object.assign(c.style, { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 });
  c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const cols = ['#7c5cff', '#22d3a6', '#ffd43b', '#ff5c7a', '#4dabf7', '#f06595'];
  const mk = (rain) => ({ x: rain ? Math.random() * innerWidth : innerWidth / 2, y: rain ? -20 : innerHeight / 3, vx: rain ? (Math.random() - .5) * 3 : (Math.random() - .5) * 16, vy: rain ? Math.random() * 3 + 2 : Math.random() * -14 - 4, r: Math.random() * 7 + 5, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, rain });
  const ps = Array.from({ length: n }, () => mk(false));
  const t0 = performance.now();
  (function frame(now) {
    const live = now - t0 < ms;
    if (live) for (let i = 0; i < 6; i++) ps.push(mk(true));
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += p.rain ? 0.05 : .45; p.vx *= .99; p.a += .2; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); ctx.restore(); }
    for (let i = ps.length - 1; i >= 0; i--) if (ps[i].y > c.height + 40) ps.splice(i, 1);
    if (live || ps.length) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

export const GEN_MESSAGES = ['Summoning the boss…', 'Sharpening trick questions…', 'Checking the syllabus scrolls…', 'Balancing the marks…', 'Hiding the answer key from you…'];
export const GRADE_MESSAGES = ['The examiner is reading your answers…', 'Counting keywords…', 'Checking working…', 'Writing explanations for anything you missed…', 'Calculating XP…'];

/** Subject score used for goals and the exam schedule: 80% written papers + 20% of the last 5 pop quizzes.
 *  Quizzes alone never give a score (a subject needs at least one marked paper). */
export function subjectScore(data, sid) {
  const QUIZ_WEIGHT = 0.2, RECENT_QUIZZES = 5;
  const pctOf = (a) => (100 * a.score) / a.total;
  const avg = (xs) => xs.reduce((t, a) => t + pctOf(a), 0) / xs.length;
  const mine = data.attempts.filter((a) => a.subject_id === sid && a.status === 'graded' && a.mode !== 'retry' && a.total > 0);
  const papers = mine.filter((a) => !['quiz', 'listening'].includes(a.level));
  const quizzes = mine.filter((a) => a.level === 'quiz').sort((a, b) => new Date(b.graded_at) - new Date(a.graded_at)).slice(0, RECENT_QUIZZES);
  const listening = mine.filter((a) => a.level === 'listening');
  const q = quizzes.length ? Math.round(avg(quizzes)) : null;
  const l = listening.length ? Math.round(avg(listening)) : null;
  if (!papers.length) return { avg: null, n: 0, quiz: q, nq: quizzes.length, listening: l, nl: listening.length };
  const pa = avg(papers);
  const blended = q == null ? pa : (1 - QUIZ_WEIGHT) * pa + QUIZ_WEIGHT * q;
  return { avg: Math.round(blended), paper: Math.round(pa), n: papers.length, quiz: q, nq: quizzes.length, listening: l, nl: listening.length };
}
