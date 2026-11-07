import React, { useState } from 'react';
import { useStore, Modal } from '../common.jsx';
import { subjectScore } from '../lib.js';

const DEFAULT_GOAL = 80;
const goalOf = (s) => (Number.isFinite(s.goal_pct) ? s.goal_pct : DEFAULT_GOAL);
// Below the goal = red; at/above the goal = green, or yellow when 90%+.
const band = (p, g) => (p < g ? { c: 'var(--danger)', tag: `${g - p} to go` } : p >= 90 ? { c: 'var(--gold)', tag: '★ 90+' } : { c: 'var(--ok)', tag: '✓ on target' });

/** Parent: set the target % for one subject or all at once. */
function GoalEditor({ rows, onClose }) {
  const { api, notify, reload } = useStore();
  const [all, setAll] = useState(DEFAULT_GOAL);
  const [vals, setVals] = useState(Object.fromEntries(rows.map(({ s }) => [s.id, goalOf(s)])));
  const [busy, setBusy] = useState(false);
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  async function save() {
    setBusy(true);
    try {
      for (const { s } of rows) if (clamp(vals[s.id]) !== goalOf(s)) await api.saveSubject(s.id, { goal_pct: clamp(vals[s.id]) });
      await reload(); notify('Goals saved'); onClose();
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }
  return (
    <Modal onClose={() => !busy && onClose()}>
      <h3>🎯 Set goals</h3>
      <div className="row mt" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1 }}>All subjects
          <input type="number" min="0" max="100" value={all} onChange={(e) => setAll(e.target.value)} /></label>
        <button className="btn ghost" onClick={() => setVals(Object.fromEntries(rows.map(({ s }) => [s.id, clamp(all)])))}>Apply to all</button>
      </div>
      <div className="col mt" style={{ gap: 6 }}>
        {rows.map(({ s }) => (
          <label key={s.id} className="row between" style={{ gap: 10 }}>
            <span>{s.emoji} {s.name}</span>
            <span className="row" style={{ gap: 4 }}><input type="number" min="0" max="100" style={{ width: 80 }} value={vals[s.id]} onChange={(e) => setVals({ ...vals, [s.id]: e.target.value })} />%</span>
          </label>
        ))}
      </div>
      <div className="row mt"><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save goals'}</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

/** Homepage goal chart: expected exam % per subject against each subject's target (dotted line). */
export default function GoalChart({ forParent = false }) {
  const { d, data } = useStore();
  const [edit, setEdit] = useState(false);
  const scoreFor = (sid) => subjectScore(data, sid);
  const rows = d.active.map((s) => ({ s, r: d.readiness[s.id], g: goalOf(s), pa: scoreFor(s.id) }));
  const onTarget = rows.filter((x) => x.pa.avg != null && x.pa.avg >= x.g).length;
  const goals = [...new Set(rows.map((x) => x.g))];
  const title = goals.length === 1 ? `Goal: ${goals[0]}%+ in every subject` : 'Goal for each subject';
  return (
    <div className="card mt">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <h3>🎯 {title}</h3>
        <span className="row small muted" style={{ gap: 10 }}>
          <span><b style={{ color: onTarget === rows.length ? 'var(--ok)' : 'var(--text)' }}>{onTarget}/{rows.length}</b> on target</span>
          {forParent && <button className="btn ghost sm" onClick={() => setEdit(true)}>✏️ Set goals</button>}
        </span>
      </div>
      <p className="tiny dim" style={{ margin: '2px 0 10px' }}>
        Score = written papers (80%) + {forParent ? "Dhruv's" : 'your'} last 5 pop quizzes (20%); a subject needs at least one paper to get a bar. The dotted line is the goal. Hover a bar for the breakdown. <span style={{ color: 'var(--danger)' }}>■ below goal</span> · <span style={{ color: 'var(--ok)' }}>■ goal reached</span> · <span style={{ color: 'var(--gold)' }}>■ 90%+</span>. Grey = no paper marked yet. Faded = based on only one paper.
      </p>
      <div className="goal-chart">
        {rows.map(({ s, r, g, pa }) => {
          const p = pa.avg;
          const b = p != null ? band(p, g) : null;
          return (
            <a key={s.id} className="goal-row" href={forParent ? `#/scores/${s.id}` : `#/world/${s.id}`}
              title={p != null ? `${s.name}: ${p}% = papers ${pa.paper}% (${pa.n})${pa.quiz != null ? ` × 80% + recent quizzes ${pa.quiz}% (${pa.nq}) × 20%` : ''} · goal ${g}% · cautious exam prediction ${r.predicted}% (likely ${r.low}–${r.high}%)` : `${s.name}: no paper marked yet${pa.quiz != null ? ` (quiz average ${pa.quiz}% — do a paper to get a score)` : ''} · goal ${g}%`}>
              <span className="goal-label">{s.emoji} {s.name}</span>
              <span className="goal-track">
                {p != null
                  ? <span className="goal-bar" style={{ width: `${p}%`, background: b.c, opacity: pa.n === 1 ? 0.6 : 1 }} />
                  : <span className="goal-bar empty" />}
                <span className="goal-line" style={{ left: `${g}%` }} />
              </span>
              <span className="goal-val">{p != null ? <><b>{p}%</b> <span className="tiny dim">{b.tag}</span></> : <span className="tiny dim">{pa.quiz != null ? `quizzes ${pa.quiz}%, no paper yet` : 'no paper yet'}</span>}</span>
            </a>
          );
        })}
        <div className="goal-row axis" aria-hidden="true">
          <span className="goal-label" />
          <span className="goal-track" style={{ background: 'none' }}>
            {[0, 25, 50, 75, 100].map((t) => <span key={t} className="tiny dim" style={{ position: 'absolute', left: `${t}%`, transform: 'translateX(-50%)' }}>{t}%</span>)}
          </span>
          <span className="goal-val" />
        </div>
      </div>
      {edit && <GoalEditor rows={rows} onClose={() => setEdit(false)} />}
    </div>
  );
}
