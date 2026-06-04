# 임용 지원서 심사 시스템

PDF 형식의 임용 지원서를 업로드하면 **Gemini(gemini-3-flash-preview)** 가 내용을 자동으로
요약·정리하고, 심사위원들이 **본인 점수만** 입력하며, 행정직원(관리자)이 전체 결과를
**접수번호순 / 점수순**으로 취합·확인할 수 있는 웹앱입니다.

- 프론트엔드: 정적 웹(빌드 불필요)
- 백엔드: Netlify Functions(서버리스)
- 저장소: Netlify Blobs(별도 DB 설치 불필요)
- AI: Gemini API (서버에서만 호출 → **API Key가 외부에 노출되지 않음**)

## 핵심 동작 방식

| 역할 | 하는 일 |
|------|---------|
| **행정직원(관리자)** | 배포·API Key 등록·심사 항목/심사위원 설정·PDF 업로드·결과 취합 |
| **심사위원** | 이름 선택 + 접속코드 입력 → 지원서 확인 → **본인 점수만** 입력 |

- API Key는 **행정직원 1명이 배포 시 한 번만** Netlify에 등록합니다. 심사위원은 입력할 필요가 없습니다.
- 심사위원은 **다른 심사위원의 점수를 볼 수 없습니다.** (서버에서 본인 점수만 반환)

---

## 배포 방법 (행정직원이 1회 수행)

### 1) Gemini API Key 발급
- Google AI Studio(<https://aistudio.google.com/apikey>)에서 API Key를 발급받습니다.

### 2) Netlify에 배포
이 저장소를 GitHub에 올린 뒤, [Netlify](https://app.netlify.com)에서:

1. **Add new site → Import an existing project** 로 이 저장소를 연결합니다.
2. 빌드 설정은 `netlify.toml`에 이미 들어 있으므로 그대로 두면 됩니다.
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
3. **Site configuration → Environment variables** 에서 다음을 추가합니다.

   | Key | Value |
   |-----|-------|
   | `GEMINI_API_KEY` | (발급받은 Gemini API Key) |

   > (선택) 모델을 바꾸려면 `GEMINI_MODEL` 변수에 모델명을 넣으면 됩니다. 기본값: `gemini-3-flash-preview`

4. 환경변수를 추가한 뒤 **Deploys → Trigger deploy → Deploy site** 로 재배포합니다.
5. **Blobs는 별도 설정이 필요 없습니다.** (Netlify가 자동 제공)

### 3) 최초 설정
- 배포된 사이트에 접속 → 로그인 화면에서 **"최초 설정 시작"** 클릭
- **관리자 코드**(행정직원 본인만 아는 비밀번호) 설정
- **채점 항목**(이름·만점)과 **심사위원 명단**(이름·접속코드) 구성 후 저장
- 저장하면 심사위원별 접속코드가 표시됩니다. 각 심사위원에게 **이름과 접속코드**를 전달하세요.

---

## 사용 방법

### 행정직원
1. **① 설정** : 심사 제목, 관리자 코드, 채점 항목, 심사위원 명단 관리
2. **② 지원서 등록** : PDF 업로드 → 자동 요약·정리, 접수번호·이름 수정 가능
3. **③ 결과 취합** : 심사위원별 점수·평균·합계 확인, 접수번호순/점수순 정렬, CSV 내보내기

### 심사위원
1. 로그인 화면에서 **심사위원** 탭 → 본인 이름 선택 + 접속코드 입력
2. 지원자를 선택해 요약·정보 확인 후 항목별 점수와 의견 입력 → **점수 저장**
3. 본인이 입력한 점수만 보이며, 언제든 다시 들어와 수정할 수 있습니다.

---

## 로컬 테스트 (선택)
Netlify CLI가 있으면 로컬에서 동일하게 실행할 수 있습니다.

```bash
npm install
npm install -g netlify-cli      # 최초 1회
export GEMINI_API_KEY=발급받은키   # Windows PowerShell: $env:GEMINI_API_KEY="키"
netlify dev
```

`netlify dev`는 Functions와 Blobs를 로컬에서 함께 띄워 줍니다.

---

## 참고 / 제한
- Netlify Functions의 요청 크기 제한으로 **PDF 1개당 약 4~5MB 이하**를 권장합니다. 더 크면 압축 후 업로드하세요.
- 스캔본(이미지) PDF도 Gemini가 어느 정도 읽지만, 텍스트 PDF가 인식 품질이 더 좋습니다.
- 접속코드는 내부 위원회용 수준의 간단한 인증입니다. 외부 공개가 필요한 민감 데이터라면 별도 보안 검토를 권장합니다.

## 향후 확장 아이디어
- 구글 드라이브 공유 링크로 PDF 일괄 가져오기
- 항목별(세부 점수) 결과 표/엑셀 내보내기
- 심사 마감/잠금 기능
