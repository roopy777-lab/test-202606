import { getStore } from '@netlify/blobs';

// ---- 응답 헬퍼 ----
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

// ---- Blob 저장소 ----
export const settingsStore = () => getStore('config');
export const applicantsStore = () => getStore('applicants');
export const scoresStore = () => getStore('scores');

const DEFAULT_SETTINGS = {
  setupComplete: false,
  title: '임용 지원서 심사',
  adminCode: '',
  rubric: [],
  evaluators: [],
};

export async function getSettings() {
  const s = await settingsStore().get('settings', { type: 'json' });
  return s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(s) {
  await settingsStore().set('settings', JSON.stringify(s));
}

// ---- 짧은 임의 코드 생성 ----
export const randCode = (len = 6) =>
  Math.random().toString(36).slice(2, 2 + len).toUpperCase();

export const newId = (prefix) =>
  prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---- 타이밍 안전 비교 ----
export function safeEqual(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- 인증 ----
export async function requireAdmin(req) {
  const settings = await getSettings();
  if (!settings.setupComplete) return { ok: false, settings, error: 'NOT_SETUP' };
  const code = req.headers.get('x-admin-code');
  if (!code || !safeEqual(code, settings.adminCode))
    return { ok: false, settings, error: 'UNAUTHORIZED' };
  return { ok: true, settings };
}

export async function requireEvaluator(req) {
  const settings = await getSettings();
  const id = req.headers.get('x-evaluator-id');
  const code = req.headers.get('x-evaluator-code');
  const ev = (settings.evaluators || []).find((e) => e.id === id);
  if (!ev || !safeEqual(code, ev.code))
    return { ok: false, settings, error: 'UNAUTHORIZED' };
  return { ok: true, settings, evaluator: ev };
}
