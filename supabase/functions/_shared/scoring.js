// Shared scoring + game rules. Used by the web app AND the edge functions,
// so the XP Dhruv sees always matches the XP the server awards.

export const LEVELS = {
  foundational: { label: 'Foundational', xp: 100, calib: 0.9, icon: '🟢' },
  challenging: { label: 'Challenging', xp: 200, calib: 1.0, icon: '🟠' },
  godmode: { label: 'God-mode', xp: 350, calib: 1.12, icon: '🔴' },
  drill: { label: 'Topic drill', xp: 60, calib: 0.95, icon: '🎯' },
  school: { label: 'School paper', xp: 150, calib: 1.05, icon: '🏫' },
  external: { label: 'Uploaded paper', xp: 150, calib: 1.0, icon: '📸' },
  quiz: { label: 'Pop quiz', xp: 30, calib: 0.85, icon: '⚡' },
  listening: { label: 'Listening', xp: 60, calib: 1.0, icon: '🎧' },
};

// Ranks ("stages") — every few levels Dhruv reaches a new stage.
export const RANKS = [
  { min: 1, name: 'Rookie', icon: '🥚', color: '#94a3b8' },
  { min: 4, name: 'Explorer', icon: '🧭', color: '#22d3a6' },
  { min: 8, name: 'Challenger', icon: '⚔️', color: '#4dabf7' },
  { min: 13, name: 'Elite', icon: '💎', color: '#a78bfa' },
  { min: 19, name: 'Master', icon: '🔥', color: '#f59f00' },
  { min: 26, name: 'Grandmaster', icon: '👑', color: '#ff6b6b' },
  { min: 34, name: 'Legend', icon: '🐉', color: '#f06595' },
  { min: 45, name: 'Mythic', icon: '🌌', color: '#ffd43b' },
];

// XP needed to go from level n to n+1 grows slowly.
export function xpForLevel(n) { return Math.round(150 + 60 * (n - 1) + 6 * (n - 1) ** 2); }

export function levelFromXp(total) {
  let level = 1, left = Math.max(0, total);
  while (left >= xpForLevel(level)) { left -= xpForLevel(level); level++; }
  const need = xpForLevel(level);
  const rank = [...RANKS].reverse().find((r) => level >= r.min);
  const nextRank = RANKS.find((r) => r.min > level) || null;
  return { level, into: left, need, pct: left / need, rank, nextRank };
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Topic mastery from graded attempts.
 * attempts: [{status, level, graded_at|started_at, topic_scores:{code:{got,max}}}]
 * Returns {code: {mastery 0-100, confidence 0-1, evidence (marks), trend, last}}
 */
export function topicMastery(attempts, topics) {
  const graded = attempts
    .filter((a) => a.status === 'graded' && a.topic_scores)
    .sort((a, b) => new Date(b.graded_at || b.started_at) - new Date(a.graded_at || a.started_at));
  const out = {};
  for (const t of topics) {
    let wsum = 0, vsum = 0, evidence = 0, idx = 0;
    const series = [];
    for (const a of graded) {
      const ts = a.topic_scores[t.code];
      if (!ts || !ts.max) continue;
      const pct = (100 * ts.got) / ts.max;
      const cal = LEVELS[a.level]?.calib ?? 1;
      const adj = clamp(pct * cal + (cal > 1 ? 4 : 0), 0, 100);
      const recency = 0.8 ** idx++;
      // Mistake redos don't count: he has just seen the answers.
      if (a.mode === 'retry') continue;
      const w = ts.max * recency * (a.level === 'quiz' ? 0.6 : 1);
      wsum += w; vsum += w * adj; evidence += ts.max;
      series.push(pct);
    }
    const mastery = wsum ? vsum / wsum : null;
    const confidence = 1 - Math.exp(-evidence / 8);
    const trend = series.length >= 2 ? series[0] - series[1] : 0;
    out[t.code] = { mastery, confidence, evidence, trend, last: series[0] ?? null, tries: series.length };
  }
  return out;
}

/**
 * Subject readiness and predicted exam score.
 * Untested topics count at a cautious prior of 50% with zero confidence.
 */
export function subjectReadiness(subject, topics, attempts, now = new Date()) {
  const subjTopics = topics.filter((t) => t.subject_id === subject.id);
  const subjAttempts = attempts.filter((a) => a.subject_id === subject.id);
  const mastery = topicMastery(subjAttempts, subjTopics);
  const PRIOR = 50;
  let W = 0, M = 0, C = 0, covered = 0;
  for (const t of subjTopics) {
    const m = mastery[t.code];
    const w = Number(t.weight) || 1;
    W += w;
    if (m.mastery == null) { M += w * PRIOR; }
    else {
      // blend toward the prior when evidence is thin
      M += w * (m.confidence * m.mastery + (1 - m.confidence) * PRIOR);
      C += w * m.confidence; covered++;
    }
  }
  const predicted = W ? M / W : PRIOR;
  const confidence = W ? C / W : 0;
  const realPapers = subjAttempts.filter((a) => a.status === 'graded' && a.mode !== 'retry' && !['quiz', 'listening'].includes(a.level)).length;
  // The range never gets narrower than the number of real papers can justify.
  const minBand = realPapers >= 3 ? 8 : realPapers === 2 ? 12 : 18;
  const band = Math.max(minBand, Math.round(8 + 22 * (1 - confidence)));
  const graded = subjAttempts.filter((a) => a.status === 'graded');
  const lastAt = graded.reduce((d, a) => Math.max(d, +new Date(a.graded_at || a.started_at)), 0);
  const daysSince = lastAt ? Math.floor((now - lastAt) / 864e5) : null;
  const ladder = ['foundational', 'challenging', 'godmode'].map((lv) => {
    const best = graded.filter((a) => a.level === lv && a.mode !== 'retry')
      .reduce((b, a) => Math.max(b, a.total ? (100 * a.score) / a.total : 0), -1);
    return { level: lv, best: best < 0 ? null : best };
  });
  const coverage = subjTopics.length ? covered / subjTopics.length : 0;
  const ladderPct = ladder.filter((l) => l.best != null && l.best >= 60).length / 3;
  const recency = daysSince == null ? 0 : clamp(1 - daysSince / 10, 0, 1);
  // Preparedness = how ready AND how well-evidenced (used for the boss HP bar).
  const preparedness = Math.round(0.6 * predicted + 15 * coverage + 15 * ladderPct + 10 * recency);
  const nextExam = (subject.papers || [])
    .map((p) => ({ ...p, at: new Date(`${p.date}T${p.time || '09:00'}:00+05:30`) }))
    .filter((p) => p.at > now).sort((a, b) => a.at - b.at)[0] || null;
  const daysToExam = nextExam ? Math.ceil((nextExam.at - now) / 864e5) : null;
  const weakest = subjTopics
    .map((t) => ({ ...t, ...mastery[t.code] }))
    .sort((a, b) => (a.mastery ?? 50) - (b.mastery ?? 50) || (a.confidence - b.confidence));
  return {
    predicted: Math.round(predicted), low: Math.max(0, Math.round(predicted - band)), high: Math.min(100, Math.round(predicted + band)),
    // Confidence = how many real papers back the prediction (quizzes alone are not enough).
    confidence, confidenceLabel: realPapers >= 3 ? 'high' : realPapers === 2 ? 'medium' : 'low',
    coverage, ladder, preparedness: clamp(preparedness, 0, 100), daysSince, nextExam, daysToExam,
    mastery, weakest, papersDone: graded.filter((a) => a.mode !== 'retry' && !['quiz', 'listening'].includes(a.level)).length,
    quizzesDone: graded.filter((a) => a.level === 'quiz').length,
    hasData: realPapers > 0, // a prediction needs at least one real paper
  };
}

export function unlocks(ladder, unlockAll = false) {
  const f = ladder.find((l) => l.level === 'foundational')?.best;
  const c = ladder.find((l) => l.level === 'challenging')?.best;
  return {
    foundational: true,
    challenging: unlockAll || f != null,
    godmode: unlockAll || (c != null && c >= 60),
  };
}

export function dayKey(d, tz = 'Asia/Kolkata') {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
}

/** Consecutive days (ending today or yesterday) with at least one XP event. */
export function streak(xpEvents, now = new Date()) {
  const days = new Set(xpEvents.map((e) => dayKey(e.created_at)));
  let s = 0; const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { s++; d.setDate(d.getDate() - 1); }
  return { days: s, today: days.has(dayKey(now)) };
}

/**
 * XP for a freshly graded attempt. Pure function so client can preview.
 * ctx: {pct, level, mode, fixedCount, readinessBefore, masteryBefore, topicScores, streakDays, firstToday, isWeakestSubject}
 */
export function computeXp(ctx) {
  const items = [];
  if (ctx.mode === 'retry') {
    if (ctx.fixedCount) items.push({ amount: 15 * ctx.fixedCount, reason: `Fixed ${ctx.fixedCount} mistake${ctx.fixedCount > 1 ? 's' : ''}`, kind: 'mistake' });
  } else {
    const base = LEVELS[ctx.level]?.xp ?? 100;
    let main = Math.round(base * (0.25 + 0.75 * ctx.pct / 100));
    if (ctx.level === 'foundational' && (ctx.readinessBefore ?? 0) >= 85) {
      main = Math.round(main * 0.5);
      items.push({ amount: 0, reason: 'Foundational is too easy for you now — Challenging pays double', kind: 'hint' });
    }
    items.push({ amount: main, reason: `${LEVELS[ctx.level]?.label || 'Paper'} cleared at ${Math.round(ctx.pct)}%`, kind: 'paper' });
    if (ctx.pct >= 90) items.push({ amount: Math.round(base * 0.25), reason: 'Accuracy bonus (90%+)', kind: 'bonus' });
    if (ctx.level === 'godmode' && ctx.pct >= 50) items.push({ amount: 100, reason: 'Survived God-mode', kind: 'bonus' });
    // Improvement on weak topics
    let improved = 0;
    for (const [code, ts] of Object.entries(ctx.topicScores || {})) {
      const before = ctx.masteryBefore?.[code]?.mastery;
      if (before == null || !ts.max) continue;
      if ((100 * ts.got) / ts.max - before >= 15) improved++;
    }
    if (improved) items.push({ amount: 30 * improved, reason: `Levelled up ${improved} weak skill${improved > 1 ? 's' : ''}`, kind: 'growth' });
    if (ctx.isWeakestSubject && ctx.level !== 'quiz') items.push({ amount: 50, reason: 'Quest: attacked your weakest world', kind: 'quest' });
    if (ctx.level === 'quiz') {
      if (ctx.maxCombo >= 10) items.push({ amount: 10, reason: `Combo x${ctx.maxCombo} 🔥`, kind: 'combo' });
      else if (ctx.maxCombo >= 5) items.push({ amount: 5, reason: `Combo x${ctx.maxCombo}`, kind: 'combo' });
      if (ctx.timeTaken != null && ctx.timeTaken <= 300 && ctx.pct >= 60) items.push({ amount: 10, reason: 'Beat the 5-minute clock ⏱️', kind: 'speed' });
      if (ctx.firstQuizToday) items.push({ amount: 20, reason: 'Daily pop quiz done ⚡', kind: 'dailyquiz' });
    }
  }
  if (ctx.firstToday) items.push({ amount: 20 + 10 * Math.min(ctx.streakDays || 0, 7), reason: `Daily streak 🔥 day ${(ctx.streakDays || 0) + 1}`, kind: 'streak' });
  return items.filter((i) => i.amount > 0 || i.kind === 'hint');
}

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🎮', name: 'Player One', desc: 'Finish your first paper', test: (s) => s.papers >= 1 },
  { id: 'five', icon: '🖐️', name: 'High Five', desc: 'Finish 5 papers', test: (s) => s.papers >= 5 },
  { id: 'twenty', icon: '🏋️', name: 'Grinder', desc: 'Finish 20 papers', test: (s) => s.papers >= 20 },
  { id: 'perfect', icon: '💯', name: 'Flawless', desc: 'Score 100% on any paper', test: (s) => s.best >= 100 },
  { id: 'ninety', icon: '🎯', name: 'Sharpshooter', desc: 'Score 90%+ on a Challenging paper', test: (s) => s.bestChallenging >= 90 },
  { id: 'god', icon: '⚡', name: 'God Slayer', desc: 'Score 50%+ in God-mode', test: (s) => s.bestGod >= 50 },
  { id: 'god80', icon: '🌩️', name: 'Ascended', desc: 'Score 80%+ in God-mode', test: (s) => s.bestGod >= 80 },
  { id: 'streak3', icon: '🔥', name: 'On Fire', desc: '3-day streak', test: (s) => s.maxStreak >= 3 },
  { id: 'streak7', icon: '☄️', name: 'Unstoppable', desc: '7-day streak', test: (s) => s.maxStreak >= 7 },
  { id: 'fix10', icon: '🛠️', name: 'Mistake Slayer', desc: 'Fix 10 mistakes', test: (s) => s.fixed >= 10 },
  { id: 'allround', icon: '🌍', name: 'World Traveller', desc: 'Play a paper in every world', test: (s) => s.subjectsPlayed >= s.subjectsTotal && s.subjectsTotal > 0 },
  { id: 'upload', icon: '📸', name: 'Pen Warrior', desc: 'Get a handwritten paper marked', test: (s) => s.paperMode >= 1 },
  { id: 'quiz20', icon: '🃏', name: 'Quiz Whiz', desc: 'Get every card right in a pop quiz', test: (s) => s.perfectQuiz >= 1 },
  { id: 'quiz7', icon: '📆', name: 'Daily Driller', desc: 'Do 7 daily pop quizzes', test: (s) => s.dailyQuizzes >= 7 },
];

export function achievementStats(attempts, xpEvents, subjects) {
  const graded = attempts.filter((a) => a.status === 'graded' && a.mode !== 'retry' && a.level !== 'quiz');
  const quizzes = attempts.filter((a) => a.status === 'graded' && a.level === 'quiz');
  const pct = (a) => (a.total ? (100 * a.score) / a.total : 0);
  const best = (lv) => graded.filter((a) => !lv || a.level === lv).reduce((m, a) => Math.max(m, pct(a)), 0);
  // max streak over history
  const days = [...new Set(xpEvents.map((e) => dayKey(e.created_at)))].sort();
  let maxStreak = 0, run = 0, prev = null;
  for (const d of days) {
    const cur = new Date(d);
    run = prev && (cur - prev) / 864e5 === 1 ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run); prev = cur;
  }
  return {
    papers: graded.length, best: best(), bestChallenging: best('challenging'), bestGod: best('godmode'), maxStreak,
    fixed: xpEvents.filter((e) => e.kind === 'mistake').reduce((n, e) => n + (Number((e.reason.match(/\d+/) || [0])[0]) || 0), 0),
    subjectsPlayed: new Set(graded.map((a) => a.subject_id)).size,
    subjectsTotal: subjects.filter((s) => s.active).length,
    paperMode: graded.filter((a) => a.mode === 'paper' || a.mode === 'external').length,
    perfectQuiz: quizzes.filter((a) => a.total && a.score >= a.total).length,
    dailyQuizzes: xpEvents.filter((e) => e.kind === 'dailyquiz').length,
  };
}
