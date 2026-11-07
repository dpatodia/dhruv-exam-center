import React, { useEffect, useState, createContext, useContext } from 'react';

export const Store = createContext(null);
export const useStore = () => useContext(Store);

export function Ring({ value, color, big, label }) {
  return (
    <div className={`ring${big ? ' big' : ''}`} style={{ '--p': value ?? 0, '--c': color }}>
      <div>{label ?? (value == null ? '?' : `${value}`)}</div>
    </div>
  );
}

export function Bar({ value, color, kind, thick, title }) {
  return (
    <div className={`bar ${kind || ''} ${thick ? 'thick' : ''}`} title={title}>
      <i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, '--c': color }} />
    </div>
  );
}

export function Spinner({ messages = ['Loading…'] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % messages.length), 2200); return () => clearInterval(t); }, [messages.length]);
  return (
    <div className="loading">
      <div className="spinner" />
      <div className="muted" style={{ fontWeight: 700 }}>{messages[i]}</div>
    </div>
  );
}

export function Modal({ children, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal pop" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Empty({ icon = '🗺️', title, children }) {
  return (
    <div className="card flat" style={{ textAlign: 'center', padding: 30 }}>
      <div style={{ fontSize: 44 }}>{icon}</div>
      <h3 className="mt">{title}</h3>
      {children && <div className="muted mt">{children}</div>}
    </div>
  );
}

export function LevelPill({ level }) {
  const map = { foundational: ['🟢 Foundational', 'ok'], challenging: ['🟠 Challenging', 'warn'], godmode: ['🔴 God-mode', 'bad'], drill: ['🎯 Drill', ''], school: ['🏫 School', 'gold'], external: ['📸 Uploaded', 'gold'], quiz: ['⚡ Pop quiz', 'gold'], listening: ['🎧 Listening', 'gold'] };
  const [t, c] = map[level] || [level, ''];
  return <span className={`pill ${c}`}>{t}</span>;
}

export function go(hash) { window.location.hash = hash; }

const CANCEL_REASONS = [
  "Haven't learnt these topics yet",
  'Started the wrong paper by mistake',
  'Something is wrong with the paper',
  'No time now, will take a fresh one later',
];

/** Cancel an unfinished paper. A reason is required; the parent sees every cancelled paper and why.
 *  The paper itself goes back on the shelf as a ready-made paper. */
export function CancelPaper({ attempt, small = true, after = '#/', label = '🗑️ Cancel paper' }) {
  const { api, notify, reload, isParent } = useStore();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const reason = pick === 'other' ? other.trim() : pick;
  async function confirm() {
    setBusy(true);
    try {
      await api.cancelAttempt(attempt.id, reason);
      await reload(); setOpen(false);
      notify('Paper cancelled. It is back on the shelf if you want it later.');
      go(after);
    } catch (e) { notify(e.message, true); }
    setBusy(false);
  }
  return (
    <>
      <button className={`btn ghost ${small ? 'sm' : ''}`} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal onClose={() => !busy && setOpen(false)}>
          <h3>Cancel this paper?</h3>
          <p className="small muted">It will disappear from the unfinished papers and won't count towards scores or predictions. Any photos already added will not be marked. The paper stays available as a ready-made paper, so it can be started again later.{!isParent && ' Your parent will see that it was cancelled and why.'}</p>
          <b>Why are you cancelling it?</b>
          <div className="col mt" style={{ gap: 6 }}>
            {CANCEL_REASONS.map((r) => (
              <label key={r} className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="cancel-reason" checked={pick === r} onChange={() => setPick(r)} /> {r}
              </label>
            ))}
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="cancel-reason" checked={pick === 'other'} onChange={() => setPick('other')} /> Something else
            </label>
            {pick === 'other' && <textarea rows={2} autoFocus placeholder="Type the reason" value={other} onChange={(e) => setOther(e.target.value)} />}
          </div>
          <div className="row mt">
            <button className="btn red" disabled={!reason || busy} onClick={confirm}>{busy ? 'Cancelling…' : 'Yes, cancel the paper'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>Keep it</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Question text with simple pipe tables ("a | b | c" on 2+ consecutive lines) drawn as real tables. */
export function RichText({ text, style }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  for (const l of lines) {
    if (/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-')) continue; // markdown |---| separator
    const isRow = (l.match(/\|/g) || []).length >= 1 && l.trim().length > 2;
    const last = blocks[blocks.length - 1];
    if (isRow && last?.t === 'table') last.rows.push(l);
    else if (isRow) blocks.push({ t: 'table', rows: [l] });
    else if (last?.t === 'text') last.lines.push(l);
    else blocks.push({ t: 'text', lines: [l] });
  }
  return (
    <div style={style}>
      {blocks.map((b, i) => (b.t === 'table' && b.rows.length >= 2) ? (
        <table key={i} className="qtable">
          <tbody>{b.rows.map((r, j) => <tr key={j}>{r.replace(/^\s*\||\|\s*$/g, '').split('|').map((c, k) => <td key={k}>{c.trim()}</td>)}</tr>)}</tbody>
        </table>
      ) : <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{(b.lines || b.rows).join('\n')}</div>)}
    </div>
  );
}
