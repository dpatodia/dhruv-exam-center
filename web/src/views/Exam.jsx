import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, Spinner, Modal, Empty, LevelPill, Bar, CancelPaper, RichText, go } from '../common.jsx';
import { compressImage, confetti, fmtDur, gradeLetter, GRADE_MESSAGES, pct, scoreColor, LEVELS } from '../lib.js';
import { levelFromXp } from '../../../supabase/functions/_shared/scoring.js';
import SketchPad from './SketchPad.jsx';
import { playFanfare } from '../sound.js';
import { ExaminerChat, ReportProblem } from './Chat.jsx';

// ───────────────────────────── Start screen
export function ExamStart({ examId }) {
  const { api, data, notify, isParent } = useStore();
  const [exam, setExam] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.getExam(examId).then(setExam).catch((e) => notify(e.message, true)); }, [examId]);
  if (!exam) return <Spinner />;
  const s = data.subjects.find((x) => x.id === exam.subject_id);
  const open = data.attempts.find((a) => a.exam_id === exam.id && a.status === 'in_progress' && a.mode !== 'retry');

  async function start(mode) {
    setBusy(true);
    try {
      const a = await api.createAttempt({ exam_id: exam.id, subject_id: exam.subject_id, mode, level: exam.level });
      go(`#/${mode === 'paper' ? 'paper' : 'play'}/${a.id}`);
    } catch (e) { notify(e.message, true); setBusy(false); }
  }

  return (
    <div className="wrap" style={{ maxWidth: 820 }}>
      <a className="small muted" href={`#/world/${s.id}`}>← {s.name}</a>
      <div className="card glow mt pop" style={{ '--c': s.color, textAlign: 'center' }}>
        <div style={{ fontSize: 60 }}>{s.emoji}</div>
        <h1>{exam.title}</h1>
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <LevelPill level={exam.level} /><span className="pill">📝 {exam.total_marks} marks</span><span className="pill">⏱️ ~{exam.duration_min} min</span><span className="pill">❓ {exam.questions.length} questions</span>
        </div>
        {exam.instructions && <p className="muted mt" style={{ textAlign: 'left', whiteSpace: 'pre-wrap' }}>{exam.instructions}</p>}
        {isParent ? (
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <a className="btn ghost" href={`#/print/${exam.id}`}>🖨️ Print paper</a>
            <a className="btn purple" href={`#/print/${exam.id}?key=1`}>🔑 Print mark scheme</a>
          </div>
        ) : open ? (
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <a className="btn big" href={`#/${open.mode === 'paper' ? 'paper' : 'play'}/${open.id}`}>▶ Resume where you left off</a>
            <button className="btn ghost" onClick={async () => { await api.deleteAttempt(open.id); location.reload(); }}>Start over</button>
          </div>
        ) : (
          <div className="card flat mt2" style={{ textAlign: 'left' }}>
            <h3>✍️ How this works</h3>
            <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 20 }}>
              <li><b>Print the paper</b> (next screen) and do it like the real exam — pen, ruler, timer running.</li>
              <li><b>Photograph every answer page</b>, flat and in good light, in order.</li>
              <li><b>Upload the photos</b> — Claude marks it like an examiner and explains every lost mark.</li>
            </ol>
            <button className="btn big" disabled={busy} onClick={() => start('paper')}>🖨️ Start this paper</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Question input
function QuestionInput({ q, value, onChange, onPhoto }) {
  const letters = 'abcd';
  const [sketch, setSketch] = useState(false);
  if (q.type === 'mcq') return (
    <div>{(q.options || []).map((o, i) => (
      <div key={i} className={`opt ${value === letters[i] ? 'sel' : ''}`} onClick={() => onChange(letters[i])}>
        <span className="letter">{letters[i]}</span><span>{o}</span>
      </div>))}
    </div>
  );
  if (q.type === 'truefalse') return (
    <div className="row">{['True', 'False'].map((v) => (
      <div key={v} className={`opt ${value === v ? 'sel' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => onChange(v)}><b>{v === 'True' ? '✅ True' : '❌ False'}</b></div>
    ))}</div>
  );
  if (q.type === 'fill' || q.type === 'numeric') return <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={q.type === 'numeric' ? 'Answer (show working below if needed)' : 'Your answer'} />;
  return (
    <div className="col" style={{ gap: 8 }}>
      <textarea rows={q.type === 'long' ? 8 : 4} value={value || ''} onChange={(e) => onChange(e.target.value)}
        placeholder={q.type === 'diagram' ? 'Draw it with the drawing board below (or on paper + photo). You can add notes here.' : `Write your answer. ${q.marks} mark${q.marks > 1 ? 's' : ''} = about ${q.marks} separate point${q.marks > 1 ? 's' : ''}.`} />
      {(q.type === 'diagram' || q.type === 'long') && onPhoto && (
        <div className="row">
          {q.type === 'diagram' && <button type="button" className="btn sm" onClick={() => setSketch(true)}>✏️ Draw it here</button>}
          <label className="btn ghost sm">📷 {q.type === 'diagram' ? 'Or upload a photo' : 'Upload photo of your working'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files[0] && onPhoto(e.target.files[0])} />
          </label>
        </div>
      )}
      {sketch && <SketchPad title={`Question ${q.number}`} onSave={onPhoto} onClose={() => setSketch(false)} />}
    </div>
  );
}

function useAttempt(attemptId) {
  const { api, notify } = useStore();
  const [att, setAtt] = useState(null);
  const [exam, setExam] = useState(null);
  useEffect(() => { (async () => {
    try {
      const a = await api.getAttempt(attemptId); setAtt(a);
      if (a.exam_id) setExam(await api.getExam(a.exam_id));
    } catch (e) { notify(e.message, true); }
  })(); }, [attemptId]);
  return [att, setAtt, exam];
}

function Timer({ since, target }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const el = Math.floor((now - new Date(since)) / 1000);
  const left = target ? target * 60 - el : null;
  return <span className={`timer ${left != null && left < 300 ? 'low' : ''}`}>⏱ {left != null ? (left >= 0 ? `${fmtDur(left)} left` : `+${fmtDur(-left)} over`) : fmtDur(el)}</span>;
}

// ───────────────────────────── Online play
export function Play({ attemptId }) {
  const { api, notify, reload, data } = useStore();
  const [att, setAtt, exam] = useAttempt(attemptId);
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  const [review, setReview] = useState(false);
  const [grading, setGrading] = useState(false);
  const [photos, setPhotos] = useState([]);
  const saveT = useRef(null);
  useEffect(() => { if (att) { setAnswers(att.answers || {}); setPhotos(att.photo_paths || []); } }, [att?.id]);

  const qs = useMemo(() => (exam?.questions || []).filter((q) => !att?.question_ids?.length || att.question_ids.includes(q.id)), [exam, att]);
  if (!att || !exam) return <Spinner />;
  if (att.status === 'cancelled') { go('#/answers'); return null; }
  if (att.status !== 'in_progress') { go(`#/result/${att.id}`); return null; }
  if (grading) return <div className="wrap"><Spinner messages={GRADE_MESSAGES} /><p className="muted" style={{ textAlign: 'center' }}>Marking usually takes under a minute. Don't close this tab.</p></div>;
  const s = data.subjects.find((x) => x.id === exam.subject_id);
  const q = qs[idx];
  const answered = (qq) => String(answers[qq.id] ?? '').trim() !== '';

  function setAns(v) {
    const next = { ...answers, [q.id]: v }; setAnswers(next);
    clearTimeout(saveT.current); saveT.current = setTimeout(() => api.saveAttempt(att.id, { answers: next }).catch(() => {}), 1200);
  }
  async function addPhoto(file) {
    try {
      const blob = await compressImage(file);
      const path = await api.uploadPhoto(att.id, blob, `${q.id}.jpg`);
      const next = [...photos, path]; setPhotos(next);
      await api.saveAttempt(att.id, { photo_paths: next });
      if (!answered(q)) setAns(`(see photo for ${q.number})`);
      notify('Photo uploaded 📷');
    } catch (e) { notify(e.message, true); }
  }
  async function submit() {
    setGrading(true);
    try {
      await api.submitAndGrade(att.id, { answers, photo_paths: photos, time_taken_sec: Math.round((Date.now() - new Date(att.started_at)) / 1000) });
    } catch (e) { notify(`Marking problem: ${e.message}`, true); }
    await reload(); go(`#/result/${att.id}`);
  }

  const retry = att.mode === 'retry';
  return (
    <div className="wrap" style={{ maxWidth: 900, '--c': s.color }}>
      <div className="row between">
        <div className="row"><span style={{ fontSize: 28 }}>{s.emoji}</span><div><b>{retry ? '🛠️ Fixing mistakes' : exam.title}</b><div className="small muted">{qs.length} questions · {qs.reduce((n, x) => n + x.marks, 0)} marks</div></div></div>
        <div className="row">{!retry && <Timer since={att.started_at} target={exam.duration_min} />}<button className="btn gold sm" onClick={() => setReview(true)}>Finish ✓</button></div>
      </div>
      <div className="mt"><Bar value={(100 * qs.filter(answered).length) / qs.length} /></div>
      <div className="qnav mt">
        {qs.map((qq, i) => <button key={qq.id} className={`${answered(qq) ? 'done' : ''} ${i === idx ? 'cur' : ''}`} onClick={() => setIdx(i)}>{qq.number}</button>)}
      </div>

      <div className="card mt pop" key={q.id}>
        <div className="small muted">{q.section}</div>
        <div className="q mt" style={{ borderColor: s.color }}>
          <div className="qhead"><span className="qnum">Question {q.number}</span><span className="pill">{q.marks} mark{q.marks > 1 ? 's' : ''}</span></div>
          {q.stem && <RichText text={q.stem} style={{ borderLeft: '3px solid var(--line)', paddingLeft: 10, marginBottom: 8, opacity: .85 }} />}
          <RichText text={q.prompt} style={{ fontSize: '1.05rem', lineHeight: 1.55, margin: '6px 0 10px' }} />
          <QuestionInput q={q} value={answers[q.id]} onChange={setAns} onPhoto={addPhoto} />
        </div>
        {retry && <p className="small muted mt">Tip: look back at the explanation from last time, then answer in your own words.</p>}
        <div className="row between mt">
          <button className="btn ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Back</button>
          {idx < qs.length - 1 ? <button className="btn" onClick={() => setIdx(idx + 1)}>Next →</button> : <button className="btn gold" onClick={() => setReview(true)}>Finish ✓</button>}
        </div>
      </div>
      {photos.length > 0 && <p className="small muted mt">📷 {photos.length} photo{photos.length > 1 ? 's' : ''} attached</p>}

      {review && (
        <Modal onClose={() => setReview(false)}>
          <h2>Ready to submit?</h2>
          {qs.filter((x) => !answered(x)).length ? (
            <p>You have <b style={{ color: 'var(--warn)' }}>{qs.filter((x) => !answered(x)).length} unanswered</b>: {qs.filter((x) => !answered(x)).map((x) => x.number).join(', ')}. A guess can still score — a blank never does.</p>
          ) : <p>All {qs.length} questions answered. 💪</p>}
          <div className="row mt">
            <button className="btn gold" onClick={submit}>Submit for marking</button>
            <button className="btn ghost" onClick={() => setReview(false)}>Keep working</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ───────────────────────────── Printable paper
export function PaperSheet({ exam, subject, keyData }) {
  let lastSection = null;
  return (
    <div className="paper-sheet paper">
      <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: 2 }}>CALCUTTA INTERNATIONAL SCHOOL · GRADE 6 · {subject.name.toUpperCase()}</div>
        <h2 style={{ marginTop: 6 }}>{exam.title}{keyData ? ' — MARK SCHEME (PARENT COPY)' : ''}</h2>
        <div style={{ fontSize: 13, marginTop: 6 }}>Total marks: {exam.total_marks} · Time: about {exam.duration_min} minutes · Start ______ End ______ · Score ____ / {exam.total_marks}</div>
      </div>
      {exam.instructions && !keyData && <p style={{ fontSize: 13 }}><b>Instructions:</b> {exam.instructions}</p>}
      {exam.questions.map((q) => {
        const head = q.section !== lastSection; lastSection = q.section;
        const k = keyData?.[q.id];
        return (
          <div key={q.id}>
            {head && <h3 style={{ margin: '18px 0 8px' }}>{q.section}</h3>}
            {q.stem && q.stem_first && <RichText text={q.stem} style={{ border: '1px solid #999', borderRadius: 4, padding: '8px 10px', margin: '12px 0 6px', fontSize: 14 }} />}
            <div className="q">
              <div className="qhead"><b className="qnum">{q.number}.</b><span>[{q.marks}]</span></div>
              <RichText text={q.prompt} style={{ margin: '6px 0 10px' }} />
              {q.options && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>{q.options.map((o, i) => <div key={i}>({'abcd'[i]}) {o}</div>)}</div>}
              {k ? (
                <div style={{ background: '#f4f4f4', padding: 8, borderRadius: 4, marginTop: 6, fontSize: 14 }}>
                  <b>Answer:</b> {k.answer}{k.markScheme?.length ? <><br /><b>Marking:</b> {k.markScheme.join(' · ')}</> : null}{k.explanation ? <><br /><i>{k.explanation}</i></> : null} <span style={{ float: 'right' }}>Topic {q.topic}</span>
                </div>
              ) : q.type === 'diagram' ? <div className="box" /> : !['mcq', 'truefalse'].includes(q.type) ? Array.from({ length: q.type !== 'long' && /\.{6,}|☐/.test(q.prompt) ? (q.type === 'numeric' ? 3 : 0) : Math.min(8, q.marks * 2 + (q.type === 'long' ? 2 : 0)) }, (_, i) => <div key={i} className="lines" />) : null}
            </div>
          </div>
        );
      })}
      <p style={{ textAlign: 'center', marginTop: 20 }}>— End of paper —</p>
    </div>
  );
}

export function PrintPaper({ examId, withKey }) {
  const { api, data } = useStore();
  const [exam, setExam] = useState(null);
  const [key, setKey] = useState(null);
  useEffect(() => { (async () => { setExam(await api.getExam(examId)); if (withKey) setKey(await api.getKey(examId)); })(); }, [examId]);
  if (!exam) return <Spinner />;
  const s = data.subjects.find((x) => x.id === exam.subject_id);
  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="row no-print mb" style={{ marginTop: 12 }}>
        <button className="btn ghost sm" onClick={() => history.back()}>← Back</button>
        <button className="btn sm" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
        {withKey && !key && <span className="pill bad">Mark scheme is parent-only</span>}
      </div>
      <PaperSheet exam={exam} subject={s} keyData={withKey ? key : null} />
    </div>
  );
}

// ───────────────────────────── Pen & paper mode
export function PaperMode({ attemptId }) {
  const { api, notify, reload, data } = useStore();
  const [att, setAtt, exam] = useAttempt(attemptId);
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [up, setUp] = useState(false);
  const [grading, setGrading] = useState(false);
  const [showPaper, setShowPaper] = useState(true);
  useEffect(() => { if (att) setPhotos(att.photo_paths || []); }, [att?.id]);
  useEffect(() => { photos.forEach(async (p) => { if (!urls[p]) { const u = await api.photoUrl(p); setUrls((x) => ({ ...x, [p]: u })); } }); }, [photos]);
  if (!att || !exam) return <Spinner />;
  if (att.status === 'cancelled') { go('#/answers'); return null; }
  if (att.status !== 'in_progress') { go(`#/result/${att.id}`); return null; }
  if (grading) return <div className="wrap"><Spinner messages={GRADE_MESSAGES} /><p className="muted" style={{ textAlign: 'center' }}>Reading handwriting takes 1–2 minutes. Don't close this tab.</p></div>;
  const s = data.subjects.find((x) => x.id === exam.subject_id);

  async function add(files) {
    setUp(true);
    try {
      let next = [...photos];
      for (const f of files) {
        const blob = await compressImage(f);
        next.push(await api.uploadPhoto(att.id, blob, f.name.replace(/\.\w+$/, '') + (blob.type === 'application/pdf' ? '.pdf' : '.jpg')));
      }
      setPhotos(next); await api.saveAttempt(att.id, { photo_paths: next });
    } catch (e) { notify(e.message, true); }
    setUp(false);
  }
  async function submit() {
    setGrading(true);
    try { await api.submitAndGrade(att.id, { photo_paths: photos }); } catch (e) { notify(`Marking problem: ${e.message}`, true); }
    await reload(); go(`#/result/${att.id}`);
  }

  return (
    <div className="wrap" style={{ maxWidth: 940 }}>
      <div className="row between no-print">
        <div className="row"><span style={{ fontSize: 28 }}>{s.emoji}</span><b>{exam.title}</b></div>
        <div className="row"><Timer since={att.started_at} target={exam.duration_min} /><button className="btn sm" onClick={() => window.print()}>🖨️ Print paper</button></div>
      </div>
      <div className="card mt no-print">
        <h3>📸 Step 2 — upload your answer pages</h3>
        <p className="small muted">Lay each page flat in good light, whole page in frame, one photo per page, in order. PDFs from a scanner app work too.<br /><b>Doing it later?</b> Close this page any time — the paper waits for you under <b>📸 Upload answers</b> in the top menu.</p>
        <label className="dropzone" style={{ display: 'block' }}>
          <div style={{ fontSize: 36 }}>📷</div><b>{up ? 'Uploading…' : 'Tap to add photos'}</b>
          <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => add([...e.target.files])} />
        </label>
        {photos.length > 0 && <div className="photos mt">{photos.map((p, i) => urls[p] && !p.endsWith('.pdf') ? <img key={p} src={urls[p]} alt={`page ${i + 1}`} /> : <span key={p} className="pill">📄 page {i + 1}</span>)}</div>}
        <div className="row mt">
          <button className="btn gold" disabled={!photos.length || up} onClick={submit}>Submit {photos.length} page{photos.length === 1 ? '' : 's'} for marking</button>
          <button className="btn ghost sm" onClick={() => setShowPaper(!showPaper)}>{showPaper ? 'Hide' : 'Show'} paper</button>
          <span className="spacer" />
          <CancelPaper attempt={att} after={`#/world/${exam.subject_id}?tab=papers`} />
          <ReportProblem examId={exam.id} attemptId={att.id} label="⚠️ Report a problem" />
        </div>
      </div>
      {showPaper && <div className="mt"><PaperSheet exam={exam} subject={s} /></div>}
    </div>
  );
}

// ───────────────────────────── Results
export function Result({ attemptId }) {
  const { api, data, reload, notify, isParent } = useStore();
  const [att, setAtt] = useState(null);
  const [exam, setExam] = useState(null);
  const [filter, setFilter] = useState('all');
  const [photoUrls, setPhotoUrls] = useState([]);
  const celebrated = useRef(false);

  async function load() {
    const a = await api.getAttempt(attemptId); setAtt(a);
    if (a.exam_id) setExam(await api.getExam(a.exam_id));
    return a;
  }
  useEffect(() => {
    let t; let alive = true;
    (async function poll() {
      try { const a = await load(); if (alive && ['grading', 'submitted'].includes(a.status)) t = setTimeout(poll, 4000); else if (alive && a.status === 'graded') reload(); }
      catch (e) { notify(e.message, true); }
    })();
    return () => { alive = false; clearTimeout(t); };
  }, [attemptId]);
  useEffect(() => { if (att?.photo_paths?.length) Promise.all(att.photo_paths.map((p) => api.photoUrl(p))).then(setPhotoUrls); }, [att?.id, att?.status]);

  const p = att ? pct(att) : 0;
  const totalXp = data.xp.reduce((n, e) => n + e.amount, 0);
  const before = levelFromXp(totalXp - (att?.xp_awarded || 0));
  const after = levelFromXp(totalXp);
  const leveled = att?.status === 'graded' && after.level > before.level && att.xp_awarded > 0;
  useEffect(() => {
    if (att?.status !== 'graded' || celebrated.current || isParent) return;
    celebrated.current = true;
    // Celebrate once per result (not every time he reopens it from history).
    const k = `dec-celebrated-${att.id}`;
    let seen = false; try { seen = localStorage.getItem(k) === '1'; localStorage.setItem(k, '1'); } catch { /* ignore */ }
    if (seen) return;
    if (p >= 80 && att.mode !== 'retry') { confetti(220, 5000); playFanfare(); }
    else if (leveled || p >= 75) confetti();
  }, [att?.status, leveled]);

  if (!att) return <Spinner />;
  const s = data.subjects.find((x) => x.id === att.subject_id);
  if (['grading', 'submitted'].includes(att.status)) return <div className="wrap"><Spinner messages={GRADE_MESSAGES} /></div>;
  if (att.status === 'error') return (
    <div className="wrap" style={{ maxWidth: 700 }}>
      <Empty icon="⚠️" title="Marking hit a problem">
        <p>{att.error}</p>
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={async () => { setAtt({ ...att, status: 'grading' }); try { await api.regrade(att.id); } catch (e) { notify(e.message, true); } await load(); reload(); }}>Try marking again</button>
          <CancelPaper attempt={att} small={false} after={`#/world/${att.subject_id}?tab=papers`} />
        </div>
      </Empty>
    </div>
  );
  if (att.status === 'in_progress') { go(`#/${att.mode === 'paper' ? 'paper' : 'play'}/${att.id}`); return null; }
  if (att.status === 'cancelled') return (
    <div className="wrap" style={{ maxWidth: 700 }}>
      <Empty icon="🗑️" title="This paper was cancelled"><p>Reason: {att.cancel_reason}</p><a className="btn" href={`#/world/${att.subject_id}`}>Back to the world</a></Empty>
    </div>
  );

  const g = gradeLetter(p);
  const results = att.results || [];
  const shown = results.filter((r) => filter === 'all' || (filter === 'miss' ? r.verdict !== 'correct' : r.verdict === 'correct'));
  const qById = Object.fromEntries((exam?.questions || []).map((q) => [q.id, q]));
  const topics = data.topics.filter((t) => t.subject_id === att.subject_id);
  const tname = (c) => topics.find((t) => t.code === c)?.name || c;
  const misses = results.filter((r) => r.verdict !== 'correct');
  const weakTopic = Object.entries(att.topic_scores || {}).sort((a, b) => a[1].got / a[1].max - b[1].got / b[1].max)[0];
  const xpItems = att.tips?.xp || [];
  const tips = att.tips?.tips || [];

  async function fixNow() {
    const a = await api.createAttempt({ exam_id: att.exam_id, subject_id: att.subject_id, mode: 'retry', level: att.level, question_ids: misses.map((m) => m.qid), retry_of: att.retry_of || att.id });
    go(`#/play/${a.id}`);
  }

  return (
    <div className="wrap" style={{ maxWidth: 980, '--c': s.color }}>
      <a className="small muted" href={`#/world/${s.id}?tab=papers`}>← {s.name}</a>
      <div className="grid g2 mt">
        <div className="card glow pop" style={{ '--c': g.c, textAlign: 'center' }}>
          <div className="small muted">{exam?.title} · <LevelPill level={att.level} /></div>
          <div className="row mt" style={{ justifyContent: 'center', gap: 24 }}>
            <div className="bigscore" style={{ color: g.c }}>{g.l}</div>
            <div><div className="bigscore">{p}%</div><div className="muted">{att.score} / {att.total} marks</div></div>
          </div>
          <h3 className="mt">{g.t}</h3>
          <div className="small muted mt">⏱ {fmtDur(att.time_taken_sec)} {exam?.duration_min ? `(target ${exam.duration_min} min)` : ''} · {att.mode === 'paper' ? '✍️ handwritten' : att.mode === 'retry' ? '🛠️ mistake fix' : '💻 online'}</div>
        </div>
        <div className="card">
          <h3>⚡ XP earned {att.xp_awarded ? <span style={{ color: 'var(--gold)' }}>+{att.xp_awarded}</span> : ''}</h3>
          <div className="mt">{xpItems.map((i, k) => <div key={k} className="xpline small"><span>{i.reason}</span><b style={{ color: 'var(--gold)' }}>{i.amount ? `+${i.amount}` : '💡'}</b></div>)}</div>
          {leveled && <div className="pill gold mt pop" style={{ fontSize: '1rem' }}>🎉 LEVEL UP! Level {after.level}{after.rank.name !== before.rank.name ? ` — new stage: ${after.rank.icon} ${after.rank.name}` : ''}</div>}
          {att.summary && <p className="mt">{att.summary}</p>}
          {tips.length > 0 && <ul className="small">{tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      </div>

      {att.status === 'graded' && att.exam_id && att.level !== 'quiz' && <ExaminerChat attempt={att} onChanged={load} />}
      {att.exam_id && <div className="row mt no-print" style={{ justifyContent: 'flex-end' }}><ReportProblem examId={att.exam_id} attemptId={att.id} /></div>}

      <div className="card mt">
        <h3>📊 By topic</h3>
        <div className="col mt" style={{ gap: 10 }}>
          {Object.entries(att.topic_scores || {}).map(([c, v]) => {
            const tp = Math.round((100 * v.got) / v.max);
            return (
              <div key={c} className="row" style={{ gap: 10 }}>
                <span className="pill mono">{c}</span>
                <div style={{ flex: 1, minWidth: 160 }}><div className="row between small"><span>{tname(c)}</span><b style={{ color: scoreColor(tp) }}>{v.got}/{v.max}</b></div><div style={{ marginTop: 4 }}><Bar value={tp} color={scoreColor(tp)} /></div></div>
                {tp < 70 && <a className="btn ghost sm" href={`#/lesson/${att.subject_id}/${c}`}>⚡ Power-up</a>}
              </div>
            );
          })}
        </div>
      </div>

      {!isParent && misses.length > 0 && (
        <div className="card mt row between" style={{ borderColor: 'var(--warn)' }}>
          <div><h3>🛠️ {misses.length} question{misses.length > 1 ? 's' : ''} to fix</h3><div className="small muted">Redo them now while the explanations are fresh — +15 XP each.</div></div>
          <div className="row">
            <button className="btn gold" onClick={fixNow}>Fix them now →</button>
            {weakTopic && <a className="btn ghost" href={`#/lesson/${att.subject_id}/${weakTopic[0]}`}>Learn {weakTopic[0]} first</a>}
          </div>
        </div>
      )}

      <div className="row between mt2 mb">
        <h2>Question by question</h2>
        <div className="tabs" style={{ border: 0, margin: 0 }}>
          {[['all', 'All'], ['miss', `Lost marks (${misses.length})`], ['ok', 'Correct']].map(([k, t]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{t}</button>)}
        </div>
      </div>
      <div className="col" style={{ gap: 12 }}>
        {shown.map((r) => {
          const q = qById[r.qid];
          return (
            <div key={r.qid} className={`res ${r.verdict}`}>
              <div className="row between">
                <b>Q{r.number} <span className="tiny dim">· {tname(r.topic)}</span></b>
                <span className={`pill ${r.verdict === 'correct' ? 'ok' : r.verdict === 'partial' ? 'warn' : 'bad'}`}>
                  {r.verdict === 'correct' ? '✅' : r.verdict === 'partial' ? '🟠' : r.verdict === 'blank' ? '⬜' : '❌'} {r.awarded}/{r.max}
                </span>
              </div>
              {q && <div className="small muted" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{q.prompt}</div>}
              <div className="label">Your answer</div><div className="ans">{r.studentAnswer || <i className="dim">blank</i>}</div>
              <div className="label">Feedback</div><div>{r.feedback}</div>
              {r.verdict !== 'correct' && <>
                <div className="label" style={{ color: 'var(--ok)' }}>Right answer</div><div className="ans">{r.correctAnswer}</div>
                {r.why && <><div className="label">Why</div><div className="ans">{r.why}</div></>}
              </>}
            </div>
          );
        })}
      </div>
      {exam?.level === 'listening' && exam.audio_script && (
        <div className="card mt"><h3>📝 What you heard (transcript)</h3><p style={{ whiteSpace: 'pre-wrap' }}>{exam.audio_script}</p></div>
      )}
      {photoUrls.length > 0 && (
        <div className="card mt"><h3>📷 Your uploaded pages</h3><div className="photos mt">{photoUrls.map((u, i) => u && <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`page ${i + 1}`} /></a>)}</div></div>
      )}
      {isParent && att.exam_id && <div className="row mt"><a className="btn ghost" href={`#/print/${att.exam_id}?key=1`}>🔑 Full mark scheme</a></div>}
    </div>
  );
}
