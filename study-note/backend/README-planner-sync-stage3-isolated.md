# Stage 3 — 격리 Apps Script 학습계획 동기화 백엔드 후보

**개발 상태: Draft PR용 후보 소스. 운영 미병합·미배포·실제 Apps Script 런타임 미검증.**
**기준 main:** \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\`
**최초 설계:** Stage 2 Draft PR #83의 \`STAGE2-SCHEMA-API.md\`와 \`STAGE2-CONFLICT-MIGRATION.md\`.
**핵심 파일:** \`study-note/backend/planner-sync-stage3-isolated.addon.gs\`.

## 1. 구현 내용

- \`PS3_get_(action,data,auth)\`: 계획 메타 목록(\`studyPlans\`), 활성 일정 청크 페이지(\`studyPlanSchedule\`), 진도 변경 이벤트 페이지(\`studyProgress\`, 고정 highWatermark/ untilSeq)
- \`PS3_post_(action,data,auth)\`: 계획 스테이징(\`beginStudyPlanRevision\`), ≤12 청크 업로드(\`putStudyPlanChunks\`), SHA 검증 후 활성화(\`commitStudyPlanRevision\`), 진도 이벤트 CAS 추가(\`saveStudyProgress\`, ≤25건)
- 계획은 정규화한 canonical JSON SHA-256 검증을 거쳐 **불변 revision**으로 기록하고, **모든 청크 확인 후** plan 메타의 활성 revision을 갱신.
- progress는 \`planId|date|topicId\` 단위의 append-only 로그, \`rowRevision\` CAS 및 영속 \`operationId\` 검출. 동일 operationId·다른 payload 거절.
- 계획 업로드 중복/경합 방지: 동일 계획 STAGING 병렬 업로드 차단, 1시간 지난 미완료 stage EXPIRED 전환, 다음 revision 번호 재사용 방지.
- 운영 원장 보호: Script Properties \`PLANNER_SYNC_MODE=ISOLATED_TEST\` 요구, \`PLANNER_SYNC_TEST_SPREADSHEET_ID\` 필수, LIVE ID와 동일하면 차단, 테스트용 시트 제목·\`테스트토픽!D2\`의 \`TEST ONLY\` 마커 필수.
- 악의적 시트 수식으로 해석될 수 있는 계획 이름과 클라이언트 시각 문자열 거절.

## 2. 실행 환경 분리 (운영 설정 복사 금지)

- 별도 시험용 Google Sheets **학습계획 동기화 Stage3 격리시험용 - 합성데이터 전용 20261113** 생성됨. 4개 서버 탭 + \`테스트토픽\` 존재, 1개의 합성 토픽 샘플만 입력됨. LIVE MASTER 원문을 복사하지 않음.
- 운영용 Google Sheets와 별개이며 개발 스크립트에서 **시험용 spreadsheetId가 정확한지 직접 확인한 뒤** Script Properties에 설정해야 함. 실제 Script Properties는 이번 단계에서 변경하지 않음.
- 프로그램 실행 설정은 \`PLANNER_SYNC_MODE=ISOLATED_TEST\`, \`PLANNER_SYNC_TEST_SPREADSHEET_ID=<test-sheet-id>\`. LIVE 원장 ID를 기입하지 않음.
- **현재 애드온 코드는 호스트 라우터와 독립된 함수 후보만 제공한다.** 이 파일 단독으로 웹 엔드포인트가 만들어지지 않으며 운영 Code.js에 직접 복사/추가하면 안 된다.

## 3. 기존 ACTIVE/HMAC 보안과의 통합 위치(별도 격리 복제에서만)

기준 참고: \`study-note/mupdf-migration/r5/source/Code.js\`의 \`doGet\`, \`doPost\` 및 \`validateSignedGet_\`, \`validateSignedMutation_\`.
이 파일은 과거 v21 일치 근거가 있는 **공개 사본**으로 실제 최신 배포 소스라고 가정할 수 없음.

### GET

**격리된 시험용 Code.js**에서 기존 \`doGet\`의 알 수 없는 action 처리 직전에 추가할 분기 예시:

\`\`\`javascript
if (['studyplans','studyplanschedule','studyprogress'].includes(action)) {
  const verified = validateSignedGet_(params, ['ACTIVE']);
  return jsonOutput_(PS3_get_(action, verified.data, verified));
}
\`\`\`

### POST

**격리된 시험용 Code.js**에서 기존 \`validateSignedMutation_(envelope,['ACTIVE'])\` 성공 후 검증된 \`authContext\`와 data만 전달:

\`\`\`javascript
if (['beginstudyplanrevision','putstudyplanchunks',
     'commitstudyplanrevision','savestudyprogress'].includes(action)) {
  result = PS3_post_(action, verified.data, authContext);
}
\`\`\`

- 기존 POST의 action 분기가 \`if/else if\` 체인이므로 중복 실행하지 않도록 정확히 기존 체인에 **추가 분기**해야 한다. 이 문서의 코드는 예시이며 파일에 자동 삽입하지 않았다.
- 읽기/쓰기 모두 보안 세션이 ACTIVE인지 확인; nonce/replay 보호는 기존 검증 함수가 담당. **PS3_auth_는 단지 ACTIVE 컨텍스트를 요구하는 방어적 조건이고 HMAC 검증 대체가 아니다.**
- 운영 Apps Script에 붙여 넣거나 운영 활성화하는 것은 Stage 8 별도 승인과 정확한 배포 소스 확인 후 진행.

## 4. Stage 2 데이터 계약과 구현 상세

| 기능 | 구현 | 유의사항 |
| --- | --- | --- |
| 계획 메타 조회 | \`studyPlans\` | 시험용 샘플 데이터만 접근 |
| 일정 조회 | \`studyPlanSchedule\` | 활성 revision만, 최대 100 청크/페이지 |
| 계획 업로드 | begin/put/commit | 8KiB 청크, 12개/POST, 총 청크 ≤5000 |
| 진도 조회 | \`studyProgress\` | afterSeq, limit≤300, untilSeq |
| 진도 저장 | \`saveStudyProgress\` | 1~25 변경, 서버 rowRevision CAS |
| 멱등성 | 계획 작업 장부와 진도 이벤트 원장 | 기존 CacheService 120초 폴링과 별개 |
| 최초 사용자 데이터 통합 | **미구현** | Stage 5 |
| 웹앱 IndexedDB 연결 | **미구현** | Stage 4 |
| 실제 OAuth/HMAC 통합 실행 | **미검증** | 운영 아닌 독립 Script 환경에서 추가 검증 필요 |
| 19,060건 실제 Apps Script/Sheets 실측 | **미실시** | synthetic Node mock에서는 통과, Script 연결 환경 검사 필요 |

## 5. 정상 실행/테스트

\`\`\`bash
node study-note/tests/test_planner_sync_stage3_synthetic.cjs
\`\`\`

테스트는 \`node:vm\`에서 SpreadsheetApp, PropertiesService, Utilities, LockService를 **합성 객체로 모킹**하여 실행. GitHub Actions \`planner-sync-stage3-synthetic.yml\`에서 반복 가능.

기대 검증: 계획 저장/조회, 100일×19,060회 합성 배정 분할 업로드·복원, 손상된 청크 해시 거부, 동시 stage 거부, ACK 재시도, done/miss/todo, rowRevision 충돌, operationId 중복 0, ACTIVE/격리모드 차단. **이 테스트는 Apps Script 실제 실행이나 HMAC 서명 검사를 대체하지 않는다.**

## 6. 현재 보완할 항목

1. 실제 격리 Apps Script 프로젝트에서 기존 ACTIVE/HMAC 인증 로직을 **운영 비밀키 없이** 시험용 Google 계정으로 구성·배포하는 접근은 현 연결 도구에 없음. 실제 격리 배포·GET/POST 네트워크 시험은 미완료.
2. 새 시험 원장에는 합성 토픽 1건만 있으므로, 전체 3812건 실제 Sheet 처리시간은 확인하지 못함. 로컬 합성 fixture \`isolated_planner_sync_fixture.xlsx\`에는 3812개의 허구 토픽이 존재하지만 Google 원장으로 import하지 않았음.
3. 계획 업로드 해시/청크 방식과 Stage 2 정규화 규약은 **Stage 4 웹앱**에서 완전히 동일하게 구현되어야 함. 서버 JSON 문자열 순서/그룹 정렬/round null 포맷이 반드시 동일.
4. 19,060개 일정에 대해 매 조회마다 Google Sheets 전체 행을 읽는 방식의 호출 비용은 **격리 Apps Script 실측 전 운영 승인 금지**. 성능이 나쁘면 인덱스/청크 저장 구성을 보완해야 함.
5. 운영 원장/Apps Script/기기별 기존 학습기록은 이 Stage 3 작업에서 건드리지 않았음.

**다음 단계:** Stage 4 웹앱 로컬 큐·서버 동기화 구현. Stage 5 실제 기기별 기존 진도 병합. 단계 전환은 별도 사용자 요청에 따름.
