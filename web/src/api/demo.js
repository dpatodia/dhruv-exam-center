// DEMO backend: everything lives in this browser's localStorage. No AI — marking is a crude
// keyword match and generated papers are placeholders. Used until Supabase is configured.
import syllabus from '../../../seed/syllabus.json';
import ictPaper from '../../../seed/ict-paper1.json';
import { computeXp, subjectReadiness, topicMastery, streak, dayKey } from '../../../supabase/functions/_shared/scoring.js';

const KEY = 'dec-demo-v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const SECRET = ['answer', 'markScheme', 'explanation'];
const split = (qs) => ({
  pub: qs.map((q) => Object.fromEntries(Object.entries(q).filter(([k]) => !SECRET.includes(k)))),
  key: Object.fromEntries(qs.map((q) => [q.id, { answer: q.answer, markScheme: q.markScheme || [], explanation: q.explanation || '' }])),
});
const USERS = { dhruv: { id: 'demo-dhruv', role: 'student', display_name: 'Dhruv', avatar: '🦊' }, parent: { id: 'demo-parent', role: 'parent', display_name: 'Parent', avatar: '🧑' } };

function seed() {
  const subjects = syllabus.subjects.map((s) => ({
    id: s.id, name: s.name, emoji: s.emoji, color: s.color, world_name: s.world_name, practice_marks: s.practice_marks ?? 50,
    papers: s.papers, exam_notes: s.exam_notes, sort: s.sort, active: s.active !== false, term: syllabus.term,
  }));
  const topics = syllabus.subjects.flatMap((s) => s.topics.map(([code, name, weight, paper], i) => ({
    id: `${s.id}-${code}`, subject_id: s.id, code, name, weight, paper: paper || 'Theory', sort: i })));
  const { pub, key } = split(ictPaper.questions);
  const exams = [{ ...ictPaper, questions: pub, created_at: '2026-11-01T06:00:00Z' }];
  return { subjects, topics, exams, keys: { [ictPaper.id]: key }, attempts: [], xp: [], handouts: [], lessons: {}, usage: [],
    settings: { unlock_all: false, daily_generate_limit: 8, daily_grade_limit: 12, price_in_per_mtok: 3, price_out_per_mtok: 15, monthly_budget_usd: 30 },
    session: null };
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } };
let db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full */ } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set('the a an of to and or is are be it in on for that this with as by its their your you he she they from at was were'.split(' '));
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 && !STOP.has(w)) || [];

function demoQuestions(subject, topics, level, focus, marks) {
  const pool = topics.filter((t) => t.subject_id === subject.id && (!focus.length || focus.includes(t.code)));
  const qs = []; let sum = 0; let i = 0;
  while (sum < marks && pool.length) {
    const t = pool[i % pool.length]; const n = i + 1;
    if (i % 3 === 0) {
      qs.push({ id: `q${n}`, number: String(n), section: 'A · Multiple choice', type: 'mcq', marks: 1, topic: t.code,
        prompt: `[Demo question] Which of these best matches the topic "${t.name}"?`,
        options: [t.name, 'Something unrelated', 'A different topic', 'None of these'], answer: 'a',
        markScheme: ['Option a'], explanation: 'In the live app Claude writes a real exam question here.' });
      sum += 1;
    } else {
      const m = Math.min(level === 'godmode' ? 4 : level === 'challenging' ? 3 : 2, marks - sum);
      qs.push({ id: `q${n}`, number: String(n), section: 'B · Structured', type: m > 2 ? 'long' : 'short', marks: m, topic: t.code,
        prompt: `[Demo question] Explain the key idea of "${t.name}" and give an example. [${m}]`,
        answer: `A clear explanation of ${t.name} with the correct keywords and an example.`,
        markScheme: [`Explains ${t.name}`, 'Uses correct keywords', 'Gives a valid example'].slice(0, m),
        explanation: 'Demo mode cannot judge real answers — connect Supabase + Claude for proper marking.' });
      sum += m;
    }
    i++;
  }
  return qs;
}

export const api = {
  demo: true,
  async session() { return db.session; },
  async signIn(who) { db.session = { who }; save(); },
  async signOut() { db.session = null; save(); },
  async me() { return db.session ? USERS[db.session.who] : null; },
  async loadAll() {
    return { subjects: db.subjects, topics: db.topics, exams: db.exams.map(({ questions, ...m }) => m), attempts: db.attempts.filter((a) => a.status !== 'cancelled'), cancelled: db.attempts.filter((a) => a.status === 'cancelled'),
      xp: [...db.xp].sort((a, b) => b.created_at.localeCompare(a.created_at)), settings: db.settings, handouts: db.handouts, profiles: Object.values(USERS) };
  },
  async getExam(id) { const e = db.exams.find((x) => x.id === id); return e && structuredClone(e); },
  async getKey(id) { return db.session?.who === 'parent' ? db.keys[id] : null; },
  async getAttempt(id) { const a = db.attempts.find((x) => x.id === id); return a && structuredClone(a); },
  async createAttempt(row) {
    const a = { id: uid(), student_id: 'demo-dhruv', status: 'in_progress', answers: {}, photo_paths: [], started_at: new Date().toISOString(), ...row };
    db.attempts.unshift(a); save(); return structuredClone(a);
  },
  async saveAttempt(id, patch) { const a = db.attempts.find((x) => x.id === id); Object.assign(a, structuredClone(patch)); save(); return structuredClone(a); },
  async cancelAttempt(id, reason) { const a = db.attempts.find((x) => x.id === id); Object.assign(a, { status: 'cancelled', cancel_reason: reason, cancelled_at: new Date().toISOString() }); save(); },
  async deleteAttempt(id) { db.attempts = db.attempts.filter((a) => a.id !== id); save(); },
  async uploadPhoto(attemptId, blob) {
    const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    return url; // store data URL directly in demo
  },
  async photoUrl(path) { return path; },
  async submitAndGrade(id, patch = {}) {
    const att = db.attempts.find((a) => a.id === id);
    Object.assign(att, patch, { status: 'grading', submitted_at: new Date().toISOString() });
    await wait(1400);
    let exam = db.exams.find((e) => e.id === att.exam_id);
    if (!exam) {
      const subj = db.subjects.find((s) => s.id === att.subject_id);
      const qs = demoQuestions(subj, db.topics, 'external', [], 10);
      const { pub, key } = split(qs);
      exam = { id: uid(), subject_id: subj.id, title: `${subj.name} uploaded paper (demo)`, level: 'external', total_marks: 10, duration_min: 30, questions: pub, source: 'upload', created_at: new Date().toISOString() };
      db.exams.unshift(exam); db.keys[exam.id] = key; att.exam_id = exam.id;
    }
    const key = db.keys[exam.id];
    const qs = exam.questions.filter((q) => !att.question_ids?.length || att.question_ids.includes(q.id));
    const topicScores = {}; let score = 0, total = 0;
    const results = qs.map((q) => {
      const ans = String(att.answers?.[q.id] ?? '').trim(); const k = key[q.id];
      let awarded = 0;
      if (q.type === 'mcq' || q.type === 'truefalse') awarded = ans && ans.toLowerCase()[0] === String(k.answer).toLowerCase()[0] ? q.marks : 0;
      else if (q.type === 'fill') awarded = ans.toLowerCase() === String(k.answer).toLowerCase() ? q.marks : 0;
      else if (ans) {
        const kw = new Set(words(k.answer)); const hit = words(ans).filter((w) => kw.has(w)).length;
        const r = kw.size ? hit / Math.min(kw.size, 8) : 0;
        awarded = Math.min(q.marks, Math.round(r * q.marks * 2) / 2);
      } else if (att.photo_paths?.length) awarded = Math.round(q.marks * 0.6 * 2) / 2;
      const verdict = !ans && !att.photo_paths?.length ? 'blank' : awarded >= q.marks ? 'correct' : awarded > 0 ? 'partial' : 'wrong';
      score += awarded; total += q.marks;
      topicScores[q.topic] = topicScores[q.topic] || { got: 0, max: 0 };
      topicScores[q.topic].got += awarded; topicScores[q.topic].max += q.marks;
      const optText = (l) => q.options?.['abcd'.indexOf(String(l).toLowerCase())] ?? l;
      return { qid: q.id, number: q.number, topic: q.topic, max: q.marks, awarded, verdict,
        studentAnswer: q.type === 'mcq' && ans ? `${ans}) ${optText(ans)}` : ans || (att.photo_paths?.length ? '(handwritten — demo cannot read photos)' : ''),
        feedback: verdict === 'correct' ? 'Correct.' : verdict === 'blank' ? 'No answer given — even a partial answer can earn marks.' : 'Demo marking: compared with the model answer\'s keywords.',
        correctAnswer: q.type === 'mcq' ? `${k.answer}) ${optText(k.answer)}` : k.answer,
        why: [k.explanation, ...(k.markScheme || [])].filter(Boolean).join(' · ') };
    });
    const pct = total ? (100 * score) / total : 0;
    const prior = db.attempts.filter((a) => a.status === 'graded');
    const subj = db.subjects.find((s) => s.id === att.subject_id);
    const before = subjectReadiness(subj, db.topics, prior);
    const st = streak(db.xp);
    const items = computeXp({ pct, level: att.level, mode: att.mode,
      fixedCount: att.mode === 'retry' ? results.filter((r) => r.verdict === 'correct').length : 0,
      readinessBefore: before.predicted, masteryBefore: topicMastery(prior.filter((a) => a.subject_id === subj.id), db.topics.filter((t) => t.subject_id === subj.id)),
      topicScores, streakDays: st.days, firstToday: !db.xp.some((e) => dayKey(e.created_at) === dayKey(new Date())), isWeakestSubject: false,
      maxCombo: (() => { let m = 0, c = 0; for (const r of results) { c = r.verdict === 'correct' ? c + 1 : 0; m = Math.max(m, c); } return m; })(),
      timeTaken: att.time_taken_sec, firstQuizToday: att.level === 'quiz' && !db.xp.some((e) => e.kind === 'dailyquiz' && dayKey(e.created_at) === dayKey(new Date())) });
    const now = new Date().toISOString();
    for (const it of items.filter((i) => i.amount > 0)) db.xp.push({ id: uid(), student_id: 'demo-dhruv', amount: it.amount, reason: it.reason, kind: it.kind, ref_id: id, created_at: now });
    Object.assign(att, { status: 'graded', graded_at: now, score, total, results, topic_scores: topicScores,
      summary: 'DEMO MARKING — this is a rough keyword match, not real marking. Connect Claude (see SETUP.md) for proper examiner-style feedback.',
      tips: { tips: ['Use the exact keywords from your handout', 'Match the number of points to the marks', 'Check every question before submitting'], xp: items },
      xp_awarded: items.reduce((s, i) => s + i.amount, 0),
      time_taken_sec: att.time_taken_sec ?? Math.round((Date.now() - new Date(att.started_at)) / 1000) });
    save();
    return { ok: true, score, total };
  },
  async regrade(id) { return this.submitAndGrade(id); },
  async generateExam({ subject_id, level, focus_topics = [], marks }) {
    await wait(1200);
    const subj = db.subjects.find((s) => s.id === subject_id);
    const total = level === 'quiz' ? 15 : marks || (level === 'drill' ? 20 : subj.practice_marks || 50);
    let qs = demoQuestions(subj, db.topics, level, focus_topics, total);
    if (level === 'quiz') {
      const tps = db.topics.filter((t) => t.subject_id === subject_id);
      const pool = focus_topics.length ? tps.filter((t) => focus_topics.includes(t.code)) : tps;
      qs = Array.from({ length: 15 }, (_, i) => {
        const t = pool[i % pool.length];
        return i % 2 ? { id: `q${i + 1}`, number: String(i + 1), section: 'Pop quiz', type: 'truefalse', marks: 1, topic: t.code, prompt: `[Demo] "${t.name}" is part of your ${subj.name} syllabus.`, answer: 'True', explanation: 'Demo card — the live app asks real questions.' }
          : { id: `q${i + 1}`, number: String(i + 1), section: 'Pop quiz', type: 'mcq', marks: 1, topic: t.code, prompt: `[Demo] Which topic code is "${t.name}"?`, options: [t.code, 'X9', 'Z0'], answer: 'a', explanation: 'Demo card — the live app asks real questions.' };
      });
    }
    const { pub: pub0, key } = split(qs);
    const pub = level === 'quiz' ? qs : pub0;
    const exam = { id: uid(), subject_id, title: `${subj.name} · ${level} (demo placeholder)`, level, total_marks: qs.reduce((s, q) => s + q.marks, 0),
      duration_min: level === 'quiz' ? 5 : Math.round(total * 1.2), instructions: 'DEMO paper with placeholder questions. Connect Claude to get real papers.', questions: pub, focus_topics, source: 'ai', created_at: new Date().toISOString() };
    db.exams.unshift(exam); db.keys[exam.id] = key;
    db.usage.push({ fn: 'generate-exam', input_tokens: 0, output_tokens: 0, created_at: exam.created_at }); save();
    return { exam_id: exam.id };
  },
  async uploadHandout(subject_id, file, title) {
    const h = { id: uid(), subject_id, title, status: 'ready', topic_codes: [], storage_path: file.name, created_at: new Date().toISOString() };
    db.handouts.unshift(h); save(); return h;
  },
  async handoutNotes() { return 'Demo mode: no notes.'; },
  async reprocessHandout() { return { ok: true }; },
  async deleteHandout(h) { db.handouts = db.handouts.filter((x) => x.id !== h.id); save(); },
  async lesson(subject_id, topic_code) {
    await wait(700);
    const t = db.topics.find((x) => x.subject_id === subject_id && x.code === topic_code);
    return { lesson: {
      title: `${t.name} — power-up (demo)`, hook: 'In the live app, Claude writes a personalised 5-minute lesson here, aimed at your exact mistakes.',
      steps: [{ heading: 'What the examiner wants', body: 'Demo placeholder. Connect Claude to unlock real lessons.' }],
      keywords: [{ term: t.name, meaning: 'Key term (demo)' }], workedExample: { question: 'Demo question', answer: 'Demo answer' },
      traps: ['Half-answers on keyword questions'], memoryTrick: 'Marks = points. 3 marks → 3 separate points.',
      quickCheck: [{ q: 'A 3-mark question needs…', options: ['1 point', '2 points', '3 separate points', 'a drawing'], answer: 'c', why: 'Each mark is usually one creditworthy point.' }],
      videoSearches: [`${t.name} KS3 explained`, `${t.name} Cambridge lower secondary`] } };
  },
  async revision(subject_id) {
    await wait(600);
    const tps = db.topics.filter((t) => t.subject_id === subject_id);
    return { created_at: new Date().toISOString(), notes: { title: 'Demo cliff notes', examTips: ['Demo: match points to marks'], sections: tps.map((t) => ({ code: t.code, heading: t.name, points: ['Demo point — the live app writes real notes from your handouts.'], keywords: [{ term: t.name, meaning: 'demo' }], traps: ['demo trap'], hook: 'demo hook' })) } };
  },
  async parentReport() {
    await wait(700);
    return { report: { headline: 'Demo mode — connect Claude for a real briefing.', strengths: ['(demo)'], concerns: ['No real data yet'], plan: [{ when: 'Today', action: 'Finish setup (SETUP.md)' }], conversation: 'Ask Dhruv to show you his HQ screen and pick his first world.' } };
  },
  async chat() { throw new Error('Chat needs the live AI (demo mode).'); },
  async examinerThread() { return null; },
  async tutorThreads() { return []; },
  async changesAndErrors() { return { changes: [], errors: [] }; },
  async usage() { return db.usage; },
  async saveSettings(patch) { Object.assign(db.settings, patch); save(); return db.settings; },
  async saveSubject(id, patch) { Object.assign(db.subjects.find((s) => s.id === id), patch); save(); },
  resetDemo() { db = seed(); save(); },
};
