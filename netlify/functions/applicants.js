import {
  applicantsStore,
  scoresStore,
  json,
  newId,
  requireAdmin,
  requireEvaluator,
} from '../lib/util.js';
import { processPdf } from '../lib/gemini.js';

export const config = { path: '/api/applicants' };

async function listApplicants() {
  const store = applicantsStore();
  const { blobs } = await store.list();
  const items = await Promise.all(
    blobs.map((b) => store.get(b.key, { type: 'json' }))
  );
  return items
    .filter(Boolean)
    .sort((a, b) =>
      String(a.appNumber).localeCompare(String(b.appNumber), undefined, {
        numeric: true,
      })
    );
}

export default async (req) => {
  const method = req.method;

  // 목록 조회: 관리자 또는 심사위원 모두 가능
  if (method === 'GET') {
    const admin = await requireAdmin(req);
    let authorized = admin.ok;
    if (!authorized) {
      const evalr = await requireEvaluator(req);
      authorized = evalr.ok;
    }
    if (!authorized) return json({ error: 'UNAUTHORIZED' }, 401);
    return json({ applicants: await listApplicants() });
  }

  // PDF 업로드 + Gemini 처리: 관리자만
  if (method === 'POST') {
    const admin = await requireAdmin(req);
    if (!admin.ok) return json({ error: 'UNAUTHORIZED' }, 401);

    const body = await req.json().catch(() => ({}));
    const { fileName, fileBase64, appNumber } = body;
    if (!fileBase64) return json({ error: 'NO_FILE' }, 400);

    let extracted;
    try {
      extracted = await processPdf(fileBase64);
    } catch (e) {
      return json({ error: 'GEMINI_ERROR', message: String(e.message || e) }, 502);
    }

    const id = newId('a');
    const rec = {
      id,
      appNumber: String(appNumber || '').trim() || '',
      displayName: extracted.applicantName || fileName || '(이름 미상)',
      fileName: fileName || '',
      summary: extracted.summary || '',
      fields: extracted.fields || [],
      createdAt: new Date().toISOString(),
    };
    await applicantsStore().set(id, JSON.stringify(rec));
    return json({ ok: true, applicant: rec });
  }

  // 접수번호/이름 수정: 관리자만
  if (method === 'PATCH') {
    const admin = await requireAdmin(req);
    if (!admin.ok) return json({ error: 'UNAUTHORIZED' }, 401);

    const body = await req.json().catch(() => ({}));
    const { id, appNumber, displayName } = body;
    const store = applicantsStore();
    const rec = await store.get(id, { type: 'json' });
    if (!rec) return json({ error: 'NOT_FOUND' }, 404);
    if (appNumber !== undefined) rec.appNumber = String(appNumber).trim();
    if (displayName !== undefined) rec.displayName = String(displayName).trim();
    await store.set(id, JSON.stringify(rec));
    return json({ ok: true, applicant: rec });
  }

  // 삭제(+관련 점수 삭제): 관리자만
  if (method === 'DELETE') {
    const admin = await requireAdmin(req);
    if (!admin.ok) return json({ error: 'UNAUTHORIZED' }, 401);

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'NO_ID' }, 400);
    await applicantsStore().delete(id);

    const ss = scoresStore();
    const { blobs } = await ss.list({ prefix: id + '::' });
    await Promise.all(blobs.map((b) => ss.delete(b.key)));
    return json({ ok: true });
  }

  return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
};
