# 학습노트 다중 기기 학습계획 동기화 — 7단계 전체 작업요청서

## 1. 목표 및 범위

이전 1~6단계에서 구현한 중앙 저장 서버 후보, 안전한 IndexedDB 클라이언트, 최초 기기별 전체 백업·병합, 3영역 동기화 상태 UI를 **출시 전 종합 통합검사**하고 검증 가능한 결함만 별도 개발 브랜치에서 보완한다.

**중요:** 실제 사용자 PC·태블릿·스마트폰의 IndexedDB 기록을 최초 동기화/통합하는 작업은 이번 단계에서 승인되지 않았다. 실제 LIVE MASTER·학습정보·관리기기·운영 Apps Script·GitHub Pages·main에 쓰지 않는다. 운영 메인 병합과 배포는 Stage 8에서 사용자의 별도 명시적 승인 후 수행한다.

전체 프로젝트는 개발·설계 **80%**, 핵심 검수·운영 **20%** 방향을 유지한다. Stage7이 검증 단계이므로 핵심 5개 위험 게이트에 집중하고 불필요한 반복 테스트를 줄인다.

## 2. GitHub·서비스 기준선(시작 전 재확인)

- 저장소: \`aliasel0817/Pe-Exam-Search\`.
- Stage6 시작 시 최신 main: \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\`. **반드시 시작 시 최신 실제 main SHA·운영 Pages 소스·운영 Apps Script 버전/Script Properties·모든 미병합 PR의 변경 파일을 다시 조회**하고 차이가 있는 경우 문서화한다.
- Draft PR #82 Stage1 기준선, #83 Stage2 스키마/동기화 API/충돌 설계, #84 Stage3 Apps Script 격리 서버 후보, #85 Stage4 IndexedDB v2/오프라인·진도 클라이언트, #86 Stage5 전체 백업·처음 통합, #87 Stage6 상태 UI·사용 안내·최초 통합 7단계 UX.
- **PR #87은 PR #86을 base로 하는 stacked Draft PR**, PR #86은 #85를 base로 하는 stacked PR; Stage3 #84와 Stage2 #83은 별도의 미병합 PR이다. **해당 코드/설계를 main에 이미 병합된 것으로 가정하지 말 것.**
- Stage6 최종 커밋: 6단계 결과 보고에서 확인된 HEAD SHA를 우선하며, PR #87의 최신 head를 다시 조회한다.
- 운영 웹앱: \`https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html\`.
- LIVE MASTER 조사 당시: 3,895 토픽; 100일 기본 정적 계획: 3,812 토픽 / 19,060 일정. **기기별 편입 여부·현재 LIVE MASTER 토픽 수는 미확인, 최신 상태를 실제 읽기 전용으로 확인할 것.**
- 기존 \`pe-study-note-db\` 일반 학습정보와 \`pe-study-planner-v1\` 학습계획/진도는 구별. 후자 store: \`plans\`, \`progress\`, \`syncMeta\`, \`pendingOps\`, \`syncConflicts\`, \`preSyncSnapshots\`.

## 3. 필수 참고 파일

**2단계 설계(주로 PR #83):** \`study-note/planner-sync/STAGE2-SCHEMA-API.md\`, \`STAGE2-CONFLICT-MIGRATION.md\`, \`STAGE2-IMPACT-CHECKLIST.md\`.

**3단계 격리 서버(주로 PR #84):** \`study-note/backend/planner-sync-stage3-isolated.addon.gs\`, \`README-planner-sync-stage3-isolated.md\`, \`STAGE3-REPORT-20261113.md\`. 실제 격리 배포 여부를 추측하지 말 것.

**4단계(주로 PR #85):** \`study-note/study-planner-sync.js\`, \`study-note/study-planner.js\`, \`study-note/tests/test_planner_sync_stage4_browser.cjs\`, \`STAGE4-REPORT-20261113.md\`.

**5단계(주로 PR #86):** \`study-note/study-planner-migration.js\`, \`study-note/study-planner-migration-ui.js\`, \`study-note/tests/test_planner_sync_stage5_migration.cjs\`, \`study-note/backend/STAGE5-REPORT-20261113.md\`.

**6단계(주로 PR #87):** \`study-note/study-planner-sync-ux.js\`, \`study-note/tests/test_planner_sync_stage6_ux.cjs\`, \`.github/workflows/planner-sync-stage6-ux.yml\`, \`study-note/backend/STAGE6-REPORT-20261114.md\`. 기존 Stage4/5 테스트도 수정·확장됨.

## 4. 핵심 검사·출시 게이트

### 4-1. 게이트 A — 보안·실제 격리 Apps Script 연결(최우선 출시 차단)

- Stage3 Apps Script 실제 테스트 배포 버전, 실제 시험용 Spreadsheet 바인딩, Script Properties, 기존 ACTIVE 신뢰기기/HMAC/nonce/서명·timestamp 재검증과 API 진입 지점을 **읽기 전용으로 확인**한다.
- 실제 격리 테스트 Script·Sheets가 연결 가능하고 독립 시험 전용 비밀키를 적법하게 사용할 수 있을 때만 **합성 데이터로** \`studyPlans\`, \`studyPlanSchedule\`, \`beginStudyPlanRevision\`, \`putStudyPlanChunks\`, \`commitStudyPlanRevision\`, \`studyProgress\`, \`saveStudyProgress\` E2E 검증.
- 실제 운영 Script·기존 HMAC 비밀키/인증 세션을 격리 시험 서버로 복제·출력하지 않는다.
- nonce 재전송·만료된 서명·미인증·ACTIVE 아닌 기기·operationId 다른 본문 재사용 차단 확인.
- Apps Script 시험 실배포·테스트 계정에 접근 불가능하면 **미검증/출시 BLOCKED**로 보고하며 운영 연결로 대체하지 말 것. 이전 Node mock PASS와 실제 Apps Script PASS를 엄격히 구분한다.

### 4-2. 게이트 B — 계획/진도 무손실 최초 통합

- 새 브라우저 프로필 PC/태블릿/모바일 역할의 서로 다른 계획/진도/미전송·충돌 기록 합성 세트 생성. **실사용 기기의 기존 IndexedDB는 읽기·쓰기·초기화 금지**.
- 모든 계획·진도·pendingOps·충돌·메타의 JSON 일괄 백업, SHA-256 manifest, **다운로드 파일 다시 선택**, 위변조/기록 수 불일치 차단 검사.
- 공통 조상 검증된 순수 신규 슬롯 병합 및 토픽·회독 날짜 이동, 기존 일정 삭제·순서 변경, 그룹 변경, done/miss/todo 상충 자동 덮어쓰기 0건 확인.
- 백업 이후 다른 탭 수정, 서버 계획 revision 변경, 서버 progress highWatermark 증가, 오프라인·부분 실패·응답 유실·브라우저 종료 시 영속 operationId/저널을 통한 재개, 중복 업로드/진도 0건 확인.
- 계획/진도 키는 \`planId|date|topicId\`, 명시적 todo와 이벤트 없음 구별. 일반 학습정보와 합치거나 덮어쓰지 않는다.

### 4-3. 게이트 C — 19,060건 계획·대량 진도 처리

- 합성 100일·19,060건 계획을 단일 셀 JSON 대신 청크로 업로드/저장/다시 조회/해시 복원 검사.
- 실제 **격리 Apps Script + 격리 Google Sheets** 실행이 가능하다면 처리시간/호출 수/한도/LockService 경합/부분 쓰기와 서버 이벤트 로그 재시도 측정. 불가능하면 Node 합성 19,060건 검사와 별개로 실서버 대량 성능 **미검증, 운영 차단**.
- 서버 로그의 전역/계획별 sequence·CAS/중복 operationId, delta highWatermark 고정, 전체 다운로드 건수·해시 검증.
- 기존 활성 계획 revision은 불완전 청크·오류 발생 중 유지되어야 한다.

### 4-4. 게이트 D — 기존 사용자 기능 회귀/보안 보존

- 학습계획 시작일·오늘 N일차(KST 실제 날짜 기준)·회독/완료/다시보기·검색/필터/페이지 이동/그룹·10/20/30/50개 보기, 새 계획·신규 토픽 편입 5회·CSV/JSON 등록·진도 백업/복원 유지.
- 기존 일반 학습정보 동기화의 서버 성공 receipt 확인 및 계획/진도와 **세 영역 독립 성공/부분 성공/미전송/인증 필요 표시**. 기존 일반 정보 API 실패를 내부에서 삼키므로 성공 여부를 증명할 수 없으면 UI에는 '미확인' 유지.
- 원래 PDF·이미지·첨부·MuPDF·AGPL 고지·필기·인증/신뢰기기/기존 서비스워커 및 \`study-note/study-note.html\` 원본 보호.
- 실제 사용자 기기/보안 키·OAuth 세션 무단 조사 금지. 소유권 불명 원격 PC 프로세스/타 채팅 PID 중지·수정 금지.

### 4-5. 게이트 E — UI·접근성·오류 및 롤백 안내

- Chromium 합성 브라우저에서 PC 1366px / 태블릿 768px / 모바일 390px 검증: 표·컨트롤의 넘침, 오작동, 키보드 포커스/aria-live/터치 목표 크기, 상태 ①~⑦, 로컬·서버 충돌 원본 확인.
- 오프라인, 인증 만료, 잘못된 백업·SHA, 서버 미지원, 다른 기기 동시 수정, 저장공간 부족 시 무조건 성공/자동 덮어쓰기 안내 0건.
- 사용자에게 최초 통합 전에 개별 기기마다 백업·승인이 필요하다는 설명; JSON 백업은 서버 공유가 아닌 독립 안전장치임을 명시.
- 자동 합성 브라우저와 실제 PC·태블릿·스마트폰의 실기기 검사 결과는 **서로 다른 열**로 보고. 실기기 미실시면 미실시로 표시.

## 5. 개발·검수 안전

1. 시작 전 최신 main/실제 운영 소스/미병합 PR/운영 Apps Script 및 변경 충돌 확인.
2. 다른 채팅의 작업 영역/프로세스/PID/브랜치 및 개인 PC·태블릿·모바일 데이터 보호.
3. GitHub 별도 Stage7 브랜치와 Draft PR, 변경 파일과 테스트 증거를 남긴다.
4. 실서버 시험은 완전히 독립된 합성 Google Sheet/Script에서만 수행. 실제 LIVE MASTER \`암기장\`, \`학습정보\`, \`관리기기\`, \`보안감사로그\` 절대 변경 금지.
5. 인증 HMAC 비밀키·실제 세션 토큰·민감 ID를 코드·로그·테스트 문서에 저장/출력 금지.
6. 기존 진도·학습계획, PDF·이미지·첨부·필기 및 인증체계 보존.
7. **운영 main 병합/Pages 및 Apps Script 배포·원장 스키마 변경·실사용 기기 최초 데이터 통합 절대 금지**(Stage8 사용자 명시적 승인 필요).
8. 검사 실패를 무작정 성공 처리하거나 실제 서버 검사 불가를 가정으로 대체하지 말 것. 출시 게이트 FAIL/BLOCKED를 정직하게 기록한다.

## 6. 필수 산출물

1. 최신 main/운영·PR 상태를 근거와 함께 재확인한 통합 기준선.
2. A~E 출시 게이트별 **PASS / FAIL / 미검증 / BLOCKED** 표, Node 합성·실제 Chromium·격리 Apps Script 실서버·실기기 검수 구분.
3. 실제 확인된 결함을 격리 개발 브랜치에서 수정한 코드와 재검사 근거. 잘못된 데이터 자동 초기화/덮어쓰기 방지 증거.
4. 19,060건 합성/가능 시 실제 시험 서버 처리 시간·청크 수·호출량. 실제 측정이 없으면 '미측정'.
5. LIVE MASTER·기존 학습정보·기기별 진도·PDF/필기/신뢰기기 설정 보존 보고.
6. GitHub Stage7 Draft PR, HEAD commit SHA, 변경 파일·미병합 PR 의존성·현재 CI 실행 결과.
7. 미해결 출시 차단 조건과 Stage8 배포·승인 전 준비사항.
8. **8단계 운영 반영·출시·사후 확인을 위한 완전한 독립 실행 작업요청서 전문을 채팅 메시지 본문에 제공**. 단순 GitHub 링크로 갈음 금지.

## 7. 종료 및 인계

7단계 종료 시 실서버 인증/대용량 성능이 미검증이면 **출시 승인 가능 상태로 판정하지 않는다**. 그럼에도 합성 테스트 및 안전한 결함 보완은 완료 범위에서 정직하게 보고한다.

8단계는 다음 별도 사용자 지시와 승인 이후에만 진행한다: GitHub PR 순서 확인·병합, 운영 Apps Script/Script Properties/중앙 Sheets 신규 시트 반영, GitHub Actions/Pages/운영 코드와 보안 검증, PC·태블릿·모바일 기기별 전체 백업 및 최초 통합. 실제 데이터 삭제/서버 덮어쓰기는 별도 확인 없이는 금지한다.

**7단계 완료 후 8단계 개발/배포를 자의로 시작하지 않는다.**
