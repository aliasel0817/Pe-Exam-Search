# 6-1 — 학습노트 Google 음성 로그인 UX 개선 운영 배포 체크포인트

날짜: 2026-10-10 (KST)
운영 URL: https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html

## 확정 결과

- 운영 `main` 커밋 **`502de0e348f66536536f87591a8a25e4021007f2`**.
- 직전 운영 기준 `f3b0cd635a3757eebfb21ba75912f5ea76a8a863`.
- 운영 변경 파일 정확히 **2개**:
  1. `study-note/tts/natural-tts.js` (Git blob `9e6e67c0ca530242fb7ac0d61210f5ad3b27915a`)
  2. `study-note/study-note.html` (Git blob `a9d6055d79030e8ea568de682f787e05cd946bc9`)
- `study-note.html` script URL `./tts/natural-tts.js?v=9e6e67c0` (8자리 Git blob 해시 캐시 무효화).
- GitHub Pages Action **success**.
- Windows에서 실제 GitHub Pages HTML·JS·cloud-config 3개를 다운로드:
  **HTTP 200 + Git blob 3/3 바이트 정확히 일치**.
- 개발 브랜치 **Node 114/114 PASS**; 운영 기준 최소 변경 후보에서
  **Node 65/65 PASS** (TTS player/mock, UI, PWA 전체 인라인 JS 문법·기존 PDF/필기/검색 훅).
- `cloud-config.json`, `service-worker.js`, 관리/Sheets/Apps Script/PDF/필기/문제검색,
  Cloud Run, private GCS 및 MP3 12개는 변경 없음.
- 유료 TTS 합성·GCS 쓰기·Cloud Run 재배포 없음; Apps Script 저장/실행/재배포 불필요.

## 사용성 변경 (6-1)

1. Google 음성 **첫 로그인 한 번 성공한 뒤**, 동일 탭에서 토픽 이동마다
   재로그인 불필요. 읽기 버튼 누르면 MP3 목록+원문 SHA-256 자동 검증.
2. 이전에 음성 로그인을 완료한 브라우저에는 **Google One Tap**
   (auto_select)으로 재방문 시 계정 선택을 자동 간소화할 수 있음.
   성공 여부는 Google 세션·동의·브라우저 정책에 따르며 절대 100% 보장하지 않음.
   iOS Safari/ITP에서는 자동 로그인 미지원/확인이 필요한 경우가 있으며
   **Google 로그인 버튼을 계속 대체 수단**으로 제공.
3. Google 인증 완료 시 불필요한 Google 로그인 버튼은 자동 숨김.
   인증 만료·401·403 시 토큰/자동 로그인 재방문 선호를 안전하게 정리하고
   Google 버튼을 다시 노출. 실패 후 자동 재시도/루프 없음.
4. 최초 무인증 상태에서 `🔊 듣기`를 짧게 누르면 재생 실패만 출력하지 않고
   음성 옵션을 열어 Google 계정 로그인을 안내.
5. 기존 `연결 설정 확인`, `현재 토픽 MP3 준비 확인`은
   `<details id="ttsDiagnostics">` 내부에 선택형 진단으로 접음.
   **토픽마다 준비 확인 버튼을 누를 필요 없음**.
6. Google ID 토큰은 메모리에만 저장, localStorage에는
   비밀이 아닌 재방문 자동 로그인 선호(`...googleVoiceOneTapOptIn.v1` = 1)만 기록.
   이미 검증된 Cloud Run Google ID 토큰 인증·이메일 allowlist는 그대로 유지.
7. **메인 앱의 Apps Script 신뢰기기 인증을 Cloud Run 인증으로 직접 재사용하지 않음.**
   서로 다른 종류의 세션/토큰이므로 인증 우회하지 않는다.
8. 별도 `stage5_pwa_trial.html`은 불변 이전 JS와 SRI에 핀되어 원상 보존됨.
   시험용 데이터 저장 키는 운영판과 계속 분리.

## 사용자 QA 필요

실제 운영 학습노트 PWA의 iPhone Safari, Galaxy Tab, Windows PC에 접속:
- 기존 MP3가 있는 `T0001`에서 Google 계정 로그인은 필요하면 **처음 한 번만** 진행.
- 로그인 후 `T1961`, `T2354` 등 다른 토픽으로 이동해
  별도의 로그인/준비 확인 없이 🔊 듣기.
- **길게 누르기 옵션**에서 Google 버튼이 인증 완료 시 숨겨지고
  연결·MP3 진단이 접혀 있는지 확인.
- 새로고침 시 Google One Tap이 지원되는 브라우저면 계정 선택 간소화,
  차단되는 브라우저면 Google 버튼으로 정상 대체.
- PDF, 필기, 문제검색 기능은 그대로 동작하는지 확인.
- 이 시험 전에는 **운영 PWA 실제 3기기 합격**이라고 기록하지 말 것;
  이전 3기기 합격은 독립 시험 페이지였음.

## 롤백/후속

- 안전 롤백 기준 Git SHA: `f3b0cd635a3757eebfb21ba75912f5ea76a8a863`.
  다른 사람이 만든 후속 main 변경을 무시하고 강제 리셋해서는 안 됨;
  롤백 시 TTS 파일 2개의 구버전 콘텐츠를 병합 커밋으로 되돌릴 것.
- dev: `feature/ai-natural-tts-20261009`;
  통합 후보: `feature/ai-natural-tts-auth-ux-20261010`.
- 다음 단계 6-2: 미생성 음성의 UX, 연속재생 실패 처리 정책,
  모바일/오프라인 장시간 검증. 현재 12개 MP3만 존재하며 전체 약
  3,800 토픽을 생성하려면 정확한 합성 범위·문자 수·비용 및 별도 승인이 필요함.
