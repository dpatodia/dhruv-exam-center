import { serve, HttpError, enforceLimit, logUsage, downloadAsBlock } from '../_shared/util.ts';
import { callClaude, MODELS, TUTOR_PERSONA, QUESTION_SCHEMA } from '../_shared/claude.ts';
import { topicMastery, subjectReadiness, computeXp, streak, dayKey } from '../_shared/scoring.js';

const RESULT_ITEM = {
  type: 'object',
  required: ['qid', 'awarded', 'studentAnswer', 'feedback', 'correctAnswer', 'why'],
  properties: {
    qid: { type: 'string' },
    awarded: { type: 'number', description: 'Marks awarded, 0..max, halves allowed only if the mark scheme allows' },
    studentAnswer: { type: 'string', description: "What Dhruv wrote (transcribe from the photo if handwritten). '' if blank." },
    feedback: { type: 'string', description: 'One or two sentences to Dhruv: what was good / what exactly was missing. Second person.' },
    correctAnswer: { type: 'string', description: 'The full-mark answer, written as Dhruv should have written it' },
    why: { type: 'string', description: 'The reasoning: why the correct answer is right and, if he lost marks, why his answer fell short' },
  },
};

const GRADE_RULES = `Marking rules:
- Mark like a fair but strict Cambridge examiner using the mark scheme. Award a mark only for a creditworthy point actually written.
- Accept correct alternatives and spelling slips that do not change the meaning; do not credit vague half-answers where the scheme wants a keyword.
- For handwriting you cannot read, say so in feedback and award only what you can read.
- For every question that is not full marks, the explanation must tell Dhruv exactly what was wrong, what the right answer is, and the reasoning.
- For full-mark answers keep feedback short and specific ("Spot-on use of 'actuator'").`;

serve(async (ctx) => {
  const { admin } = ctx;
  const { attempt_id } = ctx.body;
  const { data: att } = await admin.from('attempts').select('*').eq('id', attempt_id).single();
  if (!att) throw new HttpError(404, 'Attempt not found');
  if (att.student_id !== ctx.userId && ctx.role !== 'parent') throw new HttpError(403, 'Not your attempt');
  if (!['submitted', 'error'].includes(att.status)) throw new HttpError(409, `Attempt is ${att.status}`);
  await enforceLimit(ctx, ['grade-attempt'], 'daily_grade_limit');
  await admin.from('attempts').update({ status: 'grading', error: null }).eq('id', att.id);

  try {
    const photos = [];
    for (const [i, p] of (att.photo_paths || []).slice(0, 14).entries()) {
      const name = p.split('/').pop() || '';
      const qid = name.replace(/^\d+-/, '').replace(/\.\w+$/, '');
      photos.push({ type: 'text', text: att.mode === 'online' ? `Image ${i + 1}: Dhruv's drawing/working for question id "${qid}"` : `Page ${i + 1}` });
      photos.push(await downloadAsBlock(admin, 'answer-photos', p));
    }
    const { data: subject } = await admin.from('subjects').select('*').eq('id', att.subject_id).single();
    const { data: topics } = await admin.from('topics').select('*').eq('subject_id', att.subject_id).order('sort');

    let exam: any = null, key: any = {}, questions: any[] = [];
    let results: any[] = [];
    let summary = '', tips: string[] = [];

    if (att.exam_id) {
      ({ data: exam } = await admin.from('exams').select('*').eq('id', att.exam_id).single());
      const { data: k } = await admin.from('exam_keys').select('key').eq('exam_id', att.exam_id).single();
      key = k?.key || {};
      questions = (exam.questions || []).filter((q: any) => !att.question_ids?.length || att.question_ids.includes(q.id));
      const typed = att.answers || {};
      const needsClaude: any[] = [];
      for (const q of questions) {
        const ans = String(typed[q.id] ?? '').trim();
        const k2 = key[q.id] || {};
        const objective = q.type === 'mcq' || q.type === 'truefalse';
        if (objective && ans) {
          const right = q.type === 'mcq' ? ans.toLowerCase() === String(k2.answer).toLowerCase()
            : ans.toLowerCase()[0] === String(k2.answer).toLowerCase()[0];
          const optText = (l: string) => q.options?.['abcd'.indexOf(l)] ?? l;
          results.push({
            qid: q.id, awarded: right ? q.marks : 0, studentAnswer: q.type === 'mcq' ? `${ans}) ${optText(ans)}` : ans,
            feedback: right ? 'Correct.' : 'Not this one.',
            correctAnswer: q.type === 'mcq' ? `${k2.answer}) ${optText(k2.answer)}` : k2.answer,
            why: k2.explanation || '', auto: true,
          });
        } else if (!ans && !photos.length) {
          results.push({ qid: q.id, awarded: 0, studentAnswer: '', feedback: 'No answer given — even a partial answer can earn marks.',
            correctAnswer: k2.answer, why: k2.explanation || (k2.markScheme || []).join(' '), auto: true });
        } else needsClaude.push(q);
      }
      // Objective answers that were wrong still deserve a proper explanation → let Claude write "why" for them too.
      const wrongObjective = exam.level === 'quiz' ? [] : results.filter((r) => r.auto && r.awarded === 0 && r.studentAnswer).map((r) => r.qid);
      const toClaude = [...needsClaude, ...questions.filter((q) => wrongObjective.includes(q.id))];

      if (toClaude.length || photos.length) {
        let lastStem = '';
        const qText = toClaude.map((q) => {
          const k2 = key[q.id] || {};
          // Shared context (passage, sources, data) is sent once per numbered question.
          const stem = q.stem && q.stem !== lastStem ? `Context for Q${String(q.number).replace(/\(.*$/, '')}:\n${q.stem}\n` : '';
          if (q.stem) lastStem = q.stem;
          return `${stem}[${q.id}] Q${q.number} (${q.marks} mark${q.marks > 1 ? 's' : ''}, ${q.type}, topic ${q.topic})
Question: ${q.prompt}${q.options ? '\nOptions: ' + q.options.map((o: string, i: number) => `${'abcd'[i]}) ${o}`).join('  ') : ''}
Model answer: ${k2.answer}
Mark scheme: ${(k2.markScheme || []).join(' | ') || '—'}
Dhruv's typed answer: ${photos.length && !String(typed[q.id] ?? '').trim() ? '(see the photos)' : JSON.stringify(typed[q.id] ?? '')}`;
        }).join('\n\n');
        const { input, usage, model } = await callClaude({
          model: MODELS.grade, maxTokens: 16000,
          system: TUTOR_PERSONA + '\n' + GRADE_RULES,
          content: [
            ...photos,
            { type: 'text', text: `Subject: ${subject.name}. Paper: ${exam.title}.
${photos.length ? `The image(s)/document(s) above are Dhruv's handwritten answers or drawings. Find each question's answer in them (match by question number).` : ''}
Mark these questions and return one result per question id:

${qText}

Also write a 2-3 sentence overall summary for Dhruv (encouraging, honest, specific) and 3 concrete tips for next time. You may be seeing only some questions of the paper (the rest were auto-marked), so do NOT state any total score or mark count in the summary.` },
          ],
          tool: {
            name: 'submit_grades', description: 'Return the marking',
            input_schema: { type: 'object', required: ['results', 'summary', 'tips'], properties: {
              results: { type: 'array', items: RESULT_ITEM }, summary: { type: 'string' }, tips: { type: 'array', items: { type: 'string' } } } },
          },
        });
        await logUsage(admin, ctx.userId, 'grade-attempt', model, usage);
        summary = input.summary; tips = input.tips || [];
        const byId = Object.fromEntries((input.results || []).map((r: any) => [r.qid, r]));
        // Claude's verdict wins for anything it saw; for auto-marked wrong objectives keep the auto mark but take its explanation.
        results = results.filter((r) => !toClaude.find((q) => q.id === r.qid) || wrongObjective.includes(r.qid));
        for (const q of toClaude) {
          const r = byId[q.id];
          const existing = results.find((x) => x.qid === q.id);
          if (existing) { if (r) { existing.why = r.why || existing.why; existing.feedback = r.feedback || existing.feedback; } continue; }
          results.push(r ? { ...r, qid: q.id } : { qid: q.id, awarded: 0, studentAnswer: '', feedback: 'Could not find an answer for this question.', correctAnswer: key[q.id]?.answer, why: key[q.id]?.explanation || '' });
        }
      }
    } else {
      // External paper: Claude reads the question paper + answers from the photos, writes a mark scheme and marks it.
      if (!photos.length) throw new HttpError(400, 'Upload photos of the paper and answers');
      const topicLines = (topics || []).map((t: any) => `${t.code}: ${t.name}`).join('\n');
      const { input, usage, model } = await callClaude({
        model: MODELS.grade, maxTokens: 20000,
        system: TUTOR_PERSONA + '\n' + GRADE_RULES,
        content: [...photos, { type: 'text', text: `These are photos of a ${subject.name} paper Dhruv has done (questions and his handwritten answers, possibly with a teacher's marks).
1. Transcribe every question (with its marks if shown; otherwise estimate sensible marks).
2. Write the model answer and mark scheme for each.
3. Mark Dhruv's answer. If a teacher's mark is visible, use your own independent marking but mention a disagreement in feedback.
Tag each question with the closest topic code:\n${topicLines}` }],
        tool: {
          name: 'mark_external_paper', description: 'Return the transcribed paper and marking',
          input_schema: { type: 'object', required: ['title', 'questions', 'results', 'summary', 'tips'], properties: {
            title: { type: 'string' }, questions: { type: 'array', items: QUESTION_SCHEMA },
            results: { type: 'array', items: RESULT_ITEM }, summary: { type: 'string' }, tips: { type: 'array', items: { type: 'string' } } } },
        },
      });
      await logUsage(admin, ctx.userId, 'grade-attempt', model, usage);
      const SECRET = ['answer', 'markScheme', 'explanation'];
      questions = input.questions.map((q: any) => ({ ...q, marks: Math.max(1, Math.round(q.marks || 1)) }));
      const pub = questions.map((q: any) => Object.fromEntries(Object.entries(q).filter(([k]) => !SECRET.includes(k))));
      key = Object.fromEntries(questions.map((q: any) => [q.id, { answer: q.answer, markScheme: q.markScheme || [], explanation: q.explanation || '' }]));
      const tot = questions.reduce((s: number, q: any) => s + q.marks, 0);
      const { data: ex } = await admin.from('exams').insert({ subject_id: att.subject_id, title: input.title || `${subject.name} uploaded paper`,
        level: att.level === 'school' ? 'school' : 'external', total_marks: tot, duration_min: 60, questions: pub, source: 'upload', model, created_by: ctx.userId }).select('*').single();
      exam = ex;
      await admin.from('exam_keys').insert({ exam_id: ex.id, key });
      results = input.results; summary = input.summary; tips = input.tips || [];
    }

    // Normalise results + topic scores
    const qById = Object.fromEntries(questions.map((q: any) => [q.id, q]));
    const topicScores: Record<string, { got: number; max: number }> = {};
    let score = 0, total = 0;
    results = questions.map((q: any) => {
      const r = results.find((x) => x.qid === q.id) || { qid: q.id, awarded: 0, studentAnswer: '', feedback: 'Not answered.', correctAnswer: key[q.id]?.answer, why: '' };
      const awarded = Math.max(0, Math.min(q.marks, Math.round(Number(r.awarded || 0) * 2) / 2));
      const verdict = !String(r.studentAnswer || '').trim() && awarded === 0 ? 'blank' : awarded >= q.marks ? 'correct' : awarded > 0 ? 'partial' : 'wrong';
      score += awarded; total += q.marks;
      const t = q.topic || 'misc';
      topicScores[t] = topicScores[t] || { got: 0, max: 0 };
      topicScores[t].got += awarded; topicScores[t].max += q.marks;
      return { qid: q.id, number: q.number, topic: q.topic, max: q.marks, awarded, verdict,
        studentAnswer: r.studentAnswer, feedback: r.feedback, correctAnswer: r.correctAnswer, why: r.why };
    }).filter((r: any) => qById[r.qid]);
    const pct = total ? (100 * score) / total : 0;
    // Trust the paper's level, not the client's, so XP can't be inflated.
    const level = att.exam_id ? exam.level : (['external', 'school'].includes(att.level) ? att.level : 'external');

    // XP — computed with the same shared rules the app shows.
    const { data: prior } = await admin.from('attempts').select('id,subject_id,status,level,mode,score,total,graded_at,started_at,topic_scores')
      .eq('student_id', att.student_id).eq('status', 'graded');
    const { data: allTopics } = await admin.from('topics').select('*');
    const { data: subjects } = await admin.from('subjects').select('*').eq('active', true);
    const { data: xpEv } = await admin.from('xp_events').select('created_at,kind').eq('student_id', att.student_id);
    const before = subjectReadiness(subject, allTopics || [], prior || []);
    const ranked = (subjects || []).map((s: any) => ({ id: s.id, ...subjectReadiness(s, allTopics || [], prior || []) }))
      .filter((x: any) => x.daysToExam != null)
      .sort((a: any, b: any) => a.preparedness - b.preparedness || (a.daysToExam ?? 99) - (b.daysToExam ?? 99));
    const st = streak(xpEv || []);
    const items = computeXp({
      pct, level, mode: att.mode,
      fixedCount: att.mode === 'retry' ? results.filter((r: any) => r.verdict === 'correct').length : 0,
      readinessBefore: before.predicted,
      masteryBefore: topicMastery((prior || []).filter((a: any) => a.subject_id === att.subject_id), topics || []),
      topicScores, streakDays: st.days, firstToday: !(xpEv || []).some((e: any) => dayKey(e.created_at) === dayKey(new Date())),
      isWeakestSubject: ranked[0]?.id === att.subject_id && att.mode !== 'retry',
      maxCombo: (() => { let m = 0, c = 0; for (const r of results) { c = r.verdict === 'correct' ? c + 1 : 0; m = Math.max(m, c); } return m; })(),
      timeTaken: att.time_taken_sec,
      firstQuizToday: level === 'quiz' && !(xpEv || []).some((e: any) => e.kind === 'dailyquiz' && dayKey(e.created_at) === dayKey(new Date())),
    });
    const xp = items.reduce((s, i) => s + i.amount, 0);
    const rows = items.filter((i) => i.amount > 0).map((i) => ({ student_id: att.student_id, amount: i.amount, reason: i.reason, kind: i.kind, ref_id: att.id }));
    if (rows.length) await admin.from('xp_events').insert(rows);

    const now = new Date();
    const { error } = await admin.from('attempts').update({
      exam_id: exam?.id ?? att.exam_id, level, status: 'graded', graded_at: now.toISOString(), score, total, results,
      topic_scores: topicScores, summary, tips: { tips, xp: items }, xp_awarded: xp,
      time_taken_sec: att.time_taken_sec ?? (att.submitted_at ? Math.round((+new Date(att.submitted_at) - +new Date(att.started_at)) / 1000) : null),
    }).eq('id', att.id);
    if (error) throw new HttpError(500, error.message);
    return { ok: true, score, total, xp, items };
  } catch (e) {
    await admin.from('attempts').update({ status: 'error', error: (e as Error).message }).eq('id', att.id);
    throw e;
  }
});
