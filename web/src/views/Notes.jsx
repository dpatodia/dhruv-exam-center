import React, { useEffect, useState } from 'react';
import { useStore, Spinner, Empty, go } from '../common.jsx';
import { fmtDate, scoreColor } from '../lib.js';

// Status of each topic from his papers + quizzes. Recomputed every time, so the highlights move as he improves.
function topicStatus(m, mistakes) {
  if (m?.mastery == null) return { key: 'untested', label: 'Not tested yet', icon: '❔', cls: '' };
  if (m.mastery < 60 || mistakes >= 3) return { key: 'focus', label: `Focus area · ${Math.round(m.mastery)}%`, icon: '🔥', cls: 'bad' };
  if (m.mastery < 75) return { key: 'watch', label: `Watch · ${Math.round(m.mastery)}%`, icon: '👀', cls: 'warn' };
  return { key: 'strong', label: `Strong · ${Math.round(m.mastery)}%`, icon: '✅', cls: 'ok' };
}

export function NotesIndex() {
  const { d } = useStore();
  return (
    <div className="wrap">
      <h1>📒 Cliff notes</h1>
      <p className="muted">One revision pack per subject. Topics you're weak on are flagged 🔥 and float to the top — this updates automatically after every paper and quiz.</p>
      <div className="grid g3 mt">
        {d.active.map((s) => {
          const r = d.readiness[s.id];
          const focus = Object.values(r.mastery).filter((m) => m.mastery != null && m.mastery < 60).length;
          return (
            <a key={s.id} className="card click" style={{ '--c': s.color, textDecoration: 'none' }} href={`#/notes/${s.id}`}>
              <div style={{ fontSize: 34 }}>{s.emoji}</div>
              <h3 className="mt">{s.name}</h3>
              <div className="small muted">{r.daysToExam != null ? `Exam in ${r.daysToExam} days` : 'Exams done'}</div>
              {focus > 0 && <span className="pill bad mt">🔥 {focus} focus area{focus > 1 ? 's' : ''}</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function Notes({ sid }) {
  const { api, data, d, notify, isParent } = useStore();
  const [pack, setPack] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focusFirst, setFocusFirst] = useState(true);
  const s = data.subjects.find((x) => x.id === sid);

  async function load(refresh = false) {
    setErr(null); if (refresh) setBusy(true); else setPack(null);
    try { setPack(await api.revision(sid, refresh)); } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  useEffect(() => { load(); }, [sid]);
  if (!s) return <div className="wrap"><Empty title="Subject not found" /></div>;
  const r = d.readiness[sid];
  const topics = data.topics.filter((t) => t.subject_id === sid);

  // His own recent mistakes, per topic
  const mistakesByTopic = {};
  for (const a of d.graded.filter((x) => x.subject_id === sid && x.mode !== 'retry').slice(0, 12)) {
    for (const res of a.results || []) {
      if (res.verdict === 'correct') continue;
      (mistakesByTopic[res.topic] = mistakesByTopic[res.topic] || []).push(res);
    }
  }
  const latestHandout = data.handouts.filter((h) => h.subject_id === sid && h.status === 'ready').reduce((t, h) => Math.max(t, +new Date(h.created_at)), 0);
  const stale = pack?.created_at && latestHandout > +new Date(pack.created_at);

  if (err) return <div className="wrap"><Empty icon="⚠️" title="Couldn't load the cliff notes"><p>{err}</p><button className="btn" onClick={() => load()}>Try again</button></Empty></div>;
  if (!pack) return <div className="wrap"><Spinner messages={['Writing your cliff notes…', 'Squeezing the syllabus onto a few pages…', 'Marking your focus areas…']} /><p className="muted" style={{ textAlign: 'center' }}>The first time takes about a minute; after that it opens instantly.</p></div>;

  const order = { focus: 0, watch: 1, untested: 2, strong: 3 };
  const sections = (pack.notes.sections || []).map((sec) => {
    const t = topics.find((x) => x.code === sec.code);
    const st = topicStatus(r.mastery[sec.code], (mistakesByTopic[sec.code] || []).length);
    return { ...sec, t, st };
  });
  const shown = focusFirst ? [...sections].sort((a, b) => order[a.st.key] - order[b.st.key]) : sections;
  const counts = sections.reduce((c, x) => ({ ...c, [x.st.key]: (c[x.st.key] || 0) + 1 }), {});

  return (
    <div className="wrap notes" style={{ maxWidth: 940, '--c': s.color }}>
      <a className="small muted no-print" href="#/notes">← All cliff notes</a>
      <div className="card glow mt" style={{ '--c': s.color }}>
        <div className="row between">
          <div><div className="small muted">📒 CLIFF NOTES · {s.term}</div><h1>{s.emoji} {pack.notes.title || s.name}</h1>
            <div className="small muted">Exams: {(s.papers || []).map((p) => `${p.name} ${fmtDate(p.date)}`).join(' · ')}</div></div>
          <div className="row no-print">
            <button className="btn sm" onClick={() => window.print()}>🖨️ Print pack</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => load(true)}>{busy ? 'Rewriting…' : '🔄 Rewrite'}</button>
          </div>
        </div>
        <div className="row mt small">
          {counts.focus ? <span className="pill bad">🔥 {counts.focus} focus</span> : null}
          {counts.watch ? <span className="pill warn">👀 {counts.watch} watch</span> : null}
          {counts.untested ? <span className="pill">❔ {counts.untested} not tested</span> : null}
          {counts.strong ? <span className="pill ok">✅ {counts.strong} strong</span> : null}
          <label className="row no-print" style={{ gap: 6, marginLeft: 'auto' }}><input type="checkbox" checked={focusFirst} onChange={(e) => setFocusFirst(e.target.checked)} /> Focus areas first</label>
        </div>
        {stale && <p className="small" style={{ color: 'var(--warn)' }}>New handouts were added after these notes were written — press 🔄 Rewrite to include them.</p>}
      </div>

      {pack.notes.examTips?.length > 0 && (
        <div className="card mt"><h3>🎯 Exam technique</h3><ul>{pack.notes.examTips.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      )}

      {shown.map((sec) => {
        const mine = (mistakesByTopic[sec.code] || []).slice(0, 3);
        return (
          <div key={sec.code} className={`card mt note-sec ${sec.st.key}`} style={sec.st.key === 'focus' ? { borderColor: 'var(--danger)' } : sec.st.key === 'watch' ? { borderColor: 'var(--warn)' } : undefined}>
            <div className="row between">
              <h3><span className="pill mono">{sec.code}</span> {sec.heading || sec.t?.name}</h3>
              <span className={`pill ${sec.st.cls}`}>{sec.st.icon} {sec.st.label}</span>
            </div>
            {mine.length > 0 && (
              <div className="mine mt">
                <b>🔥 Where you lost marks:</b>
                <ul className="small" style={{ margin: '6px 0 0' }}>
                  {mine.map((m, i) => <li key={i}>{m.feedback}{m.correctAnswer ? <> <span className="dim">→ Right answer:</span> {String(m.correctAnswer).slice(0, 160)}</> : null}</li>)}
                </ul>
              </div>
            )}
            <ul className="mt">{(sec.points || []).map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}</ul>
            {sec.rule && <div className="rule mt"><b>Rule / structure:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{sec.rule}</span></div>}
            {sec.keywords?.length > 0 && <div className="mt small"><b>Keywords:</b> {sec.keywords.map((k, i) => <span key={i}><b style={{ color: 'var(--accent2)' }}>{k.term}</b> — {k.meaning}{i < sec.keywords.length - 1 ? ' · ' : ''}</span>)}</div>}
            {sec.traps?.length > 0 && <div className="mt small"><b>🪤 Traps:</b> {sec.traps.join(' · ')}</div>}
            {sec.hook && <div className="mt small"><b>🧠 Remember:</b> {sec.hook}</div>}
            {!isParent && <div className="row mt no-print"><a className="btn ghost sm" href={`#/lesson/${sid}/${sec.code}`}>⚡ Power-up lesson</a></div>}
          </div>
        );
      })}
      <p className="tiny dim mt">Written {pack.created_at ? fmtDate(pack.created_at) : 'today'} from the syllabus{data.handouts.some((h) => h.subject_id === sid && h.status === 'ready') ? ' and your school handouts' : ''}. Focus flags update live from papers and pop quizzes.</p>
    </div>
  );
}
