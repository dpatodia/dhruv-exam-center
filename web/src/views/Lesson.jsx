import React, { useEffect, useState } from 'react';
import { useStore, Spinner, Empty, go } from '../common.jsx';

export default function Lesson({ sid, code }) {
  const { api, data, d, notify, isParent } = useStore();
  const [lesson, setLesson] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState({});
  const [drilling, setDrilling] = useState(false);
  const s = data.subjects.find((x) => x.id === sid);
  const t = data.topics.find((x) => x.subject_id === sid && x.code === code);

  async function load(refresh = false) {
    setLesson(null); setErr(null); setPicked({});
    try { const r = await api.lesson(sid, code, refresh); setLesson(r.lesson); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [sid, code]);
  if (!s || !t) return <div className="wrap"><Empty title="Topic not found" /></div>;
  const m = d.readiness[sid].mastery[code];

  async function drill() {
    if (drilling) return;
    setDrilling(true);
    try { const { exam_id } = await api.generateExam({ subject_id: sid, level: 'drill', focus_topics: [code], marks: 15 }); go(`#/exam/${exam_id}`); }
    catch (e) { notify(e.message, true); setDrilling(false); }
  }

  return (
    <div className="wrap" style={{ maxWidth: 860, '--c': s.color }}>
      <a className="small muted" href={`#/world/${sid}?tab=skills`}>← {s.name} skills</a>
      <div className="card glow mt" style={{ '--c': s.color }}>
        <div className="row between">
          <div><div className="small muted">⚡ POWER-UP · {s.name} · {t.code}</div><h1>{t.name}</h1></div>
          <span className="pill">{m.mastery == null ? 'Untested' : `Mastery ${Math.round(m.mastery)}%`}</span>
        </div>
      </div>
      {err && <Empty icon="⚠️" title="Couldn't load the lesson"><p>{err}</p><button className="btn" onClick={() => load()}>Try again</button></Empty>}
      {!lesson && !err && <Spinner messages={['Your tutor is preparing a lesson…', 'Looking at your past mistakes…', 'Finding the best memory trick…']} />}
      {lesson && (
        <div className="col mt" style={{ gap: 16 }}>
          <div className="card"><h2>{lesson.title}</h2><p style={{ fontSize: '1.1rem' }}>{lesson.hook}</p></div>
          {lesson.steps?.map((st, i) => (
            <div key={i} className="card"><h3>{i + 1}. {st.heading}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{st.body}</p></div>
          ))}
          {lesson.keywords?.length > 0 && (
            <div className="card"><h3>🔑 Keywords the examiner wants</h3>
              <div className="col mt" style={{ gap: 8 }}>{lesson.keywords.map((k, i) => <div key={i}><b style={{ color: 'var(--accent2)' }}>{k.term}</b> — {k.meaning}</div>)}</div>
            </div>
          )}
          {lesson.workedExample && (
            <div className="card"><h3>🧪 Worked example</h3><p style={{ whiteSpace: 'pre-wrap' }}><b>Q:</b> {lesson.workedExample.question}</p><p style={{ whiteSpace: 'pre-wrap' }}><b>A:</b> {lesson.workedExample.answer}</p></div>
          )}
          <div className="grid g2">
            {lesson.traps?.length > 0 && <div className="card" style={{ borderColor: 'var(--danger)' }}><h3>🪤 Traps</h3><ul>{lesson.traps.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {lesson.memoryTrick && <div className="card" style={{ borderColor: 'var(--gold)' }}><h3>🧠 Memory trick</h3><p>{lesson.memoryTrick}</p></div>}
          </div>
          {lesson.quickCheck?.length > 0 && (
            <div className="card"><h3>✅ Quick check</h3>
              {lesson.quickCheck.map((qc, i) => {
                const ans = String(qc.answer || '').toLowerCase()[0];
                return (
                  <div key={i} className="mt">
                    <b>{i + 1}. {qc.q}</b>
                    <div className="mt" style={{ marginTop: 8 }}>{qc.options.map((o, j) => {
                      const l = 'abcd'[j]; const p = picked[i];
                      const cls = p ? (l === ans ? 'sel' : p === l ? 'opt-wrong' : '') : '';
                      return <div key={j} className={`opt ${cls}`} style={p === l && l !== ans ? { borderColor: 'var(--danger)' } : undefined} onClick={() => !p && setPicked({ ...picked, [i]: l })}><span className="letter">{l}</span>{o}</div>;
                    })}</div>
                    {picked[i] && <p className="small" style={{ color: picked[i] === ans ? 'var(--ok)' : 'var(--warn)' }}>{picked[i] === ans ? '✅ Yes! ' : '❌ Not quite. '}{qc.why}</p>}
                  </div>
                );
              })}
            </div>
          )}
          {lesson.videoSearches?.length > 0 && (
            <div className="card"><h3>🎬 Watch it explained</h3><p className="small muted">These open a YouTube search — pick a short video from a channel you trust (e.g. BBC Bitesize, FuseSchool, Khan Academy).</p>
              <div className="row mt">{lesson.videoSearches.map((v, i) => <a key={i} className="btn ghost sm" target="_blank" rel="noreferrer" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(v)}`}>▶ {v}</a>)}</div>
            </div>
          )}
          <div className="row">
            {!isParent && <button className="btn" disabled={drilling} onClick={drill}>{drilling ? '⏳ Writing your drill… (30–60 s)' : '🎯 Drill this topic (15 marks)'}</button>}
            <button className="btn ghost" onClick={() => load(true)}>🔄 New lesson</button>
          </div>
        </div>
      )}
    </div>
  );
}
