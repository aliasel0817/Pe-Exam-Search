# 학습노트 다중 기기 학습계획 동기화 — 4단계 전체 작업요청서

## 1. 목표

**기존 학습노트 프런트엔드에 회독 계획·진도 동기화 클라이언트를 개발**한다. PC/태블릿/스마트폰 간 동일 계획/배정/진도 공유를 목표로 하되, Stage 3 백엔드가 실제 Apps Script 격리 환경에서 완전히 검증되기 전에는 **운영 API 연결 및 운영 배포를 하지 않는다.**

전체 작업 비중은 **개발·설계 80%, 검수·배포 20%**. Stage 4에서는 개발과 핵심 모의 회귀 검사를 우선한다.

## 2. 재확인할 기준선

- GitHub \`aliasel0817/Pe-Exam-Search\`, Stage 3 시작 시 main: \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\`. **Stage 4 시작 시 최신 main·PR·운영 Pages·Apps Script 재조회.**
- Stage 1 Draft PR #82, Stage 2 설계 PR #83, Stage 3 코드 Draft PR #84.
- Stage 2 상세설계: \`study-note/planner-sync/STAGE2-SCHEMA-API.md\`, \`STAGE2-CONFLICT-MIGRATION.md\`, \`STAGE2-IMPACT-CHECKLIST.md\`, \`STAGE3-REQUEST.md\` (PR #83).
- Stage 3 서버 후보: \`study-note/backend/planner-sync-stage3-isolated.addon.gs\`; 구성·통합/한계: \`study-note/backend/README-planner-sync-stage3-isolated.md\`; mock QA: \`study-note/tests/test_planner_sync_stage3_synthetic.cjs\` (PR #84).
- Stage 3 격리 시험용 Google Sheets는 실제 LIVE MASTER와 별개, 4개 sync 탭 + TEST ONLY 합성 토픽. **실제 Apps Script 시험 배포 및 실서버/HMAC 통합 검사는 Stage 3 시점 미완료**; 모의 API 통과만으로 운영 연결하지 않는다.
- 현재 서비스 \`study-note/study-note.html\`의 일반 \`learningStates/saveLearningStates\`와 \`syncLearningStates\`; \`study-note/study-planner.js\`의 \`pe-study-planner-v1\` IndexedDB \`plans\`, \`progress\`.
- 실제 사용자 기기별 IndexedDB 진도/계획은 **아직 수집·병합하지 않았음**. 기본 100일 3812 토픽·19060회, LIVE 기준 신규 Y 24개는 정적 파일과의 차이일 뿐 각 기기 편입 여부 미확인.
- 충돌·오프라인·서버 배포판 바인딩·다른 채팅 작업 소유권을 추측하지 않는다.

## 3. 수행 5개 작업

### 3-1. IndexedDB 안전한 v2 업그레이드
1. 기존 DB 이름 \`pe-study-planner-v1\`과 \`plans/progress\`를 유지한다. 새 ObjectStore \`syncMeta\`, \`pendingOps\`, \`syncConflicts\`, \`preSyncSnapshots\`를 **버전 업그레이드로 추가**한다. 기존 두 저장소의 데이터 삭제/clear/reset 금지.
2. 진도 로컬 저장과 pendingOps 생성은 같은 트랜잭션에서 처리한다. 원래 \`StudyPlanner.record\` 동작/날짜 컨텍스트/기존 화면 필터 유지.
3. 최초 사용은 기존 진도를 묻지 않고 원격으로 덮어쓰지 않도록 \`MIGRATION_REQUIRED\` 상태로 구분한다. Stage 5 이전 UI 적용 전 서버에 자동 업로드하지 않는다.

### 3-2. 계획 스냅샷 동기화
1. Stage 3 \`studyPlans\`·\`studyPlanSchedule\`·begin/put/commit API 계약과 완전히 동일한 canonical JSON/그룹 정렬/날짜·회독·토픽 순서·SHA-256 로직 구현.
2. 새 계획 생성/CSV·JSON 가져오기/신규 24 토픽 편입을 로컬에서 사용 가능하게 유지하고, 서버 전송 대기 작업으로 기록한다.
3. 일정은 활성 revision의 청크를 **모두** 수신·해시 검증한 다음 로컬로 반영하고, 새 revision 충돌이면 원본 보존/보류.
4. 계획 초기 시딩의 고정 planId를 서버 계획과 중복 생성하지 않도록 Stage 5 최초 병합 규칙과 연계한다.

### 3-3. 회독별 진도 증분 동기화
1. \`studyProgress\` 조회(\`afterSeq/limit/untilSeq\`) 및 \`saveStudyProgress\` 쓰기를 구현한다.
2. 각 변경은 영속 \`operationId\`와 \`expectedRowRevision\`, \`planRevisionAtWrite\`를 갖는다. 통신 실패 후 retry에도 ID 보존.
3. 서버 이벤트의 seq는 첫 페이지 \`highWatermark\`를 고정하고 연속 수신. 서버 verified 커서와 pending ack는 성공 후에만 업데이트.
4. 충돌은 UI 표시용 \`syncConflicts\`로 저장. \`done\` vs \`miss\`나 다른 회독 기록을 무조건 덮어쓰지 않는다.
5. 오프라인에서는 로컬 완료/다시보기 정상 동작, 재접속 후 미전송 큐 재개.

### 3-4. 기존 동기화 버튼과 상태 통합
1. 기존 \`학습정보 동기화\` 기능을 제거/축약하지 않고, 일반 학습정보 + 학습계획 + 진도의 **영역별 결과**를 추가한다.
2. 최초 동기화, 서버 기능 미지원, 미승인 기기, 네트워크 장애, 부분 성공 상태를 구분한다.
3. Stage 6에서 자세한 안내를 변경하되, Stage 4에서도 최소한 \`서버 준비 안 됨/로컬만 저장/미전송 N건\`을 정확히 표시.
4. 기능 플래그 기본 OFF. Stage 3 실제 Apps Script/HMAC/Sheet 시험이 미확인이라면 production endpoint로는 신규 API 호출·업로드를 비활성화한다.

### 3-5. 핵심 회귀 검사와 인계
1. 합성 IndexedDB에서 v1→v2 업그레이드 후 plan/progress 바이트 및 기록 수 보존.
2. mock server로 두 기기의 같은 plan/version/slot/진도 수렴, 각 회독 독립성, 충돌/중복 재시도.
3. 오프라인→연결, 인증 실패, 서버 기능 미지원 시 기존 로컬 학습 지속.
4. 기존 일반 학습정보/진도 백업·복원, 학습계획 5회 자동 편입, 기존 검색/PDF 기본 경로의 경량 회귀.
5. 자동·브라우저·실기기 검사 결과는 구분한다. 과도한 반복 검수 대신 데이터 보호와 동기화 핵심 검증에 집중.

## 4. 절대 금지·안전 규칙

- Google Sheets LIVE MASTER 학습 원문·학습정보/관리기기/첨부/PDF/주석 데이터 및 모든 사용자 기기 기존 진도 수정/삭제 금지.
- 현재 운영 Apps Script/Script Properties·실제 운영 시트 변경 또는 배포 금지. test-only 서버 후보와 synthetic 데이터만 사용.
- GitHub main 병합/Pages 배포 금지. 별도 feature 브랜치/Draft PR에서만 개발.
- 원격 PC 접속 시 대상 장비·절대경로·Git 저장소·프로세스 소유권 확인. 타 채팅의 소스·프로세스·PID 무조작.
- 신규 기능 때문에 기존 학습 기능/검색/PDF/이미지/첨부/필기/보안·인증 흐름을 바꾸거나 축약하지 않는다.
- Stage 3 서버 실배포/HMAC end-to-end 미완료를 Stage 4에서 검증 PASS로 바꾸지 않는다. 필요한 별도 test-only 배포는 먼저 안전성 확인.
- 계획/진도를 원격에서 자동 덮어쓰는 최초 통합은 **Stage 5** 승인 흐름 전까지 비활성화.

## 5. 필수 산출물

1. 웹앱의 IndexedDB 안전 업그레이드 및 계획·진도 동기화 소스.
2. 서버 API 계약과 클라이언트 구현 일치 확인 자료 및 기능 플래그.
3. 로컬/outbox/오프라인/충돌·재시도 처리 결과와 회귀검사 증거.
4. GitHub Draft PR 및 SHA/변경 파일/미병합 PR 충돌 확인 기록.
5. 운영 MASTER, 실제 사용자 진도, 인증·PDF 등 불변 결과.
6. **5단계 최초 기기별 학습기록 통합·복구를 위한 전체 작업요청서 전문을 채팅 메시지 본문으로 제공.** 링크만 제공 금지.

## 6. 종료 조건

Stage 4의 UI/클라이언트 소스와 mock 서버 동작 검증까지 개발한다. 실제 각 기기의 진도 최초 통합은 Stage 5, 전체 핵심 검수는 Stage 7, 운영 main/Apps Script/Pages 배포는 Stage 8의 사용자 별도 승인 후에만 실시한다. 불가능·미검증 항목을 명확히 보고한 뒤 다음 요청서를 제공한다.
