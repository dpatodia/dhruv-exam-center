import React, { useState } from 'react';
import { useStore, Ring, Bar, Spinner, Modal, Empty, LevelPill, CancelPaper, go } from '../common.jsx';
import { fmtDate, pct, scoreColor, GEN_MESSAGES, LEVELS } from '../lib.js';
import { unlocks } from '../../../supabase/functions/_shared/scoring.js';
import { HandoutList } from './Parent.jsx';
import { SubjectQuiz } from './Quiz.jsx';
import { ListeningCard } from './Listening.jsx';

const LADDER = [
  { level: 'foundational', icon: '🟢', name: 'Foundational', blurb: 'Warm-up. Know the basics cold.', c: '#3ddc97' },
  { level: 'challenging', icon: '🟠', name: 'Challenging', blurb: 'Real exam difficulty.', c: '#ffa94d' },
  { level: 'godmode', icon: '🔴', name: 'God-mode', blurb: 'Top-of-class stretch. Brutal.', c: '#ff5c7a' },
];

export default function World({ sid, tab: tab0 }) {
  const store = useStore();
  const { data, d, isParent, api, notify, reload } = store;
  const s = data.subjects.find((x) => x.id === sid);
  const [tab, setTab] = useState(tab0 || 'map');
  const [picker, setPicker] = useState(null); // {level, focus}
  const [busy, setBusy] = useState(false);
  if (!s) return <div className="wrap"><Empty title="World not found" /></div>;
  const r = d.readiness[s.id];
  const topics = data.topics.filter((t) => t.subject_id === s.id);
  const exams = data.exams.filter((e) => e.subject_id === s.id && !e.retired_at); // retired = replaced by a newer version
  const attempts = data.attempts.filter((a) => a.subject_id === s.id);
  const un = unlocks(r.ladder, data.settings?.unlock_all);
  const playedExamIds = new Set(attempts.filter((a) => a.mode !== 'retry').map((a) => a.exam_id));

  async function generate(level, focus = [], marks) {
    setBusy(true);
    try {
      const { exam_id } = await api.generateExam({ subject_id: s.id, level, focus_topics: focus, marks });
      await reload();
      go(`#/exam/${exam_id}`);
    } catch (e) { notify(e.message, true); setBusy(false); }
  }

  if (busy) return <div className="wrap"><Spinner messages={GEN_MESSAGES} /><p className="muted" style={{ textAlign: 'center' }}>Writing a fresh paper takes about 30–90 seconds.</p></div>;

  return (
    <div className="wrap" style={{ '--c': s.color }}>
      <a className="small muted" href="#/">← {isParent ? 'Overview' : 'HQ'}</a>
      <div className="card glow mt" style={{ '--c': s.color }}>
        <div className="row" style={{ gap: 20 }}>
          <div style={{ fontSize: 64 }}>{s.emoji}</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1>{s.name}</h1>
            <div className="muted">{s.world_name} · {s.term}</div>
            <div className="row mt small">
              {(s.papers || []).map((p) => <span key={p.name} className="pill">📅 {p.name}: {fmtDate(p.date)} · {p.marks}m</span>)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Ring big value={r.predicted} color={s.color} label={r.hasData ? `${r.predicted}%` : '?'} />
            <div className="small muted mt" style={{ marginTop: 6 }}>Predicted {r.hasData ? `${r.low}–${r.high}%` : '— needs one marked paper, play a paper'}</div>
            <span className={`pill ${r.confidenceLabel === 'high' ? 'ok' : r.confidenceLabel === 'medium' ? 'warn' : 'bad'}`}>{r.confidenceLabel} confidence</span>
          </div>
        </div>
        <div className="mt">
          <div className="row between small"><b>👹 Boss HP</b><span className="muted">{r.daysToExam != null ? `Boss fight in ${r.daysToExam} days` : 'Exam done'}</span></div>
          <div style={{ marginTop: 6 }}><Bar value={100 - r.preparedness} kind="hp" thick /></div>
          <div className="tiny dim" style={{ marginTop: 6 }}>Boss HP drops as your scores, topic coverage, paper ladder and recent practice go up.</div>
        </div>
      </div>

      <div className="tabs mt2">
        {[['map', '🗺️ Quest map'], ['skills', '📊 Skills'], ['papers', '📜 Papers'], ['notes', '📒 Cliff notes'], ...(isParent ? [['handouts', '📚 Handouts']] : [])].map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </div>

      {tab === 'map' && (
        <div>
          <div className="ladder">
            {LADDER.map((L) => {
              const best = r.ladder.find((x) => x.level === L.level).best;
              const open = un[L.level];
              return (
                <div key={L.level} className={`node ${open ? 'open' : 'locked'}`} style={{ '--c': L.c }}>
                  <div className="big-ico">{open ? L.icon : '🔒'}</div>
                  <h3>{L.name}</h3>
                  <div className="small muted">{L.blurb}</div>
                  <div className="stars mt">{best == null ? '☆☆☆' : best >= 85 ? '★★★' : best >= 70 ? '★★☆' : best >= 50 ? '★☆☆' : '☆☆☆'}</div>
                  <div className="small">{best == null ? 'Not played' : `Best ${Math.round(best)}%`}</div>
                  <div className="small" style={{ color: 'var(--gold)', fontWeight: 800 }}>up to {LEVELS[L.level].xp + (L.level === 'godmode' ? 100 : 0)} XP</div>
                  {open && !isParent && <button className="btn sm mt" style={{ '--c': L.c }} onClick={async () => { setPicker({ level: L.level, loading: true }); try { await reload(); } catch { /* show what we have */ } setPicker({ level: L.level }); }}>Play</button>}
                  {!open && <div className="tiny dim mt">{L.level === 'challenging' ? 'Unlocks after any Foundational paper' : 'Unlocks at 60%+ on Challenging'}</div>}
                </div>
              );
            })}
          </div>
          {!isParent && <div className="mt"><SubjectQuiz subject={s} /></div>}
          {!isParent && (s.papers || []).some((p) => /listen/i.test(p.name)) && <div className="mt"><ListeningCard subject={s} /></div>}
          {!isParent && (
            <div className="grid g2 mt">
              <div className="card">
                <h3>🎯 Topic drill</h3>
                <p className="muted small">A short 20-mark set on just the topics you pick. Best for weak spots.</p>
                <DrillPicker topics={topics} r={r} onGo={(focus) => generate('drill', focus, 20)} />
              </div>
              <div className="card">
                <h3>📸 Mark a written paper</h3>
                <p className="muted small">Did a school worksheet or past paper by hand? Upload photos and get it marked with explanations.</p>
                <a className="btn purple" href={`#/upload?s=${s.id}`}>Upload photos →</a>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'skills' && (
        <div className="card">
          <div className="row between"><h3>Skill tree</h3><span className="small muted">Mastery · confidence (how much evidence)</span></div>
          <div className="col mt" style={{ gap: 14 }}>
            {topics.map((t) => {
              const m = r.mastery[t.code];
              const v = m.mastery == null ? null : Math.round(m.mastery);
              return (
                <div key={t.code} className="row" style={{ gap: 12, alignItems: 'center' }}>
                  <span className="pill mono" style={{ minWidth: 52, justifyContent: 'center' }}>{t.code}</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div className="row between small"><b>{t.name}</b><span style={{ color: scoreColor(v), fontWeight: 800 }}>{v == null ? 'untested' : `${v}%`}{m.trend ? ` ${m.trend > 0 ? '▲' : '▼'}` : ''}</span></div>
                    <div style={{ marginTop: 6 }}><Bar value={v ?? 0} color={scoreColor(v)} /></div>
                    <div className="tiny dim" style={{ marginTop: 4 }}>{t.paper} · weight {t.weight} · {m.evidence} marks of evidence · confidence {Math.round(m.confidence * 100)}%</div>
                  </div>
                  <a className="btn ghost sm" href={`#/lesson/${s.id}/${t.code}`}>⚡ Power-up</a>
                  {!isParent && <button className="btn sm" onClick={() => generate('drill', [t.code], 15)}>Drill</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'papers' && (
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <h3>Your attempts</h3>
            {attempts.length ? (
              <div className="table-scroll mt"><table>
                <thead><tr><th>Date</th><th>Paper</th><th>Mode</th><th>Score</th><th>XP</th><th /></tr></thead>
                <tbody>{attempts.map((a) => {
                  const e = data.exams.find((x) => x.id === a.exam_id);
                  return (
                    <tr key={a.id}>
                      <td>{fmtDate(a.started_at)}</td>
                      <td>{e?.title || 'Uploaded paper'} <LevelPill level={a.level} /></td>
                      <td className="small">{a.mode}</td>
                      <td>{a.status === 'graded' ? <b style={{ color: scoreColor(pct(a)) }}>{a.score}/{a.total} ({pct(a)}%)</b> : <span className="pill">{a.status.replace('_', ' ')}</span>}</td>
                      <td style={{ color: 'var(--gold)' }}>{a.xp_awarded ? `+${a.xp_awarded}` : ''}</td>
                      <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>{a.status === 'in_progress' && !isParent
                        ? <a className="btn sm" href={`#/${a.mode === 'paper' ? 'paper' : 'play'}/${a.id}`}>{a.mode === 'paper' ? '📸 Upload answers' : 'Resume'}</a>
                        : <a className="btn ghost sm" href={`#/result/${a.id}`}>View</a>}
                        {['in_progress', 'error'].includes(a.status) && <CancelPaper attempt={a} after={`#/world/${s.id}?tab=papers`} label="🗑️ Cancel" />}</div></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            ) : <p className="muted">No attempts yet.</p>}
          </div>
          <div className="card">
            <h3>Paper library</h3>
            <div className="col mt" style={{ gap: 8 }}>
              {exams.length ? exams.map((e) => (
                <div key={e.id} className="row between">
                  <div><b>{e.title}</b> <LevelPill level={e.level} /> <span className="small muted">{e.total_marks} marks · {fmtDate(e.created_at)}</span>{!playedExamIds.has(e.id) && <span className="pill gold" style={{ marginLeft: 6 }}>unplayed</span>}</div>
                  <div className="row">
                    <a className="btn ghost sm" href={`#/print/${e.id}`}>🖨️ Print</a>
                    {isParent && <a className="btn ghost sm" href={`#/print/${e.id}?key=1`}>🔑 Mark scheme</a>}
                    {!isParent && <a className="btn sm" href={`#/exam/${e.id}`}>Start</a>}
                  </div>
                </div>
              )) : <p className="muted">No papers yet — play a level on the quest map.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'handouts' && isParent && <HandoutList subject={s} />}
      {tab === 'notes' && <div className="card"><h3>📒 {s.name} cliff notes</h3><p className="small muted">A short revision pack for every topic, with your weak spots flagged 🔥.</p><a className="btn" href={`#/notes/${s.id}`}>Open cliff notes →</a></div>}

      {picker && (
        <Modal onClose={() => setPicker(null)}>
          <h2>{LADDER.find((l) => l.level === picker.level).icon} {LADDER.find((l) => l.level === picker.level).name} · {s.name}</h2>
          {(() => {
            if (picker.loading) return <div className="col mt"><div className="spinner" style={{ margin: '0 auto' }} /><p className="muted small" style={{ textAlign: 'center' }}>Checking for ready-made papers…</p></div>;
            const unplayed = exams.filter((e) => e.level === picker.level && !playedExamIds.has(e.id));
            return (
              <div className="col mt">
                {unplayed.length > 0 && <>
                  <div className="small muted">Ready-made papers you haven't played:</div>
                  {unplayed.map((e) => <a key={e.id} className="btn ghost" href={`#/exam/${e.id}`}>▶ {e.title} · {e.total_marks} marks</a>)}
                  <div className="small muted mt">…or</div>
                </>}
                <button className="btn" style={{ '--c': LADDER.find((l) => l.level === picker.level).c }} onClick={() => { setPicker(null); generate(picker.level); }}>
                  ✨ Generate a brand-new {s.practice_marks}-mark paper
                </button>
                <div className="tiny dim">Claude writes it from the syllabus{data.handouts.some((h) => h.subject_id === s.id && h.status === 'ready') ? ' and your school handouts' : ''}, aiming more marks at your weak topics.</div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

function DrillPicker({ topics, r, onGo }) {
  const weakest = r.weakest.slice(0, 2).map((t) => t.code);
  const [sel, setSel] = useState(weakest);
  const toggle = (c) => setSel((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  return (
    <div>
      <div className="row" style={{ gap: 6 }}>
        {topics.map((t) => (
          <button key={t.code} className={`pill ${sel.includes(t.code) ? 'ok' : ''}`} style={{ cursor: 'pointer' }} onClick={() => toggle(t.code)} title={t.name}>{t.code} {t.name.length > 22 ? t.name.slice(0, 22) + '…' : t.name}</button>
        ))}
      </div>
      <button className="btn mt" disabled={!sel.length} onClick={() => onGo(sel)}>Start drill ({sel.length} topic{sel.length === 1 ? '' : 's'}) →</button>
    </div>
  );
}
