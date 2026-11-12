import React, { useState } from 'react';
import { useStore } from '../common.jsx';
import { subjectScore } from '../lib.js';

const DAY = 864e5;
const at = (date, time) => new Date(`${date}T${time || '09:00'}:00+05:30`);
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtDay = (d) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
const topicPaper = (name) => (/listen/i.test(name) ? 'Listening' : /practical/i.test(name) ? 'Practical' : /oral/i.test(name) ? 'Oral' : 'Theory');

/** Every exam paper: date, time, length, syllabus and how he's doing in it. */
export default function Schedule() {
  const { data, d, isParent } = useStore();
  const [open, setOpen] = useState({});
  const now = new Date();
  const goal = (s) => (Number.isFinite(s.goal_pct) ? s.goal_pct : 80);

  // One row per paper; the combined Science practical (same slot for Physics, Chemistry, Biology) becomes one row.
  const rows = [];
  for (const s of d.active) {
    for (const p of s.papers || []) {
      if (p.combined) {
        const ex = rows.find((r) => r.combined === p.combined && r.p.date === p.date);
        if (ex) { ex.subjects.push(s); continue; }
        rows.push({ key: `${p.combined}-${p.date}`, combined: p.combined, subjects: [s], p, when: at(p.date, p.time) });
      } else rows.push({ key: `${s.id}-${p.name}`, subjects: [s], p, when: at(p.date, p.time) });
    }
  }
  rows.sort((a, b) => a.when - b.when);
  const byDay = rows.reduce((m, r) => { (m[r.p.date] = m[r.p.date] || []).push(r); return m; }, {});
  const next = rows.find((r) => at(r.p.date, r.p.end || r.p.time) > now);
  const daysTo = next ? Math.ceil((new Date(next.p.date + 'T00:00:00+05:30') - new Date(now.toDateString())) / DAY) : null;

  function scoreCell(r) {
    if (r.combined) return <span className="tiny dim">no practice paper yet</span>;
    const s = r.subjects[0]; const sc = subjectScore(data, s.id); const g = goal(s);
    const kind = topicPaper(r.p.name);
    const v = kind === 'Listening' ? sc.listening : kind === 'Theory' ? sc.avg : null;
    if (kind === 'Oral' || kind === 'Practical') return <span className="tiny dim">not practised here</span>;
    if (v == null) return <span className="tiny dim">{kind === 'Listening' ? 'try a listening practice' : 'no paper marked yet'}</span>;
    const c = v < g ? 'var(--danger)' : v >= 90 ? 'var(--gold)' : 'var(--ok)';
    return <span><b style={{ color: c, fontSize: '1.15rem' }}>{v}%</b> <span className="tiny dim">{v >= g ? '✓ goal' : `goal ${g}%`}</span></span>;
  }

  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <div className="row between no-print">
        <h1>🗓️ Exam schedule</h1>
        <button className="btn ghost sm" onClick={() => window.print()}>🖨️ Print</button>
      </div>
      <p className="muted">Grade 6A · Term 1 exams. Times are from the school timetable. The % is {isParent ? "Dhruv's" : 'your'} current score in that subject (papers 80% + recent pop quizzes 20%).</p>

      {next && (
        <div className="card glow mt" style={{ '--c': next.subjects[0].color }}>
          <div className="row between">
            <div>
              <div className="tiny dim">NEXT EXAM</div>
              <h2 style={{ margin: '4px 0' }}>{next.subjects.map((s) => s.emoji).join('')} {next.combined || `${next.subjects[0].name} ${next.p.name}`}</h2>
              <div>{fmtDay(next.when)} · {fmtTime(next.p.time)}{next.p.end ? `–${fmtTime(next.p.end)}` : ''}{next.p.report ? ` · report by ${fmtTime(next.p.report)}` : ''}</div>
            </div>
            <div className="stat"><b>{daysTo <= 0 ? 'Today' : daysTo === 1 ? 'Tomorrow' : daysTo}</b><span>{daysTo > 1 ? 'days to go' : ''}</span></div>
          </div>
        </div>
      )}

      {Object.entries(byDay).map(([date, list]) => {
        const day = at(date, '23:59'); const past = day < now;
        return (
          <div key={date} className="card mt" style={{ opacity: past ? 0.55 : 1 }}>
            <h3 style={{ marginBottom: 8 }}>{fmtDay(at(date))}{past ? ' · done' : ''}</h3>
            <div className="col" style={{ gap: 10 }}>
              {list.map((r) => {
                const s = r.subjects[0];
                const kind = topicPaper(r.p.name);
                const topics = data.topics.filter((t) => r.subjects.some((x) => x.id === t.subject_id) && (t.paper || 'Theory') === kind);
                const isOpen = open[r.key];
                return (
                  <div key={r.key} className="sched-row" style={{ '--c': s.color }}>
                    <div className="sched-time">
                      <b>{fmtTime(r.p.time)}</b>{r.p.end && <span className="tiny dim">to {fmtTime(r.p.end)}</span>}
                      {r.p.report && <span className="tiny dim">report {fmtTime(r.p.report)}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div><b>{r.subjects.map((x) => x.emoji).join('')} {r.combined ? 'Science: Approaches to Practical' : s.name}</b> <span className="pill">{r.combined ? r.subjects.map((x) => x.name).join(' + ') : r.p.name}</span></div>
                      <div className="small muted">⏱ {r.p.duration} · {r.p.marks} marks{r.p.notes ? ` · ${r.p.notes}` : ''}</div>
                      <button className="btn ghost sm mt no-print" onClick={() => setOpen({ ...open, [r.key]: !isOpen })}>{isOpen ? '▾' : '▸'} Syllabus ({topics.length || '—'})</button>
                      <ul className={`small sched-syl ${isOpen ? '' : 'print-only'}`}>
                        {topics.length ? topics.map((t) => {
                          const m = d.readiness[t.subject_id]?.mastery?.[t.code];
                          return <li key={t.subject_id + t.code}>{r.combined ? `${data.subjects.find((x) => x.id === t.subject_id)?.emoji} ` : ''}{t.name}{m?.mastery != null && <span className="tiny" style={{ color: m.mastery < 60 ? 'var(--danger)' : 'var(--muted)' }}> · {Math.round(m.mastery)}%</span>}</li>;
                        }) : <li>{kind === 'Oral' ? 'Speaking: conversation on familiar Grade 6 topics (see the Spanish syllabus).' : 'See the school syllabus.'}</li>}
                      </ul>
                    </div>
                    <div className="sched-score">{scoreCell(r)}{!r.combined && <a className="tiny no-print" href={isParent ? `#/scores/${s.id}` : `#/world/${s.id}`}>{isParent ? 'scores →' : 'practise →'}</a>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
