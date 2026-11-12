import React, { useState } from 'react';
import GoalChart from './Goal.jsx';
import { useStore, Ring, Bar, Empty, LevelPill, CancelPaper, go } from '../common.jsx';
import { fmtDate, fmtDateTime, pct, scoreColor } from '../lib.js';
import { RANKS, xpForLevel } from '../../../supabase/functions/_shared/scoring.js';
import { STUDENT_NAME } from '../config.js';
import { QuizLauncher } from './Quiz.jsx';

export function PlayerCard() {
  const { me, d } = useStore();
  const L = d.level;
  return (
    <div className="card glow" style={{ '--c': L.rank.color }}>
      <div className="player">
        <div className="avatar" style={{ '--rank': L.rank.color }}>{me.avatar || '🦊'}</div>
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 16 }}>
            <div><div className="tiny muted" style={{ fontWeight: 800 }}>LEVEL</div><div className="lvl">{L.level}</div></div>
            <div>
              <div className="rank" style={{ '--rank': L.rank.color }}>{L.rank.icon} {L.rank.name}</div>
              <div className="small muted">{L.nextRank ? `${L.nextRank.icon} ${L.nextRank.name} at level ${L.nextRank.min}` : 'Max stage reached'}</div>
            </div>
            <div className="spacer" />
            <div className="row" style={{ gap: 22 }}>
              <div className="stat"><b>{d.totalXp.toLocaleString()}</b><span>Total XP</span></div>
              <div className="stat"><b>{d.streak.days}🔥</b><span>Day streak</span></div>
              <div className="stat"><b>{d.stats.papers}</b><span>Papers</span></div>
            </div>
          </div>
          <Bar value={L.pct * 100} kind="xp" thick />
          <div className="small muted">{L.into} / {L.need} XP to level {L.level + 1}</div>
        </div>
      </div>
    </div>
  );
}

export function HQ() {
  const { data, d } = useStore();
  const next = d.nextExams[0];
  const days = next ? Math.ceil((next.at - new Date()) / 864e5) : null;
  const recent = data.xp.slice(0, 6);
  return (
    <div className="wrap">
      <div className="row between mb" style={{ marginTop: 8 }}>
        <h1>Welcome back, {STUDENT_NAME} 👋</h1>
        <div className="row">
          <a className="btn purple" href="#/answers">📸 Upload answers</a>
        </div>
      </div>
      <PlayerCard />
      <GoalChart />
      <PendingPapers />
      <div className="mt"><QuizLauncher /></div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="row between"><h3>⚔️ Today's quests</h3>{!d.streak.today && <span className="pill warn">Keep your streak alive!</span>}</div>
          <div className="col mt" style={{ gap: 10 }}>
            {d.quests.map((q) => (
              <a key={q.id} href={q.link || '#/'} className="row" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, background: q.done ? 'rgba(61,220,151,.12)' : 'rgba(255,255,255,.04)', border: `2px solid ${q.done ? 'rgba(61,220,151,.5)' : 'var(--line)'}` }}>
                <span style={{ fontSize: 24 }}>{q.done ? '✅' : q.icon}</span>
                <b style={{ flex: 1, textDecoration: q.done ? 'line-through' : 'none' }}>{q.text}</b>
                <span className="pill gold">{q.reward}</span>
              </a>
            ))}
          </div>
        </div>
        <div className="card glow" style={{ '--c': '#ff5c7a' }}>
          <h3>👹 Next boss battle</h3>
          {next ? (
            <div className="row mt" style={{ gap: 18 }}>
              <div style={{ fontSize: 56 }}>{next.subject.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--head)', fontWeight: 800, fontSize: '1.4rem' }}>{next.subject.name} — {next.name}</div>
                <div className="muted">{fmtDate(next.at)} · {next.time} · {next.marks} marks</div>
                <div className="mt"><Bar value={100 - d.readiness[next.subject.id].preparedness} kind="hp" /></div>
                <div className="small muted mt" style={{ marginTop: 6 }}>Boss HP {100 - d.readiness[next.subject.id].preparedness}% — practise to drain it</div>
              </div>
              <div style={{ textAlign: 'center' }}><div className="bigscore" style={{ fontSize: '3rem' }}>{days}</div><div className="small muted">days</div></div>
            </div>
          ) : <p className="muted">No upcoming exams on the calendar.</p>}
          {next && <button className="btn red mt" onClick={() => go(`#/world/${next.subject.id}`)}>Train for it →</button>}
        </div>
      </div>

      <h2 className="mt2 mb">🌍 Worlds</h2>
      <div className="grid g3">
        {d.ranked.map(({ s, r }) => (
          <div key={s.id} className="card click world" style={{ '--c': s.color }} onClick={() => go(`#/world/${s.id}`)}>
            <div className="row between">
              <div className="emoji">{s.emoji}</div>
              <Ring value={r.hasData ? r.predicted : null} color={s.color} label={r.hasData ? `${r.predicted}%` : '?'} />
            </div>
            <div className="name mt">{s.name}</div>
            <div className="small muted">{s.world_name}</div>
            <div className="row mt small" style={{ gap: 8 }}>
              {r.daysToExam != null && <span className={`pill ${r.daysToExam <= 5 ? 'bad' : r.daysToExam <= 12 ? 'warn' : ''}`}>⏳ {r.daysToExam}d</span>}
              <span className="pill">{['foundational', 'challenging', 'godmode'].map((lv) => {
                const b = r.ladder.find((x) => x.level === lv).best;
                return b == null ? '☆' : b >= 60 ? '★' : '✩';
              }).join('')}</span>
              {!r.hasData && <span className="pill gold">New!</span>}
            </div>
            <div className="mt" style={{ marginTop: 10 }}><Bar value={100 - r.preparedness} kind="hp" title="Boss HP" /></div>
          </div>
        ))}
      </div>

      <div className="grid g2 mt2">
        <div className="card">
          <div className="row between"><h3>⚡ Recent XP</h3><a className="small muted" href="#/trophies">All trophies →</a></div>
          {recent.length ? (
            <div className="mt">{recent.map((e) => (
              <div key={e.id} className="xpline"><span>{e.reason}</span><b style={{ color: 'var(--gold)' }}>+{e.amount}</b></div>
            ))}</div>
          ) : <p className="muted">Finish your first paper to start earning XP.</p>}
        </div>
        <div className="card">
          <h3>🏆 Trophies ({d.achievements.filter((a) => a.got).length}/{d.achievements.length})</h3>
          <div className="row mt" style={{ gap: 10 }}>
            {d.achievements.map((a) => (
              <span key={a.id} title={`${a.name}: ${a.desc}`} style={{ fontSize: 32, filter: a.got ? 'none' : 'grayscale(1) opacity(.3)' }}>{a.icon}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Trophies() {
  const { d, data } = useStore();
  return (
    <div className="wrap">
      <h1 className="mb">🏆 Trophy room</h1>
      <PlayerCard />
      <h2 className="mt2 mb">Stages</h2>
      <div className="grid g4">
        {RANKS.map((r) => (
          <div key={r.name} className="card flat" style={{ opacity: d.level.level >= r.min ? 1 : 0.45, borderColor: d.level.rank.name === r.name ? r.color : undefined }}>
            <div style={{ fontSize: 36 }}>{r.icon}</div>
            <h3 style={{ color: r.color }}>{r.name}</h3>
            <div className="small muted">From level {r.min}</div>
          </div>
        ))}
      </div>
      <h2 className="mt2 mb">Achievements</h2>
      <div className="grid g3">
        {d.achievements.map((a) => (
          <div key={a.id} className="card flat row" style={{ opacity: a.got ? 1 : 0.5 }}>
            <span style={{ fontSize: 40, filter: a.got ? 'none' : 'grayscale(1)' }}>{a.icon}</span>
            <div><h3>{a.name}</h3><div className="small muted">{a.desc}</div></div>
            {a.got && <span className="pill ok" style={{ marginLeft: 'auto' }}>Unlocked</span>}
          </div>
        ))}
      </div>
      <h2 className="mt2 mb">XP history</h2>
      <div className="card">
        {data.xp.length ? data.xp.slice(0, 60).map((e) => (
          <div key={e.id} className="xpline"><span>{e.reason} <span className="tiny dim">· {fmtDateTime(e.created_at)}</span></span><b style={{ color: 'var(--gold)' }}>+{e.amount}</b></div>
        )) : <p className="muted">Nothing yet.</p>}
        <p className="tiny dim mt">Level {d.level.level + 1} needs {xpForLevel(d.level.level)} XP in total for this level. Harder papers and fixing mistakes pay the most XP.</p>
      </div>
    </div>
  );
}

export function Mistakes() {
  const { d, data, api, notify } = useStore();
  const [busy, setBusy] = useState(false);
  const groups = {};
  for (const m of d.mistakes) (groups[m.attempt.id] = groups[m.attempt.id] || { attempt: m.attempt, items: [] }).items.push(m);
  const subj = (id) => data.subjects.find((s) => s.id === id);
  const exam = (id) => data.exams.find((e) => e.id === id);

  async function fix(g) {
    setBusy(true);
    try {
      const a = await api.createAttempt({ exam_id: g.attempt.exam_id, subject_id: g.attempt.subject_id, mode: 'retry', level: g.attempt.level,
        question_ids: g.items.map((m) => m.qid), retry_of: g.attempt.id });
      go(`#/play/${a.id}`);
    } catch (e) { notify(e.message, true); setBusy(false); }
  }

  return (
    <div className="wrap">
      <h1>🛠️ Mistake notebook</h1>
      <p className="muted">Every question you lost marks on lives here until you get it fully right. Each fix = <b style={{ color: 'var(--gold)' }}>+15 XP</b>.</p>
      {!d.mistakes.length && <Empty icon="✨" title="No open mistakes">Finish a paper and anything you miss shows up here.</Empty>}
      <div className="col mt" style={{ gap: 16 }}>
        {Object.values(groups).map((g) => {
          const s = subj(g.attempt.subject_id);
          return (
            <div key={g.attempt.id} className="card" style={{ '--c': s?.color }}>
              <div className="row between">
                <div className="row"><span style={{ fontSize: 28 }}>{s?.emoji}</span><div><h3>{exam(g.attempt.exam_id)?.title || s?.name}</h3><div className="small muted">{fmtDate(g.attempt.graded_at)} · {g.items.length} to fix</div></div></div>
                <button className="btn" disabled={busy} onClick={() => fix(g)}>Fix these ({g.items.length}) →</button>
              </div>
              <div className="col mt" style={{ gap: 8 }}>
                {g.items.map((m) => (
                  <div key={m.qid} className="row small" style={{ gap: 8 }}>
                    <span className={`pill ${m.verdict === 'partial' ? 'warn' : 'bad'}`}>Q{m.number} · {m.awarded}/{m.max}</span>
                    <span className="muted">{m.feedback}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { pct, scoreColor, LevelPill };

function pendingPapers(data) {
  return data.attempts.filter((a) => a.status === 'in_progress' && a.mode === 'paper');
}

/** Big, obvious reminder on HQ: papers he has started (printed) but not uploaded yet. */
export function PendingPapers() {
  const { data } = useStore();
  const list = pendingPapers(data);
  if (!list.length) return null;
  return (
    <div className="card glow mt" style={{ '--c': '#a78bfa' }}>
      <div className="row between">
        <div><h3>📸 Waiting for your answers ({list.length})</h3><div className="small muted">Finished on paper? Photograph the pages and upload them here to get marked and earn your XP.</div></div>
      </div>
      <div className="col mt" style={{ gap: 10 }}>
        {list.map((a) => <PendingRow key={a.id} a={a} />)}
      </div>
    </div>
  );
}

function PendingRow({ a }) {
  const { data } = useStore();
  const e = data.exams.find((x) => x.id === a.exam_id);
  const s = data.subjects.find((x) => x.id === a.subject_id);
  return (
    <div className="row between" style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '2px solid var(--line)' }}>
      <div className="row"><span style={{ fontSize: 26 }}>{s?.emoji}</span><div><b>{e?.title || s?.name}</b> <LevelPill level={a.level} /><div className="tiny dim">Started {fmtDate(a.started_at)} · {e?.total_marks} marks</div></div></div>
      <div className="row">
        <a className="btn ghost sm" href={`#/print/${a.exam_id}`}>🖨️ Reprint</a>
        <a className="btn gold" href={`#/paper/${a.id}`}>📸 Upload answers</a>
        <CancelPaper attempt={a} after={window.location.hash || '#/'} label="🗑️ Cancel" />
      </div>
    </div>
  );
}

/** One place for every upload: started papers + any other written paper. */
export function Answers() {
  const { data } = useStore();
  const list = pendingPapers(data);
  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <h1>📸 Upload answers</h1>
      <div className="card mt">
        <h3>Practice papers you've started</h3>
        <p className="small muted">Pick the paper, then add a photo of each answer page.</p>
        {list.length ? <div className="col mt" style={{ gap: 10 }}>{list.map((a) => <PendingRow key={a.id} a={a} />)}</div>
          : <p className="muted">None waiting. Start a paper from any world: Foundational, Challenging, God-mode or a topic drill.</p>}
      </div>
      <div className="card mt">
        <h3>Any other written paper</h3>
        <p className="small muted">A school worksheet, class test or past paper you did by hand. Photograph the questions and your answers.</p>
        <a className="btn purple" href="#/upload">📄 Upload a different paper</a>
      </div>
    </div>
  );
}
