import React, { useState } from 'react';
import { useStore, Spinner, go } from '../common.jsx';
import { compressImage, GRADE_MESSAGES } from '../lib.js';

// Mark any handwritten paper that was NOT generated here (school worksheet, past paper, class test).
export default function UploadPaper({ sid }) {
  const { api, data, d, notify, reload } = useStore();
  const [subject, setSubject] = useState(sid || d.active[0]?.id);
  const [kind, setKind] = useState('external');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState(''); // '' = not answered, 'outside', or an exam id from this app
  // Papers made here that haven't been marked yet: these must be marked with their own mark scheme.
  const done = new Set(data.attempts.filter((a) => ['graded', 'submitted', 'grading'].includes(a.status)).map((a) => a.exam_id));
  const candidates = data.exams.filter((e) => e.subject_id === subject && !e.retired_at && !done.has(e.id)
    && ['foundational', 'challenging', 'godmode', 'drill'].includes(e.level));
  const needAnswer = candidates.length > 0 && !match;

  async function submit() {
    setBusy(true);
    let att;
    try {
      const ex = candidates.find((e) => e.id === match);
      if (ex) {
        att = data.attempts.find((a) => a.exam_id === ex.id && a.status === 'in_progress' && a.mode === 'paper')
          || await api.createAttempt({ exam_id: ex.id, subject_id: subject, mode: 'paper', level: ex.level });
      } else att = await api.createAttempt({ exam_id: null, subject_id: subject, mode: 'external', level: kind });
      const paths = [];
      for (const f of files) paths.push(await api.uploadPhoto(att.id, await compressImage(f), f.name.replace(/\.\w+$/, '') + (f.type === 'application/pdf' ? '.pdf' : '.jpg')));
      await api.submitAndGrade(att.id, { photo_paths: paths });
    } catch (e) { notify(e.message, true); }
    await reload();
    if (att) go(`#/result/${att.id}`); else setBusy(false);
  }

  if (busy) return <div className="wrap"><Spinner messages={['Uploading pages…', ...GRADE_MESSAGES]} /><p className="muted" style={{ textAlign: 'center' }}>Reading a whole paper takes 1–3 minutes.</p></div>;
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <h1>📸 Mark a written paper</h1>
      <p className="muted">For school worksheets, class tests or past papers you did by hand. Include the question pages <b>and</b> your answers. Claude reads it, writes a mark scheme, marks every answer and explains what went wrong.</p>
      <div className="card mt col">
        <label className="field">Subject
          <select value={subject} onChange={(e) => { setSubject(e.target.value); setMatch(''); }}>{data.subjects.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}</select>
        </label>
        {candidates.length > 0 && (
          <div className="card" style={{ borderColor: 'var(--gold)' }}>
            <b>Is this one of the Exam Center papers you printed?</b>
            <div className="small muted">If so, pick it, so it's marked with its own official mark scheme.</div>
            <div className="col mt" style={{ gap: 6 }}>
              {candidates.map((e) => (
                <label key={e.id} className="row" style={{ gap: 8, cursor: "pointer", flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <input type="radio" name="match" checked={match === e.id} onChange={() => setMatch(e.id)} />
                  <span>Yes: <b>{e.title}</b> <span className="tiny dim">({e.level}, {e.total_marks} marks)</span></span>
                </label>
              ))}
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="match" checked={match === 'outside'} onChange={() => setMatch('outside')} />
                <span>No, it's a school worksheet, class test or other outside paper</span>
              </label>
            </div>
          </div>
        )}
        {(!candidates.length || match === 'outside') && <label className="field">What is it?
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="external">Practice / worksheet / past paper</option>
            <option value="school">Real school test (already marked by teacher)</option>
          </select>
        </label>}
        <label className="dropzone" style={{ display: 'block' }}>
          <div style={{ fontSize: 36 }}>📷</div><b>Add photos or a PDF (in page order)</b>
          <div className="small muted">Flat page, good light, whole page in the frame.</div>
          <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => setFiles([...files, ...e.target.files])} />
        </label>
        {files.length > 0 && <div className="row">{files.map((f, i) => <span key={i} className="pill">📄 {i + 1}. {f.name.slice(0, 24)}</span>)}<button className="btn ghost sm" onClick={() => setFiles([])}>Clear</button></div>}
        {needAnswer && <div className="small" style={{ color: 'var(--gold)' }}>Answer the question above first.</div>}
        <button className="btn gold" disabled={!files.length || needAnswer} onClick={submit}>Mark it ({files.length} page{files.length === 1 ? '' : 's'})</button>
        <p className="tiny dim">Max ~14 pages per upload. The transcribed paper is saved, so it also shapes future practice papers.</p>
      </div>
    </div>
  );
}
