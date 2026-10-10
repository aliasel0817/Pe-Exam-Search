# Stage 5 – Aoede TTS 운영 학습노트 PWA 배포/실검증 체크포인트

기준일: 2026-10-10 (KST). 이 문서는 추후 채팅 이관용이며 기존 음성 데이터 변경 지시가 아님.

## 실제 확인 상태

- **운영 URL:** https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html
- **운영 main:** `f3b0cd635a3757eebfb21ba75912f5ea76a8a863`
- **반영 전 기준:** `37ad2f9aad50dc928a0b159dc1c3d7cf37a8db3c`
- 기존 기준 대비 운영 변경 파일은 정확히 3개:
  - `study-note/study-note.html` (기존 UI+Bridge, 듣기/반복/옵션 추가)
  - `study-note/tts/natural-tts.js` (신규; 클라우드 읽기 전용 TTS)
  - `study-note/tts/cloud-config.json` (신규; 이미 실기기 승인된 게이트웨이)
- 추가 운영 변경: PWA `study-note.html`의 TTS 스크립트에
  `?v=3672248e`를 붙여 캐시 무효화.
  `T0000` 홈 및 학습대상 `N`에서는 듣기/반복 버튼 숨김.
- `service-worker.js` 변경 **없음** (blob `e9c247d1236b917e3ed081ad4bfdd1080b5b8375`).
- GitHub Pages `main` 배포 작업 최종 `success`.
- **실제 Windows 원격 환경에서 3개의 GitHub Pages 파일을 GET,
  HTTP 200 + 다운로드 바이트를 Git blob ID와 직접 비교하여 모두 일치**.
  - HTML blob `134b199985dcf59ed0633b96f7ee11087bdb3710`
  - 재생 JS blob `3672248e4762a58aa8731df38da0822d7cad434a`
  - 설정 JSON blob `48578b4226a3cdf19be0cdcc4d06c9bfb3d23273`
- dev 측 JavaScript 가짜 환경 회귀 **102/102 통과** (이전),
  PWA 전체 HTML 내부 스크립트 파싱 + 필기/PDF/검색 훅 보호
  **신규 5/5 통과** (`test_stage5_live_pwa_inline.cjs`).
- Python GCS/합성 안전 mock 테스트 이전 **59/59 통과**.
- 독립 TTS 조작 페이지 `stage5_pwa_trial.html`은 사용자가 직접
  Windows PC / Galaxy Tab / iPhone의 3기기에서 모두 정상 동작을 확인.
  길게 550ms→옵션, 짧게 재생/정지, `↻ 1회/2회` 조작 확인.
- **중요: 실제 운영 학습노트 PWA 내 TTS 버튼의 실기기 청취 결과는 아직
  사용자가 별도로 확인하지 않았음. 독립 시험 페이지 3기기 합격과 혼동 금지.**

## 현재 음성과 안전 범위

- 비공개 GCS에 MP3 **12개**, 매니페스트 **8개 항목**.
  5개 토픽명 음성 61,248 bytes, 기존 본문 7개 351,360 bytes.
- 최초 사용자 환경은 `현재 토픽만` + `토픽명만` (본문 6개 OFF),
  별도 사용자가 직접 체크/연속재생 모드 변경 가능.
- 합성 당시 토픽명과 최신 암기장 제목 차이 2건:
  - `T1961`: 합성 당시 `몬테카를로 트리검색(MCTS)` /
    최신 암기장 `몬테카를로 트리검색 (MCTS)`
  - `T2354`: 합성 당시 `SQL` /
    최신 암기장 `SQL (Structured Query Language)`
  - 재생기는 이 **두 정확한 케이스에만** 원본 MP3 SHA-256 확인 후 호환.
    그 밖의 이름이나 본문 해시 불일치 시 중단/안내.
- 홈 `T0000`과 학습대상 N은 표시 제외.
- 재생 대상 미생성 시 자동 TTS 합성 또는 시스템 음성 대체 **금지**.
- Google OAuth ID 토큰으로 Cloud Run 인증 → GCS 서명 URL 다운로드.
  개인 음성 설정/캐시와 운영 학습 메모/관리 권한을 분리.
- Cloud Run, 기존 GCS 객체, 12개 MP3, LIVE Sheets, Apps Script 변경 없음.
- `cloud-project.json` 개발측 전역 쓰기 허용 플래그 3개는 `false`:
  `ttsGenerationApproved`, `gcsUploadApproved`,
  `cloudRunRevisionUpdateUserApproved`.
- Apps Script 저장·함수 실행·재배포 **전부 불필요**.

## 아직 해야 할 일

1. 사용자에게 **운영 URL**에서 3기기 실제 조작/재생 확인 요청:
   T0000 홈 숨김 → T0001 토픽명 듣기 → 옵션/Google 로그인 →
   T1961·T2354 기존 원음성 해시 호환 → 1회/2회 및 PDF/필기/문제검색 확인.
2. 인증/브라우저 캐시 이슈 발견 시 **기존 운영 데이터에 손대지 않고**
   새 dev 브랜치 테스트 → 최소 수정 → 자동 테스트 → main 병합/한정 반영.
3. 대량 음성 준비는 **별도 작업**. 현재 12개 음성으로 3,800토픽 전체
   연속 읽기는 지원하지 않음. 비용/합성 범위/호출 수/명시 승인 전
   실제 Google Cloud TTS 합성·GCS 신규 쓰기 금지.

## 브랜치

- `main` 운영 위 SHA.
- `feature/ai-natural-tts-main-integration-20261010` 운영 기준 최소 세 파일을
  검토한 RC. 운영 main과 동일하다고 가정하지 말고 필요 시 재비교.
- `feature/ai-natural-tts-20261009` 연구/실험/검증 코드 및 현재 체크포인트.

## 추가 배포 후 검증 — 2026-10-10

- 운영 GitHub Pages 페이지, TTS JS, cloud-config.json을 Windows 원격 PC에서
  `curl.exe`로 각각 내려받아 **HTTP 200 + GIT blob hash 3개 모두 정확히 일치**
  (GitHub main `f3b0cd635a3757eebfb21ba75912f5ea76a8a863`).
  단순 URL 응답만 본 것이 아니라 실제 배포 바이너리 바이트까지 확인.
- `test_stage5_live_pwa_inline.cjs`: 운영 PWA 전체 HTML의 인라인 JavaScript
  **2개 컴파일 가능**, TTS 브리지 하나, Google 로그인 스크립트,
  학습/PDF/필기/문제검색 훅 보존 5개 체크 통과.
- `test_stage5_five_title_gcs_upload.py`: 랜덤 Windows 임시 폴더명에
  `rm` 문자 조합이 우연히 포함되는 것을 삭제 명령으로 오인하던 플래키
  assertion 1개를 **승인된 5개 입력 MP3 경로 + index.json 입력 경로 +
  허용된 gcloud cp/cat 하위 명령 전체의 정확한 allowlist** 검사로 수정.
  모의 업로더만 테스트했으며 실제 Cloud 쓰기 실행 없음.
- 개발 브랜치 회귀 테스트: **Node 107/107 PASS** (9개 JS 테스트 파일),
  **Python 59/59 PASS** (모의 GCS 및 5개 토픽명 합성 안전 테스트).
- 기인증 토큰 없이 Cloud Run `/v1/manifest` 읽기 요청 시
  **HTTP 401** 반환 확인. 비공개 오디오 목록 노출 없음.
- **현재 운영 PWA 실기기 음성 종단 간 확인은 사용자 회신 대기**.
  독립 시험 페이지 3기기 검증이 성공한 사실과 혼동 금지.
