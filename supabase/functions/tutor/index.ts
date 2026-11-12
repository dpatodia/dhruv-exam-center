import { serve, HttpError, enforceLimit, logUsage, handoutNotes } from '../_shared/util.ts';
import { callClaude, MODELS, TUTOR_PERSONA } from '../_shared/claude.ts';
import { subjectReadiness } from '../_shared/scoring.js';

serve(async (ctx) => {
  const { action } = ctx.body;
  if (action === 'lesson') return lesson(ctx);
  if (action === 'parent_report') return parentReport(ctx);
  if (action === 'revision') return revision(ctx);
  throw new HttpError(400, 'Unknown action');
});

async function lesson(ctx: any) {
  const { admin } = ctx;
  const { subject_id, topic_code, refresh } = ctx.body;
  if (!refresh) {
    const { data: cached } = await admin.from('lessons').select('*').eq('subject_id', subject_id).eq('topic_code', topic_code)
      .order('created_at', { ascending: false }).limit(1);
    if (cached?.length) return { lesson: cached[0].content, cached: true };
  }
  await enforceLimit(ctx, ['tutor'], 'daily_generate_limit');
  const { data: subject } = await admin.from('subjects').select('*').eq('id', subject_id).single();
  const { data: topic } = await admin.from('topics').select('*').eq('subject_id', subject_id).eq('code', topic_code).single();
  if (!subject || !topic) throw new HttpError(404, 'Topic not found');
  const { data: attempts } = await admin.from('attempts').select('results').eq('subject_id', subject_id).eq('status', 'graded')
    .order('graded_at', { ascending: false }).limit(10);
  const mistakes = (attempts || []).flatMap((a: any) => a.results || [])
    .filter((r: any) => r.topic === topic_code && r.verdict !== 'correct').slice(0, 6)
    .map((r: any) => `- He wrote: ${JSON.stringify(r.studentAnswer)}; issue: ${r.feedback}`).join('\n');
  const notes = await handoutNotes(admin, subject_id, 25000, [topic_code]);

  const { input, usage, model } = await callClaude({
    model: MODELS.tutor, maxTokens: 6000, system: TUTOR_PERSONA,
    content: [{ type: 'text', text: `Teach Dhruv this ${subject.name} topic in a 5-minute "power-up" lesson: ${topic.code} — ${topic.name}.
${mistakes ? `His recent mistakes on this topic (target these directly):\n${mistakes}` : ''}
${notes ? `School handout notes (stay consistent with these). Lines marked "tutor comment", "my observation", "(unclear)" or "possible confusion" were added by the note-taker, not taught in class: do not present them as what the teacher taught, and do not use acronyms or names the notes say the teacher did not write.\n${notes}` : ''}
Make it punchy and exam-focused: what the examiner wants, the exact keywords, a worked example, the classic traps, a memory trick, and a 4-question quick check.
For videos, give 3 YouTube SEARCH phrases (not URLs) likely to find good Grade 6 / KS3 explainers on exactly this.` }],
    tool: {
      name: 'lesson', description: 'Return the lesson',
      input_schema: { type: 'object', required: ['title', 'hook', 'steps', 'keywords', 'workedExample', 'traps', 'memoryTrick', 'quickCheck', 'videoSearches'], properties: {
        title: { type: 'string' }, hook: { type: 'string', description: 'One fun opening line' },
        steps: { type: 'array', items: { type: 'object', required: ['heading', 'body'], properties: { heading: { type: 'string' }, body: { type: 'string' } } } },
        keywords: { type: 'array', items: { type: 'object', required: ['term', 'meaning'], properties: { term: { type: 'string' }, meaning: { type: 'string' } } } },
        workedExample: { type: 'object', required: ['question', 'answer'], properties: { question: { type: 'string' }, answer: { type: 'string' } } },
        traps: { type: 'array', items: { type: 'string' } }, memoryTrick: { type: 'string' },
        quickCheck: { type: 'array', items: { type: 'object', required: ['q', 'options', 'answer', 'why'], properties: {
          q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'string', description: 'a-d' }, why: { type: 'string' } } } },
        videoSearches: { type: 'array', items: { type: 'string' } } } },
    },
  });
  await logUsage(admin, ctx.userId, 'tutor', model, usage);
  await admin.from('lessons').insert({ subject_id, topic_code, content: input });
  return { lesson: input, cached: false };
}

async function parentReport(ctx: any) {
  if (ctx.role !== 'parent') throw new HttpError(403, 'Parents only');
  const { admin } = ctx;
  const { data: subjects } = await admin.from('subjects').select('*').eq('active', true).order('sort');
  const { data: topics } = await admin.from('topics').select('*');
  const { data: attempts } = await admin.from('attempts').select('*').eq('status', 'graded').order('graded_at', { ascending: false });
  const { data: xp } = await admin.from('xp_events').select('amount,created_at').gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString());
  const lines = (subjects || []).map((s: any) => {
    const r = subjectReadiness(s, topics || [], attempts || []);
    const weak = r.weakest.filter((t: any) => t.mastery != null).slice(0, 3).map((t: any) => `${t.name} ${Math.round(t.mastery)}%`).join('; ');
    return `${s.name}: predicted ${r.predicted}% (${r.low}-${r.high}, ${r.confidenceLabel} confidence), papers ${r.papersDone}, coverage ${Math.round(r.coverage * 100)}%, exam in ${r.daysToExam ?? '?'} days, last practice ${r.daysSince ?? 'never'} days ago. Weakest: ${weak || 'no data'}`;
  }).join('\n');
  const recent = (attempts || []).slice(0, 12).map((a: any) => `${a.graded_at?.slice(0, 10)} ${a.subject_id} ${a.level} ${a.score}/${a.total}${a.time_taken_sec ? ` in ${Math.round(a.time_taken_sec / 60)} min` : ''}`).join('\n');
  const activeDays = new Set((xp || []).map((e: any) => e.created_at.slice(0, 10))).size;

  const { input, usage, model } = await callClaude({
    model: MODELS.tutor, maxTokens: 3000,
    system: 'You advise the parent of Dhruv (11, Grade 6, Cambridge curriculum, Calcutta International School). Be blunt, specific and evidence-based. Flag where the data is too thin to conclude anything. No flattery.',
    content: [{ type: 'text', text: `Today: ${new Date().toISOString().slice(0, 10)}. Active practice days in last 14: ${activeDays}.\nSubjects:\n${lines}\n\nRecent papers:\n${recent || 'none'}\n\nWrite the parent briefing.` }],
    tool: {
      name: 'briefing', description: 'Parent briefing',
      input_schema: { type: 'object', required: ['headline', 'strengths', 'concerns', 'plan', 'conversation'], properties: {
        headline: { type: 'string' }, strengths: { type: 'array', items: { type: 'string' } }, concerns: { type: 'array', items: { type: 'string' } },
        plan: { type: 'array', items: { type: 'object', required: ['when', 'action'], properties: { when: { type: 'string' }, action: { type: 'string' } } } },
        conversation: { type: 'string', description: 'How to talk to Dhruv about this tonight, in 2-3 sentences' } } },
    },
  });
  await logUsage(admin, ctx.userId, 'tutor', model, usage);
  return { report: input };
}

// Cliff-note revision pack for a whole subject. Cached; the app highlights weak topics itself.
async function revision(ctx: any) {
  const { admin } = ctx;
  const { subject_id, refresh } = ctx.body;
  if (!refresh) {
    const { data: cached } = await admin.from('revision_notes').select('*').eq('subject_id', subject_id).order('created_at', { ascending: false }).limit(1);
    if (cached?.length) return { notes: cached[0].content, created_at: cached[0].created_at, cached: true };
  }
  await enforceLimit(ctx, ['tutor'], 'daily_generate_limit');
  const { data: subject } = await admin.from('subjects').select('*').eq('id', subject_id).single();
  const { data: topics } = await admin.from('topics').select('*').eq('subject_id', subject_id).order('sort');
  if (!subject) throw new HttpError(404, 'Subject not found');
  const notes = await handoutNotes(admin, subject_id, 60000);
  const { input, usage, model } = await callClaude({
    model: MODELS.tutor, maxTokens: 16000, system: TUTOR_PERSONA,
    content: [{ type: 'text', text: `Write a cliff-notes revision pack for Dhruv's ${subject.name} exam (${JSON.stringify(subject.papers)}).
One section per syllabus topic, in this order:
${(topics || []).map((t: any) => `${t.code}: ${t.name} [${t.paper}]`).join('\n')}

Exam format notes: ${subject.exam_notes || ''}
${notes ? `School handout notes — the source of truth; use their wording and examples. Lines marked "tutor comment", "my observation", "(unclear)" or "possible confusion" were added by the note-taker, not taught in class: do not present them as what the teacher taught, and do not use acronyms or names the notes say the teacher did not write.\n${notes}` : 'No school handouts uploaded yet: stick to standard Cambridge Lower Secondary Grade 6 content and say nothing you are unsure of.'}

Each section must be skimmable in under a minute the night before the exam: the 3-6 must-know points, the exact keywords examiners reward, any rule/formula/structure (with a tiny example), the classic traps, and one memory hook. For languages include the key vocabulary or grammar patterns with examples. For writing topics include a ready-to-use structure. Never reproduce copyrighted poems, lyrics or long passages.` }],
    tool: {
      name: 'revision_pack', description: 'Return the cliff notes',
      input_schema: { type: 'object', required: ['title', 'examTips', 'sections'], properties: {
        title: { type: 'string' },
        examTips: { type: 'array', items: { type: 'string' }, description: '3-5 exam-technique tips for this subject' },
        sections: { type: 'array', items: { type: 'object', required: ['code', 'heading', 'points', 'keywords', 'traps', 'hook'], properties: {
          code: { type: 'string' }, heading: { type: 'string' },
          points: { type: 'array', items: { type: 'string' } },
          keywords: { type: 'array', items: { type: 'object', required: ['term', 'meaning'], properties: { term: { type: 'string' }, meaning: { type: 'string' } } } },
          rule: { type: 'string', description: 'Formula / rule / structure with a tiny example, if relevant' },
          traps: { type: 'array', items: { type: 'string' } },
          hook: { type: 'string', description: 'One memory hook' },
        } } },
      } },
    },
  });
  await logUsage(admin, ctx.userId, 'tutor', model, usage);
  // Models occasionally return nested arrays as JSON strings — normalise before saving.
  for (const k of ['sections', 'examTips']) {
    if (typeof input[k] === 'string') {
      const raw = input[k].trim();
      try { input[k] = JSON.parse(raw); }
      catch {
        // salvage: cut to the outermost [ ... ] and retry
        const a = raw.indexOf('['), b = raw.lastIndexOf(']');
        try { input[k] = JSON.parse(raw.slice(a, b + 1)); } catch { console.error('unparseable', k, raw.slice(0, 300), raw.slice(-300)); input[k] = []; }
      }
    }
  }
  if (!Array.isArray(input.sections) || !input.sections.length) throw new HttpError(502, 'The notes came back empty — try Rewrite again');
  const { data: row } = await admin.from('revision_notes').insert({ subject_id, content: input, model }).select('created_at').single();
  return { notes: input, created_at: row?.created_at, cached: false };
}
