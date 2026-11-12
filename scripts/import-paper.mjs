// Mark a handwritten paper that was done outside the app and record it as Dhruv's attempt.
// usage: node scripts/import-paper.mjs <exam_id|"none"> <subject_id> <level> <answers.json|-> <started_at ISO> photo1.jpg photo2.jpg ...
import { readFileSync } from 'node:fs';
const [examId, subject, level, answersFile, startedAt, ...photos] = process.argv.slice(2);
const REF = process.env.SUPABASE_PROJECT_REF, TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL = `https://${REF}.supabase.co`;
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
const SR = keys.find((k) => k.type === 'secret').api_key;
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };
const prof = await (await fetch(`${URL}/rest/v1/profiles?role=eq.student&select=id`, { headers: H })).json();
const student = prof[0].id;
const answers = answersFile && answersFile !== '-' ? JSON.parse(readFileSync(answersFile, 'utf8')) : {};
const row = { exam_id: examId === 'none' ? null : examId, subject_id: subject, student_id: student, mode: examId === 'none' ? 'external' : 'paper', level, answers, status: 'submitted', started_at: startedAt, submitted_at: startedAt };
const att = (await (await fetch(`${URL}/rest/v1/attempts`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) })).json())[0];
if (!att?.id) { console.error('attempt insert failed', att); process.exit(1); }
const paths = [];
for (const [i, f] of photos.entries()) {
  const path = `${student}/${att.id}/page${String(i + 1).padStart(2, '0')}.jpg`;
  const r = await fetch(`${URL}/storage/v1/object/answer-photos/${path}`, { method: 'POST', headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'image/jpeg' }, body: readFileSync(f) });
  if (!r.ok) { console.error('upload failed', f, await r.text()); process.exit(1); }
  paths.push(path);
}
await fetch(`${URL}/rest/v1/attempts?id=eq.${att.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ photo_paths: paths }) });
console.log('attempt', att.id, 'pages', paths.length, '— marking…');
const t0 = Date.now();
const g = await (await fetch(`${URL}/functions/v1/grade-attempt`, { method: 'POST', headers: H, body: JSON.stringify({ attempt_id: att.id }) })).json();
console.log(JSON.stringify(g), `${Math.round((Date.now() - t0) / 1000)}s`);
