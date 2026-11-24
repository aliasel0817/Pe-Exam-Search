# 학습노트 개인 노트 Google 클라우드 동기화 인계서 v10 (2026-11-24)

## 1. 이번 작업의 핵심 성과 — 운영 Apps Script v23 원본 확보
- 사용자 제공 **실제 Script ID**로 `clasp clone` 성공. 이전 화면 주소를 바탕으로 추정한 ID는 유효하지 않았으나, 이번 제공값은 접근됨.
- `DESKTOP-5H5J4TU` 독립 원본 폴더(HEAD):
  `C:\Users\user\Dev\PeExamProdSourceReadOnly20261124`
- **정확한 운영 배포 v23** 읽기 전용 폴더:
  `C:\Users\user\Dev\PeExamProdDeployedV23ReadOnly20261124`
- `clasp deployments`에서 운영 웹 앱 배포가 **@23**임을 확인. 실제 배포 ID가 GitHub main `study-note/study-note.html`의 `DEFAULT_API_URL`과 일치.
- `clasp pull --versionNumber 23` 성공. HEAD 복사본과 배포본의 `Code.js`, `PlannerSyncBackend.js`, `PlannerSyncReleaseControl.js`, `PlannerSyncSignedBridge.js`, `referencePdfContent.js`, `appsscript.json` **6개 파일 SHA-256 모두 동일**.
- 실제 Code.js SHA-256: `5cecf67ada6a5b330e3ce3dc4185e8ee337e6c18e02e06766998cde90701dfa2`.
- 읽기 전용 소스 복사 및 로컬 파일 비교만 수행. 운영 Apps Script / LIVE MASTER / 기존 PDF / 첨부 / 신뢰기기 / 보안 설정 **변경 없음**.

## 2. 실제 운영 인증 라우터 분석
- 운영 `Code.js`는 `doGet` 내부에서 서명 GET: `validateSignedGet_(params,['ACTIVE'])` 사용.
- `doPost`는 기존 `requestId/pollKey` 중복 요청 처리 후 `validateSignedMutation_(envelope,['ACTIVE'])` 성공 시에만 보안 쓰기 action을 실행.
- `validateDeviceSignature_`는 서명 요청 시각, nonce 형식/재사용, 등록된 신뢰기기 상태, 세션 만료·키 해시, HMAC 서명 등을 검증.
- 기존 `PlannerSyncSignedBridge.js`는 같은 검증 결과를 전달하는 선례. **이 검증 로직·mutationStatus·기존 인증 키 저장 위치를 수정할 필요 없음**.
- 기존 `referencePdfContent.gs`, `PlannerSyncBackend.gs` 및 기타 원본은 편집하지 않음.
- 실제 운영 `Code.js` 전체나 Script Properties 비밀값을 GitHub PR에 업로드하지 않음.

## 3. 이번 구현: 별도 브랜치와 Draft PR #99 (NO DEPLOY)
- 부모 브랜치/PR: `test/personal-note-isolated-gas-readonly-20261123` / Draft PR #98. PR #98은 이전 `syncPending` 및 모의 2기기·격리 Drive 검증 후보.
- 신규 브랜치: `feature/personal-note-cloud-v23-gated-integration-20261124`
- 신규 **Draft PR #99**: https://github.com/aliasel0817/Pe-Exam-Search/pull/99
- `study-note/backend/tools/patch_personal_note_v23_host.cjs`:
  - 상기 SHA-256과 **완전히 일치하는 실제 배포 v23 Code.js**를 입력으로 요구. 다르면 즉시 거절.
  - 입력 파일 수정·기존 출력 덮어쓰기 금지, 지정된 **새 파일**만 생성.
  - 두 개의 조건부 개인노트 라우트만 추가: GET `PN1_signedGet_`; POST는 기존 `validateSignedMutation_` 성공 후 `PN1_verifiedPost_`.
  - 기존 학습계획/주석/PDF/첨부 및 `mutationStatus`/HMAC/nonce/ACTIVE 함수 변경 없음.
  - 신규 업로드의 매 16KiB `personalnotepart`에 대한 대량 감사로그 기록만 제외. 나머지 기존 action 감사 규칙은 유지.
  - **정확한 v23 소스에 적용 성공**, `node --check` PASS, `git diff --no-index`로 위 변경만 발생했음을 확인.
  - 후보 결과: `C:\Users\user\Dev\PeExamPersonalNoteV23Candidate20261124\Code.personal-note.candidate.js`. 운영용 `clasp push/deploy` 하지 않음.
- `study-note/backend/personal-note-sync-isolated.addon.gs`:
  - 기존 `ISOLATED_TEST` 경로 보존.
  - 신규 `PRODUCTION`은 **별도 운영 승인 전 비활성**. `PeExamPersonalNotesProduction` 전용 비공개 폴더/명시적 마커/추가 운영 승인/쓰기 활성화 속성을 모두 검사.
  - 운영 MASTER, 기존 PDF 폴더 또는 격리 시험 폴더를 운영 노트 저장소로 사용하지 못하도록 차단.
  - **새 폴더 생성, 권한 변경, Script Properties 변경은 하지 않았음**.
- 필수 검사 추가: `test_personal_note_v23_host_patch.cjs`, `test_personal_note_production_gate.cjs`, 전용 GitHub Actions Workflow에 등록.

## 4. 검수 범위 / 현재 결과
- 실제 **배포 v23 코드 파일 6개 동일성**: PASS
- exact-SHA 호스트 패치 + 출력 별도 생성 + 문법 + 원본 차이 확인: PASS (Windows 독립 작업본)
- 전용 GitHub Actions Run **#45295033734**: `personal-note-checks` SUCCESS, `browser-essentials` SUCCESS (합성 검사)
- 실제 운영 `doGet/doPost` 서명 요청·ACTIVE 기기 왕복: **미검증**
- 격리 Google Apps Script 실 함수를 통한 Google Drive 저장/조회: **미검증**. 이전 Draft PR #98의 격리 프로젝트 `PePersonalNoteIsolated20261123`에 `PN1_stageRealDriveSelfTest`가 업로드되어 있으나, `clasp run`은 `NOT_FOUND` 상태. Apps Script 편집기에서 직접 실행 및 결과 확인이 필요.
- 실제 PC/Galaxy Tab S11/iPhone Safari 동일 노트 동기화: **미검증/운영 미구현**
- LIVE MASTER/보안/기존 학습자료: 이번 작업에서는 쓰기/수정 요청 0건
- 사용자가 요구한 개발 80%, 필수 검수 20%, 비필수 실사용 검수 사용자 담당 원칙 유지.

## 5. 운영 배포 승인 전 필수 차단 조건
1. **절대** 현재 버전 23 프로젝트/배포를 바로 수정하거나 push하지 말 것. 기존 v23 복사본 및 v23 운영 상태 보존.
2. 격리 독립 Google Drive 폴더에서 `PN1_stageRealDriveSelfTest`의 실제 서버 실행 로그 PASS 확인. 실패 시 원인 진단.
3. 실제 ACTIVE/HMAC/nonce 재사용/REVOKED/PENDING 거부, 토픽별 다중페이지/사진/배경 왕복, 충돌 시 기존 로컬 보존을 **최소한의 실환경 검수**로 확인.
4. **새 비공개 전용 운영 폴더**와 `PERSONAL_NOTE_PRODUCTION_ONLY` 마커를 사용자가 별도로 승인한 이후에만 준비. 폴더 이름은 정확히 `PeExamPersonalNotesProduction`.
5. 승인 시에만 v23 복사본에 생성한 안전한 후보 라우팅 및 PN1 신규 .gs 2개를 운영 프로젝트에 적용하는 별도 배포 절차. 기존 배포 ID 유지 여부를 점검하고 운영 URL 연결을 회귀 확인.
6. 운영 `PERSONAL_NOTE_SYNC_MODE`, `PERSONAL_NOTE_SYNC_FOLDER_ID`, `PERSONAL_NOTE_SYNC_READY`, `PERSONAL_NOTE_SYNC_PRODUCTION_APPROVED`, `PERSONAL_NOTE_SYNC_WRITE_ENABLED` 등은 사용자의 **별도 승인 전 설정하지 말 것**.
7. 운영 적용 이전에는 클라우드가 지원된다고 안내하지 말 것. 개인 노트는 계속 브라우저 로컬 저장이며 JSON 백업 필요.

## 6. 다음 채팅에 붙여넣는 작업요청서
개인 노트 Google 클라우드 동기화 개발을 PR #98 + 스택형 Draft PR #99에서 이어 진행해줘. 운영 main/Pages의 로컬/A4 개인 노트는 PR #96/#97에서 이미 완료된 상태이므로 재배포하지 마. 이번 v10에서는 사용자 제공 정확한 운영 Script ID로 회사 PC `DESKTOP-5H5J4TU`에서 `clasp clone`과 배포 `--versionNumber 23` pull을 성공했고, 운영 배포 URL까지 일치 확인. 실운영 v23 Code.js 포함 파일 6개 SHA-256 전부 동일한 것이 확인됐어. v23 Code.js SHA-256은 `5cecf67ada6a5b330e3ce3dc4185e8ee337e6c18e02e06766998cde90701dfa2`야. 원본 폴더 `C:\Users\user\Dev\PeExamProdDeployedV23ReadOnly20261124`, 호스트 후보 파일 `C:\Users\user\Dev\PeExamPersonalNoteV23Candidate20261124\Code.personal-note.candidate.js`. 새 스택형 Draft PR #99에는 SHA-핀 방식의 독립 출력만 생성하는 호스트 라우팅 패치 도구, 별도 private Drive PRODUCTION 게이트, 합성 검수가 추가되었어. CI Run #45295033734 두 Job PASS. **운영 Apps Script는 한 줄도 변경·배포하지 않았고**, 실제 Google Drive 격리 실행 `PN1_stageRealDriveSelfTest`와 ACTIVE/HMAC/nonce 실기기 왕복은 아직 미검증이야. 우선 격리 Apps Script 편집기에서 직접 시험을 정상 실행하고, 승인된 별도 운영 Drive 폴더/마커 설정 및 소스 후보에 대한 실환경 검수를 완료해. 보안·원본 보존 후 사용자 별도 승인을 받아야만 운영 main/Apps Script/Pages 배포할 수 있어. 개발:필수 검수 8:2, 비필수 사용성 검수는 사용자 실사용 기준. LIVE MASTER 학습 원문, PDF·첨부, 주석, 기존 인증 및 다른 채팅 원격 작업 영역·PID 보호. 작업 완료/미완료/미검증, 브랜치·PR·SHA, 다음 인계서를 매번 보고해줘.
