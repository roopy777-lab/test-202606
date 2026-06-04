import { getSettings, json } from '../lib/util.js';

export const config = { path: '/api/config' };

// 로그인 화면 등에서 필요한 공개 설정만 반환한다.
// 접속코드(adminCode, evaluator.code)는 절대 반환하지 않는다.
export default async () => {
  const s = await getSettings();
  return json({
    setupComplete: s.setupComplete,
    title: s.title,
    rubric: s.rubric,
    evaluators: (s.evaluators || []).map((e) => ({ id: e.id, name: e.name })),
  });
};
