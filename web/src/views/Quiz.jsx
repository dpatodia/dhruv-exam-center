import React, { useEffect, useRef, useState } from 'react';
import { useStore, Spinner, go } from '../common.jsx';
import { dayKey, GRADE_MESSAGES } from '../lib.js';
import { playCorrect, playWrong } from '../sound.js';

const QUIZ_SECONDS = 300;

/** Find today's unplayed pop quiz for a subject (and topic set), or have Claude write one. Returns attempt id. */
export async function startQuiz(store, subjectId, focus = []) {
  const { api, data, reload } = store;
  const today = dayKey(new Date());
  const key = [...focus].sort().join(',');
  const sameFocus = (e) => [...(e.focus_topics || [])].sort().join(',') === key;
  const played = new Set(data.attempts.map((a) => a.exam_id));
  const exams = Object.fromEntries(data.exams.map((e) => [e.id, e]));
  const open = data.attempts.find((a) => a.level === 'quiz' && a.subject_id === subjectId && a.status === 'in_progress' && exams[a.exam_id] && sameFocus(exams[a.exam_id]));
  if (open) return open.id;
  const ready = data.exams.find((e) => e.level === 'quiz' && e.subject_id === subjectId && e.total_marks === QUIZ_CARDS && dayKey(e.created_at) === today && !played.has(e.id) && sameFocus(e));
  const examId = ready?.id || (await api.generateExam({ subject_id: subjectId, level: 'quiz', focus_topics: focus })).exam_id;
  const a = await api.createAttempt({ exam_id: examId, subject_id: subjectId, mode: 'online', level: 'quiz' });
  await reload();
  return a.id;
}

const QUIZ_CARDS = 15;

/** Daily pop quiz card for HQ (picks the most urgent subject). */
export function QuizLauncher() {
  const store = useStore();
  const { d, notify } = store;
  const [busy, setBusy] = useState(false);
  const s = d.quests.find((q) => q.id === 'weak')?.subject || d.active[0];
  async function launch() {
    setBusy(true);
    try { go(`#/quiz/${await startQuiz(store, s.id)}`); } catch (e) { notify(e.message, true); setBusy(false); }
  }
  if (busy) return <QuizLoading />;
  return (
    <div className="card glow quiz-launch" style={{ '--c': s.color }}>
      <div className="row" style={{ gap: 16 }}>
        <div className="quiz-deck"><span>{s.emoji}</span></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="small muted" style={{ fontWeight: 800, letterSpacing: 1 }}>⚡ DAILY POP QUIZ</div>
          <h2 style={{ margin: '4px 0' }}>{s.name}: {QUIZ_CARDS} cards · 5 minutes</h2>
          <div className="small muted">True/false and A-B-C flashcards aimed at your weakest topics. Combos and beating the clock earn bonus XP.{!d.dailyQuizDone ? ' First quiz of the day: +20 XP bonus.' : ' Want a different subject? Open its world and pick your topics.'}</div>
        </div>
        <button className="btn big gold" onClick={launch}>{d.dailyQuizDone ? 'Play again ⚡' : 'Start ⚡'}</button>
      </div>
    </div>
  );
}

function QuizLoading() {
  return <div className="card" style={{ textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /><p className="muted">Shuffling {QUIZ_CARDS} flashcards… (about 30–60 seconds the first time)</p></div>;
}

/** Pop quiz inside a subject: whole subject or chosen topics. */
export function SubjectQuiz({ subject }) {
  const store = useStore();
  const { data, d, notify } = store;
  const topics = data.topics.filter((t) => t.subject_id === subject.id);
  const r = d.readiness[subject.id];
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const toggle = (c) => setSel((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  async function launch(focus) {
    setBusy(true);
    try { go(`#/quiz/${await startQuiz(store, subject.id, focus)}`); } catch (e) { notify(e.message, true); setBusy(false); }
  }
  if (busy) return <QuizLoading />;
  const weak = r.weakest.filter((t) => t.mastery != null && t.mastery < 70).slice(0, 3).map((t) => t.code);
  return (
    <div className="card glow quiz-launch" style={{ '--c': subject.color }}>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div className="quiz-deck"><span>{subject.emoji}</span></div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="small muted" style={{ fontWeight: 800, letterSpacing: 1 }}>⚡ POP QUIZ · {QUIZ_CARDS} CARDS · 5 MIN</div>
          <h3 style={{ margin: '4px 0 10px' }}>Quiz the whole subject, or pick topics</h3>
          <div className="row" style={{ gap: 6 }}>
            {topics.map((t) => {
              const m = r.mastery[t.code]?.mastery;
              return (
                <button key={t.code} className={`pill ${sel.includes(t.code) ? 'ok' : ''}`} style={{ cursor: 'pointer' }} onClick={() => toggle(t.code)} title={t.name}>
                  {sel.includes(t.code) ? '✓ ' : ''}{t.code} {t.name.length > 24 ? t.name.slice(0, 24) + '…' : t.name}{m != null ? ` · ${Math.round(m)}%` : ''}
                </button>
              );
            })}
          </div>
          <div className="row mt">
            <button className="btn gold" onClick={() => launch([])}>⚡ Whole {subject.name}</button>
            <button className="btn" disabled={!sel.length} onClick={() => launch(sel)}>🎯 Quiz {sel.length || ''} chosen topic{sel.length === 1 ? '' : 's'}</button>
            {weak.length > 0 && <button className="btn ghost sm" onClick={() => launch(weak)}>🩹 My weak spots ({weak.join(', ')})</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuizPlayer({ attemptId }) {
  const { api, data, notify, reload } = useStore();
  const [att, setAtt] = useState(null);
  const [exam, setExam] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flipped, setFlipped] = useState(false);
  const [combo, setCombo] = useState(0);
  const [best, setBest] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [grading, setGrading] = useState(false);
  const submitted = useRef(false);

  useEffect(() => { (async () => {
    try { const a = await api.getAttempt(attemptId); setAtt(a); setAnswers(a.answers || {}); setExam(await api.getExam(a.exam_id)); }
    catch (e) { notify(e.message, true); }
  })(); }, [attemptId]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  const qs = exam?.questions || [];
  const elapsed = att ? Math.floor((now - new Date(att.started_at)) / 1000) : 0;
  const left = Math.max(0, QUIZ_SECONDS - elapsed);

  async function finish(final = answers) {
    if (submitted.current) return; submitted.current = true;
    setGrading(true);
    try { await api.submitAndGrade(att.id, { answers: final, time_taken_sec: Math.min(elapsed, 3600) }); } catch (e) { notify(e.message, true); }
    await reload(); go(`#/result/${att.id}`);
  }
  useEffect(() => { if (att && exam && left === 0 && !submitted.current && att.status === 'in_progress') finish(); }, [left, att, exam]);

  if (!att || !exam) return <Spinner />;
  if (att.status !== 'in_progress') { go(`#/result/${att.id}`); return null; }
  if (grading) return <div className="wrap"><Spinner messages={['Counting your cards…', 'Adding up combos…', 'Calculating XP…']} /></div>;
  const s = data.subjects.find((x) => x.id === exam.subject_id);
  const q = qs[idx];
  const topic = data.topics.find((t) => t.subject_id === s.id && t.code === q.topic);
  const picked = answers[q.id];
  const correctAns = q.type === 'truefalse' ? String(q.answer) : String(q.answer).toLowerCase();
  const isRight = picked != null && (q.type === 'truefalse' ? picked[0]?.toLowerCase() === correctAns[0]?.toLowerCase() : picked === correctAns);
  const choices = q.type === 'truefalse' ? [['True', '✅ True'], ['False', '❌ False']] : (q.options || []).map((o, i) => ['abcd'[i], o]);
  const correctCount = qs.filter((x) => answers[x.id] != null && (x.type === 'truefalse' ? answers[x.id][0]?.toLowerCase() === String(x.answer)[0]?.toLowerCase() : answers[x.id] === String(x.answer).toLowerCase())).length;

  function pick(v) {
    if (picked != null) return;
    const next = { ...answers, [q.id]: v }; setAnswers(next); setFlipped(true);
    const right = q.type === 'truefalse' ? v[0].toLowerCase() === correctAns[0].toLowerCase() : v === correctAns;
    const c = right ? combo + 1 : 0; setCombo(c); setBest(Math.max(best, c));
    if (right) playCorrect(c); else playWrong();
    api.saveAttempt(att.id, { answers: next }).catch(() => {});
  }
  function nextCard() {
    setFlipped(false);
    if (idx < qs.length - 1) setIdx(idx + 1); else finish();
  }

  return (
    <div className="wrap quiz-wrap" style={{ maxWidth: 760, '--c': s.color }}>
      <div className="row between">
        <div className="row"><span style={{ fontSize: 26 }}>{s.emoji}</span><b>{s.name} pop quiz</b></div>
        <div className="row">
          {combo >= 2 && <span className="pill warn pop" key={combo}>🔥 Combo x{combo}</span>}
          <span className={`timer ${left < 60 ? 'low' : ''}`}>⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
        </div>
      </div>
      <div className="bar mt"><i style={{ width: `${(100 * left) / QUIZ_SECONDS}%`, '--c': left < 60 ? 'var(--danger)' : s.color }} /></div>
      <div className="quiz-dots mt">
        {qs.map((x, i) => {
          const a = answers[x.id];
          const ok = a != null && (x.type === 'truefalse' ? a[0]?.toLowerCase() === String(x.answer)[0]?.toLowerCase() : a === String(x.answer).toLowerCase());
          return <i key={x.id} className={a == null ? (i === idx ? 'cur' : '') : ok ? 'ok' : 'bad'} />;
        })}
      </div>

      <div className={`flashcard mt ${flipped ? 'flipped' : ''}`} key={q.id}>
        <div className="fc-inner">
          <div className="fc-face fc-front">
            <div className="fc-watermark">{s.emoji}</div>
            <div className="row between small"><span className="pill">Card {idx + 1}/{qs.length}</span>{topic && <span className="pill" title={topic.name}>{topic.code} · {topic.name.length > 28 ? topic.name.slice(0, 28) + '…' : topic.name}</span>}</div>
            <div className="fc-q">{q.type === 'truefalse' ? <span className="tiny muted" style={{ display: 'block', marginBottom: 6 }}>TRUE OR FALSE?</span> : null}{q.prompt}</div>
            <div className={`fc-choices ${q.type === 'truefalse' ? 'tf' : ''}`}>
              {choices.map(([v, label]) => (
                <button key={v} className="fc-choice" onClick={() => pick(v)}>
                  {q.type !== 'truefalse' && <span className="letter">{v.toUpperCase()}</span>}<span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={`fc-face fc-back ${isRight ? 'right' : 'wrong'}`}>
            <div style={{ fontSize: 64 }}>{isRight ? '🎯' : '💥'}</div>
            <h2>{isRight ? ['Nailed it!', 'Boom!', 'Correct!', 'Too easy!'][idx % 4] : 'Not quite!'}</h2>
            {!isRight && <p><b>Answer:</b> {q.type === 'truefalse' ? q.answer : `${String(q.answer).toUpperCase()}) ${q.options?.['abcd'.indexOf(correctAns)] ?? ''}`}</p>}
            {q.explanation && <p className="muted">💡 {q.explanation}</p>}
            <button className="btn big" onClick={nextCard} autoFocus>{idx < qs.length - 1 ? 'Next card →' : 'Finish 🏁'}</button>
          </div>
        </div>
      </div>
      <div className="row between mt small muted">
        <span>Score so far: <b style={{ color: 'var(--text)' }}>{correctCount}</b> / {Object.keys(answers).length}</span>
        <span>Best combo: {best}</span>
        <button className="btn ghost sm" onClick={() => finish()}>End quiz now</button>
      </div>
    </div>
  );
}
