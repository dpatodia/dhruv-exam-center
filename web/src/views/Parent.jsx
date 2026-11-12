import React, { useEffect, useState } from 'react';
import { useStore, Bar, Empty, LevelPill, Spinner, CancelPaper, go } from '../common.jsx';
import { dayKey, fmtDate, fmtDateTime, fmtDur, pct, scoreColor } from '../lib.js';
import { STUDENT_NAME, DEMO } from '../config.js';
import { ChangesAndErrors } from './Chat.jsx';
import GoalChart from './Goal.jsx';

function statusOf(r) {
  if (r.daysToExam == null) return ['Done', ''];
  if (!r.hasData) return [r.quizzesDone ? 'Quizzes only — needs a paper' : r.daysToExam <= 10 ? 'No practice yet' : 'Not started', r.daysToExam <= 10 ? 'bad' : 'warn'];
  if (r.predicted < 55) return ['At risk', 'bad'];
  if (r.predicted < 70 || r.confidenceLabel === 'low') return ['Watch', 'warn'];
  return ['On track', 'ok'];
}

export function ParentHome() {
  const { data, d, api, notify } = useStore();
  const [report, setReport] = useState(null);
  const [rBusy, setRBusy] = useState(false);
  const [usage, setUsage] = useState([]);
  useEffect(() => { api.usage().then(setUsage).catch(() => {}); }, []);

  const rows = d.active.map((s) => ({ s, r: d.readiness[s.id] })).sort((a, b) => (a.r.daysToExam ?? 99) - (b.r.daysToExam ?? 99));
  const withData = rows.filter((x) => x.r.hasData);
  const avg = withData.length ? Math.round(withData.reduce((n, x) => n + x.r.predicted, 0) / withData.length) : null;
  const days = Array.from({ length: 21 }, (_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 20 + i); return dayKey(dt); });
  const perDay = Object.fromEntries(days.map((k) => [k, 0]));
  for (const e of data.xp) { const k = dayKey(e.created_at); if (k in perDay) perDay[k] += e.amount; }
  const maxDay = Math.max(1, ...Object.values(perDay));
  const active14 = days.slice(-14).filter((k) => perDay[k] > 0).length;
  const week = d.graded.filter((a) => a.mode !== 'retry' && Date.now() - new Date(a.graded_at) < 7 * 864e5);
  const minutes = Math.round(d.graded.filter((a) => Date.now() - new Date(a.graded_at) < 7 * 864e5).reduce((n, a) => n + (a.time_taken_sec || 0), 0) / 60);
  const s = data.settings || {};
  const cost = usage.reduce((n, u) => n + (u.input_tokens * (s.price_in_per_mtok || 3) + u.output_tokens * (s.price_out_per_mtok || 15)) / 1e6, 0);

  // Rule-based next actions
  const actions = [];
  for (const { s: sub, r } of rows) {
    if (r.daysToExam != null && r.daysToExam <= 10 && !r.hasData) actions.push(`${sub.emoji} ${sub.name}: exam in ${r.daysToExam} days and no practice paper yet — start with Foundational.`);
    const weak = r.weakest.filter((t) => t.mastery != null && t.mastery < 55).slice(0, 2);
    if (weak.length) actions.push(`${sub.emoji} ${sub.name}: weak on ${weak.map((t) => `${t.code} ${t.name} (${Math.round(t.mastery)}%)`).join(', ')} — Power-up lesson then a drill.`);
    if (r.hasData && r.daysSince != null && r.daysSince >= 5 && r.daysToExam != null && r.daysToExam <= 14) actions.push(`${sub.emoji} ${sub.name}: no practice for ${r.daysSince} days.`);
  }
  const allHandoutSubjects = new Set(data.handouts.map((h) => h.subject_id));
  const noHandouts = d.active.filter((x) => !allHandoutSubjects.has(x.id));
  const recent = d.graded.filter((a) => a.mode !== 'retry').slice(0, 8);
  const unfinished = data.attempts.filter((a) => ['in_progress', 'error'].includes(a.status) && a.mode !== 'retry');
  const cancelled = (data.cancelled || []).slice().sort((a, b) => String(b.cancelled_at).localeCompare(String(a.cancelled_at)));
  const who = (id) => data.profiles?.find((p) => p.id === id)?.display_name || '—';

  return (
    <div className="wrap">
      <div className="row between" style={{ marginTop: 8 }}>
        <h1>{STUDENT_NAME}'s readiness</h1>
        <button className="btn purple" disabled={rBusy} onClick={async () => { setRBusy(true); try { setReport((await api.parentReport()).report); } catch (e) { notify(e.message, true); } setRBusy(false); }}>
          {rBusy ? 'Thinking…' : '🧠 AI briefing'}
        </button>
      </div>

      <GoalChart forParent />

      <div className="grid g4 mt">
        <div className="card"><div className="stat"><b style={{ color: scoreColor(avg) }}>{avg == null ? '—' : `${avg}%`}</b><span>Avg predicted ({withData.length}/{rows.length} subjects with a paper)</span></div></div>
        <div className="card"><div className="stat"><b>{week.length}</b><span>Papers in last 7 days</span></div></div>
        <div className="card"><div className="stat"><b>{active14}/14</b><span>Active days (2 wks)</span></div></div>
        <div className="card"><div className="stat"><b>{minutes}m</b><span>Timed work, last 7 days</span></div></div>
      </div>

      {report && (
        <div className="card mt glow" style={{ '--c': '#7c5cff' }}>
          <h3>🧠 {report.headline}</h3>
          <div className="grid g2 mt">
            <div><b style={{ color: 'var(--ok)' }}>Strengths</b><ul>{report.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><b style={{ color: 'var(--danger)' }}>Concerns</b><ul>{report.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          <b>Plan</b><ul>{report.plan.map((p, i) => <li key={i}><b>{p.when}:</b> {p.action}</li>)}</ul>
          <p className="muted"><b>Talking to {STUDENT_NAME}:</b> {report.conversation}</p>
        </div>
      )}

      <div className="card mt">
        <div className="row between"><h3>Predicted exam scores</h3><span className="small muted">Needs at least one marked paper (quizzes alone don't count). Confidence: 1 paper = low, 2 = medium, 3+ = high.</span></div>
        <div className="table-scroll mt"><table>
          <thead><tr><th>Subject</th><th>Next exam</th><th>Predicted</th><th>Confidence</th><th>Papers</th><th>Coverage</th><th>Last practice</th><th>Weakest topic</th><th>Status</th></tr></thead>
          <tbody>{rows.map(({ s: sub, r }) => {
            const [st, cls] = statusOf(r);
            const w = r.weakest.find((t) => t.mastery != null);
            return (
              <tr key={sub.id} style={{ cursor: 'pointer' }} onClick={() => go(`#/subject/${sub.id}`)}>
                <td><a href={`#/scores/${sub.id}`} title="Scores and graph"><b>{sub.emoji} {sub.name}</b></a></td>
                <td className="small">{r.nextExam ? `${fmtDate(r.nextExam.at)} (${r.daysToExam}d)` : '—'}</td>
                <td>{r.hasData ? <><b style={{ color: scoreColor(r.predicted) }}>{r.predicted}%</b> <span className="tiny dim">{r.low}–{r.high}</span></> : <span className="dim">no prediction yet</span>}</td>
                <td><span className={`pill ${r.confidenceLabel === 'high' ? 'ok' : r.confidenceLabel === 'medium' ? 'warn' : 'bad'}`}>{r.confidenceLabel}</span></td>
                <td>{r.papersDone}{r.quizzesDone ? <span className="tiny dim"> +{r.quizzesDone}⚡</span> : null}</td>
                <td style={{ minWidth: 90 }}><Bar value={r.coverage * 100} /><span className="tiny dim">{Math.round(r.coverage * 100)}%</span></td>
                <td className="small">{r.daysSince == null ? '—' : r.daysSince === 0 ? 'today' : `${r.daysSince}d ago`}</td>
                <td className="small">{w ? `${w.code} ${Math.round(w.mastery)}%` : '—'}</td>
                <td><span className={`pill ${cls}`}>{st}</span></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <h3>🎯 Suggested next actions</h3>
          {actions.length ? <ul>{actions.slice(0, 8).map((a, i) => <li key={i} style={{ marginBottom: 6 }}>{a}</li>)}</ul> : <p className="muted">Nothing urgent from the data.</p>}
          {noHandouts.length > 0 && <p className="small muted">📚 No handouts uploaded for: {noHandouts.map((x) => x.name).join(', ')}. Papers for these follow the general syllabus, not CIS notes — <a href="#/handouts">upload</a>.</p>}
        </div>
        <div className="card">
          <h3>📅 Activity (last 21 days)</h3>
          <div className="heat mt">{days.map((k) => <i key={k} title={`${k}: ${perDay[k]} XP`} style={{ background: perDay[k] ? `rgba(34,211,166,${0.25 + 0.75 * perDay[k] / maxDay})` : undefined }} />)}</div>
          <div className="row between tiny dim mt"><span>{fmtDate(days[0])}</span><span>today</span></div>
          <div className="mt small">
            <b>Game status:</b> Level {d.level.level} {d.level.rank.icon} {d.level.rank.name} · {d.totalXp} XP · streak {d.streak.days} · {d.achievements.filter((a) => a.got).length} trophies · {d.mistakes.length} open mistakes
          </div>
          <div className="mt small"><b>AI cost this month:</b> ~${cost.toFixed(2)} of ${s.monthly_budget_usd ?? 30} budget <span className="tiny dim">(estimate from token counts)</span></div>
          <Bar value={(100 * cost) / (s.monthly_budget_usd || 30)} color={cost > (s.monthly_budget_usd || 30) * 0.8 ? 'var(--danger)' : undefined} />
        </div>
      </div>

      {unfinished.length > 0 && (
        <div className="card mt">
          <h3>⏳ Unfinished papers ({unfinished.length})</h3>
          <p className="small muted">Started but not marked yet. Cancel any that shouldn't count; the paper goes back on the shelf as a ready-made paper.</p>
          <div className="table-scroll mt"><table>
            <thead><tr><th>Started</th><th>Subject</th><th>Paper</th><th>Status</th><th /></tr></thead>
            <tbody>{unfinished.map((a) => {
              const sub = data.subjects.find((x) => x.id === a.subject_id);
              const e = data.exams.find((x) => x.id === a.exam_id);
              return (
                <tr key={a.id}><td className="small">{fmtDateTime(a.started_at)}</td><td>{sub?.emoji} {sub?.name}</td><td>{e?.title || 'Uploaded paper'} <LevelPill level={a.level} /></td>
                  <td><span className={`pill ${a.status === 'error' ? 'bad' : ''}`}>{a.status === 'error' ? 'marking problem' : `${(a.photo_paths || []).length} photo(s) added`}</span></td>
                  <td><CancelPaper attempt={a} label="🗑️ Cancel" /></td></tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}

      <ChangesAndErrors />

      {cancelled.length > 0 && (
        <div className="card mt">
          <h3>🗑️ Cancelled papers ({cancelled.length})</h3>
          <div className="table-scroll mt"><table>
            <thead><tr><th>Cancelled</th><th>By</th><th>Subject</th><th>Paper</th><th>Reason</th></tr></thead>
            <tbody>{cancelled.slice(0, 15).map((a) => {
              const sub = data.subjects.find((x) => x.id === a.subject_id);
              const e = data.exams.find((x) => x.id === a.exam_id);
              return (
                <tr key={a.id}><td className="small">{fmtDateTime(a.cancelled_at)}</td><td className="small">{who(a.cancelled_by)}</td><td>{sub?.emoji} {sub?.name}</td>
                  <td>{e?.title || 'Uploaded paper'} <LevelPill level={a.level} /></td><td className="small">{a.cancel_reason}</td></tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}

      <div className="card mt">
        <h3>Recent papers</h3>
        {recent.length ? (
          <div className="table-scroll mt"><table>
            <thead><tr><th>When</th><th>Subject</th><th>Paper</th><th>Score</th><th>Time</th><th /></tr></thead>
            <tbody>{recent.map((a) => {
              const sub = data.subjects.find((x) => x.id === a.subject_id);
              const e = data.exams.find((x) => x.id === a.exam_id);
              return (
                <tr key={a.id}><td className="small">{fmtDateTime(a.graded_at)}</td><td>{sub?.emoji} {sub?.name}</td><td>{e?.title} <LevelPill level={a.level} /> <span className="tiny dim">{a.mode}</span></td>
                  <td><b style={{ color: scoreColor(pct(a)) }}>{a.score}/{a.total} ({pct(a)}%)</b></td><td className="small">{fmtDur(a.time_taken_sec)}</td>
                  <td><a className="btn ghost sm" href={`#/result/${a.id}`}>Open</a></td></tr>
              );
            })}</tbody>
          </table></div>
        ) : <Empty icon="⏳" title="No papers marked yet">Once {STUDENT_NAME} finishes papers, scores, predictions and weak topics appear here.</Empty>}
      </div>
    </div>
  );
}

export function HandoutList({ subject }) {
  const { data, api, notify, reload } = useStore();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // {id, notes}
  const list = data.handouts.filter((h) => h.subject_id === subject.id);
  const topics = data.topics.filter((t) => t.subject_id === subject.id);
  const tname = (c) => topics.find((t) => t.code === c)?.name || c;
  useEffect(() => {
    if (!list.some((h) => ['uploaded', 'processing'].includes(h.status))) return;
    const t = setInterval(reload, 6000); return () => clearInterval(t);
  }, [list.map((h) => h.status).join()]);

  async function upload(files) {
    setBusy(true);
    try { for (const f of files) await api.uploadHandout(subject.id, f, f.name.replace(/\.\w+$/, '')); notify(`Uploaded ${files.length} to ${subject.name} — Claude is reading ${files.length > 1 ? 'them' : 'it'} now`); await reload(); }
    catch (e) { notify(e.message, true); }
    setBusy(false);
  }
  async function toggleNotes(h) {
    if (open?.id === h.id) return setOpen(null);
    try { setOpen({ id: h.id, notes: await api.handoutNotes(h.id) }); } catch (e) { notify(e.message, true); }
  }
  const badge = { uploaded: ['queued', ''], processing: ['Claude is reading…', 'warn'], ready: ['ready ✓', 'ok'], error: ['error', 'bad'] };
  const covered = new Set(list.filter((h) => h.status === 'ready').flatMap((h) => h.topic_codes || []));

  return (
    <div className="card" style={{ '--c': subject.color }}>
      <div className="row between">
        <h3>{subject.emoji} {subject.name} handouts <span className="pill">{list.length}</span></h3>
        <label className="btn sm" style={{ cursor: 'pointer' }}>{busy ? 'Uploading…' : `➕ Add ${subject.name} files`}
          <input type="file" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,image/*" onChange={(e) => upload([...e.target.files])} disabled={busy} />
        </label>
      </div>
      <p className="small muted">Every new {subject.name} paper and lesson is written from these, using the school's wording.</p>
      <div className="small mt"><b>Syllabus topics covered by handouts:</b>{' '}
        {topics.map((t) => <span key={t.code} className={`pill ${covered.has(t.code) ? 'ok' : ''}`} style={{ margin: '0 4px 4px 0' }} title={t.name}>{covered.has(t.code) ? '✓' : '·'} {t.code} {t.name.length > 26 ? t.name.slice(0, 26) + '…' : t.name}</span>)}
      </div>
      <div className="col mt" style={{ gap: 0 }}>
        {list.length ? list.map((h) => (
          <div key={h.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <div className="row between">
              <div style={{ flex: 1, minWidth: 200 }}><b>{h.title}</b> <span className={`pill ${badge[h.status][1]}`}>{badge[h.status][0]}</span>
                {h.topic_codes?.length > 0 && <div className="tiny dim" style={{ marginTop: 4 }}>Covers: {h.topic_codes.map(tname).join(' · ')}</div>}
                {h.error && <div className="tiny" style={{ color: 'var(--danger)' }}>{h.error}</div>}
              </div>
              <div className="row">
                {h.status === 'ready' && <button className="btn ghost sm" onClick={() => toggleNotes(h)}>{open?.id === h.id ? 'Hide notes' : 'What Claude read'}</button>}
                {h.status === 'error' && <button className="btn ghost sm" onClick={async () => { try { await api.reprocessHandout(h.id); } catch (e) { notify(e.message, true); } reload(); }}>Retry</button>}
                <button className="btn ghost sm" title="Delete" onClick={async () => { if (window.confirm(`Delete ${h.title}?`)) { await api.deleteHandout(h); reload(); } }}>🗑</button>
              </div>
            </div>
            {open?.id === h.id && <div className="small" style={{ whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 12, marginTop: 8, maxHeight: 360, overflow: 'auto' }}>{open.notes || 'No notes.'}</div>}
          </div>
        )) : <p className="muted small" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>No {subject.name} handouts yet. Papers for this subject follow the general Cambridge syllabus until you add some.</p>}
      </div>
    </div>
  );
}

export function Handouts() {
  const { data, d } = useStore();
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const [sid, setSid] = useState(q.get('s') || d.active[0]?.id);
  const count = (id) => data.handouts.filter((h) => h.subject_id === id).length;
  const subject = data.subjects.find((s) => s.id === sid);
  return (
    <div className="wrap">
      <h1 className="mb">📚 Handouts</h1>
      <div className="row mb" style={{ gap: 8 }}>
        {d.active.map((s) => (
          <button key={s.id} className={`btn sm ${s.id === sid ? '' : 'ghost'}`} style={{ '--c': s.color }} onClick={() => setSid(s.id)}>
            {s.emoji} {s.name} <span className="pill" style={{ marginLeft: 4 }}>{count(s.id)}</span>
          </button>
        ))}
      </div>
      {subject && <HandoutList key={subject.id} subject={subject} />}
    </div>
  );
}

export function Library() {
  const { data } = useStore();
  const [f, setF] = useState('all');
  const exams = data.exams.filter((e) => !e.retired_at && (f === 'all' || e.subject_id === f));
  const played = (id) => data.attempts.filter((a) => a.exam_id === id && a.status === 'graded' && a.mode !== 'retry');
  return (
    <div className="wrap">
      <div className="row between"><h1>📜 Paper library</h1>
        <select style={{ width: 'auto' }} value={f} onChange={(e) => setF(e.target.value)}><option value="all">All subjects</option>{data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <p className="muted">Every paper ever generated or uploaded is kept, with its mark scheme — the history that future papers build on.</p>
      <div className="card mt"><div className="table-scroll"><table>
        <thead><tr><th>Created</th><th>Subject</th><th>Paper</th><th>Marks</th><th>Attempts</th><th /></tr></thead>
        <tbody>{exams.map((e) => {
          const s = data.subjects.find((x) => x.id === e.subject_id); const p = played(e.id);
          return (
            <tr key={e.id}><td className="small">{fmtDate(e.created_at)}</td><td>{s?.emoji} {s?.name}</td><td>{e.title} <LevelPill level={e.level} /></td><td>{e.total_marks}</td>
              <td className="small">{p.length ? p.map((a) => `${pct(a)}%`).join(', ') : '—'}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}><a className="btn ghost sm" href={`#/print/${e.id}`}>🖨️ Paper</a><a className="btn ghost sm" href={`#/print/${e.id}?key=1`}>🔑 Scheme</a></td></tr>
          );
        })}</tbody>
      </table></div></div>
    </div>
  );
}

export function Settings() {
  const { data, api, notify, reload } = useStore();
  const [s, setS] = useState(data.settings || {});
  const set = (k, v) => setS({ ...s, [k]: v });
  async function save() {
    try { const { id, ...rest } = s; await api.saveSettings(rest); notify('Saved'); reload(); } catch (e) { notify(e.message, true); }
  }
  async function toggleSubject(sub) { try { await api.saveSubject(sub.id, { active: !sub.active }); reload(); } catch (e) { notify(e.message, true); } }
  async function setDate(sub, i, date) {
    const papers = sub.papers.map((p, j) => (j === i ? { ...p, date } : p));
    try { await api.saveSubject(sub.id, { papers }); reload(); } catch (e) { notify(e.message, true); }
  }
  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <h1 className="mb">⚙️ Settings</h1>
      <div className="card col">
        <h3>Game & limits</h3>
        <label className="row"><input type="checkbox" checked={!!s.unlock_all} onChange={(e) => set('unlock_all', e.target.checked)} /> Unlock all difficulty levels (skip the Foundational → Challenging → God-mode ladder)</label>
        <div className="grid g3">
          <label className="field">Pop quizzes per day (Dhruv)<input type="number" value={s.daily_quiz_limit ?? 10} onChange={(e) => set('daily_quiz_limit', +e.target.value)} /></label>
          <label className="field">Chat messages per day (Dhruv: tutor + examiner)<input type="number" value={s.daily_chat_limit ?? 60} onChange={(e) => set('daily_chat_limit', +e.target.value)} /></label>
          <label className="field">New papers + lessons per day (Dhruv)<input type="number" value={s.daily_generate_limit ?? 8} onChange={(e) => set('daily_generate_limit', +e.target.value)} /></label>
          <label className="field">Markings per day (Dhruv)<input type="number" value={s.daily_grade_limit ?? 12} onChange={(e) => set('daily_grade_limit', +e.target.value)} /></label>
          <label className="field">Monthly AI budget (USD)<input type="number" value={s.monthly_budget_usd ?? 30} onChange={(e) => set('monthly_budget_usd', +e.target.value)} /></label>
          <label className="field">$ per million input tokens<input type="number" step="0.1" value={s.price_in_per_mtok ?? 3} onChange={(e) => set('price_in_per_mtok', +e.target.value)} /></label>
          <label className="field">$ per million output tokens<input type="number" step="0.1" value={s.price_out_per_mtok ?? 15} onChange={(e) => set('price_out_per_mtok', +e.target.value)} /></label>
        </div>
        <p className="tiny dim">Token prices are only used for the cost estimate — check the current price of your models on the Anthropic pricing page. The hard limit is the spend limit you set in the Anthropic Console.</p>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={save}>Save</button>
      </div>
      <div className="card mt">
        <h3>Subjects & exam dates</h3>
        <p className="small muted">Turn off subjects Dhruv doesn't take. Edit dates if the school changes the timetable. Topics and weights can be edited in Supabase → Table editor → topics.</p>
        <div className="col mt">
          {data.subjects.map((sub) => (
            <div key={sub.id} className="row between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
              <label className="row"><input type="checkbox" checked={sub.active} onChange={() => toggleSubject(sub)} /> <b>{sub.emoji} {sub.name}</b></label>
              <div className="row">{(sub.papers || []).map((p, i) => (
                <label key={i} className="small row" style={{ gap: 6 }}>{p.name}<input type="date" style={{ width: 'auto' }} defaultValue={p.date} onBlur={(e) => e.target.value !== p.date && setDate(sub, i, e.target.value)} /></label>
              ))}</div>
            </div>
          ))}
        </div>
      </div>
      {DEMO && <div className="card mt"><h3>Demo data</h3><button className="btn red" onClick={() => { api.resetDemo(); location.reload(); }}>Reset demo</button></div>}
    </div>
  );
}
