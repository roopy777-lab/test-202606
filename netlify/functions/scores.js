import { scoresStore, json, requireEvaluator } from '../lib/util.js';

export const config = { path: '/api/scores' };

// 심사위원은 '본인' 점수만 조회/저장할 수 있다. (타 심사위원 점수 접근 불가)
export default async (req) => {
  const evalr = await requireEvaluator(req);
  if (!evalr.ok) return json({ error: 'UNAUTHORIZED' }, 401);
  const me = evalr.evaluator;
  const ss = scoresStore();

  if (req.method === 'GET') {
    const applicantId = new URL(req.url).searchParams.get('applicantId');
    if (applicantId) {
      const rec = await ss.get(`${applicantId}::${me.id}`, { type: 'json' });
      return json({ score: rec || null });
    }
    // 본인의 전체 점수
    const { blobs } = await ss.list();
    const mine = [];
    for (const b of blobs) {
      if (b.key.endsWith('::' + me.id)) {
        const r = await ss.get(b.key, { type: 'json' });
        if (r) mine.push(r);
      }
    }
    return json({ scores: mine });
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { applicantId, scores, comment } = body;
    if (!applicantId) return json({ error: 'NO_APPLICANT' }, 400);

    const rubric = evalr.settings.rubric || [];
    const cleanScores = {};
    let total = 0;
    for (const r of rubric) {
      let v = Number(scores?.[r.id]);
      if (isNaN(v)) v = 0;
      v = Math.max(0, Math.min(v, r.max));
      cleanScores[r.id] = v;
      total += v;
    }

    const rec = {
      applicantId,
      evaluatorId: me.id,
      evaluatorName: me.name,
      scores: cleanScores,
      total,
      comment: String(comment || ''),
      updatedAt: new Date().toISOString(),
    };
    await ss.set(`${applicantId}::${me.id}`, JSON.stringify(rec));
    return json({ ok: true, score: rec });
  }

  return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
};
