// Chat with the examiner about a marked paper (can change marks, fix the answer key, log paper errors),
// chat with the tutor about anything, or report a problem with a paper.
import { serve, HttpError, enforceLimit, logUsage, downloadAsBlock, handoutNotes } from '../_shared/util.ts';
import { callClaude, MODELS, TUTOR_PERSONA } from '../_shared/claude.ts';
import { topicMastery } from '../_shared/scoring.js';

const NOTE_CAVEAT = 'Lines in handout notes marked "tutor comment", "my observation", "(unclear)" or "possible confusion" were added by the note-taker, not taught in class.';
const MAX_TURNS = 30;

type Msg = { role: 'user' | 'assistant'; content: string; at: string; by?: string; changes?: any[]; error?: any };

serve(async (ctx) => {
  const { admin } = ctx;
  const { mode = 'tutor' } = ctx.body;
  if (mode === 'report') return report(ctx);
  if (mode === 'resolve_error') return resolveError(ctx);
  const text = String(ctx.body.message || '').trim().slice(0, 3000);
  if (!text) throw new HttpError(400, 'Type a message first');
  await enforceLimit(ctx, ['chat-examiner', 'chat-tutor'], 'daily_chat_limit');
  const { data: me } = await admin.from('profiles').select('display_name,role').eq('id', ctx.userId).single();
  const who = me?.role === 'parent' ? `${me?.display_name || 'A parent'} (Dhruv's parent)` : 'Dhruv';
  return mode === 'examiner' ? examiner(ctx, text, who) : tutor(ctx, text, who);
});

// ───────────────────────────── Examiner
async function examiner(ctx: any, text: string, who: string) {
  const { admin } = ctx;
  const { data: att } = await admin.from('attempts').select('*').eq('id', ctx.body.attempt_id).single();
  if (!att) throw new HttpError(404, 'Paper not found');
  if (att.student_id !== ctx.userId && ctx.role !== 'parent') throw new HttpError(403, 'Not your paper');
  if (att.status !== 'graded') throw new HttpError(409, 'The examiner can only discuss a marked paper');
  const { data: exam } = await admin.from('exams').select('*').eq('id', att.exam_id).single();
  const { data: k } = await admin.from('exam_keys').select('key').eq('exam_id', att.exam_id).single();
  const key = k?.key || {};
  const { data: subject } = await admin.from('subjects').select('name').eq('id', att.subject_id).single();

  // One shared thread per paper, so the parent can see what was argued.
  let { data: thread } = await admin.from('chat_threads').select('*').eq('attempt_id', att.id).eq('kind', 'examiner').maybeSingle();
  if (!thread) {
    ({ data: thread } = await admin.from('chat_threads').insert({ user_id: ctx.userId, kind: 'examiner', attempt_id: att.id,
      subject_id: att.subject_id, title: exam?.title || 'Paper' }).select('*').single());
  }
  const history: Msg[] = (thread.messages || []).slice(-MAX_TURNS);

  const photos: any[] = [];
  for (const [i, p] of (att.photo_paths || []).slice(0, 14).entries()) {
    photos.push({ type: 'text', text: `Answer page ${i + 1}` });
    photos.push(await downloadAsBlock(admin, 'answer-photos', p));
  }
  const qs = (exam?.questions || []).filter((q: any) => !att.question_ids?.length || att.question_ids.includes(q.id));
  const res = Object.fromEntries((att.results || []).map((r: any) => [r.qid, r]));
  let lastStem = '';
  const paperText = qs.map((q: any) => {
    const k2 = key[q.id] || {}; const r = res[q.id] || {};
    const stem = q.stem && q.stem !== lastStem ? `Context: ${q.stem}\n` : '';
    if (q.stem) lastStem = q.stem;
    return `${stem}[${q.id}] Q${q.number} (${q.marks} marks)
Question: ${q.prompt}${q.options ? '\nOptions: ' + q.options.map((o: string, i: number) => `${'abcd'[i]}) ${o}`).join('  ') : ''}
Answer key: ${k2.answer ?? '—'} | Mark scheme: ${(k2.markScheme || []).join(' ; ') || '—'}
Dhruv's answer (as transcribed): ${r.studentAnswer ?? ''}
Marks given: ${r.awarded ?? 0}/${q.marks} | Feedback given: ${r.feedback ?? ''}`;
  }).join('\n\n');
  const notes = await handoutNotes(admin, att.subject_id, 15000);
  const changes = await admin.from('mark_changes').select('number,old_awarded,new_awarded,reason').eq('attempt_id', att.id);

  const context = `You are the examiner who marked Dhruv's ${subject?.name} paper "${exam?.title}" (${att.level} level). Current score: ${att.score}/${att.total}.
${photos.length ? 'The images above are his actual handwritten answer pages: they are the evidence. Re-read them whenever a mark is questioned.' : 'He answered online; his typed answers are below.'}

THE PAPER, ANSWER KEY AND YOUR MARKING:
${paperText}

${changes.data?.length ? `Marks already changed in this chat: ${changes.data.map((c: any) => `Q${c.number} ${c.old_awarded}→${c.new_awarded} (${c.reason})`).join('; ')}\n` : ''}
${notes ? `School handout notes for this subject (what was taught; ${NOTE_CAVEAT}):\n${notes}` : ''}`;

  const system = `${TUTOR_PERSONA}
You are now in a conversation with ${who} about the marking of this paper. You can change marks yourself.
How to handle a challenge:
- Look again at the evidence: the photo of what was actually written, the question, the mark scheme and the school's handout wording.
- Change a mark ONLY for a real reason: you misread the handwriting; the answer is a correct alternative the mark scheme did not list; the answer uses the school's own taught wording or method; the question or answer key is ambiguous or wrong; or you applied the mark scheme too harshly or too generously.
- Never change a mark because of what Dhruv says he "meant" but did not write, because someone is upset, insists, or says the teacher would accept it without a reason you can check. Only what is on the paper earns marks.
- Marks can go DOWN as well as up if, on checking, you over-marked. Be fair both ways and say so plainly.
- When the answer key or a question is itself wrong or unclear, report it as a paper error and, if you can, give the corrected key so future marking is right.
- If no change is justified, explain kindly and specifically why, quoting the mark scheme point that was missing, and tell him exactly what to write next time.
- Keep replies short (under 150 words), warm and direct, written for an 11-year-old unless the parent is speaking. Do not repeat the whole marking.`;

  const turns = history.map((m) => ({ role: m.role, content: m.content }));
  const messages: any[] = [];
  const first: any[] = [...photos, { type: 'text', text: context, cache_control: { type: 'ephemeral' } }];
  if (turns.length) {
    messages.push({ role: 'user', content: [...first, { type: 'text', text: turns[0].content }] });
    for (const t of turns.slice(1)) messages.push({ role: t.role, content: t.content });
    messages.push({ role: 'user', content: text });
  } else messages.push({ role: 'user', content: [...first, { type: 'text', text }] });

  const { input, usage, model } = await callClaude({
    model: MODELS.grade, maxTokens: 4000, system, messages,
    tool: {
      name: 'examiner_reply', description: 'Reply to the person and record any mark changes or paper errors',
      input_schema: { type: 'object', required: ['reply'], properties: {
        reply: { type: 'string', description: 'What you say back, in plain text' },
        changes: { type: 'array', description: 'Only marks you have decided to change', items: { type: 'object', required: ['qid', 'new_awarded', 'reason'], properties: {
          qid: { type: 'string' }, new_awarded: { type: 'number' }, reason: { type: 'string', description: 'One sentence, the evidence-based reason' },
          new_feedback: { type: 'string', description: 'Updated feedback for that question, second person' } } } },
        paper_error: { type: 'object', description: 'Only if the question, answer key or mark scheme itself is wrong or unclear', required: ['qid', 'description'], properties: {
          qid: { type: 'string' }, description: { type: 'string' },
          key_fix_answer: { type: 'string', description: 'Corrected answer key, if you are sure' },
          key_fix_markscheme: { type: 'array', items: { type: 'string' } } } },
      } },
    },
  });
  await logUsage(admin, ctx.userId, 'chat-examiner', model, usage);

  // Apply mark changes.
  const applied: any[] = [];
  const results = (att.results || []).map((r: any) => ({ ...r }));
  for (const c of input.changes || []) {
    const r = results.find((x: any) => x.qid === c.qid);
    if (!r) continue;
    const nv = Math.max(0, Math.min(r.max, Math.round(Number(c.new_awarded) * 2) / 2));
    if (!Number.isFinite(nv) || nv === r.awarded) continue;
    applied.push({ qid: r.qid, number: r.number, old: r.awarded, new: nv, max: r.max, reason: String(c.reason || '').slice(0, 500) });
    r.awarded = nv;
    r.verdict = !String(r.studentAnswer || '').trim() && nv === 0 ? 'blank' : nv >= r.max ? 'correct' : nv > 0 ? 'partial' : 'wrong';
    r.feedback = `${c.new_feedback || r.feedback} (Mark changed ${applied.at(-1).old}→${nv} after review: ${applied.at(-1).reason})`;
  }
  if (applied.length) {
    const topicScores: Record<string, { got: number; max: number }> = {};
    let score = 0;
    for (const r of results) {
      score += r.awarded; const t = r.topic || 'misc';
      topicScores[t] = topicScores[t] || { got: 0, max: 0 }; topicScores[t].got += r.awarded; topicScores[t].max += r.max;
    }
    await admin.from('attempts').update({ results, score, topic_scores: topicScores }).eq('id', att.id);
    await admin.from('mark_changes').insert(applied.map((a) => ({ attempt_id: att.id, qid: a.qid, number: a.number,
      old_awarded: a.old, new_awarded: a.new, max: a.max, reason: a.reason, requested_by: ctx.userId })));
  }

  // Paper error (and answer-key fix for future marking).
  let error: any = null;
  const pe = input.paper_error;
  if (pe?.description && qs.find((q: any) => q.id === pe.qid)) {
    const q = qs.find((x: any) => x.id === pe.qid);
    let fix = '';
    if (pe.key_fix_answer || pe.key_fix_markscheme?.length) {
      const nk = { ...key, [pe.qid]: { ...(key[pe.qid] || {}),
        ...(pe.key_fix_answer ? { answer: pe.key_fix_answer } : {}),
        ...(pe.key_fix_markscheme?.length ? { markScheme: pe.key_fix_markscheme } : {}) } };
      await admin.from('exam_keys').update({ key: nk }).eq('exam_id', att.exam_id);
      fix = `Answer key corrected${pe.key_fix_answer ? `: ${pe.key_fix_answer}` : ''}`;
    }
    const { data: row } = await admin.from('paper_errors').insert({ exam_id: att.exam_id, attempt_id: att.id, qid: pe.qid, number: q.number,
      description: String(pe.description).slice(0, 1000), fix: fix || null, status: fix ? 'fixed' : 'open', reported_by: ctx.userId }).select('*').single();
    error = row;
  }

  const now = new Date().toISOString();
  const msgs: Msg[] = [...(thread.messages || []), { role: 'user', content: text, at: now, by: ctx.userId },
    { role: 'assistant', content: String(input.reply || ''), at: now, changes: applied, error: error ? { number: error.number, description: error.description, fix: error.fix } : undefined }];
  await admin.from('chat_threads').update({ messages: msgs, updated_at: now }).eq('id', thread.id);
  return { thread_id: thread.id, messages: msgs, changes: applied, error };
}

// ───────────────────────────── Tutor
async function tutor(ctx: any, text: string, who: string) {
  const { admin } = ctx;
  const subjectId = ctx.body.subject_id || null;
  let thread: any = null;
  if (ctx.body.thread_id) {
    ({ data: thread } = await admin.from('chat_threads').select('*').eq('id', ctx.body.thread_id).eq('kind', 'tutor').maybeSingle());
    if (thread && thread.user_id !== ctx.userId && ctx.role !== 'parent') throw new HttpError(403, 'Not your chat');
  }
  if (!thread) {
    ({ data: thread } = await admin.from('chat_threads').insert({ user_id: ctx.userId, kind: 'tutor', subject_id: subjectId,
      title: text.slice(0, 60) }).select('*').single());
  }
  const sid = thread.subject_id || subjectId;
  const { data: subjects } = await admin.from('subjects').select('id,name,papers,active').eq('active', true).order('sort');
  const { data: topics } = await admin.from('topics').select('*');
  const { data: graded } = await admin.from('attempts').select('subject_id,level,mode,score,total,graded_at,started_at,status,topic_scores')
    .eq('status', 'graded').order('graded_at', { ascending: false }).limit(60);
  const lines = (subjects || []).map((s: any) => {
    const mine = (graded || []).filter((a: any) => a.subject_id === s.id && a.mode !== 'retry' && a.level !== 'quiz');
    const m = topicMastery((graded || []).filter((a: any) => a.subject_id === s.id), (topics || []).filter((t: any) => t.subject_id === s.id));
    const weak = Object.entries(m).filter(([, v]: any) => v.mastery != null && v.mastery < 60).map(([c, v]: any) => `${c} ${Math.round(v.mastery)}%`).slice(0, 4);
    const ex = (s.papers || []).map((p: any) => `${p.name} ${p.date}`).join(', ');
    return `- ${s.name}: exams ${ex || '—'}; papers marked: ${mine.map((a: any) => `${a.level} ${a.score}/${a.total}`).join(', ') || 'none'}${weak.length ? `; weak topics: ${weak.join(', ')}` : ''}`;
  }).join('\n');
  const subj = (subjects || []).find((s: any) => s.id === sid);
  const topicList = subj ? (topics || []).filter((t: any) => t.subject_id === sid).map((t: any) => `${t.code}: ${t.name}`).join('\n') : '';
  const notes = sid ? await handoutNotes(admin, sid, 25000) : '';
  const { data: errs } = await admin.from('paper_errors').select('number,description,status,created_at').order('created_at', { ascending: false }).limit(10);

  const context = `Today is ${new Date().toISOString().slice(0, 10)}. Dhruv's term exams and progress:
${lines}
${subj ? `\nThis chat is about ${subj.name}. Syllabus topics:\n${topicList}\n` : ''}
${notes ? `School handout notes (the source of truth; ${NOTE_CAVEAT}):\n${notes}` : ''}
${errs?.length ? `\nRecently reported paper problems: ${errs.map((e: any) => `Q${e.number}: ${e.description} [${e.status}]`).join(' | ')}` : ''}`;

  const system = `${TUTOR_PERSONA}
You are chatting with ${who} inside Dhruv's Exam Center app. Help with anything about his exam preparation: explain a topic, go through a mistake, plan revision, answer questions about a paper or the app.
- Teach, don't just tell: for homework-style questions, guide him to the answer with hints and a worked example of a similar one.
- Use the school's wording from the handouts where you can. If you are not sure something is right, say so.
- To change marks on a marked paper, tell them to open that paper's result and use "Talk to the examiner". To report a broken question, use "Report a problem" on the paper.
- Keep replies short (under 200 words) unless asked for more. Plain text; simple lists are fine.`;

  const history: Msg[] = (thread.messages || []).slice(-MAX_TURNS);
  const messages: any[] = [];
  const first = [{ type: 'text', text: context, cache_control: { type: 'ephemeral' } }];
  if (history.length) {
    messages.push({ role: 'user', content: [...first, { type: 'text', text: history[0].content }] });
    for (const t of history.slice(1)) messages.push({ role: t.role, content: t.content });
    messages.push({ role: 'user', content: text });
  } else messages.push({ role: 'user', content: [...first, { type: 'text', text }] });

  const { input, usage, model } = await callClaude({
    model: MODELS.tutor, maxTokens: 3000, system, messages,
    tool: { name: 'tutor_reply', description: 'Reply to the person', input_schema: { type: 'object', required: ['reply'], properties: { reply: { type: 'string' } } } },
  });
  await logUsage(admin, ctx.userId, 'chat-tutor', model, usage);
  const now = new Date().toISOString();
  const msgs: Msg[] = [...(thread.messages || []), { role: 'user', content: text, at: now, by: ctx.userId }, { role: 'assistant', content: String(input.reply || ''), at: now }];
  await admin.from('chat_threads').update({ messages: msgs, updated_at: now }).eq('id', thread.id);
  return { thread_id: thread.id, messages: msgs };
}

// ───────────────────────────── Report a problem (no AI call)
async function report(ctx: any) {
  const { admin } = ctx;
  const { exam_id, attempt_id, number, description } = ctx.body;
  const d = String(description || '').trim();
  if (!exam_id || !d) throw new HttpError(400, 'Say what the problem is');
  const { data: exam } = await admin.from('exams').select('questions').eq('id', exam_id).single();
  if (!exam) throw new HttpError(404, 'Paper not found');
  const q = (exam.questions || []).find((x: any) => String(x.number) === String(number || '').trim());
  const { data } = await admin.from('paper_errors').insert({ exam_id, attempt_id: attempt_id || null, qid: q?.id || null,
    number: number ? String(number).slice(0, 20) : null, description: d.slice(0, 1000), reported_by: ctx.userId }).select('*').single();
  return { ok: true, error: data };
}

async function resolveError(ctx: any) {
  if (ctx.role !== 'parent') throw new HttpError(403, 'Parents only');
  const { id, status } = ctx.body;
  if (!['open', 'fixed', 'not_an_error'].includes(status)) throw new HttpError(400, 'Bad status');
  await ctx.admin.from('paper_errors').update({ status }).eq('id', id);
  return { ok: true };
}
