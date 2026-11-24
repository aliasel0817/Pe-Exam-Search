# 학습노트 개인 노트 클라우드 동기화 인계서 v8 — 2026-11-23

## 1. 운영 배포 완료 — 다시 배포하지 말 것
- GitHub: `aliasel0817/Pe-Exam-Search`.
- PR #96 로컬 그림판, PR #97 A4·답안지·확대·이동·도구 UI가 main 및 GitHub Pages에 이전에 배포 완료.
- 운영 main 확인 SHA: `37c53067f856e3f9d5733baf8349495a0ca6e7f1`; Pages Run #45141140645 SUCCESS. 본 단계에서 운영 main 변경 또는 Pages 재배포하지 않음.

## 2. 이번 작업 범위 — Draft PR #98에서만 변경
- 브랜치: `test/personal-note-isolated-gas-readonly-20261123`.
- 최초 PR SHA: `ed9644e1086a355a4cbf41b31505d08131f9760d`.
- 마지막 코드/CI 커밋: `1f825cf797f0f29e2c54ca7e812d98cbd0da2961` (문서 업데이트 전).
- `study-note/personal-note.js`:
  - 로컬 저장에 `syncPending:true`를 같은 IndexedDB 트랜잭션으로 기록, 서버 성공 응답/메타데이터 보존 완료 시에만 false 처리
  - 오프라인 상태로 저장 후 브라우저 재연결 이벤트 또는 개인 노트 재열기 시, **사용자가 이미 저장한 스냅샷만** 서버 재전송 시도
  - 서버 CAS 충돌 시 기존 로컬 노트를 보존하고 임의 덮어쓰기 금지
  - 저장소 버전(IndexedDB v1)과 기존 페이지·주석/첨부/MASTER 데이터 구조 변경 없음
- `study-note/backend/personal-note-sync-isolated.addon.gs`:
  - 허용 저장 키를 `global`, `index:<topic SHA256>`, `page:<topic SHA256>:<pageId>`로 엄격화
  - 업로드 JSON의 토픽 ID와 SHA256 키 일치, 중복 페이지 ID, 페이지 객체/이미지 좌표·형식 검증 후 CAS 확정
  - `ISOLATED_TEST`/폴더 ID/READY 속성/명시 마커 없으면 여전히 fail-closed, 실제 운영용 모드는 추가하지 않음
- `study-note/tests/test_personal_note_browser.cjs`: 합성 Chromium에서 서버 미지원 로컬 저장 시 대기 표시, 이후 모의 서버 성공 응답 시 대기 해제와 페이지·필기 보존 확인.
- `study-note/tests/test_personal_note_isolated_backend.cjs`: 잘못된 토픽 키/페이지 스키마/이미지 URL을 거부하는 서버 검사 추가.
- `study-note/tests/test_personal_note_real_code_contract.cjs`: **실제 클라이언트 소스와 실제 GAS 서버 후보 소스를 같은 합성 환경**에 로드해 두 모의 ACTIVE 기기, 다중 페이지·PNG 사진·공통 배경, CAS 충돌·오프라인 보존·비활성 모드를 시험. **Google Drive·운영 Apps Script·실제 인증 서버가 아닌 Node VM의 fake DriveApp/가짜 서명 인증**.
- `.github/workflows/study-note-personal-note.yml`: 위 합성 계약 검사를 전용 CI에 추가.

## 3. 필수 검수 및 접근 확인
- 전용 CI Run #45144524612, 커밋 `1f825cf797f0f29e2c54ca7e812d98cbd0da2961`:
  - `personal-note-checks` SUCCESS, `browser-essentials` SUCCESS.
  - `PERSONAL_NOTE_CLIENT_SERVER_CONTRACT_PASS` : 다중 페이지·사진·공통 배경·두 모의 기기 왕복·CAS 보호·오프라인 보존 합성 검사.
- 실제 인증된 ACTIVE 기기 2대 왕복 / 실제 Drive API 쓰기 / 운영 Apps Script 호스트 동작 **미검증**.
- 연결된 Google Drive의 Apps Script MIME 검색 0건. 원격 PC `DESKTOP-5H5J4TU`의 `clasp list --json`에는 이번 시험 프로젝트와 과거 격리용 프로젝트 3개만 확인. 운영 v23 실제 `Code.gs`의 Script ID/전체 원본/접근 권한 **미확보**.
- `clasp run PN1_stageSelfTest`의 Google `NOT_FOUND`는 함수 내용이 정상 실행됐다는 증거가 아님. Google 공식 clasp 실행 문서에 따라 API executable 배포 및 OAuth 클라이언트/연결 GCP 프로젝트 설정을 먼저 갖춰야 하므로 현 상태는 **실행 미검증**.
- 전용 테스트 Apps Script `PePersonalNoteIsolated20261123`는 `C:\Users\user\Dev\PePersonalNoteIsolated20261123`에서만 관리. 최신 강화 서버 코드 `pn_isolated_server.gs`로 갱신하고 `clasp push` 성공(2026-11-23). 운영 Apps Script·MASTER·공용 구글 드라이브 폴더·다른 PC 프로젝트·다른 채팅 PID에 쓰기/종료 없음.

## 4. 여전히 차단된 핵심 목표
**Google 클라우드 다중 기기 동기화 운영 완료가 아님.**
1. 운영 Apps Script v23 프로젝트 Script ID 및 실제 배포되는 전체 Code.gs를 **정당한 소유자 계정 권한**으로 읽기 전용 확보해야 함. 공개 /exec URL만으로 소스를 역산하지 말 것.
2. `validateSignedGet_`, `validateSignedMutation_`, ACTIVE/HMAC/nonce, owner/device 검증, mutationStatus·일반 저장 라우터를 실제 운영 버전과 대조해 기존 기능 보존.
3. 별도 승인된 격리 시험용 Drive 폴더/마커와 Apps Script Script Properties를 마련하고 API executable 및 OAuth 접근을 구성한 후 실제 구글 서버 왕복 검증.
4. 위 단계에서 안전성·데이터 무손실이 확보돼야 기존 운영 Apps Script에 후보 라우팅을 통합하는 별도 PR을 준비. *별도 사용자의 운영 배포 승인 전까지 운영 Script·main 재수정 금지*.
5. Galaxy Tab S11/iPhone Safari/PC 실제 사용 검수는 사용자가 운영 반영 후 직접 진행하는 기준. 서버 보안·데이터 무손실 최소 검수는 생략하지 않음.

## 5. 새 채팅용 작업요청서
학습노트 개인 노트 Google 클라우드 동기화 Draft PR #98을 이어서 개발해줘. 기존 PR #96/#97 로컬 그림판·A4·배경·UI는 main `37c53067f856e3f9d5733baf8349495a0ca6e7f1` 및 Pages에 배포 완료됐으므로 중복 병합/배포하지 마. PR #98에는 브라우저 로컬 저장 후 `syncPending` 보존과 재연결 시 안전한 자동 재시도, 서버의 토픽 SHA 키·페이지/이미지 스키마 검증, 실제 클라이언트/서버 후보를 합성 DriveApp·서명 게이트에 연결한 2기기 왕복 테스트가 추가됐고 최소 CI Run #45144524612의 2개 Job 모두 SUCCESS야. 회사 PC `DESKTOP-5H5J4TU`의 독립 폴더 `C:\Users\user\Dev\PePersonalNoteIsolated20261123`에 강화한 GAS 후보를 clasp push했지만 `clasp run`은 API executable/OAuth 준비 부족으로 NOT_FOUND이므로 실제 Drive/서버 검증은 미완료야. 운영 v23 Apps Script 실제 Script ID/Code.gs가 연결된 계정에서 보이지 않으니 우선 소유자 권한의 운영 원본을 **읽기 전용** 확보하고 ACTIVE/HMAC/nonce 인증을 대조해. 이후 격리 Drive 폴더에서 실제 API 실행 검증 → 운영 라우팅 별도 PR → 별도 승인 후 운영 배포를 수행해. 원본 없이 운영 코드 추정 병합 금지, LIVE MASTER 원문/PDF/첨부/주석/보안/타 채팅 원격 프로세스 보호, 개발 80%·필수 검수 20% 원칙 유지. 작업마다 실제 완료·미완료·미검증, 브랜치·PR·SHA, 복사할 후속 요청서 보고.
