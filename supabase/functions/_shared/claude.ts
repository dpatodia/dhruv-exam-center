// Minimal Claude Messages API client using forced tool use for reliable JSON.
import { HttpError } from './util.ts';

export const MODELS = {
  generate: Deno.env.get('GEN_MODEL') || 'claude-sonnet-5-5',
  godmode: Deno.env.get('GODMODE_MODEL') || 'claude-opus-5-5',
  grade: Deno.env.get('GRADE_MODEL') || 'claude-opus-5-5',
  tutor: Deno.env.get('TUTOR_MODEL') || 'claude-sonnet-5-5',
};

export const TUTOR_PERSONA = `You are the personal exam tutor for Dhruv, an 11-year-old Grade 6 student at Calcutta International School (Cambridge curriculum, Kolkata, India).
Pitch everything at a strong Grade 6 Indian Cambridge student. Use British spelling. Be warm, direct and specific — like a good coach, never babyish.
Accuracy matters more than anything: if you are not sure a fact is right, leave it out.`;

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

export async function callClaude(opts: {
  model: string; system: string; content?: unknown[]; tool: ToolDef; maxTokens?: number;
  /** Multi-turn conversation instead of a single user message (content is then ignored). */
  messages?: { role: 'user' | 'assistant'; content: unknown }[];
  onCutOff?: (usage: any, model: string) => void;
}): Promise<{ input: any; usage: any; model: string }> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new HttpError(500, 'ANTHROPIC_API_KEY is not set on the server');
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 8000,
        system: `${opts.system}\n\nRespond ONLY by calling the ${opts.tool.name} tool exactly once, with the complete result. Do not write any other text.`,
        tools: [opts.tool],
        tool_choice: { type: 'auto' },
        messages: opts.messages || [{ role: 'user', content: opts.content }],
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = `${res.status} ${await res.text()}`;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const data = await res.json();
    if (!res.ok) throw new HttpError(502, `Claude API error: ${data?.error?.message || res.status}`);
    const block = (data.content || []).find((b: any) => b.type === 'tool_use');
    if (!block) { lastErr = 'no tool call'; continue; }
    if (data.stop_reason === 'max_tokens') {
      opts.onCutOff?.(data.usage, data.model || opts.model);
      throw new HttpError(502, 'Claude wrote more than fits in one go, so the paper was cut off. Please try again — if it keeps happening, tell a parent.');
    }
    return { input: block.input, usage: data.usage, model: data.model || opts.model };
  }
  throw new HttpError(503, `Claude is busy right now. Try again in a minute. (${lastErr.slice(0, 120)})`);
}

// Shared JSON schema for a question (with answer + mark scheme; split before saving).
export const QUESTION_SCHEMA = {
  type: 'object',
  required: ['id', 'number', 'section', 'type', 'marks', 'topic', 'prompt', 'answer', 'markScheme', 'explanation'],
  properties: {
    id: { type: 'string', description: 'q1, q2, q3a ... unique' },
    number: { type: 'string', description: 'Display number e.g. "3(b)"' },
    section: { type: 'string', description: 'Section heading e.g. "A · Multiple choice"' },
    type: { type: 'string', enum: ['mcq', 'truefalse', 'fill', 'short', 'long', 'numeric', 'diagram'], description: 'diagram = must be drawn/labelled on paper' },
    marks: { type: 'integer', minimum: 1 },
    topic: { type: 'string', description: 'Topic code from the syllabus list' },
    stem: { type: 'string', description: 'Shared context for a numbered question (situation, passage, sources, data table, described figure). Put it ONLY on the first part of that numbered question; later parts leave it empty. Use \\n for line breaks.' },
    prompt: { type: 'string', description: 'The text of this part only (command word + task), including any answer line such as "speed = ........ m/s". Use \\n for line breaks.' },
    options: { type: 'array', items: { type: 'string' }, description: 'mcq only: 4 options, no letter prefixes' },
    answer: { type: 'string', description: 'mcq: the letter a-d. truefalse: True/False. Otherwise the model answer.' },
    markScheme: { type: 'array', items: { type: 'string' }, description: 'Short marking points (a few words each), one per mark; add one "0 for …" note only where it matters' },
    explanation: { type: 'string', description: 'Why the answer is right, in ONE short sentence' },
  },
};
