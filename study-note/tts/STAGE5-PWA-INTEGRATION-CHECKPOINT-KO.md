# TTS 5단계 PWA 연동 체크포인트 (2026-10-09)

## 사용자 실기기 검증 완료: 4단계
- 비공개 GCS: `study-note-tts-audio-558407087449`; 최종 Aoede MP3 7개, index 3개 항목
- 업로드 및 GCS 조회 SHA-256 일치; Google 로그인/허용 계정 `/v1/manifest` HTTP 200 확인
- 사용자 Chrome 실제 재생 완료: T0001 개념 1개, T2176 구성요소 2개, T2354 구성요소 4개
- 화면에서 `사용자가 재생을 중지했습니다.` 메시지 확인: 중지 UI 정상
- 독립 검증 화면: `https://aliasel0817.github.io/Pe-Exam-Search/study-note/tts/stage4_browser_audio_pilot.html`
- 테스트 HTML 1개만 별도 사용자 승인을 받아 main에 추가함. 운영 `study-note/study-note.html`은 바꾸지 않음

## 5단계 — 개발 브랜치에 반영한 작업
- 브랜치: `feature/ai-natural-tts-20261009`
- 기존 TTS 스피커/설정/토픽 읽기/선택 6개 필드/토픽 전환 브리지 보존
- 새 UI 버튼: `현재 토픽 MP3 준비 확인` (`ttsAvailabilityBtn`)
- 새 결과 영역: `ttsAvailabilityStatus` (접근성 `role=status, aria-live=polite`)
- 명시적으로 눌렀을 때만 읽기 전용 `index.json` 조회. 원문 SHA-256, MP3 경로 및 선택 필드를 비교
- 미생성, 원문 변경, 경로 이상, 토픽명 MP3 누락, 원문이 빈 필드 제외 상태를 표시
- 확인 동작 중 **새 음성 합성, 파일 다운로드, GCS 쓰기, Cloud Run 배포, 학습노트 데이터 쓰기 없음**
- 현재 `cloud-config.json.mode=disabled` 유지: PWA의 실제 클라우드 연동·재생은 운영과 개발 모두 자동 활성화되지 않음
- 세 잠금 `ttsGenerationApproved=false`, `gcsUploadApproved=false`, `cloudRunRevisionUpdateUserApproved=false` 유지

## 검사 결과
- PWA 재생기/신규 준비 검사 및 PWA 정적 구조 23개 Node 자동 검사 통과
- 게이트웨이/인증 시험/독립 재생 검증까지 포함한 Node 회귀 56개 통과
- 외부 API 요청 없이 테스트한 모의 환경 결과이며 PWA 실기기 종단 간 재생 합격으로 간주하지 않음
- 새 기능 코드 변경: `study-note/study-note.html`, `study-note/tts/natural-tts.js`,
  `study-note/tts/test_player.cjs` 및 `study-note/tts/test_stage5_pwa_markup.cjs`

## 남은 제약과 다음 단계
1. 현재 업로드된 MP3는 **3개 본문 항목만** 포함하고 **토픽명 MP3가 없음**.
   고정 순서 '토픽명 -> 개념 -> 등장배경 -> 필요성 -> 특징 -> 기술요소/구성요소 -> 키워드'를 변경하지 않음.
2. 따라서 PWA 토픽 전체 재생 성공은 아직 검증할 수 없음. 미생성 음성은 자동 생성하거나 시스템 TTS로 대체하지 않음.
3. 선택한 필드의 최신 학습 내용이 MP3 생성 시 데이터와 일치하는지 실데이터 기준 비교 필요.
4. 검증용 기능이 포함된 PWA를 실기기에서 시험하려면 운영 `main`과 구분된 안전한 시험 경로에 대한 별도 검토 필요.
5. 토픽명/남은 항목의 추가 MP3 합성은 비용·파일 개수·범위 안내와 **별도 사용자 승인** 전 금지.
6. 기존 오디오 및 ZIP 보존. 운영 main, Google Sheets, Apps Script, PDF/이미지/필기/문제검색 기능은 수정하지 않음.

실제 Apps Script 배포/함수 실행: **없음**. GCS/Cloud Run 추가 쓰기: **없음**.
