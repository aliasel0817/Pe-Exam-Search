# 학습노트 다중 기기 학습계획 동기화 — Stage9 운영 연결 후보 작업보고
기준: 2026-11-15 KST · **개발/설계 80%, 검증 20% 지향** · **운영 출시 BLOCKED**

## 1. 기준선 및 독립성
- 운영 main: \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\` (이번 작업 종료 시 재확인). main 미변경.
- PR #90: stages 1–8 main 대상 통합 Draft, 미병합. PR #91: 19,060건 실제 격리 성능검사 Draft, 미병합.
- PR #92: 별도 Stage9 운영 signed server/client bridge Draft, PR #91 스택 기반. PR #82–#91 원본 브랜치 미조작.
- 회사 PC \`DESKTOP-5H5J4TU\`: 원격 CMD가 정상 복구됨. 작업 소유 폴더 \`C:\Users\user\AppData\Local\Temp\pe-planner-stage9-20261115-chat\`만 사용, 다른 채팅의 프로세스·PID 무조작.
- 실제 Pages의 \`study-note.html\`, \`study-planner.js\`, \`service-worker.js\` 원문 접두 내용은 main 소스와 동일 (원격 URL 읽기 결과, 도구 출력 꼬리 제외).
- 기존 승인된 MuPDF R5/version21 \`Code.js\`은 SHA-256 \`e2867b4859a861c835541f6fb4a5196374c97035ca6edeaf6b696ad3289d3f3f\`, Git blob \`9457b67d61742fce1e70f2ce18f6c386a478b9ee\`로 보존.

## 2. 실제 개발 결과
1. Stage3 \`PS3_context_\`: 기존 \`ISOLATED_TEST\` 유지. \`PRODUCTION\` 모드는 **STUDY_NOTE_SPREADSHEET_ID**, \`PLANNER_SYNC_PRODUCTION_READY=READY:<same ID>\`, 원장 파일명 \`topic_study_data\`, 암기장 시트와 신규 학습계획 4개 시트의 헤더가 모두 일치한 경우에만 활성. 운영 MASTER 학습 원문을 직접 수정하는 기능 없음.
2. \`planner-sync-stage9-production-bridge.addon.gs\`: GET 3종·POST 4종 허용목록. GET은 호스트 \`validateSignedGet_(ACTIVE)\` 이후, POST는 기존 \`validateSignedMutation_(ACTIVE)\` 이후에만 Stage3 서버 호출. 기존 인증/nonce/claim/poll 방식 재사용.
3. \`study-planner-sync.js\`: localhost 합성 모드 보존, 운영 hostname과 **실제 signed GET 응답 버전 검증** 전에는 \`productionEnabled()=false\`. 별도 \`runSync\`은 기존 최초 통합 준비 상태가 \`ready\`가 아니면 쓰기 실행을 차단.
4. \`study-planner.js\`: 운영 signed GET 읽기 확인 성공 후에만 최초 통합 마법사와 통합 버튼을 연결. 사용자 승인 전 자동 업로드 없음.
5. \`study-planner-migration-ui.js\`: 사용자 파일 다운로드·재선택·해시 확인 및 승인 프로세스는 유지하면서 인증 완료된 운영 transport를 지원.
6. 기존 R5 \`Code.js\`은 MuPDF/AGPL 법률 및 R7~R9 불변성 검사 보호를 위해 **원본 그대로 보존**. \`build-planner-sync-stage9-host-candidate.cjs\`는 승인된 R5 소스 SHA를 확인한 뒤 서명 라우트가 추가된 후보를 메모리에서 생성. **현 운영 Script는 변경하지 않음.**
7. \`build-planner-sync-stage9-release-package.cjs\`: Git 저장소 외부의 **신규** 경로에만 Code.gs / PlannerSyncBackend.gs / PlannerSyncSignedBridge.gs / appsscript.json 및 출시 게이트 매니페스트를 생성. 운영 계정 자격증명·설정·배포 절대 수행하지 않음.

## 3. 검증 결과 (독립 합성 검사, 실제 GAS 아님)
- GitHub Actions Stage9 Preflight **SUCCESS** Run #43702352135: 운영/격리 게이트, 인증 경로, 기존 GET/POST 보존, 19,060건 청크/해시 합성 왕복, 원본 HMAC 검사 함수의 합성 검증 PASS.
- 기존 R5/R7/R8/R9 MuPDF·AGPL 증빙 검사 **25/25 PASS**. 기존 \`Code.js\`의 승인 SHA 보호.
- 리뷰용 Apps Script 묶음 생성·구문검사 PASS. 격리 코드·키·사용자 기록을 운영에 반영한 것은 아님.
- 같은 커밋의 Stage5 최초 통합, Stage6 UX 및 세 화면, Stage7 교차 서버, Stage8 브라우저/백업 통합 합성 CI **모두 SUCCESS**.
- 실제 테스트 Google Sheets는 4개 계획 시트 모두 **헤더만 존재**. 19,060건 실제 GAS 업로드·조회/LockService/quotas 미실행.
- \`clasp run PS8R_runEditorBatch\`는 실제 격리 프로젝트에서 \`NOT_FOUND\` 반환. 이는 Apps Script API executable/표준 Cloud OAuth 미설정으로 인한 실행 경로 차단과 양립하며, GAS 편집기 함수 실행 여부 자체의 문제와 별개.
- 사용자 화면은 \`PS8R_preflight\` SUCCESS만 증명. \`PS8R_runEditorBatch\` 실행 성공 **증빙 없음**.
- 실제 격리 AUTH 신뢰기기/HMAC/nonce signed HTTP 통합 **미검증**.
- Windows 실제 로그인·PDF·MuPDF 필기·서비스워커 전 기능 사용 E2E **미검증**.
- 사용자 스마트폰/태블릿 물리검수: 요청에 따라 **SKIPPED**, PASS 아님.

## 4. 운영 릴리스 차단 상태
**BLOCKED**. 사용자는 운영 main 반영을 명시적으로 요청했지만 다음 기술 출시 게이트가 남아 있다.
1. 격리 Apps Script 에디터에서 \`PS8R_runEditorBatch\` 실행. \`VERIFIED\` 될 때까지 중단·재개하고 19,060건 SHA/지연/호출 수/쿼터 수치 보존. 이어서 \`PS8R_progress\`.
2. 독립 격리 합성 인증 원장 + ACTIVE 신뢰기기 + HMAC/nonce/시각 만료 + 7 HTTP API **실서버** 통합 시험.
3. 실제 운영 Script ID/배포 버전·보안 설정과 R5 원본 SHA의 일치 여부 확인. Script/Sheets 복구 지점 확보. 생산용 신규 계획 저장소 4개 탭을 중앙 원장에 추가할 별도 백업과 무손실 승인 절차.
4. 위 모두 PASS 후 승인된 패키지로 운영 Script 안전 배포, 계획 endpoint/권한 검증 및 PR #82~#92 의존성 통합 RC를 main 병합. GitHub Actions/Pages 실제 반영·기존 PDF/필기/인증 회귀검사.
5. 배포된 기능도 기존 사용자 데이터 첫 통합은 OFF. 기기별 전체 JSON 백업·파일 재선택·해시·충돌 검토 및 사용자 기기별 승인을 거쳐야만 첫 동기화 가능.

**코드 합성 PASS는 실제 Google 성능이나 사용자 데이터 무손실을 입증하지 않는다. 본 대화에서는 main 병합·Pages·운영 Apps Script·LIVE MASTER·사용자 계획/진도 변경을 수행하지 않았다.**
