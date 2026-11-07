import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/index.js';
import { DEMO } from './config.js';
import { derive } from './lib.js';
import { isMuted, setMuted } from './sound.js';
import { Store, Spinner } from './common.jsx';
import Login from './views/Login.jsx';
import { HQ, Trophies, Mistakes, Answers } from './views/Student.jsx';
import World from './views/World.jsx';
import { ExamStart, Play, PaperMode, Result, PrintPaper } from './views/Exam.jsx';
import Lesson from './views/Lesson.jsx';
import QuizPlayer from './views/Quiz.jsx';
import ListeningPlayer from './views/Listening.jsx';
import Notes, { NotesIndex } from './views/Notes.jsx';
import UploadPaper from './views/Upload.jsx';
import TutorChat from './views/Chat.jsx';
import { ScoresIndex, SubjectScores } from './views/Scores.jsx';
import Schedule from './views/Schedule.jsx';
import { ParentHome, Handouts, Library, Settings } from './views/Parent.jsx';

function useHash() {
  const [h, setH] = useState(window.location.hash || '#/');
  useEffect(() => {
    const f = () => { setH(window.location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export default function App() {
  const [me, setMe] = useState(undefined);
  const [data, setData] = useState(null);
  const [toast, setToast] = useState(null);
  const hash = useHash();

  const notify = useCallback((msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), err ? 6000 : 3500); }, []);
  const reload = useCallback(async () => { const d = await api.loadAll(); setData(d); return d; }, []);

  // Refresh data when the tab comes back into view, so papers made elsewhere (e.g. by a parent) show up.
  useEffect(() => {
    let last = Date.now();
    const f = () => { if (document.visibilityState === 'visible' && Date.now() - last > 20000) { last = Date.now(); reload().catch(() => {}); } };
    document.addEventListener('visibilitychange', f); window.addEventListener('focus', f);
    return () => { document.removeEventListener('visibilitychange', f); window.removeEventListener('focus', f); };
  }, [reload]);
  useEffect(() => { (async () => {
    try { const p = await api.me(); setMe(p); if (p) await reload(); } catch (e) { setMe(null); notify(e.message, true); }
  })(); }, [reload, notify]);

  const derived = useMemo(() => (data ? derive(data) : null), [data]);
  const store = useMemo(() => ({ me, data, d: derived, reload, notify, api, isParent: me?.role === 'parent' }), [me, data, derived, reload, notify]);

  if (me === undefined) return <Spinner />;
  if (!me) return <Login onIn={async () => { const p = await api.me(); setMe(p); await reload(); window.location.hash = '#/'; }} />;
  if (!data) return <Spinner />;

  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const query = new URLSearchParams(hash.split('?')[1] || '');
  const [r, a, b] = parts;
  const parent = me.role === 'parent';
  let view;
  if (!r) view = parent ? <ParentHome /> : <HQ />;
  else if (r === 'world' || r === 'subject') view = <World sid={a} tab={query.get('tab')} />;
  else if (r === 'exam') view = <ExamStart examId={a} />;
  else if (r === 'play') view = <Play attemptId={a} />;
  else if (r === 'quiz') view = <QuizPlayer attemptId={a} />;
  else if (r === 'listen') view = <ListeningPlayer attemptId={a} />;
  else if (r === 'notes') view = a ? <Notes sid={a} /> : <NotesIndex />;
  else if (r === 'paper') view = <PaperMode attemptId={a} />;
  else if (r === 'result') view = <Result attemptId={a} />;
  else if (r === 'print') view = <PrintPaper examId={a} withKey={query.get('key') === '1'} />;
  else if (r === 'lesson') view = <Lesson sid={a} code={b} />;
  else if (r === 'upload') view = <UploadPaper sid={query.get('s')} />;
  else if (r === 'chat') view = <TutorChat />;
  else if (r === 'exams') view = <Schedule />;
  else if (r === 'scores') view = a ? <SubjectScores sid={a} /> : <ScoresIndex />;
  else if (r === 'trophies') view = <Trophies />;
  else if (r === 'answers') view = <Answers />;
  else if (r === 'mistakes') view = <Mistakes />;
  else if (r === 'handouts' && parent) view = <Handouts />;
  else if (r === 'library') view = <Library />;
  else if (r === 'settings') view = <Settings />;
  else view = <div className="wrap"><h2>Lost in the void 🌌</h2><a href="#/">Back to base</a></div>;

  const navs = parent
    ? [['#/', 'Overview'], ['#/exams', '🗓️ Exams'], ['#/scores', '📈 Scores'], ['#/library', 'Papers'], ['#/notes', 'Cliff notes'], ['#/chat', '💬 Ask tutor'], ['#/handouts', 'Handouts'], ['#/settings', 'Settings']]
    : [['#/', 'HQ'], ['#/exams', '🗓️ Exams'], ['#/answers', `📸 Upload answers${data.attempts.some((a) => a.status === 'in_progress' && a.mode === 'paper') ? ` (${data.attempts.filter((a) => a.status === 'in_progress' && a.mode === 'paper').length})` : ''}`], ['#/notes', '📒 Cliff notes'], ['#/chat', '💬 Ask tutor'], ['#/mistakes', `Mistakes${derived.mistakes.length ? ` (${derived.mistakes.length})` : ''}`], ['#/trophies', 'Trophies']];
  const fullBleed = r === 'print';

  return (
    <Store.Provider value={store}>
      {DEMO && <div className="demo-banner no-print">DEMO MODE — sample data in this browser only, AI not connected. Follow SETUP.md to go live.</div>}
      {!fullBleed && (
        <div className="topbar no-print">
          <div className="wrap">
            <a className="logo" href="#/">🎮 <span>Exam<b>Center</b></span></a>
            <nav className="nav">
              {navs.map(([h, t]) => <a key={h} href={h} className={(hash === h || (h !== '#/' && hash.startsWith(h))) ? 'on' : ''}>{t}</a>)}
            </nav>
            <div className="spacer" />
            {!parent && <span className="pill gold" title="Level">⭐ Lv {derived.level.level}</span>}
            {!parent && derived.streak.days > 0 && <span className="pill warn" title="Streak">🔥 {derived.streak.days}</span>}
            {!parent && <SoundToggle />}
            <button className="btn ghost sm" onClick={async () => { await api.signOut(); setMe(null); setData(null); }}>
              {me.avatar || '🙂'} <span className="who-name">{me.display_name} ·</span> Log out
            </button>
          </div>
        </div>
      )}
      <div key={hash.split('?')[0]}>{view}</div>
      {toast && <div className={`toast pop ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </Store.Provider>
  );
}

function SoundToggle() {
  const [m, setM] = useState(isMuted());
  return <button className="btn ghost sm" title={m ? 'Sound off' : 'Sound on'} onClick={() => { setMuted(!m); setM(!m); }}>{m ? '🔇' : '🔊'}</button>;
}
