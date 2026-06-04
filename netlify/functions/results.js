import { applicantsStore, scoresStore, json, requireAdmin } from '../lib/util.js';

export const config = { path: '/api/results' };

// 행정직원(관리자)만 전체 취합 결과를 볼 수 있다.
export default async (req) => {
  const admin = await requireAdmin(req);
  if (!admin.ok) return json({ error: 'UNAUTHORIZED' }, 401);
  const settings = admin.settings;

  const as = applicantsStore();
  const { blobs: ab } = await as.list();
  const applicants = (
    await Promise.all(ab.map((b) => as.get(b.key, { type: 'json' })))
  ).filter(Boolean);

  const ss = scoresStore();
  const { blobs: sb } = await ss.list();
  const allScores = (
    await Promise.all(sb.map((b) => ss.get(b.key, { type: 'json' })))
  ).filter(Boolean);

  const byApplicant = {};
  for (const sc of allScores) {
    (byApplicant[sc.applicantId] = byApplicant[sc.applicantId] || []).push(sc);
  }

  const evaluators = (settings.evaluators || []).map((e) => ({
    id: e.id,
    name: e.name,
  }));

  const rows = applicants.map((a) => {
    const list = byApplicant[a.id] || [];
    const totals = list.map((s) => s.total);
    const sum = totals.reduce((x, y) => x + y, 0);
    const avg = totals.length ? sum / totals.length : 0;
    return {
      applicantId: a.id,
      appNumber: a.appNumber,
      displayName: a.displayName,
      evaluatorScores: evaluators.map((e) => {
        const s = list.find((x) => x.evaluatorId === e.id);
        return {
          evaluatorId: e.id,
          evaluatorName: e.name,
          total: s ? s.total : null,
          scores: s ? s.scores : null,
          comment: s ? s.comment : '',
          submitted: !!s,
        };
      }),
      sum,
      average: Math.round(avg * 100) / 100,
      submittedCount: list.length,
      evaluatorCount: evaluators.length,
    };
  });

  return json({ title: settings.title, rubric: settings.rubric, evaluators, rows });
};
