import { getSettings, json, safeEqual } from '../lib/util.js';

export const config = { path: '/api/login' };

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const body = await req.json().catch(() => ({}));
  const { role, evaluatorId, code } = body;
  const s = await getSettings();

  if (role === 'admin') {
    if (!s.setupComplete) return json({ ok: false, error: 'NOT_SETUP' }, 400);
    if (!safeEqual(code, s.adminCode)) return json({ ok: false }, 401);
    return json({ ok: true, role: 'admin' });
  }

  const ev = (s.evaluators || []).find((e) => e.id === evaluatorId);
  if (!ev || !safeEqual(code, ev.code)) return json({ ok: false }, 401);
  return json({ ok: true, role: 'evaluator', id: ev.id, name: ev.name });
};
