# 5단계 — 학습노트 PWA Aoede 자연음성 연결 체크포인트

기준일: 2026-10-10
개발 브랜치: `feature/ai-natural-tts-20261009`

## 사용자 확정 QA
- 비공개 GCS의 MP3 **12개**를 독립 시험 페이지에서 모두 정상 재생했다고 사용자가 확인.
- 구성: 토픽명 ‘[토픽명]에 대한 설명’ 5개 + 기존 본문 7개.
- 사용자에게 재합성, 발음 실험, GCS 재업로드 등을 반복 요청하지 않는다.
- 기존 본문 MP3 7개, 토픽명 MP3 5개, ZIP 및 GCS 객체를 보존한다.

## 개발 브랜치의 실제 학습노트 PWA 연결 변경
1. `study-note/tts/cloud-config.json`의 개발 브랜치 전용 모드를 `gcs-private`로 설정.
   이미 실사용이 검증된 `study-tts-audio-gateway-hgli3gua6q-uc.a.run.app`과
   `study-note-tts-audio-558407087449` 버킷을 연결.
   **운영 main에는 해당 설정·TTS 재생기가 게시되지 않았다.**
2. `study-note/tts/natural-tts.js`
   - 토픽명 + 선택한 본문 6개 읽기 순서 및 데이터 SHA-256 확인 유지.
   - 토픽명 단독 듣기 지원 (본문 6개 전체 해제).
   - 선택한 토픽의 모든 비어 있지 않은 읽기 항목을 **재생/토픽 이동 전에** 검사.
     미생성 MP3/수정 원문/경로 이상이면 자동 생성하지 않고 중단.
   - GCS 서명 URL의 버킷, 정확한 객체 경로, HTTPS, 서명, 1~300초 만료 제한 확인.
   - 다운로드/재생은 사용자 클릭 후에만 이루어짐. 자동 합성·업로드·서버 쓰기 없음.
   - 선택 가능 음성은 청취 확정된 `ko-KR-Chirp3-HD-Aoede`뿐.
3. `study-note/study-note.html`
   - 현재 소수의 토픽/필드만 MP3 생성된 상태임을 안내.
   - 스피커/설정/6개 체크박스/토픽 이동 브리지 유지.
   - 미생성 Kore/Charon 선택 금지 표시.
   - 개발용 시험은 `현재 토픽만` 및 `현재 토픽 MP3 준비 확인` 사용 권장.

## 자동검사
- PWA 리드/재생/인증 시뮬레이션, 4분할 MP3, 토픽명만 듣기,
  파일 사전 검사, 중지, 외부 서명 URL 차단, 무클릭 자동 요청 금지 등.
- PWA UI 및 기존 이미지/PDF/관리/문제검색 훅 보존 검사.
- Cloud Run 게이트웨이, 기존 독립 재생기 등 Node 자동 테스트
  **77개 전부 통과 (2026-10-10, Windows mock 환경)**.
- 이 검사는 실제 Google/Cloud 비용 없이 가짜 응답으로 수행됐음.
- 실제 학습노트 PWA의 Windows/Galaxy Tab/iPhone 브라우저 종단 간 테스트는 **아직 미실시**.
- 독립 12MP3 시험 페이지에서의 사용자 청취 완료와 구분할 것.

## 환경·권한 보호
- 운영 `main`은 기존 독립 테스트 HTML만 있는 상태로 유지.
- `study-note.html`의 운영 버전 v4.6.3, PDF·이미지·펜·필기·검색 기능을 수정하지 않음.
- Google Sheets/Apps Script/Cloud Run/GCS 추가 쓰기 없음.
- `cloud-project.json`의 `ttsGenerationApproved`,
  `gcsUploadApproved`, `cloudRunRevisionUpdateUserApproved` 모두 `false`.
- Apps Script 저장/함수 실행/재배포 모두 필요 없음.

## 다음 단계
1. 실기기 PWA 통합 시험용 **별도 승인된 안전한 시험 배포 경로** 설계.
   현재 Pages는 main을 게시하므로 dev 브랜치 PWA URL을 곧바로 접속할 수는 없음.
2. 무단 main 머지 금지. 특히 3,800토픽 앱의 관리/필기/즐겨찾기 저장 동작을
   스테이징에서 안전하게 격리할 방법을 검토할 것.
3. 허용된 시험 경로에서 T0001 개념 1개, T2176 구성요소 2개,
   T2354 구성요소 4개, 그 외 토픽명 단독 듣기 실제 테스트.
4. 본문 6개 항목을 완성할 추가 MP3는 비용·정확한 호출 수·합성 문자 수를
   먼저 보고하고 별도 합성 승인을 받은 뒤 수행.
