import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, LOGINS } from '../config.js';
import { compressImage } from '../lib.js';

const sb = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

async function fn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Word and text files can't be read by Claude directly, so their text is pulled out here first.
async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth/mammoth.browser.js');
    const mammoth = mod.extractRawText ? mod : mod.default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!value.trim()) throw new Error(`${file.name}: no text found in this Word file`);
    return value;
  }
  if (name.endsWith('.pptx')) return pptxText(file);
  if (name.endsWith('.txt') || name.endsWith('.md')) return file.text();
  if (name.endsWith('.doc') || name.endsWith('.pages')) throw new Error(`${file.name}: old .doc / Pages files aren't supported — save it as .docx or PDF first`);
  if (name.endsWith('.ppt') || name.endsWith('.key')) throw new Error(`${file.name}: old .ppt / Keynote files aren't supported — save it as .pptx or PDF first`);
  return null;
}

// PowerPoint: read each slide's text (and speaker notes) in slide order.
async function pptxText(file) {
  const zm = await import('jszip');
  const JSZip = zm.loadAsync ? zm : zm.default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const num = (p) => Number((p.match(/(\d+)\.xml$/) || [0, 0])[1]);
  const read = async (path) => {
    const xml = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
    return [...xml.getElementsByTagName('a:p')].map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent).join('')).filter((l) => l.trim()).join('\n');
  };
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  let out = '';
  for (const sp of slides) {
    const n = num(sp);
    out += `\n--- Slide ${n} ---\n${await read(sp)}\n`;
    const notes = `ppt/notesSlides/notesSlide${n}.xml`;
    if (zip.file(notes)) { const t = await read(notes); if (t.trim()) out += `(Speaker notes) ${t}\n`; }
  }
  if (!out.replace(/--- Slide \d+ ---/g, '').trim()) throw new Error(`${file.name}: no text found in these slides — export it as PDF instead`);
  return out;
}

if (typeof window !== 'undefined') window.__extractText = extractText; // used by automated checks

const EXAM_META = 'id,subject_id,title,level,total_marks,duration_min,source,focus_topics,created_at,retired_at';

export const api = {
  demo: false,
  async session() { const { data } = await sb.auth.getSession(); return data.session; },
  async signIn(who, password) {
    const email = LOGINS[who] || who;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong password — try again' : error.message);
  },
  async signOut() { await sb.auth.signOut(); },
  async me() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    return must(await sb.from('profiles').select('*').eq('id', user.id).single());
  },
  async loadAll() {
    const [subjects, topics, exams, attempts, xp, settings, handouts, profiles] = await Promise.all([
      sb.from('subjects').select('*').order('sort'),
      sb.from('topics').select('*').order('sort'),
      sb.from('exams').select(EXAM_META).order('created_at', { ascending: false }),
      sb.from('attempts').select('id,exam_id,subject_id,student_id,mode,level,question_ids,retry_of,status,started_at,submitted_at,graded_at,time_taken_sec,score,total,results,topic_scores,summary,tips,xp_awarded,error,photo_paths,cancel_reason,cancelled_at,cancelled_by').order('started_at', { ascending: false }),
      sb.from('xp_events').select('*').order('created_at', { ascending: false }),
      sb.from('app_settings').select('*').eq('id', 1).single(),
      sb.from('handouts').select('id,subject_id,title,status,topic_codes,error,created_at,storage_path,mime_type').order('created_at', { ascending: false }),
      sb.from('profiles').select('*'),
    ]);
    return {
      // Cancelled papers are hidden everywhere except the parent's "Cancelled papers" list.
      subjects: must(subjects), topics: must(topics), exams: must(exams),
      attempts: must(attempts).filter((a) => a.status !== 'cancelled'),
      cancelled: must(attempts).filter((a) => a.status === 'cancelled'), xp: must(xp),
      settings: settings.data || {}, handouts: must(handouts), profiles: must(profiles),
    };
  },
  async getExam(id) { return must(await sb.from('exams').select('*').eq('id', id).single()); },
  async getKey(id) { const { data } = await sb.from('exam_keys').select('key').eq('exam_id', id).maybeSingle(); return data?.key || null; },
  async getAttempt(id) { return must(await sb.from('attempts').select('*').eq('id', id).single()); },
  async createAttempt(row) { return must(await sb.from('attempts').insert(row).select('*').single()); },
  async saveAttempt(id, patch) { return must(await sb.from('attempts').update(patch).eq('id', id).select('*').single()); },
  async cancelAttempt(id, reason) { must(await sb.rpc('cancel_attempt', { p_id: id, p_reason: reason })); },
  async deleteAttempt(id) { must(await sb.from('attempts').delete().eq('id', id)); },
  async uploadPhoto(attemptId, blob, name) {
    const { data: { user } } = await sb.auth.getUser();
    const path = `${user.id}/${attemptId}/${Date.now()}-${name}`;
    must(await sb.storage.from('answer-photos').upload(path, blob, { contentType: blob.type || 'image/jpeg' }));
    return path;
  },
  async photoUrl(path, bucket = 'answer-photos') {
    const { data } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl;
  },
  async submitAndGrade(attemptId, patch = {}) {
    await sb.from('attempts').update({ ...patch, status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', attemptId);
    return fn('grade-attempt', { attempt_id: attemptId });
  },
  async chat(body) { return fn('chat', body); },
  async examinerThread(attemptId) { const { data } = await sb.from('chat_threads').select('*').eq('attempt_id', attemptId).eq('kind', 'examiner').maybeSingle(); return data; },
  async tutorThreads() {
    const { data: { user } } = await sb.auth.getUser();
    return must(await sb.from('chat_threads').select('*').eq('kind', 'tutor').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(30));
  },
  async changesAndErrors() {
    const [c, e] = await Promise.all([
      sb.from('mark_changes').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('paper_errors').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    return { changes: must(c), errors: must(e) };
  },
  async regrade(attemptId) { return fn('grade-attempt', { attempt_id: attemptId }); },
  async generateExam(params) { return fn('generate-exam', params); },
  async uploadHandout(subjectId, file, title) {
    const { data: { user } } = await sb.auth.getUser();
    // Phone photos are often 8-12 MB; Claude accepts images up to ~5 MB, so shrink them first
    // (2400 px keeps whiteboard handwriting readable).
    const isImg = (file.type || '').startsWith('image/');
    const body = isImg ? await compressImage(file, 2400, 0.85) : file;
    const safe = file.name.replace(/[^\w.\-]+/g, '_').replace(isImg ? /\.\w+$/ : /$^/, isImg ? '.jpg' : '');
    const path = `${subjectId}/${Date.now()}-${safe}`;
    const source_text = await extractText(file);
    const type = isImg ? 'image/jpeg' : (file.type || 'application/octet-stream');
    must(await sb.storage.from('handouts').upload(path, body, { contentType: type }));
    const h = must(await sb.from('handouts').insert({ subject_id: subjectId, title, storage_path: path, mime_type: type, uploaded_by: user.id, source_text }).select('*').single());
    fn('ingest-handout', { handout_id: h.id }).catch(() => {});
    return h;
  },
  async handoutNotes(id) { const { data } = await sb.from('handouts').select('notes').eq('id', id).single(); return data?.notes || ''; },
  async reprocessHandout(id) { return fn('ingest-handout', { handout_id: id }); },
  async deleteHandout(h) {
    await sb.storage.from('handouts').remove([h.storage_path]);
    must(await sb.from('handouts').delete().eq('id', h.id));
  },
  async lesson(subject_id, topic_code, refresh = false) { return fn('tutor', { action: 'lesson', subject_id, topic_code, refresh }); },
  async revision(subject_id, refresh = false) { return fn('tutor', { action: 'revision', subject_id, refresh }); },
  async parentReport() { return fn('tutor', { action: 'parent_report' }); },
  async usage() {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    return must(await sb.from('usage_log').select('*').gte('created_at', since.toISOString()));
  },
  async saveSettings(patch) { return must(await sb.from('app_settings').update(patch).eq('id', 1).select('*').single()); },
  async saveSubject(id, patch) { return must(await sb.from('subjects').update(patch).eq('id', id).select('*').single()); },
};
