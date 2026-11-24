# 학습노트 개인 노트 클라우드 동기화 후속 작업 인계 v11 (2026-11-24)

## 1. 결론: 운영 메인 반영 요청 접수, 그러나 필수 Google 실환경 검증 차단으로 운영 배포 보류
- 이번 사용자는 `실제 메인 서버에 반영`을 명시적으로 요청하여 **운영 반영 의사 확인**.
- 단, 프로젝트의 데이터 무손실/ACTIVE 인증/보안 검증 의무에 따라 실환경 403을 성공으로 간주하거나 운영 배포를 강행하지 않았음.
- GitHub main HEAD 재확인: `37c53067f856e3f9d5733baf8349495a0ca6e7f1` **변경 없음**.
- Draft PR #98 HEAD: `c83cf876de0651109961d90c1c117f0856981d48`; Draft PR #99 (스택 PR) 기존 코드 HEAD: `dab43cae0096c845c90df06e40160faa03ed78f2` (이 문서 추가 전).
- PR #96/#97의 로컬 그림판·A4·답안지·도구 UI 운영 배포 완료 상태 보존, 중복 작업 금지.
- 운영 Google Apps Script v23 기존 배포 ID, Script Properties, LIVE MASTER, 기존 PDF/첨부, 보안인증 **읽기/확인만**, 쓰기·변경 0건.
- 개인 노트 클라우드 동기화는 **아직 운영에서 동작하지 않음**. 저장은 계속 IndexedDB 로컬 우선이며 JSON 백업 보존 필요.

## 2. 실제 운영 source 확인 (재확보 불필요)
- 회사 PC: `DESKTOP-5H5J4TU`
- 운영 v23 read-only: `C:\Users\user\Dev\PeExamProdDeployedV23ReadOnly20261124`
- 검증된 운영 v23 Code.js SHA-256: `5cecf67ada6a5b330e3ce3dc4185e8ee337e6c18e02e06766998cde90701dfa2`.
- v23 원본을 SHA 고정으로 읽고 신규 라우터를 삽입한 후보만 별도 파일로 존재:
  `C:\Users\user\Dev\PeExamPersonalNoteV23Candidate20261124\Code.personal-note.candidate.js`
- 기존 v23 소스와 비교한 라우팅 Diff는 개인노트 GET/POST 추가 및 청크 단위 감사로그 예외뿐. v23 원본 변경 없음.
- PR #99 기존 CI Run [#45295033734](https://github.com/aliasel0817/Pe-Exam-Search/actions/runs/45295033734): `personal-note-checks` SUCCESS, `browser-essentials` SUCCESS.

## 3. 이번 대화에서 수행한 새 안전성 작업
### 3.1 새 독립 Apps Script 프로젝트와 실제 Google Drive 시험
- 다른 채팅/기존 원격 폴더를 손대지 않도록 **이번 대화 전용** `PeNoteCloudReleaseIsolated20261124`을 clasp create로 생성.
- 프로젝트 로컬: `C:\Users\user\Dev\PeNoteCloudReleaseIsolated20261124`
- 시험 제어/무작위 토큰/합성 검증 로컬: `C:\Users\user\Dev\PeNoteCloudReleaseControl20261124`
- PR #99의 최신 `personal-note-sync-isolated.addon.gs`와 이전 stage 실 Drive 왕복 검사 `PN1_stageRealDriveSelfTest`를 독립 프로젝트에 업로드. `clasp push -f` 성공.
- 웹 호출이 가능한 **일회성 인증 토큰 보호 시험 배포**를 별도 프로젝트에만 생성하여 HTTP 실제 호출을 시도했으나 **403 액세스 거부**. Apps Script의 내부 함수가 실행된 근거가 없으며 Google Drive 왕복 실검증 **미완료**.
- 공개 시험 배포는 즉시 `clasp undeploy` 성공, 이후 전용 `stage_http_entry.gs` 및 무작위 토큰 로컬 제거. 다시 `clasp push -f`하여 현재 독립 프로젝트에는 **편집기 직접 실행용 4개 파일만** 남음.
- 격리 프로젝트 배포 조회 결과 HEAD만 남음. 운영 v23 deployment 조회 결과 기존 @23 그대로.
- 실 Google Drive 테스트를 하려면 프로젝트를 소유한 Google 계정의 Apps Script 편집기에서 **`PN1_stageRealDriveSelfTest` 직접 실행 → Drive 권한 동의 → 실행 로그 `PERSONAL_NOTE_STAGE_REAL_DRIVE_PASS`** 필요.
- `clasp run`은 API executable + 동일 표준 Google Cloud 프로젝트 + 충분한 OAuth scope가 필수. 기존 운영 Google Cloud 프로젝트/인증을 이 목적으로 임의 변경하지 말 것.

### 3.2 실제 운영 v23 HMAC/nonce 함수로 합성 보안검사 PASS
- 이번 대화 전용 독립 검증 스크립트(운영 원본 미포함):
  `C:\Users\user\Dev\PeNoteCloudReleaseControl20261124\verify_v23_real_host.cjs`
- 검증 스크립트는 실제 배포 v23 `Code.js`를 SHA 검증 후 정확히 해당 원본에 적용한 별도 라우팅 후보 + PR #99 서버 후보를 **Node VM**에 로드, 실제 운영 `validateSignedGet_`, `validateSignedMutation_`, `validateDeviceSignature_`를 직접 평가함.
- 인증 시트/기기/세션 키/Drive/Cache/감사 로그는 모두 **합성 값**. 실제 사용자 인증 정보나 학습 시트 접근·변경 없음.
- 실제 실행 결과: `PERSONAL_NOTE_V23_REAL_HOST_HMAC_SYNTHETIC_PASS`.
- 검사항목: ACTIVE 서명 GET·POST PASS, 잘못된 서명 거부, nonce 재사용 거부, PENDING/REVOKED 거부, 청크 업로드/확정/CAS 충돌 거부, 기존 mutationStatus 조회 유지, 단계별 감사로그, 승인 플래그 제거 시 저장소 비활성화.
- **실제 ACTIVE 기기 서명 E2E나 실제 Google 서버 Drive 저장/조회 성공을 뜻하지 않음.**

## 4. 아직 필요한 필수 조건
1. **정확한 격리 Apps Script 프로젝트** `PeNoteCloudReleaseIsolated20261124` 편집기에서 `PN1_stageRealDriveSelfTest` 수동 실행 및 최초 Drive OAuth 동의, 로그 PASS 확인. 공개 웹앱 재배포 방식은 사용하지 말 것.
2. 성공하면 별도 사용자 데이터 없는 비공개 Drive 폴더 `PeExamPersonalNotesProduction` 및 마커를 안전하게 구성할 수 있는 경로/권한 확인. 연결된 Google Drive 커넥터에서 이번 신설 Apps Script 프로젝트 검색 결과 0이므로 **클래스프 소유 계정과 같은 계정인지 확인하지 않고 임의 폴더 생성 금지**.
3. 실제 ACTIVE 신뢰기기에서 HMAC/nonce 검증·GET/POST·페이지/사진/공통 배경/충돌 처리 최소 왕복 검증(사용자 제공 기기 인증키를 요구하거나 로그로 출력하지 말 것).
4. Google의 기존 학습계획/PDF/주석/첨부/인증/MASTER 원본을 보호하고, 독립 Drive 폴더 활성화 후에만 순차적으로 운영 Apps Script 라우터/개인노트 서버/Pages를 적용. 배포 시 최신 v23 원본 SHA와 PR #98/#99 상태/충돌 재확인.
5. 필수 안전 검증이 실패하면 **운영 main 병합/Pages/Apps Script 배포를 강행하지 말 것**. 사용자 운영 승인 의사는 이미 표현했으나, 실환경 차단 상태와 다른 설정 변경의 영향은 별도 보고.

## 5. 회귀검수 방식
- 개발 80%, 필수 검수 20%.
- 필수: MASTER 원문/PDF/첨부/기존 공부 계획 진도 무손실, ACTIVE 인증/nonce/CAS, 로컬 JSON 백업 보호, 다중 페이지+이미지+공통 배경 최소 왕복, 기존 라우터 상태.
- 비필수 PC·Galaxy Tab S11·iPhone Safari 사용성 검수는 사용자가 실제 사용 중 발견 시 수정.
- 여러 채팅 원격 PC 동시 사용을 전제하고 현재 채팅에서 소유한 PID/폴더 외 강제 종료·삭제·리셋 금지.

## 6. 다음 채팅용 작업요청서
학습노트 개인 노트 클라우드 동기화 운영 적용을 이어서 수행해줘. 기존 PR #96·#97은 main 운영 완료라 재배포 중복 금지. 현재 GitHub main `37c53067f856e3f9d5733baf8349495a0ca6e7f1`; 기능 후보는 Draft PR #98과 스택형 Draft PR #99에 있으며 운영 실서버 미배포. v10에서 운영 Apps Script v23 원본/배포 URL 및 SHA를 이미 확인했고 `PeExamProdDeployedV23ReadOnly20261124`에 백업이 보존됨. 이번 v11에서는 새 독립 시험 Apps Script `PeNoteCloudReleaseIsolated20261124`에 서버/실 Drive 왕복 시험 코드를 업로드했지만, 비공개 토큰 일회성 HTTP 시험 배포는 403 액세스 거부로 실패해 즉시 제거했으며 운영에 영향 없음. 독립 시험 편집기에서 `PN1_stageRealDriveSelfTest`를 수동 실행하고 최초 Drive 권한을 승인해야 실제 Drive PASS를 확인할 수 있음. 별도로 정확한 v23 Code.js+신규 서버 후보에 대한 ACTIVE/HMAC/nonce/POST/CAS/mutationStatus **합성** 검사는 `C:\Users\user\Dev\PeNoteCloudReleaseControl20261124\verify_v23_real_host.cjs`로 PASS. 합성 검사를 실 서버 검사로 오인하지 말 것. 실 Drive OAuth 권한/실행 및 실제 신뢰기기 왕복이 통과한 경우에만 별도 private 운영 Drive 폴더/마커와 서버/메인 배포를 진행하고 기존 LIVE MASTER·PDF/첨부/주석/인증·다른 채팅 작업을 무조건 보존해. 개발:필수검수 80:20, 불필요한 검수 생략. 매 작업 종료 시 완료/미완료/미검증, PR/SHA, 복사용 인계서 보고.
