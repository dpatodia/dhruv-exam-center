import React, { useEffect, useState } from 'react';
import { useStore, Spinner, RichText } from '../common.jsx';
import { gradeLetter } from '../lib.js';

const C = { ok: '#1a7f37', part: '#b76e00', bad: '#c62828', dim: '#666', line: '#ccc' };
const mins = (s) => (s > 0 ? `${Math.floor(s / 60)} min` : null);

/** Printable review of a marked paper for Dhruv: score, examiner summary, topics to work on,
 *  then every question with his answer, marks, feedback and the right answer. Save as PDF from the print dialog. */
export default function Review({ attemptId }) {
  const { api, data, notify } = useStore();
  const [att, setAtt] = useState(null);
  const [exam, setExam] = useState(null);
  useEffect(() => { (async () => {
    try { const a = await api.getAttempt(attemptId); setAtt(a); if (a.exam_id) setExam(await api.getExam(a.exam_id)); }
    catch (e) { notify(e.message, true); }
  })(); }, [attemptId]);
  useEffect(() => {
    if (!att) return;
    const s = data.subjects.find((x) => x.id === att.subject_id);
    const old = document.title;
    document.title = `${s?.name || 'Paper'} review - ${(exam?.title || '').replace(/[^\w\s-]/g, '')} - ${new Date(att.graded_at || att.started_at).toISOString().slice(0, 10)}`;
    return () => { document.title = old; };
  }, [att?.id, exam?.id]);
  if (!att || (att.exam_id && !exam)) return <Spinner />;
  if (att.status !== 'graded') return <div className="wrap"><p>This paper hasn't been marked yet.</p></div>;

  const s = data.subjects.find((x) => x.id === att.subject_id);
  const p = Math.round((100 * att.score) / att.total);
  const qById = Object.fromEntries((exam?.questions || []).map((q) => [q.id, q]));
  const tname = (code) => data.topics.find((t) => t.subject_id === att.subject_id && t.code === code)?.name || code;
  const topics = Object.entries(att.topic_scores || {}).map(([code, v]) => ({ code, ...v, pc: v.max ? Math.round((100 * v.got) / v.max) : 0 })).sort((a, b) => a.pc - b.pc);
  const results = att.results || [];
  const lost = results.filter((r) => r.awarded < r.max && r.verdict !== 'void');
  const shownStems = new Set();

  return (
    <div className="review-wrap">
      <div className="row no-print" style={{ maxWidth: 820, margin: '12px auto', gap: 8 }}>
        <button className="btn ghost sm" onClick={() => history.back()}>← Back</button>
        <button className="btn sm" onClick={() => window.print()}>📄 Save as PDF / Print</button>
        <span className="small muted">In the print window, choose "Save as PDF" as the destination.</span>
      </div>
      <div className="review-sheet">
        <div style={{ textAlign: 'center', borderBottom: `2px solid #222`, paddingBottom: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: C.dim }}>DHRUV'S EXAM CENTER · MARKED PAPER REVIEW</div>
          <h1 style={{ margin: '6px 0 2px', fontSize: 24 }}>{s?.name}: {exam?.title || 'Uploaded paper'}</h1>
          <div style={{ fontSize: 13, color: C.dim }}>
            {att.level} level · marked {new Date(att.graded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            {mins(att.time_taken_sec) ? ` · time taken ${mins(att.time_taken_sec)}${exam?.duration_min ? ` (target ${exam.duration_min} min)` : ''}` : ''}
          </div>
        </div>

        <div className="rv-score">
          <div><div style={{ fontSize: 40, fontWeight: 700 }}>{att.score}/{att.total}</div><div style={{ color: C.dim }}>marks</div></div>
          <div><div style={{ fontSize: 40, fontWeight: 700, color: p >= 80 ? C.ok : p >= 60 ? C.part : C.bad }}>{p}%</div><div style={{ color: C.dim }}>score</div></div>
          <div><div style={{ fontSize: 40, fontWeight: 700 }}>{gradeLetter(p).l}</div><div style={{ color: C.dim }}>grade</div></div>
          <div><div style={{ fontSize: 40, fontWeight: 700, color: lost.length ? C.bad : C.ok }}>{lost.length}</div><div style={{ color: C.dim }}>questions to fix</div></div>
        </div>

        {att.summary && <><h2 className="rv-h">Examiner's summary</h2><p style={{ whiteSpace: 'pre-wrap' }}>{att.summary}</p></>}
        {(att.tips || []).length > 0 && <><h2 className="rv-h">What to do next time</h2><ul>{att.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></>}

        {topics.length > 0 && <>
          <h2 className="rv-h">Score by topic</h2>
          <table className="rv-table"><tbody>
            {topics.map((t) => (
              <tr key={t.code}><td>{tname(t.code)}</td><td style={{ width: 70, textAlign: 'right' }}>{t.got}/{t.max}</td>
                <td style={{ width: 160 }}><div style={{ background: '#eee', height: 10, borderRadius: 3 }}><div style={{ width: `${t.pc}%`, height: '100%', borderRadius: 3, background: t.pc >= 80 ? C.ok : t.pc >= 50 ? C.part : C.bad }} /></div></td>
                <td style={{ width: 50, textAlign: 'right', fontWeight: 600 }}>{t.pc}%</td></tr>
            ))}
          </tbody></table>
        </>}

        <h2 className="rv-h">Question by question</h2>
        <p style={{ fontSize: 13, color: C.dim, marginTop: 0 }}>✅ full marks · 🟠 some marks · ❌ no marks. Read the feedback and the right answer for every question you lost marks on.</p>
        {results.map((r) => {
          const q = qById[r.qid];
          const stem = q?.stem && !shownStems.has(q.stem) ? (shownStems.add(q.stem), q.stem) : null;
          const col = r.verdict === 'correct' ? C.ok : r.verdict === 'partial' ? C.part : r.verdict === 'void' ? C.dim : C.bad;
          return (
            <React.Fragment key={r.qid}>
              {stem && <RichText text={stem} style={{ border: `1px solid ${C.line}`, borderRadius: 4, padding: '8px 10px', margin: '14px 0 6px', fontSize: 13 }} />}
              <div className="rv-q" style={{ borderLeftColor: col }}>
                <div className="row between">
                  <b>Q{r.number} <span style={{ fontWeight: 400, fontSize: 12, color: C.dim }}>· {tname(r.topic)}</span></b>
                  <b style={{ color: col }}>{r.verdict === 'void' ? '⚪ not counted' : `${r.verdict === 'correct' ? '✅' : r.verdict === 'partial' ? '🟠' : '❌'} ${r.awarded}/${r.max}`}</b>
                </div>
                {q && <RichText text={q.prompt} style={{ fontSize: 13, color: '#333', margin: '4px 0' }} />}
                <div className="rv-lbl">Your answer</div><div className="rv-ans">{r.studentAnswer || <i style={{ color: C.dim }}>blank</i>}</div>
                <div className="rv-lbl">Feedback</div><div>{r.feedback}</div>
                {r.verdict !== 'correct' && r.correctAnswer && <><div className="rv-lbl" style={{ color: C.ok }}>Right answer</div><div className="rv-ans">{r.correctAnswer}</div></>}
                {r.verdict !== 'correct' && r.why && <><div className="rv-lbl">Why</div><div>{r.why}</div></>}
              </div>
            </React.Fragment>
          );
        })}
        <div style={{ textAlign: 'center', fontSize: 11, color: C.dim, marginTop: 24 }}>Marked by the Exam Center examiner. Disagree with a mark? Open this paper in the app and use "Talk to the examiner".</div>
      </div>
    </div>
  );
}
