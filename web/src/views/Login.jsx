import React, { useState } from 'react';
import { api } from '../api/index.js';
import { DEMO, STUDENT_NAME } from '../config.js';

export default function Login({ onIn }) {
  const [who, setWho] = useState(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault(); setBusy(true); setErr('');
    try { await api.signIn(who, pw); await onIn(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <div className="login-card">
        <div style={{ fontSize: 64 }}>🎮</div>
        <h1 style={{ fontSize: '2.6rem' }}>{STUDENT_NAME}'s Exam Center</h1>
        <p className="muted">Grade 6 · Calcutta International School · Term 1 boss battles start 16 Nov</p>
        {!who ? (
          <div className="who">
            <div className="card click glow" style={{ '--c': '#22d3a6' }} onClick={() => setWho('dhruv')}>
              <div className="face">🦊</div>
              <h2 className="mt">{STUDENT_NAME}</h2>
              <p className="muted">Play papers, earn XP, level up</p>
              <span className="btn">Enter the game →</span>
            </div>
            <div className="card click" style={{ '--c': '#7c5cff' }} onClick={() => setWho('parent')}>
              <div className="face">🧑‍💼</div>
              <h2 className="mt">Parent</h2>
              <p className="muted">Readiness, predictions, weak spots</p>
              <span className="btn purple">Parent view →</span>
            </div>
          </div>
        ) : (
          <form className="card mt2" style={{ maxWidth: 420, margin: '28px auto 0', textAlign: 'left' }} onSubmit={submit}>
            <h2>{who === 'dhruv' ? `🦊 Hi ${STUDENT_NAME}!` : '🧑‍💼 Parent login'}</h2>
            <label className="field mt">Password
              <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder={DEMO ? 'Demo: any password works' : ''} />
            </label>
            {err && <p style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</p>}
            <div className="row mt">
              <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
              <button type="button" className="btn ghost" onClick={() => { setWho(null); setErr(''); }}>Back</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
