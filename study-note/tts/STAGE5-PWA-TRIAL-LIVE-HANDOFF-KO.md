# 5단계 — 실기기 듣기 버튼 격리 시험 페이지 인계

기준일: 2026-10-10

## 공개된 경로
`https://aliasel0817.github.io/Pe-Exam-Search/study-note/tts/stage5_pwa_trial.html`

- 운영 GitHub Pages `main`에는 **독립 HTML 1개**만 추가됨.
- 시험 HTML은 개발 브랜치의 실제 PWA `natural-tts.js` 파일을 불변 커밋
  `8926fe736a776cf30a9a982d1f886dd09a6f4ae6`에서 jsDelivr로 가져옴.
  SRI SHA-384 검증, Cloud 설정도 같은 불변 커밋에서 읽음.
- 기존 운영 `study-note.html`, service worker, PWA 데이터, Sheets,
  Apps Script, Cloud Run, GCS 및 12개 MP3는 변경하지 않음.
- 시험 페이지에는 Sheets/Apps Script/PWA 저장 기능이 없음.
  표시 토픽 5개는 페이지 내 메모리 데이터, 본문은 비어 있는 상태.
- 사용자가 자신의 원본 JSON을 선택하면 승인된 5개 토픽의 본문 필드만
  브라우저 메모리에 로드(최대 512KB)하고, 계정이나 클라우드에 저장하지 않음.
- 시험 전용 `peStudyNote.aiTts.stage5Trial.options.v1` 로컬 설정 키만 쓰며,
  기존 운영 `peStudyNote.aiTts.options.v1`와 분리됨.
- 시험에서는 MP3 CacheStorage 사용하지 않음.
- 실제 개발 PWA 소스의 짧게 누르기 재생·정지, 550ms 길게 누르기 옵션 팝업,
  12px 드래그 취소, `↻ 1회/2회` 버튼, 팝업 위치·닫기를 검증.
- 기본값 `현재 토픽만` + 본문 6개 전부 OFF → 토픽명 MP3만 재생.
- 실제 HTTP 200 및 GitHub Pages 배포 성공까지 확인.
  Google 계정 로그인 및 소리 청취는 사용자의 실기기 확인이 필요.

## 핵심 — 원본 MP3와 최신 암기장 명칭 차이
다음 5개는 *음성 합성 당시 원본* `study-note-tts-real-5.json`의 제목을 그대로 사용.

| 통합ID | 합성 시 원본 토픽명 |
| --- | --- |
| T0001 | 3C 분석 종류 |
| T1961 | 몬테카를로 트리검색(MCTS) |
| T2238 | 퀵 정렬 |
| T2176 | B+Tree |
| T2354 | SQL |

운영 LIVE `topic_study_data`의 2026-10-10 현재 토픽명은
T1961 `몬테카를로 트리검색 (MCTS)` (띄어쓰기 차이),
T2354 `SQL (Structured Query Language)` (영문 확장)으로,
기존 합성 오디오의 `entry.sha256` 원문 해시와 맞지 않을 수 있다.
합격한 MP3를 재합성하거나 LIVE를 수정하지 않고,
독립 UI 시험은 합성 당시의 원본 토픽명으로 수행.
실제 PWA 통합 전에 원문 불일치를 별도 안전한 방법으로 해소해야 함.
무단 원문 우회·재합성·GCS 수정 금지.

## 배포 및 테스트 상태
- GitHub Pages 초기 배포 커밋 `1c25f92ef103d4a20cb09294e59cb028a86e6ccd`.
- 원본명 수정 `main` 커밋 `37ad2f9aad50dc928a0b159dc1c3d7cf37a8db3c`.
- 최초 5개 페이지 정적 테스트 성공. 원본명 검증 추가로 6개 성공.
- 부트 경로 한정 stage 전용 localStorage/CacheStorage 테스트 성공.
- 최종 전체 회귀는 다음 실행에서 확인.

## 사용자 실기기 점검
1. Chrome PC / Galaxy Tab Android Chrome / iPhone Safari에서 해당 주소 열기.
2. 듣기 버튼 0.55초 길게 눌러 옵션 열고 Google 로그인.
3. 기본값의 토픽명만 듣기, 짧게 눌러 재생·정지, 반복 1회/2회 전환.
4. T0001 → T1961 → T2238 → T2176 → T2354 음성별 체크.
5. 외부 누르기/Esc/닫기, 가로·세로 회전 뒤 팝업 위치 확인.

*이 시험 페이지는 실제 PWA의 TTS 컨트롤러를 가져와 테스트하지만
전체 운영 PWA의 종단 간 시험까지 완료했다는 뜻은 아니다.*
