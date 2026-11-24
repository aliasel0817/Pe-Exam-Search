# 학습노트 개인 노트(그림판) 후속 개발 인계 v9 (2026-11-23)

## 1. 실제 운영 및 PR 기준
- 저장소: `aliasel0817/Pe-Exam-Search`
- 운영 main HEAD 재확인: `37c53067f856e3f9d5733baf8349495a0ca6e7f1` (운영 배포된 PR #96/#97의 기존 결과 보존)
- 개발 브랜치: `test/personal-note-isolated-gas-readonly-20261123`, **Draft PR #98, main 미병합**
- v8 인계 기준 HEAD: `33337d10fc991a503d3d2c8904ac09dee94908c7`
- 이번 v9 마지막 코드 커밋: `00e0884a4e3e020a84c729792387ecf7bd169eac` (본 문서 추가 전)
- 개발 80%, 필수 검수 20%, 비필수 실제 사용성 검사는 사용자가 진행

## 2. 실사용 Google 운영 원본 접근 재확인: 차단
- 연결된 Google Drive에서 `application/vnd.google-apps.script` 검색 결과 **0건**.
- Remote Desktop Commander 장비 `DESKTOP-5H5J4TU` ONLINE. `clasp list --json`에는 `PePersonalNoteIsolated20261123` 외 이전 격리 Script 3개만 나옴.
- Gmail에서 2026-09-01 이후 Script 프로젝트 편집 URL/Pe-Exam-Search Apps Script 관련 항목을 제한 검색했으나 운영 v23 소스/Script ID를 확인할 메시지 없음.
- 운영 Apps Script v23 전체 `Code.gs`, `scriptId`, 인증 함수/Script Properties/현재 배포 코드가 **없으므로** ACTIVE/HMAC/nonce 검증 구현을 추측해 합치거나 덮어쓰지 말 것.
- 현 GitHub의 과거 `Code.js`(v21 참고)는 최신 운영 원본이라고 판단하지 않음. 공개 /exec URL 또한 Script ID/소스가 아님.

## 3. 이번 개발: 실제 Drive 격리 시험을 위한 실행 기능
- 새 파일: `study-note/backend/tests/personal-note-stage-real-drive-selftest.gs`
  - `PN1_stageRealDriveSelfTest` 함수를 Apps Script **편집기에서 직접 실행**하도록 작성.
  - **실제 ScriptApp.getScriptId()가 사전 지정된 격리 프로젝트 ID와 일치할 때만 실행**. 프로젝트 ID는 이 저장소에 게시하지 않으며, 원격의 자체 전용 `pn_stage_guard_local.gs`에만 정의.
  - `PERSONAL_NOTE_SYNC_MODE`, `PERSONAL_NOTE_SYNC_FOLDER_ID`, `PERSONAL_NOTE_SYNC_READY`가 기존 설정돼 있으면 즉시 중단.
  - 매 실행마다 새로운 `PERSONAL_NOTE_ISOLATED_TEST_ONLY_<UUID>` 폴더를 생성하고 전용 마커 파일로 접근 통제.
  - **운영 HMAC 검증 대신, 두 개의 합성 ACTIVE 인증 객체로** `PN1_post_`/ `PN1_get_` 실 메서드를 호출하여 global 배경·2개 page(필기/PNG 사진/글자)·index를 Google Drive에 저장/조회하고 SHA 무결성 확인.
  - 오래된 baseRevision 요청은 CAS로 거부되며, PENDING 상태 또한 거부.
  - `finally`에서 *이번 실행이 만든* 격리 폴더만 휴지통으로 보내고 세 개의 테스트용 Script Properties만 삭제. 그 외 Drive 폴더, MASTER, PDF, 주석, 학습진도와 인증 비밀키는 건드리지 않음.
  - Apps Script 편집기 실행 로그에 민감정보 없는 `PERSONAL_NOTE_STAGE_REAL_DRIVE_PASS` 또는 `INCOMPLETE` 출력.
  - 이 시험은 실제 Drive/코드 경로 시험일 뿐 실제 ACTIVE/HMAC/nonce 신뢰기기 인증 E2E가 아님.
- 새 파일: `study-note/tests/test_personal_note_real_drive_stage_synthetic.cjs`
  - 위 새 실제 시험 함수를 fake DriveApp / fake LockService / fake PropertiesService 환경에 로드하여 격리 ID 거부, 충돌·읽기·정리·속성 보호를 검사.
  - 기존 `.github/workflows/study-note-personal-note.yml`에 자동검사 등록.
- 원격 전용 경로 `C:\Users\user\Dev\PePersonalNoteIsolated20261123`에서 `clasp push`로 6개 파일 업로드 성공(2026-11-23 21:48 KST).
  - `pn_isolated_server.gs`, `pn_signed_bridge.gs`, `pn_stage_readonly_test.gs`, `pn_stage_real_drive_test.gs`, `pn_stage_guard_local.gs`, `appsscript.json`
  - 운영 Apps Script 프로젝트나 master에 업로드하지 않음.
- `clasp run PN1_stageRealDriveSelfTest` 시 Google **NOT_FOUND** 응답. Google Drive 파일 생성/읽기/삭제는 실행되지 않았으며 **Google API를 통한 실제 함수 검증 미실시**.
  - 공식 문서상 `clasp run`은 API 실행 배포, 동일 표준 GCP 프로젝트, OAuth 권한 등이 필요. 현 상태에서 기존 운영 인증/Cloud 프로젝트를 변경하여 우회하지 말 것.
  - **대안:** 권한을 가진 사용자가 격리 프로젝트 `PePersonalNoteIsolated20261123`을 Google Apps Script 편집기에서 연 후 함수 선택 `PN1_stageRealDriveSelfTest` → 실행 → 최초 Google Drive 동의 → 실행 로그에서 PASS 확인. 해당 실행은 아직 하지 않았으며 성공으로 보고하지 말 것.
  - 편집기 실행도 안 된다면 Apps Script 실제 프로젝트 권한/Cloud 설정을 정확히 진단해야 함. 별도 GCP 프로젝트 생성이나 운영 Script 편집은 사용자 승인 없이 하지 말 것.

## 4. 검수
- 수정 코드 커밋 `00e0884a4e3e020a84c729792387ecf7bd169eac` 기준 개인 노트 CI Run `45177696942`: `personal-note-checks` SUCCESS, `browser-essentials` SUCCESS.
- 관련 전체 화면 Visibility CI Run `45177116923` 기준 SUCCESS. 이전 PR SHA `33337...`의 전체 화면 검사 한 번 실패는 학습계획 마스터 브라우저 합성검사 12초 타임아웃(개인 노트 검사와 무관)이었으며 이번 전용 검사와 구분.
- **미검증:** Google Apps Script 편집기에서 실제 기능 실행, Google Drive 왕복, 실제 운영 Script v23 소스, ACTIVE/HMAC/nonce 호출, Galaxy Tab S11/iPhone/PC 실제 2기기 동기화.
- 운영 `main` 병합 / Pages 배포 / 운영 Apps Script v23 배포 / LIVE MASTER 쓰기 작업: **이번 세션 모두 없음**.

## 5. 다음 작업 우선순위
1. 실제 운영 Apps Script v23 원본의 정당한 소유자 계정에 **읽기 전용** 접근 확보. GitHub 검증용 구버전으로 대체 금지.
2. 접근 권한이 있는 계정의 Google Apps Script 편집기에서 격리 전용 `PN1_stageRealDriveSelfTest` 직접 실행하고 실행 로그의 `PASS` 및 실제 폴더 정리 확인. 실제 Google 서비스 실행 성공 전에는 클라우드가 동기화됐다고 표현 금지.
3. 운영 ACTIVE/HMAC/nonce 서명 검증 및 Drive 저장 라우팅을 실제 v23 소스와 비교하고 별도 안전한 운영 변경안 구성.
4. 필요한 격리/실서버 보안·CAS·대용량 이미지 시험을 최소한으로 확인. 비필수 실기기 사용성 검수는 사용자 주도.
5. 운영 변경은 사용자 별도 승인 후 별도 브랜치와 PR로 진행. master 문서·기존 PDF·첨부·주석·보안, 다른 채팅 원격 작업 폴더·PID를 보호할 것.

## 6. 복사용 다음 채팅 작업요청
학습노트 개인 노트 클라우드 동기화 개발 Draft PR #98 `test/personal-note-isolated-gas-readonly-20261123`을 이어서 진행해줘. PR #96/#97은 운영 main `37c53067f856e3f9d5733baf8349495a0ca6e7f1`에 배포 완료이니 중복 작업 금지. 이번 v9에서 실제 Drive 격리 시험 함수 `PN1_stageRealDriveSelfTest`와 격리 ID/임시 Drive 폴더/조건부 정리·두 모의 기기 CAS 검사를 구현했고, GitHub CI Run #45177696942 필수 검사 2개 PASS야. 회사 PC `DESKTOP-5H5J4TU` 독립 폴더 `C:\Users\user\Dev\PePersonalNoteIsolated20261123`에 관련 6개 파일을 clasp push 성공했으나 `clasp run`은 Google NOT_FOUND로 실패하여 실제 Drive 왕복은 미검증이야. 운영 v23 Apps Script 전체 Code.gs/Script ID는 현재 Google Drive 및 clasp 로그인 계정으로 확보되지 않아, 먼저 정당한 프로젝트 접근 권한을 읽기 전용으로 확보해. 별도 소유자 계정의 Apps Script 편집기에서 격리 프로젝트 `PePersonalNoteIsolated20261123`의 `PN1_stageRealDriveSelfTest`를 수동 실행할 수 있고 로그 PASS가 실제 확인돼야 해. 운영 보안 인증을 추측/변경하지 말고 원본 확인 후 HMAC/ACTIVE/nonce 경계와 연결해. 고정 원칙: 개발:필수검수 80:20, 원본 데이터 무손실, Google Sheets LIVE MASTER 학습원문/기존 PDF·첨부/인증 보호, 다른 채팅 원격 파일/PID 보호, 승인 없는 추가 main 병합/배포 금지. 매번 완료/미완료/미검증 및 브랜치 PR SHA와 후속 작업요청서 보고.
