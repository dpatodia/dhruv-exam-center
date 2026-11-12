import { serve, HttpError, logUsage, downloadAsBlock } from '../_shared/util.ts';
import { callClaude, MODELS, TUTOR_PERSONA } from '../_shared/claude.ts';

serve(async (ctx) => {
  const { admin } = ctx;
  const { handout_id } = ctx.body;
  const { data: h } = await admin.from('handouts').select('*').eq('id', handout_id).single();
  if (!h) throw new HttpError(404, 'Handout not found');
  await admin.from('handouts').update({ status: 'processing', error: null }).eq('id', h.id);
  try {
    const { data: subject } = await admin.from('subjects').select('name').eq('id', h.subject_id).single();
    const { data: topics } = await admin.from('topics').select('code,name').eq('subject_id', h.subject_id).order('sort');
    const block = h.source_text
      ? { type: 'text', text: `--- Document text (from ${h.title}) ---\n${String(h.source_text).slice(0, 150000)}\n--- End of document ---` }
      : await downloadAsBlock(admin, 'handouts', h.storage_path);
    const { input, usage, model } = await callClaude({
      model: MODELS.tutor, maxTokens: 20000,
      system: TUTOR_PERSONA,
      content: [block, { type: 'text', text: `${h.source_text ? 'Above is the text of' : 'This is'} a school ${subject?.name} handout/worksheet titled "${h.title}".
Turn it into complete study notes that a paper-writer and a tutor can rely on instead of the original:
- every fact, definition, keyword, example, diagram description and rule it contains, in the school's own wording where it matters;
- any worksheet questions with correct answers (mark where the handout itself seems wrong or oversimplified);
- nothing that is not in the document;
- never copy out song lyrics or poems: name the song/poem and summarise its lines, quoting at most 4 words at a time.
Be compact: aim for under 1,500 words. For long documents (textbooks, big revision packs) keep only what matters for the Grade 6 syllabus topics below, and say which chapters/pages you skipped.
Tag which syllabus topics it covers:\n${(topics || []).map((t: any) => `${t.code}: ${t.name}`).join('\n')}` }],
      tool: {
        name: 'handout_notes', description: 'Return study notes for the handout',
        input_schema: { type: 'object', required: ['summary', 'topic_codes', 'notes_markdown'], properties: {
          summary: { type: 'string', description: 'One sentence' },
          topic_codes: { type: 'array', items: { type: 'string' } },
          notes_markdown: { type: 'string' } } },
      },
    });
    await logUsage(admin, ctx.userId, 'ingest-handout', model, usage);
    await admin.from('handouts').update({
      status: 'ready', notes: `${input.summary}\n\n${input.notes_markdown}`, topic_codes: input.topic_codes || [],
    }).eq('id', h.id);
    return { ok: true, summary: input.summary };
  } catch (e) {
    await admin.from('handouts').update({ status: 'error', error: (e as Error).message }).eq('id', h.id);
    throw e;
  }
});
