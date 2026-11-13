# 학습노트 다중 기기 학습계획 동기화 — Stage 4 결과 보고 (2026-11-13 KST)

## 0. 작업 범위 및 기준선

- GitHub: \`aliasel0817/Pe-Exam-Search\`; 작업 시작 main: \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\`.
- 이전 완료·미병합 Draft PR: #82(Stage 1), #83(Stage 2), #84(Stage 3). 현재 변경: **Draft PR #85** 독립 브랜치 \`feature/planner-sync-stage4-client-20261113\`.
- 실제 운영 GitHub Pages/Google Apps Script, LIVE MASTER, 사용자 기기 IndexedDB에는 **쓰기·병합·배포 작업 없음**. 다른 채팅 원격 PC 프로세스/PID/Git 파일 무조작.
- 전체 작업 비중: **개발·설계 80%, 검수·출시 20%**. Stage 4 핵심 합성 브라우저 + 기존 3개 회귀만 수행.

## 1. 개발 완료(후보 코드 기준, 운영 미반영)

| 기능 | 구현 증거 및 의미 |
| --- | --- |
| DB v2 안전 업그레이드 | \`study-note/study-planner.js\`에서 \`pe-study-planner-v1\` DB 버전 1→2. 기존 \`plans/progress\` 그대로 두고 \`syncMeta\`, \`pendingOps\`, \`syncConflicts\`, \`preSyncSnapshots\` 4개 store 추가 |
| 로컬 저장+outbox 원자화 | \`study-note/study-planner-sync.js\`의 \`queuePlan\`, \`queueProgress\`, \`queueProgressBatch\`; 생성/편입/CSV·JSON 등록/진도 기록/JSON 복원 경로에서 연동 |
| 계획 클라우드 프로토콜 | canonical SHA-256, ≤8KiB DAY/GROUPS 청크, begin/put/commit, activeRevision/hash, 불완전/충돌 상태 보존 |
| 진도 증분 동기화 | \`studyProgress\` (afterSeq/고정 untilSeq), \`saveStudyProgress\` (per-key CAS/영속 operationId), done/miss/todo 독립 보존 |
| 미전송·오프라인/응답 손실 | 전송 이전 outbox 영속화, 동일 opId 재시도, ACK 후에만 삭제, 충돌 보류함 저장 |
| 기존 동기화 버튼 연결 | \`study-planner.js\`에서 **loopback/test flag에 한해** 기존 버튼에 planner sync 연결. 일반 학습정보 동기화 코드와 인증 로직은 **변경하지 않음** |
| 계획 UI 상태 | \`plannerSyncStatus\`: 기본 서버 연결 준비 중, 미전송, 최초 기기별 통합 대기, 충돌 수량/최근 성공 표시. Stage 6에서 사용자 안내 최종 개정 예정 |
| 운영 연결 차단 | \`PE_PLANNER_SYNC_TEST_ENABLED=true\`, loopback hostname, \`PE_PLANNER_SYNC_TEST_TRANSPORT\` 모의 전송 세 조건을 동시에 요구. 그 외 \`sync\`는 \`disabled\` 반환, 요청 0건 |

**보존:** \`study-note/study-note.html\` 전체 원문은 \`main\`과 바이트 단위로 동일하게 되돌려서 MuPDF/AGPL 보호 회귀 테스트를 유지. 새 모듈은 기존 planner 스크립트에서 조건부 로딩. \`service-worker.js\`, 인증 및 MASTER·PDF·주석 원문은 수정하지 않음.

## 2. 수행 검증과 결과 한계

**합성 브라우저 검증**
- Workflow: \`.github/workflows/planner-sync-stage4-browser.yml\`
- Test: \`study-note/tests/test_planner_sync_stage4_browser.cjs\`
- 실제 Chromium 두 독립 브라우저 프로필 + 루프백 Node mock API를 사용. 실사용 기기/Google 서버가 아님.
- v1→v2 업그레이드 시 원래 plan 및 progress 두 레코드를 JS 객체 단위로 일치 확인.
- 최초 통합 이전 서버 접근 0건, 합성 새 계획 생성·원격 일정 import, PC done→태블릿, 태블릿 miss→PC, 다른 회독의 독립 상태, 오프라인 재개, 동일 키 CAS 충돌 보류, ACK 소실 후 opId 재시도 중복 0건.
- 기존 일반 학습정보 동기화 버튼의 테스트 모드 연결 및 migration gate 검증 추가.
- 근거: \`https://github.com/aliasel0817/Pe-Exam-Search/actions/runs/43421069049\` (핵심 브라우저 PASS). 마지막 테스트 강화 커밋의 별도 Actions 결과도 확인 후 인계한다.

**기존 회귀**
- \`Study Planner Live MASTER QA\` (\`https://github.com/aliasel0817/Pe-Exam-Search/actions/runs/43421069056\`) PASS.
- \`Study Note Windows Preview and Cache QA\` (\`https://github.com/aliasel0817/Pe-Exam-Search/actions/runs/43421068979\`) PASS.
- \`Study Note Visibility Browser QA\` (\`https://github.com/aliasel0817/Pe-Exam-Search/actions/runs/43421069168\`) PASS.

**엄격한 구분**
- 실제 Apps Script 독립 시험 배포 + HMAC/nonce + LIVE Sheets I/O **미검증**. Stage 3 미완료 사항을 PASS로 바꾸지 않음.
- 실제 사용자 PC·태블릿·스마트폰의 계획/진도 백업, 최초 통합, 충돌 해결 및 실기기 검수 **미실시**.
- 현재 단계는 모의 합성 API 지원 클라이언트 후보만 제공하며 운영 페이지에는 **반영 안 됨**.

## 3. 위험·남은 작업

1. Stage 3 격리 Apps Script 실제 실행·기존 ACTIVE/HMAC 호스트 통합, 대용량 Sheets 속도 측정 완료 전에는 서버 운용 불가.
2. 기존 기기별 plan ID와 서로 다른 일정/진도의 **실제 첫 통합은 Stage 5**로 유보. \`preSyncSnapshots\`는 store만 생성, 전체 계획+진도 백업·병합 승인 UI는 아직 구현되지 않음.
3. Stage 4의 \`syncMeta.migration\` 값은 기존 사용자의 경우 기본 \`required\`. 합성 테스트에서만 시험 마커로 \`ready\`를 설정했으며 사용자 실계정에 적용 안 함.
4. Stage 6에서 사용자 안내/복원 번호와 마지막 동기화 UI 개정, Stage 7 핵심 전체 회귀, Stage 8 승인 후 운영 반영.
5. 기존 일반 학습정보와 회독 진도의 인증·실제 네트워크 E2E 실행 검증은 다른 범위이므로 결과를 혼동하지 않는다.

## 4. Stage 5 인계

- 전체 독립 실행 요청서: \`study-note/backend/STAGE5-REQUEST-planner-sync.md\`.
- 다음 채팅에는 **요청서 전문을 메시지 본문으로 제공**하고 링크만 주지 않는다.
- Stage 5 개발도 별도 Draft PR/합성 시나리오. Stage 6, Stage 8 및 운영 배포를 자의로 진행하지 않는다.
