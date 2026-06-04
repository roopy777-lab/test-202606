// Gemini를 이용해 PDF 지원서에서 핵심 정보를 추출/요약한다.
// PDF를 텍스트로 변환하지 않고 Gemini 멀티모달 입력(inline_data)으로 직접 전달하므로
// 스캔본(이미지) PDF도 어느 정도 처리할 수 있다.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    applicantName: { type: 'string', description: '지원자 이름' },
    applicationNumber: {
      type: 'string',
      description: '첫 페이지 표 최상단 왼쪽 칸의 10자리 접수번호(숫자만). 없으면 빈 문자열',
    },
    summary: { type: 'string', description: '학력/경력/연구실적/강점 요약' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
      },
    },
  },
  required: ['applicantName', 'applicationNumber', 'summary', 'fields'],
};

const PROMPT = `당신은 대학 교원 임용 지원서를 분석하는 행정 보조자입니다.
첨부된 PDF 지원서를 읽고 심사위원이 빠르게 파악할 수 있도록 핵심 정보를 한국어로 정리하세요.

- applicantName: 지원자 본인의 이름 (확인 불가 시 빈 문자열)
- applicationNumber: 지원서 첫 페이지 표의 최상단 왼쪽 칸에 적힌 10자리 접수번호.
  숫자만 추출하세요(하이픈·공백 제거). 확실하지 않거나 10자리 숫자가 없으면 빈 문자열로 두세요.
- summary: 지원자의 최종학력, 전공, 주요 경력, 연구실적, 강점을 5~8문장으로 요약
- fields: PDF에서 확인되는 항목을 라벨/값 쌍으로 정리
  (예: 생년월일, 최종학력, 전공, 주요경력, 연구실적(논문) 건수, 자격증, 지원분야 등)

규칙:
- PDF에서 확인되지 않는 정보는 추측하지 말고 생략하세요.
- 개인정보를 과장하거나 새로 만들어내지 마세요.`;

export async function processPdf(fileBase64) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new Error(
      'GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Netlify 사이트 설정에서 등록하세요.'
    );

  // data URL("data:application/pdf;base64,....") 형태면 prefix 제거
  const b64 = fileBase64.includes(',') ? fileBase64.split(',').pop() : fileBase64;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${t.slice(0, 400)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('') || '';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { applicantName: '', summary: text, fields: [] };
  }
  return {
    applicantName: String(parsed.applicantName || '').trim(),
    applicationNumber: String(parsed.applicationNumber || '').trim(),
    summary: String(parsed.summary || '').trim(),
    fields: Array.isArray(parsed.fields)
      ? parsed.fields
          .filter((f) => f && f.label)
          .map((f) => ({ label: String(f.label), value: String(f.value || '') }))
      : [],
  };
}
