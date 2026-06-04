import { getSettings, saveSettings, json, safeEqual } from '../lib/util.js';

export const config = { path: '/api/recover' };

// 관리자 코드 복구/재설정
// - Netlify 환경변수 ADMIN_RESET_CODE 가 설정되어 있어야 동작
// - resetCode가 일치하면 새 관리자 코드로 교체 (기존 지원자/점수/심사위원 설정은 유지)
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const resetCode = process.env.ADMIN_RESET_CODE;
  if (!resetCode)
    return json({ ok: false, error: 'RESET_NOT_CONFIGURED' }, 400);

  const body = await req.json().catch(() => ({}));
  if (!safeEqual(body.resetCode, resetCode))
    return json({ ok: false, error: 'INVALID_RESET_CODE' }, 401);

  const newAdminCode = String(body.newAdminCode || '').trim();
  if (!newAdminCode)
    return json({ ok: false, error: 'NEW_CODE_REQUIRED' }, 400);

  const current = await getSettings();
  const next = { ...current, adminCode: newAdminCode, setupComplete: true };
  await saveSettings(next);

  return json({ ok: true });
};
