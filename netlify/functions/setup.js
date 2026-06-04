import { getSettings, saveSettings, json, safeEqual, newId, randCode, decodeHeader } from '../lib/util.js';

export const config = { path: '/api/setup' };

// 관리자 설정 저장 (심사 제목 / 관리자 코드 / 채점항목 / 심사위원 명단)
// - 최초 설정(setupComplete=false)일 때는 인증 없이 부트스트랩 가능
// - 이후 수정은 x-admin-code 헤더 필요
export default async (req) => {
  if (req.method === 'GET') {
    // 관리자에게 코드 포함 전체 설정 반환
    const current = await getSettings();
    if (current.setupComplete) {
      if (!safeEqual(decodeHeader(req.headers.get('x-admin-code')), current.adminCode))
        return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }
    return json({ ok: true, settings: current });
  }

  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const body = await req.json().catch(() => ({}));
  const current = await getSettings();

  if (current.setupComplete) {
    if (!safeEqual(decodeHeader(req.headers.get('x-admin-code')), current.adminCode))
      return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  }

  const rubric = (body.rubric || [])
    .map((r) => ({
      id: r.id || newId('r'),
      name: String(r.name || '').trim(),
      max: Math.max(0, Number(r.max) || 0),
    }))
    .filter((r) => r.name);

  const evaluators = (body.evaluators || [])
    .map((e) => ({
      id: e.id || newId('e'),
      name: String(e.name || '').trim(),
      code: String(e.code || '').trim() || randCode(),
    }))
    .filter((e) => e.name);

  const adminCode = String(body.adminCode || '').trim() || current.adminCode;
  if (!adminCode) return json({ ok: false, error: 'ADMIN_CODE_REQUIRED' }, 400);

  const next = {
    setupComplete: true,
    title: String(body.title || '').trim() || '임용 지원서 심사',
    adminCode,
    rubric,
    evaluators,
  };

  await saveSettings(next);
  // 관리자가 코드를 배포할 수 있도록 코드 포함하여 반환
  return json({ ok: true, settings: next });
};
