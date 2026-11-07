import React, { useEffect, useRef, useState } from 'react';
import { useStore, Modal, Spinner } from '../common.jsx';
import { fmtDateTime } from '../lib.js';

/** Message list + input. `send(text)` returns the full updated messages array. */
function ChatBox({ messages, send, placeholder, busyText = 'Thinking…', examiner = false }) {
  const { notify, me } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState(messages || []);
  const end = useRef(null);
  useEffect(() => setMsgs(messages || []), [messages]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length, busy]);
  async function go() {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setText('');
    setMsgs((m) => [...m, { role: 'user', content: t, by: me.id, at: new Date().toISOString() }]);
    try { setMsgs(await send(t)); } catch (e) { notify(e.message, true); setText(t); setMsgs((m) => m.slice(0, -1)); }
    setBusy(false);
  }
  return (
    <div className="chat">
      <div className="chat-log">
        {msgs.length === 0 && !busy && <p className="muted small">{placeholder}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            {(m.changes || []).map((c, j) => (
              <div key={j} className={`pill ${c.new > c.old ? 'ok' : 'bad'} mt`} style={{ display: 'inline-block' }}>
                Q{c.number}: {c.old} → {c.new}/{c.max} marks
              </div>
            ))}
            {m.error && <div className="pill warn mt" style={{ display: 'inline-block' }}>⚠️ Paper problem logged{m.error.number ? ` (Q${m.error.number})` : ''}{m.error.fix ? ` — ${m.error.fix}` : ''}</div>}
            <div className="tiny dim">{m.role === 'assistant' ? (examiner ? 'Examiner' : 'Tutor') : (m.by && m.by !== me.id ? 'Other user' : 'You')} · {fmtDateTime(m.at)}</div>
          </div>
        ))}
        {busy && <div className="chat-msg assistant"><div className="bubble muted">{busyText}</div></div>}
        <div ref={end} />
      </div>
      <div className="row mt" style={{ alignItems: 'flex-end' }}>
        <textarea rows={2} style={{ flex: 1 }} value={text} placeholder="Type your message…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }} />
        <button className="btn" disabled={busy || !text.trim()} onClick={go}>Send</button>
      </div>
    </div>
  );
}

/** On a marked paper: talk to the examiner. The examiner can change marks itself; every change is logged. */
export function ExaminerChat({ attempt, onChanged }) {
  const { api, reload } = useStore();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState(undefined);
  useEffect(() => { if (open && thread === undefined) api.examinerThread(attempt.id).then(setThread).catch(() => setThread(null)); }, [open]);
  async function send(text) {
    const r = await api.chat({ mode: 'examiner', attempt_id: attempt.id, message: text });
    if (r.changes?.length || r.error) { await onChanged?.(); reload(); }
    return r.messages;
  }
  return (
    <div className="card mt no-print">
      <div className="row between">
        <div><h3>💬 Talk to the examiner</h3><div className="small muted">Think a mark is wrong, or the examiner misread your handwriting? Explain here. The examiner re-checks your answer pages and the mark scheme, and changes the mark if you're right. Marks can go down as well as up, and only what's written on the paper counts.</div></div>
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Open chat'}</button>
      </div>
      {open && (thread === undefined ? <Spinner /> :
        <ChatBox examiner messages={thread?.messages || []} send={send} busyText="The examiner is re-checking your paper… (about 30 seconds)"
          placeholder='Say which question and why, e.g. "Q14: I wrote sodium chloride, which is in the mark scheme."' />)}
    </div>
  );
}

/** Report a broken question / answer key (no AI call). */
export function ReportProblem({ examId, attemptId, label = '⚠️ Report a problem with this paper' }) {
  const { api, notify } = useStore();
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { await api.chat({ mode: 'report', exam_id: examId, attempt_id: attemptId, number: num, description: desc }); notify('Thanks, the problem has been logged. Future papers will avoid it.'); setOpen(false); setNum(''); setDesc(''); }
    catch (e) { notify(e.message, true); }
    setBusy(false);
  }
  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal onClose={() => !busy && setOpen(false)}>
          <h3>Report a problem with this paper</h3>
          <p className="small muted">For example: a question is cut off, the answer key looks wrong, a question is about something you weren't taught, or two answers could be right.</p>
          <label className="field">Question number (optional)<input value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. 3(b)" /></label>
          <label className="field">What's wrong?<textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <div className="row mt"><button className="btn" disabled={busy || !desc.trim()} onClick={send}>{busy ? 'Sending…' : 'Send report'}</button><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </Modal>
      )}
    </>
  );
}

/** "Ask the tutor" page: general chat, optionally about one subject. */
export default function TutorChat() {
  const { api, data } = useStore();
  const [threads, setThreads] = useState(null);
  const [cur, setCur] = useState(null); // thread object or {new:true, subject_id}
  const [sid, setSid] = useState('');
  useEffect(() => { api.tutorThreads().then((t) => { setThreads(t); setCur(t[0] || { messages: [] }); }).catch(() => setThreads([])); }, []);
  if (!threads) return <Spinner />;
  async function send(text) {
    const r = await api.chat({ mode: 'tutor', thread_id: cur?.id, subject_id: cur?.id ? undefined : sid || undefined, message: text });
    const t = { ...(cur || {}), id: r.thread_id, messages: r.messages, subject_id: cur?.subject_id ?? (sid || null), title: cur?.title || text.slice(0, 60), updated_at: new Date().toISOString() };
    setCur(t); setThreads((ts) => [t, ...ts.filter((x) => x.id !== t.id)]);
    return r.messages;
  }
  const subj = (id) => data.subjects.find((s) => s.id === id);
  return (
    <div className="wrap" style={{ maxWidth: 1000 }}>
      <h1>💬 Ask the tutor</h1>
      <p className="muted">Ask anything about exam prep: explain a topic, go through a mistake, plan revision. To change a mark, open the marked paper and use "Talk to the examiner".</p>
      <div className="grid chat-grid mt">
        <div className="card">
          <button className="btn sm" onClick={() => setCur({ messages: [] })}>＋ New chat</button>
          <div className="col mt" style={{ gap: 6 }}>
            {threads.map((t) => (
              <button key={t.id} className={`btn ghost sm ${cur?.id === t.id ? 'on' : ''}`} style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => setCur(t)}>
                {subj(t.subject_id)?.emoji || '💬'} {t.title || 'Chat'}
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          {!cur?.id && (
            <label className="field">About which subject? (helps the tutor use your school's handouts)
              <select value={sid} onChange={(e) => setSid(e.target.value)}>
                <option value="">Any / general</option>
                {data.subjects.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
              </select>
            </label>
          )}
          {cur?.id && cur.subject_id && <div className="small muted">{subj(cur.subject_id)?.emoji} {subj(cur.subject_id)?.name}</div>}
          <ChatBox key={cur?.id || 'new'} messages={cur?.messages || []} send={send}
            placeholder='Try: "Explain the difference between an element and a compound", or "Make me a revision plan for Geography".' />
        </div>
      </div>
    </div>
  );
}

/** Parent overview: every mark change and reported paper problem. */
export function ChangesAndErrors() {
  const { api, data, notify } = useStore();
  const [rows, setRows] = useState(null);
  const load = () => api.changesAndErrors().then(setRows).catch(() => setRows({ changes: [], errors: [] }));
  useEffect(() => { load(); }, []);
  if (!rows || (!rows.changes.length && !rows.errors.length)) return null;
  const att = (id) => data.attempts.find((a) => a.id === id);
  const sub = (id) => data.subjects.find((s) => s.id === id);
  const who = (id) => data.profiles?.find((p) => p.id === id)?.display_name || '—';
  return (
    <div className="card mt">
      <h3>🧑‍⚖️ Mark changes and paper problems</h3>
      {rows.changes.length > 0 && <div className="table-scroll mt"><table>
        <thead><tr><th>When</th><th>Paper</th><th>Q</th><th>Change</th><th>Asked by</th><th>Examiner's reason</th></tr></thead>
        <tbody>{rows.changes.map((c) => { const a = att(c.attempt_id); return (
          <tr key={c.id}><td className="small">{fmtDateTime(c.created_at)}</td><td>{sub(a?.subject_id)?.emoji} <a href={`#/result/${c.attempt_id}`}>{sub(a?.subject_id)?.name || 'Paper'}</a></td><td>{c.number}</td>
            <td><b style={{ color: c.new_awarded > c.old_awarded ? 'var(--ok)' : 'var(--danger)' }}>{c.old_awarded} → {c.new_awarded}</b>/{c.max}</td><td className="small">{who(c.requested_by)}</td><td className="small">{c.reason}</td></tr>); })}</tbody>
      </table></div>}
      {rows.errors.length > 0 && <div className="table-scroll mt"><table>
        <thead><tr><th>When</th><th>Paper</th><th>Q</th><th>Problem</th><th>Status</th></tr></thead>
        <tbody>{rows.errors.map((e) => { const ex = data.exams.find((x) => x.id === e.exam_id); return (
          <tr key={e.id}><td className="small">{fmtDateTime(e.created_at)}</td><td>{sub(ex?.subject_id)?.emoji} {ex?.title || '—'}</td><td>{e.number || '—'}</td>
            <td className="small">{e.description}{e.fix ? <div className="tiny dim">{e.fix}</div> : null}</td>
            <td><select value={e.status} onChange={async (ev) => { try { await api.chat({ mode: 'resolve_error', id: e.id, status: ev.target.value }); load(); } catch (err) { notify(err.message, true); } }}>
              <option value="open">open</option><option value="fixed">fixed</option><option value="not_an_error">not an error</option></select></td></tr>); })}</tbody>
      </table></div>}
    </div>
  );
}
