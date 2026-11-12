import React, { useEffect, useState } from 'react';
import { useStore, Spinner, go } from '../common.jsx';
import { GRADE_MESSAGES } from '../lib.js';

const MAX_PLAYS = 2;

function pickVoice(lang) {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  const base = lang.split('-')[0];
  return vs.find((v) => v.lang === lang && /google|premium|enhanced/i.test(v.name))
    || vs.find((v) => v.lang === lang) || vs.find((v) => v.lang?.startsWith(base)) || null;
}

/** Start (or resume) a listening practice for Spanish / Hindi. */
export async function startListening(store, subjectId) {
  const { api, data, reload } = store;
  const open = data.attempts.find((a) => a.level === 'listening' && a.subject_id === subjectId && a.status === 'in_progress');
  if (open) return open.id;
  const played = new Set(data.attempts.map((a) => a.exam_id));
  const ready = data.exams.find((e) => e.level === 'listening' && e.subject_id === subjectId && !played.has(e.id));
  const examId = ready?.id || (await api.generateExam({ subject_id: subjectId, level: 'listening' })).exam_id;
  const a = await api.createAttempt({ exam_id: examId, subject_id: subjectId, mode: 'online', level: 'listening' });
  await reload();
  return a.id;
}

export function ListeningCard({ subject }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  async function go2() {
    setBusy(true);
    try { go(`#/listen/${await startListening(store, subject.id)}`); } catch (e) { store.notify(e.message, true); setBusy(false); }
  }
  const paper = (subject.papers || []).find((p) => /listen/i.test(p.name));
  return (
    <div className="card">
      <h3>🎧 Listening practice</h3>
      <p className="small muted">Like the real {paper ? `${paper.marks}-mark listening paper (${new Date(paper.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : 'listening paper'}: the app reads a passage aloud in {subject.name} — you may play it twice, and pause it to write — then 10 quick questions.</p>
      <button className="btn" disabled={busy} onClick={go2}>{busy ? '⏳ Writing the passage… (30–60 s)' : '🎧 Start listening practice'}</button>
    </div>
  );
}

export default function ListeningPlayer({ attemptId }) {
  const { api, data, notify, reload } = useStore();
  const [att, setAtt] = useState(null);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [plays, setPlays] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [pos, setPos] = useState(0); // next sentence to read; > 0 while a play is paused part-way
  const posRef = React.useRef(0);
  const runRef = React.useRef(0); // bumps on every start/pause so stale callbacks stop
  const [voice, setVoice] = useState(undefined);
  const [grading, setGrading] = useState(false);

  useEffect(() => { (async () => {
    try { const pl = Number(localStorage.getItem(`dec-plays-${attemptId}`)) || 0; setPlays(pl); } catch { /* ignore */ }
    try { const a = await api.getAttempt(attemptId); setAtt(a); setAnswers(a.answers || {}); setExam(await api.getExam(a.exam_id)); }
    catch (e) { notify(e.message, true); }
  })(); }, [attemptId]);
  useEffect(() => {
    if (!exam) return;
    const set = () => setVoice(pickVoice(exam.audio_lang || 'es-ES'));
    set(); window.speechSynthesis?.addEventListener?.('voiceschanged', set);
    return () => { window.speechSynthesis?.removeEventListener?.('voiceschanged', set); window.speechSynthesis?.cancel(); };
  }, [exam?.id]);

  if (!att || !exam) return <Spinner />;
  if (att.status !== 'in_progress') { go(`#/result/${att.id}`); return null; }
  if (grading) return <div className="wrap"><Spinner messages={GRADE_MESSAGES} /></div>;
  const s = data.subjects.find((x) => x.id === exam.subject_id);
  const lang = exam.audio_lang || 'es-ES';

  // The passage is read one sentence at a time, so it can be paused and resumed without losing the place.
  // Only starting from the beginning uses up a play; pausing and resuming is free.
  const sentences = (exam.audio_script || '').replace(/\s+/g, ' ').match(/[^.!?।]+[.!?।]+["'»”]*\s*|[^.!?।]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];
  function speakFrom(i, run) {
    if (run !== runRef.current) return;
    if (i >= sentences.length) { posRef.current = 0; setPos(0); setSpeaking(false); return; }
    posRef.current = i; setPos(i);
    const u = new SpeechSynthesisUtterance(sentences[i]);
    u.lang = lang; if (voice) u.voice = voice; u.rate = 0.85;
    u.onend = () => setTimeout(() => speakFrom(i + 1, run), 250);
    u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') setTimeout(() => speakFrom(i + 1, run), 250); };
    window.speechSynthesis.speak(u);
  }
  function play() {
    if (!window.speechSynthesis) return notify('This browser cannot read aloud — try Chrome or Safari.', true);
    window.speechSynthesis.cancel();
    const run = ++runRef.current;
    const n = plays + 1; setPlays(n);
    try { localStorage.setItem(`dec-plays-${att.id}`, String(n)); } catch { /* ignore */ }
    setSpeaking(true); speakFrom(0, run);
  }
  function pause() { runRef.current++; window.speechSynthesis.cancel(); setSpeaking(false); }
  function resume() { window.speechSynthesis.cancel(); const run = ++runRef.current; setSpeaking(true); speakFrom(posRef.current, run); }
  const paused = !speaking && pos > 0;
  function setAns(q, v) { const next = { ...answers, [q.id]: v }; setAnswers(next); api.saveAttempt(att.id, { answers: next }).catch(() => {}); }
  async function submit() {
    window.speechSynthesis?.cancel();
    setGrading(true);
    try { await api.submitAndGrade(att.id, { answers, time_taken_sec: Math.round((Date.now() - new Date(att.started_at)) / 1000) }); } catch (e) { notify(e.message, true); }
    await reload(); go(`#/result/${att.id}`);
  }
  const done = exam.questions.filter((q) => answers[q.id] != null).length;

  return (
    <div className="wrap" style={{ maxWidth: 820, '--c': s.color }}>
      <div className="row between"><div className="row"><span style={{ fontSize: 28 }}>{s.emoji}</span><b>{exam.title}</b></div><span className="pill">🎧 {exam.total_marks} marks</span></div>
      <div className="card glow mt" style={{ '--c': s.color, position: 'sticky', top: 70, zIndex: 5 }}>
        <div className="row between">
          <div>
            <h3>{speaking ? '🔊 Listening…' : paused ? '⏸ Paused — press Resume to carry on' : plays >= MAX_PLAYS ? '✅ Recording finished' : plays ? '▶ Play it once more' : '▶ Read the questions, then press play'}</h3>
            <div className="small muted">Plays used: {plays}/{MAX_PLAYS} (pausing is free) · voice: {voice ? voice.name : voice === null ? <b style={{ color: 'var(--warn)' }}>no {s.name} voice on this device — it will sound wrong; try Chrome</b> : '…'}</div>
          </div>
          <div className="row">
            {speaking ? <button className="btn ghost" onClick={pause}>⏸ Pause</button>
              : paused ? <button className="btn big" onClick={resume}>▶ Resume</button>
              : <button className="btn big" disabled={plays >= MAX_PLAYS} onClick={play}>▶ Play {plays ? 'again' : ''}</button>}
          </div>
        </div>
        {(speaking || paused) && sentences.length > 0 && <div className="bar mt" style={{ height: 8 }} title={`Sentence ${pos + 1} of ${sentences.length}`}><i style={{ width: `${Math.round((100 * pos) / sentences.length)}%` }} /></div>}
      </div>
      <div className="col mt" style={{ gap: 14 }}>
        {exam.questions.map((q) => (
          <div key={q.id} className="card flat">
            <div className="qhead row between"><b className="qnum">Q{q.number}</b><span className="pill">1 mark</span></div>
            <div className="prompt" style={{ margin: '6px 0 10px', whiteSpace: 'pre-wrap' }}>{q.prompt}</div>
            {q.type === 'truefalse'
              ? <div className="row">{['True', 'False'].map((v) => <div key={v} className={`opt ${answers[q.id] === v ? 'sel' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setAns(q, v)}><b>{v}</b></div>)}</div>
              : (q.options || []).map((o, i) => <div key={i} className={`opt ${answers[q.id] === 'abcd'[i] ? 'sel' : ''}`} onClick={() => setAns(q, 'abcd'[i])}><span className="letter">{'abcd'[i]}</span><span>{o}</span></div>)}
          </div>
        ))}
      </div>
      <div className="row mt between">
        <span className="small muted">{done}/{exam.questions.length} answered</span>
        <button className="btn gold" disabled={!plays} onClick={submit}>Submit answers ✓</button>
      </div>
    </div>
  );
}
