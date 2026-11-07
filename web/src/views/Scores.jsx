import React, { useMemo, useState } from 'react';
import { useStore, LevelPill, Empty } from '../common.jsx';
import { fmtDate, fmtDateTime, fmtDur, pct, scoreColor } from '../lib.js';

// One fixed colour + marker shape per paper type (colour follows the type, never its rank).
// Palette: validated categorical slots 1-6, dark mode, against the card surface.
export const SERIES = [
  { key: 'foundational', label: 'Foundational', color: '#3987e5', shape: 'circle' },
  { key: 'challenging', label: 'Challenging', color: '#d95926', shape: 'square' },
  { key: 'godmode', label: 'God-mode', color: '#199e70', shape: 'diamond' },
  { key: 'quiz', label: 'Pop quiz', color: '#c98500', shape: 'triangle' },
  { key: 'listening', label: 'Listening', color: '#d55181', shape: 'tri-down' },
  { key: 'school', label: 'School / uploaded', color: '#9085e9', shape: 'cross' },
];
const seriesOf = (a) => (a.level === 'external' ? 'school' : a.level);
const graded = (data, sid) => data.attempts
  .filter((a) => a.status === 'graded' && (!sid || a.subject_id === sid) && a.total > 0)
  .sort((a, b) => new Date(a.graded_at || a.started_at) - new Date(b.graded_at || b.started_at));

function Marker({ shape, x, y, r = 5, color }) {
  const s = { fill: color, stroke: 'var(--card)', strokeWidth: 2 };
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={1.5} {...s} />;
  if (shape === 'diamond') return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} {...s} />;
  if (shape === 'triangle') return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} {...s} />;
  if (shape === 'tri-down') return <polygon points={`${x},${y + r + 1} ${x + r + 1},${y - r} ${x - r - 1},${y - r}`} {...s} />;
  if (shape === 'cross') return <g><rect x={x - r} y={y - 2} width={2 * r} height={4} {...s} /><rect x={x - 2} y={y - r} width={4} height={2 * r} {...s} /></g>;
  return <circle cx={x} cy={y} r={r} {...s} />;
}

// Two main lines on the graph: exam papers (all levels) and pop quizzes (+ listening if any).
// Line colour = what kind of test; marker shape on the paper line = paper level.
const LINES = [
  { key: 'paper', label: 'Exam papers', color: '#3987e5' },
  { key: 'quiz', label: 'Pop quizzes', color: '#d95926' },
  { key: 'listening', label: 'Listening', color: '#199e70' },
];
const lineOf = (a) => (a.level === 'quiz' ? 'quiz' : a.level === 'listening' ? 'listening' : 'paper');
const SHAPE = { foundational: 'circle', challenging: 'square', godmode: 'diamond', school: 'cross', drill: 'circle', quiz: 'triangle', listening: 'tri-down' };
const LEVEL_NAME = { foundational: 'Foundational', challenging: 'Challenging', godmode: 'God-mode', school: 'School / uploaded', drill: 'Drill', quiz: 'Pop quiz', listening: 'Listening' };

/** % score over time: exam papers and pop quizzes as two lines. Mistake-fix retries are left out (they re-test only wrong answers). */
export function ScoreChart({ attempts }) {
  const [tip, setTip] = useState(null);
  const pts = attempts.filter((a) => a.mode !== 'retry').map((a) => ({ a, lv: seriesOf(a), line: lineOf(a), t: new Date(a.graded_at || a.started_at).getTime(), p: pct(a) }));
  const present = LINES.filter((l) => pts.some((p) => p.line === l.key));
  const paperLevels = ['foundational', 'challenging', 'godmode', 'school', 'drill'].filter((lv) => pts.some((p) => p.lv === lv));
  if (!pts.length) return <p className="muted small">No marked papers or quizzes yet.</p>;
  const W = 760, H = 300, L = 40, R = 34, T = 14, B = 34;
  let t0 = Math.min(...pts.map((p) => p.t)), t1 = Math.max(...pts.map((p) => p.t));
  if (t1 - t0 < 86400000) { t0 -= 43200000; t1 += 43200000; }
  const X = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const Y = (p) => T + (1 - p / 100) * (H - T - B);
  const days = []; for (let d = new Date(new Date(t0).toDateString()).getTime() + 86400000; d <= t1; d += 86400000) days.push(d);
  const step = Math.max(1, Math.ceil(days.length / 8));
  return (
    <div style={{ position: 'relative' }}>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
        {present.map((l) => (
          <span key={l.key} className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="26" height="12"><line x1="1" x2="25" y1="6" y2="6" stroke={l.color} strokeWidth="2.5" strokeLinecap="round" /></svg><b>{l.label}</b>
          </span>
        ))}
        {paperLevels.length > 1 && <span className="tiny dim" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>Paper level:
          {paperLevels.map((lv) => <span key={lv} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><svg width="14" height="14"><Marker shape={SHAPE[lv]} x={7} y={7} r={4} color="var(--muted)" /></svg>{LEVEL_NAME[lv]}</span>)}
        </span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }} role="img" aria-label="Exam paper and quiz scores over time" onMouseLeave={() => setTip(null)}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}><line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke="var(--line)" strokeWidth={g === 0 ? 1.5 : 1} strokeDasharray={g === 0 ? '' : '3 5'} />
            <text x={L - 8} y={Y(g) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{g}%</text></g>
        ))}
        {days.filter((_, i) => i % step === 0).map((d) => <text key={d} x={X(d)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmtDate(d)}</text>)}
        {present.map((l) => {
          const ps = pts.filter((p) => p.line === l.key);
          return (
            <g key={l.key}>
              {ps.length > 1 && <polyline points={ps.map((p) => `${X(p.t)},${Y(p.p)}`).join(' ')} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
              {ps.map((p) => (
                <g key={p.a.id} style={{ cursor: 'pointer' }} onMouseEnter={() => setTip({ p, l, x: X(p.t), y: Y(p.p) })} onClick={() => { window.location.hash = `#/result/${p.a.id}`; }}>
                  <circle cx={X(p.t)} cy={Y(p.p)} r={12} fill="transparent" />
                  <Marker shape={SHAPE[p.lv] || 'circle'} x={X(p.t)} y={Y(p.p)} r={5} color={l.color} />
                </g>
              ))}
              {ps.length > 0 && <text x={Math.min(X(ps.at(-1).t) + 9, W - R)} y={Y(ps.at(-1).p) - 9} fontSize="11" fill="var(--text)" textAnchor={X(ps.at(-1).t) > W - 60 ? 'end' : 'start'}>{ps.at(-1).p}%</text>}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="card small" style={{ position: 'absolute', left: `calc(${(tip.x / W) * 100}% + 12px)`, top: `calc(${(tip.y / H) * 100}% - 10px)`, padding: '8px 10px', pointerEvents: 'none', zIndex: 5, maxWidth: 260, transform: tip.x > W * 0.65 ? 'translateX(calc(-100% - 24px))' : 'none' }}>
          <b>{tip.p.p}%</b> · {tip.p.a.score}/{tip.p.a.total} marks<br />{LEVEL_NAME[tip.p.lv] || tip.l.label} · {fmtDateTime(tip.p.t)}<div className="tiny dim">click to open</div>
        </div>
      )}
    </div>
  );
}

/** Parent: all subjects at a glance, each linking to its score history. */
export function ScoresIndex() {
  const { data } = useStore();
  const all = graded(data);
  const rows = data.subjects.filter((s) => s.active).map((s) => {
    const mine = all.filter((a) => a.subject_id === s.id && a.mode !== 'retry');
    const byLevel = Object.fromEntries(SERIES.map((x) => [x.key, mine.filter((a) => seriesOf(a) === x.key)]));
    return { s, mine, byLevel };
  });
  const cell = (list) => list.length ? <span><b style={{ color: scoreColor(pct(list.at(-1))) }}>{pct(list.at(-1))}%</b>{list.length > 1 && <span className="tiny dim"> ({list.length}, best {Math.max(...list.map(pct))}%)</span>}</span> : <span className="dim">—</span>;
  return (
    <div className="wrap">
      <h1>📈 Scores</h1>
      <p className="muted">Latest score for each kind of paper, per subject. Click a subject for every result and a graph over time. Mistake-fix redos are not counted here.</p>
      <div className="card mt"><div className="table-scroll"><table>
        <thead><tr><th>Subject</th><th>Foundational</th><th>Challenging</th><th>God-mode</th><th>School / uploaded</th><th>Pop quizzes</th><th>Listening</th><th /></tr></thead>
        <tbody>{rows.map(({ s, mine, byLevel }) => (
          <tr key={s.id}>
            <td><a href={`#/scores/${s.id}`}><b>{s.emoji} {s.name}</b></a></td>
            <td>{cell(byLevel.foundational)}</td><td>{cell(byLevel.challenging)}</td><td>{cell(byLevel.godmode)}</td><td>{cell(byLevel.school)}</td>
            <td>{byLevel.quiz.length ? <span><b style={{ color: scoreColor(Math.round(byLevel.quiz.reduce((t, a) => t + pct(a), 0) / byLevel.quiz.length)) }}>{Math.round(byLevel.quiz.reduce((t, a) => t + pct(a), 0) / byLevel.quiz.length)}% avg</b><span className="tiny dim"> ({byLevel.quiz.length})</span></span> : <span className="dim">—</span>}</td>
            <td>{cell(byLevel.listening)}</td>
            <td>{mine.length ? <a className="btn ghost sm" href={`#/scores/${s.id}`}>Details →</a> : null}</td>
          </tr>
        ))}</tbody>
      </table></div></div>
    </div>
  );
}

/** Parent: one subject — graph plus every marked paper and quiz. */
export function SubjectScores({ sid }) {
  const { data } = useStore();
  const s = data.subjects.find((x) => x.id === sid);
  const [showRetries, setShowRetries] = useState(false);
  const list = useMemo(() => graded(data, sid), [data, sid]);
  if (!s) return <div className="wrap"><Empty icon="🤷" title="Subject not found" /></div>;
  const shown = list.filter((a) => showRetries || a.mode !== 'retry').slice().reverse();
  const nRetry = list.filter((a) => a.mode === 'retry').length;
  return (
    <div className="wrap" style={{ maxWidth: 1000, '--c': s.color }}>
      <a className="small muted" href="#/scores">← All subjects</a>
      <h1>{s.emoji} {s.name}: scores</h1>
      <div className="card mt">
        <h3>Score over time</h3>
        <p className="small muted">Blue line: exam papers. Orange line: pop quizzes. Each point is one marked test; hover for details, click to open it.</p>
        <ScoreChart attempts={list} />
      </div>
      <div className="card mt">
        <div className="row between"><h3>Every result ({shown.length})</h3>
          {nRetry > 0 && <label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={showRetries} onChange={(e) => setShowRetries(e.target.checked)} /> show {nRetry} mistake-fix redo{nRetry > 1 ? 's' : ''}</label>}</div>
        {shown.length === 0 ? <p className="muted">Nothing marked yet.</p> : (
          <div className="table-scroll mt"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Paper</th><th>Marks</th><th>%</th><th>Time</th><th>How</th><th /></tr></thead>
            <tbody>{shown.map((a) => {
              const e = data.exams.find((x) => x.id === a.exam_id); const p = pct(a);
              return (
                <tr key={a.id}>
                  <td className="small">{fmtDateTime(a.graded_at || a.started_at)}</td>
                  <td><LevelPill level={a.level} /></td>
                  <td className="small">{e?.title || (a.level === 'external' ? 'Uploaded paper' : '—')}</td>
                  <td>{a.score}/{a.total}</td>
                  <td><b style={{ color: scoreColor(p) }}>{p}%</b></td>
                  <td className="small">{a.time_taken_sec > 0 ? fmtDur(a.time_taken_sec) : '—'}{e?.duration_min && a.time_taken_sec > 0 ? <span className="tiny dim"> / {e.duration_min}m</span> : null}</td>
                  <td className="small">{a.mode === 'paper' ? '✍️ paper' : a.mode === 'retry' ? '🛠️ redo' : a.mode === 'external' ? '📸 uploaded' : '💻 online'}</td>
                  <td><a className="btn ghost sm" href={`#/result/${a.id}`}>View</a></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
