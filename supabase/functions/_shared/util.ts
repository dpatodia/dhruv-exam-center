import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Ctx = { admin: SupabaseClient; userId: string; role: 'student' | 'parent'; body: any };

/** Wraps a handler with CORS, auth and error handling. */
/** Long Claude calls can run past the gateway's 150 s idle limit. Once the caller is signed in we
 *  answer 200 straight away and send a space every 10 s (JSON ignores leading whitespace), then the
 *  result. Errors after this point are reported as {"error": ...} in the body. */
function streamed(work: Promise<unknown>) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      const t = setInterval(() => { try { c.enqueue(enc.encode(' ')); } catch { /* closed */ } }, 10000);
      work.then((out) => JSON.stringify(out ?? {}))
        .catch((e) => { console.error(e); return JSON.stringify({ error: (e as Error).message || String(e) }); })
        .then((txt) => { clearInterval(t); c.enqueue(enc.encode(txt)); c.close(); });
    },
  });
  return new Response(stream, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function serve(handler: (ctx: Ctx) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      const url = Deno.env.get('SUPABASE_URL')!;
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      const body0 = await req.clone().json().catch(() => ({}));
      // Admin path for maintenance scripts run by the parent (service-role key): acts as the parent.
      if (token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
        const { data: p } = await admin.from('profiles').select('id').eq('role', 'parent').limit(1).single();
        return streamed(handler({ admin, userId: p?.id, role: 'parent', body: body0 }));
      }
      const { data: { user }, error } = await admin.auth.getUser(token);
      if (error || !user) throw new HttpError(401, 'Not signed in');
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (!profile) throw new HttpError(403, 'No profile');
      const body = await req.json().catch(() => ({}));
      return streamed(handler({ admin, userId: user.id, role: profile.role, body }));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      return json({ error: (e as Error).message || String(e) }, status);
    }
  });
}

export async function settings(admin: SupabaseClient) {
  const { data } = await admin.from('app_settings').select('*').eq('id', 1).single();
  return data || { daily_generate_limit: 8, daily_grade_limit: 12, unlock_all: false };
}

/** Daily caps protect the API budget. Parents are not capped. */
export async function enforceLimit(ctx: Ctx, fns: string[], limitKey: 'daily_generate_limit' | 'daily_grade_limit' | 'daily_quiz_limit' | 'daily_chat_limit') {
  if (ctx.role === 'parent') return;
  const s = await settings(ctx.admin);
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { count } = await ctx.admin.from('usage_log').select('id', { count: 'exact', head: true })
    .in('fn', fns).eq('user_id', ctx.userId).gte('created_at', since);
  const cap = s[limitKey] ?? 10;
  if ((count ?? 0) >= cap) {
    const what = limitKey === 'daily_chat_limit' ? 'chat messages' : limitKey === 'daily_quiz_limit' ? 'pop quizzes' : limitKey === 'daily_grade_limit' ? 'markings' : 'new papers';
    throw new HttpError(429, `Daily limit reached: ${cap} ${what} in 24 hours. A slot frees up 24 hours after each one was made — or ask a parent to raise the limit in Settings.`);
  }
}

export async function logUsage(admin: SupabaseClient, userId: string, fn: string, model: string, usage: any) {
  await admin.from('usage_log').insert({ user_id: userId, fn, model, input_tokens: usage?.input_tokens || 0, output_tokens: usage?.output_tokens || 0 });
}

/**
 * School handout notes for a prompt, fairly shared across ALL handouts (not just the first few),
 * with handouts covering the focus topics given more room.
 */
export async function handoutNotes(admin: SupabaseClient, subjectId: string, maxChars = 45000, focus: string[] = []) {
  const { data } = await admin.from('handouts').select('title, notes, topic_codes').eq('subject_id', subjectId).eq('status', 'ready').order('created_at');
  const hs = (data || []).filter((h: any) => h.notes);
  if (!hs.length) return '';
  const total = hs.reduce((n: number, h: any) => n + h.notes.length + h.title.length + 20, 0);
  if (total <= maxChars) return hs.map((h: any) => `\n### Handout: ${h.title}\n${h.notes}\n`).join('');
  const rel = (h: any) => (focus.length && (h.topic_codes || []).some((c: string) => focus.includes(c)) ? 3 : 1);
  const weight = hs.reduce((n: number, h: any) => n + rel(h), 0);
  return hs.map((h: any) => {
    const budget = Math.max(800, Math.floor((maxChars * rel(h)) / weight) - h.title.length - 20);
    const body = h.notes.length > budget ? h.notes.slice(0, budget) + ' …' : h.notes;
    return `\n### Handout: ${h.title}\n${body}\n`;
  }).join('').slice(0, maxChars + 2000);
}

export function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function downloadAsBlock(admin: SupabaseClient, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw new HttpError(500, `Could not read ${path}`);
  const type = data.type || (path.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const b64 = toBase64(await data.arrayBuffer());
  if (type === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
  const media = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type) ? type : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: media, data: b64 } };
}
