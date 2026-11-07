import { serve, HttpError, enforceLimit, logUsage, handoutNotes } from '../_shared/util.ts';
import { callClaude, MODELS, TUTOR_PERSONA, QUESTION_SCHEMA } from '../_shared/claude.ts';
import { topicMastery } from '../_shared/scoring.js';
import { styleFor, paperMinutes } from '../_shared/style.ts';

const LEVEL_BRIEF: Record<string, string> = {
  foundational: 'FOUNDATIONAL: like a fair class test. About 60% recall/definitions, 30% straightforward application, 10% explain-why. Clear wording, familiar contexts. A solid student should score 75%+.',
  challenging: 'CHALLENGING: like the real CIS term exam. About 35% recall, 40% application in new contexts, 25% explain/compare/evaluate. Mark schemes are keyword-strict. A solid student should score 60-75%.',
  godmode: 'GOD-MODE: top-of-the-class stretch paper, STILL strictly inside the Grade 6 syllabus (never test content beyond it). Multi-step problems, unfamiliar contexts, traps that catch half-answers, questions that need precise keywords and full reasoning, a few that combine two topics. A strong student should score 45-65%.',
  quiz: 'POP QUIZ: exactly 15 rapid-fire flashcard questions worth 1 mark each, each answerable in about 15 seconds. ONLY types "mcq" (3 or 4 short options) and "truefalse". Prompts under 25 words, options under 8 words. If focus topics are given, every question is on those topics; otherwise about 70% on the topics where Dhruv is weakest or untested and 30% spread across the rest for revision. Mix recall, keywords and quick application; include classic traps. Explanations: one short, memorable line (a tip or memory hook).',
  listening: 'LISTENING PRACTICE (like the real 10-mark listening paper): first write an audio_script — a natural spoken passage in the target language, about 130-180 words, that a teacher would read aloud: a short dialogue, announcement or someone talking about themselves, using ONLY Grade 6 vocabulary and grammar from the syllabus topics. Then exactly 10 one-mark questions answerable ONLY by listening to it (types "mcq" with 3-4 options, or "truefalse"). Questions and options are in English for Spanish; in simple Hindi (Devanagari) for Hindi. Test specific details: numbers, times, places, people, likes/dislikes, what happens next. Questions in the order the information is heard. Topic for every question: L1.',
  drill: 'TOPIC DRILL: a short focused practice set on the focus topics only. Start easy and ramp up; include at least one question on the most common misconception for each topic.',
};

serve(async (ctx) => {
  const { subject_id, level = 'foundational', focus_topics = [], marks } = ctx.body;
  if (!LEVEL_BRIEF[level]) throw new HttpError(400, 'Unknown level');
  const fnName = level === 'quiz' ? 'generate-quiz' : 'generate-exam';
  await enforceLimit(ctx, [fnName], level === 'quiz' ? 'daily_quiz_limit' : 'daily_generate_limit');

  const { admin } = ctx;
  const { data: subject } = await admin.from('subjects').select('*').eq('id', subject_id).single();
  if (!subject) throw new HttpError(404, 'Subject not found');
  const { data: topics } = await admin.from('topics').select('*').eq('subject_id', subject_id).order('sort');
  const { data: attempts } = await admin.from('attempts').select('status,level,mode,graded_at,started_at,topic_scores')
    .eq('subject_id', subject_id).eq('status', 'graded').order('graded_at', { ascending: false }).limit(20);
  const { data: recentExams } = await admin.from('exams').select('questions').eq('subject_id', subject_id)
    .order('created_at', { ascending: false }).limit(4);

  const total = level === 'listening' ? 10 : level === 'quiz' ? 15 : Math.min(80, Math.max(10, Number(marks) || (level === 'drill' ? 20 : subject.practice_marks || 50)));
  const mastery: Record<string, any> = topicMastery(attempts || [], topics || []);
  const topicLines = (topics || []).map((t: any) => {
    const m = mastery[t.code];
    const perf = m?.mastery != null ? ` — Dhruv's mastery so far ${Math.round(m.mastery)}%` : ' — not yet tested';
    return `- ${t.code}: ${t.name} [${t.paper}, weight ${t.weight}]${perf}`;
  }).join('\n');
  const notes = await handoutNotes(admin, subject_id, 45000, focus_topics);
  const { data: errRows } = await admin.from('paper_errors').select('description, fix, status, exams!inner(subject_id)')
    .eq('exams.subject_id', subject_id).neq('status', 'not_an_error').order('created_at', { ascending: false }).limit(12);
  const pastErrors = (errRows || []).map((e: any) => `• ${e.description}${e.fix ? ` (fix: ${e.fix})` : ''}`).join('\n');
  const seen = (recentExams || []).flatMap((e: any) => (e.questions || []).map((q: any) => `• ${String(q.prompt).slice(0, 110)}`)).slice(0, 80).join('\n');
  const focus = focus_topics.length ? `Focus ONLY on these topic codes: ${focus_topics.join(', ')}.` :
    'Cover the WHOLE syllabus in proportion to the topic weights. Give slightly more marks to topics where Dhruv is weakest, but never skip a topic.';

  const written = !['quiz', 'listening'].includes(level);
  const schoolMin = paperMinutes(subject);
  const fullMarks = subject.practice_marks || 50;
  const minutes = level === 'quiz' ? 5 : level === 'listening' ? 10
    : schoolMin && total >= fullMarks ? schoolMin : Math.round(total * 1.2);
  const prompt = `Write a ${subject.name} practice paper for Dhruv.

Total marks: EXACTLY ${total}. Time allowed: ${minutes} minutes.
Difficulty: ${LEVEL_BRIEF[level]}
${focus}

Real exam papers for this subject: ${JSON.stringify(subject.papers)}
School format for this subject (this wins if it conflicts with the house style below): ${subject.exam_notes || 'Cambridge-style mix of question types.'}
${written ? `\n${styleFor(subject_id)}\n` : ''}
Syllabus topics (use these codes in "topic"):
${topicLines}

${notes ? `School handout notes (the source of truth — stay inside this content and use its terminology). Lines marked "tutor comment", "my observation", "(unclear)" or "possible confusion" were added by the note-taker, NOT taught in class: never test them, and never use a name, acronym or mnemonic that the notes say the teacher did not write; use the teacher's own wording instead.\n${notes}` : 'No handouts uploaded yet: stay strictly within standard Cambridge Lower Secondary Grade 6 content for these topics.'}

${pastErrors ? `Mistakes found in earlier papers for this subject — do not repeat them:\n${pastErrors}\n` : ''}
${seen ? `Do NOT repeat these recent questions (vary contexts and numbers):\n${seen}` : ''}

Rules:
- Group questions into sections with headings. Put MCQs first if the real paper has them.
- Each MCQ has 4 options (3 where the subject style says so) and one correct letter. Spread the correct letters.
- Each lettered part is its own question object (id q3a, number "3(a)"), with the shared context in "stem" on the first part only.
- Questions that need drawing (flowcharts, labelled diagrams, graphs) use type "diagram".
- Marks must match the number of creditworthy points in the mark scheme.
- Write any reading passage, source extract or data table inside the question prompt itself. Never quote copyrighted song lyrics or poems.
- Sum of all question marks must equal ${total}.
- Keep it tight (the whole reply must stay compact): never repeat a stem, model answers in a few words where possible, at most marks+2 short points in any markScheme, explanations under 15 words, no commentary.`;

  const model = level === 'godmode' ? MODELS.godmode : MODELS.generate;
  const { input, usage, model: used } = await callClaude({
    model,
    system: TUTOR_PERSONA + '\nYou are an experienced Cambridge examiner writing practice papers.',
    content: [{ type: 'text', text: prompt }],
    maxTokens: level === 'quiz' || level === 'listening' ? 12000 : 36000,
    onCutOff: (u, m) => { logUsage(admin, ctx.userId, fnName, m, u); },
    tool: {
      name: 'create_exam',
      description: 'Return the complete practice paper',
      input_schema: {
        type: 'object', required: ['title', 'instructions', 'questions'],
        properties: {
          title: { type: 'string', description: 'Short fun but clear title' },
          instructions: { type: 'string' },
          questions: { type: 'array', items: QUESTION_SCHEMA },
          audio_script: { type: 'string', description: 'Listening practice only: the passage to be read aloud, in the target language' },
        },
      },
    },
  });
  await logUsage(admin, ctx.userId, fnName, used, usage);

  // Validate + normalise
  const codes = new Set((topics || []).map((t: any) => t.code));
  const ids = new Set<string>();
  const qs = (input.questions || []).map((q: any, i: number) => {
    let id = String(q.id || `q${i + 1}`); while (ids.has(id)) id += 'x'; ids.add(id);
    const out: any = { ...q, id, marks: Math.max(1, Math.round(Number(q.marks) || 1)) };
    out.stem = String(q.stem || '').trim();
    if (!out.stem) delete out.stem;
    if (!codes.has(out.topic)) out.topic = level === 'listening' ? 'L1' : [...codes][0];
    if ((level === 'quiz' || level === 'listening') && !['mcq', 'truefalse'].includes(out.type)) out.type = out.options?.length ? 'mcq' : 'truefalse';
    if (level === 'quiz' || level === 'listening') out.marks = 1;
    if (level === 'listening') out.topic = 'L1';
    if (out.type === 'mcq') {
      out.options = (out.options || []).slice(0, 4);
      out.answer = String(out.answer || 'a').trim().toLowerCase().replace(/[^a-d]/g, '').slice(0, 1) || 'a';
      if ('abcd'.indexOf(out.answer) >= out.options.length) out.answer = 'a';
    }
    if (out.type === 'truefalse') out.answer = /^t/i.test(out.answer) ? 'True' : 'False';
    return out;
  });
  if (!qs.length) throw new HttpError(502, 'Empty paper — try again');
  // A shared stem is printed once (stem_first) but kept on every part of the same numbered
  // question, so online retries and the marker always see the context.
  const base = (n: string) => String(n || '').replace(/\(.*$/, '').trim();
  let cur = { b: '', stem: '' };
  for (const q of qs) {
    const b = base(q.number);
    if (b !== cur.b) cur = { b, stem: '' };
    if (q.stem && q.stem !== cur.stem) { cur.stem = q.stem; q.stem_first = true; }
    else if (cur.stem) q.stem = cur.stem;
  }
  if (level === 'listening' && !String(input.audio_script || '').trim()) throw new HttpError(502, 'No listening passage came back — try again');
  const sum = qs.reduce((s: number, q: any) => s + q.marks, 0);

  const SECRET = ['answer', 'markScheme', 'explanation'];
  // Pop quizzes give instant feedback per card, so they carry their answers.
  const pub = level === 'quiz' ? qs : qs.map((q: any) => Object.fromEntries(Object.entries(q).filter(([k]) => !SECRET.includes(k))));
  const key = Object.fromEntries(qs.map((q: any) => [q.id, { answer: q.answer, markScheme: q.markScheme || [], explanation: q.explanation || '' }]));

  const { data: exam, error } = await admin.from('exams').insert({
    subject_id, title: input.title || `${subject.name} ${level} paper`, level, total_marks: sum,
    duration_min: sum === total ? minutes : Math.round(sum * minutes / total), instructions: input.instructions, questions: pub,
    focus_topics, source: 'ai', model: used, created_by: ctx.userId,
    ...(level === 'listening' ? { audio_script: input.audio_script || '', audio_lang: subject_id === 'hindi' ? 'hi-IN' : 'es-ES', duration_min: 10 } : {}),
  }).select('id').single();
  if (error) throw new HttpError(500, error.message);
  await admin.from('exam_keys').insert({ exam_id: exam.id, key });
  return { exam_id: exam.id, total_marks: sum };
});
