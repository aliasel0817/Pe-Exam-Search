# 학습노트 다중 기기 학습계획 동기화 — 3단계 전체 작업요청서

> **이 문서를 다음 채팅에 그대로 전달한다.** Stage 3는 **격리된 서버/API 개발 및 근거 있는 최소 검사** 단계다. 운영 MASTER/운영 Apps Script/운영 main은 변경하지 않는다.

## 1. 목표·실행 범위

PC·태블릿·모바일에서 공유할 학습계획·일정·회독별 진행 상태를 위한 Google Apps Script 서버 API와 분리된 Google Sheets 저장 구조를 **안전한 시험 환경**에서 개발한다. 기존 신뢰기기 ACTIVE/HMAC/nonce/요청 상태 조회를 보존하며, 분할 업로드·plan revision·날짜별 진도 서버 이벤트·CAS·멱등성까지 최소 동작 구현한다.

**작업 원칙:** 전체 프로젝트 개발·설계 80%, 검수·배포 20%. Stage 3 자체는 서버 구현에 집중하며 테스트는 5개 핵심 위험을 차단하는 수준으로 제한한다.

## 2. 독립 실행을 위한 기준선

- 저장소: `aliasel0817/Pe-Exam-Search`
- Stage 2 작성 시 `main`: `56bf0901ee7a7d8e41165a90d6b65e41893f8ee3`. **시작 시 최신 main과 미병합 PR 재조회**. 과거 SHA를 최신이라고 단정하지 않는다.
- Stage 1 문서 Draft PR #82: `https://github.com/aliasel0817/Pe-Exam-Search/pull/82`
- Stage 2 필수 설계 자료(해당 PR/브랜치 또는 GitHub 문서 경로로 먼저 읽기):
  - `study-note/planner-sync/STAGE2-SCHEMA-API.md`
  - `study-note/planner-sync/STAGE2-CONFLICT-MIGRATION.md`
  - `study-note/planner-sync/STAGE2-IMPACT-CHECKLIST.md`
- 운영 웹앱: `https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html`
- 기존 웹 코드: `study-note/study-note.html`의 `buildSignedGetUrl`, `sendSecureMutation`, `syncLearningStates`; `study-note/study-planner.js`의 `plans/progress`.
- 백엔드 참조 소스: `study-note/mupdf-migration/r5/source/Code.js`는 이전 R8 운영 v21 대응 사본이었음. **이번 Stage 3의 운영 실소스라고 가정 금지.** 다른 후속 `r7/source/Code.js` 역시 운영 소스와 혼용 금지.
- LIVE 원장 이름 `topic_study_data`, 1단계 조사 당시 토픽 3895개. 구글 시트 이름/ID 동일 여부는 운영 Apps Script Script Properties와 대조 전까지 **미확정**.
- 기존 학습계획: `pe141-100d-2026` 100일, 3812개 고유 토픽, 19060건 배정. MASTER 대비 Y 미편입 24개(정적 JSON 기준, **실제 기기별 상태 미확인**).
- 기존 중앙 일반 학습정보 `학습정보`, 기기별 플래너 DB `pe-study-planner-v1`: `plans` / `progress`. 이번 Stage 3은 기기 로컬 데이터를 직접 변경하지 않음.
- 기존 보안: ACTIVE 신뢰기기, 서명 GET/POST, nonce·서버 시간창, requestId/pollKey/`mutationStatus` 폴링. 동일 제약 적용; 운영 OAuth 비밀키·등록기기 세션을 출력/커밋 금지.

## 3. 필수 수행 작업 (5건)

### 3-1. 서버 실체·버전·권한 확인 (읽기 전용)

1. 최신 `main`, 열린 PR #82와 MuPDF 관련 미병합 #52–#68, 운영 Pages 코드 및 실제 Apps Script 배포 소스/버전/Script Properties의 대상 시트 ID를 확인한다.
2. 정확한 배포 버전/바인딩 확인이 불가능하면 **'미확인'**으로 기록하고 LIVE 쓰기 작업을 수행하지 않는다. 접근이 불가능해도 나머지 격리 소스 개발은 계속할 수 있다.
3. 원격 PC를 이용할 경우 프로젝트·대상 PC·Git 경로와 자신이 생성한 독립 작업 세션 소유권부터 확인. 다른 채팅 PID·프로세스·터미널을 조작하지 않는다.

### 3-2. 격리 시험용 4개 시트 준비 (운영과 완전히 분리)

1. 원본 LIVE 원장 복제를 무조건 사용하지 말고, **합성 토픽/진도**만 포함하는 별도 시험용 Google Sheets를 만든다.
2. 신규 탭: `학습계획`, `학습계획일정`, `학습계획진도`, `학습계획작업`. 정확한 헤더/PK/revision/chunk/operationId는 Stage 2 스키마 문서 준수.
3. 시험용 Apps Script는 기존 보안 로직을 허가된 방법으로 복제하되 **운영 비밀키/운영 장비 인증을 복사하지 않으며**, 시험용으로 독립 구성한다.
4. 부득이하게 Apps Script/Google Sheets 실제 연결 권한이 없는 경우, 문서화된 **독립 서버 코드 후보 및 synthetic 스텁 테스트**까지 완료하고 실제 Apps Script 테스트를 미수행으로 보고한다. 실서버 PASS로 표시하지 않는다.

### 3-3. 계획 조회·버전 관리·안전한 분할 확정

- 신규 signed GET: `studyPlans`, `studyPlanSchedule`.
- 신규 signed POST: `beginStudyPlanRevision`, `putStudyPlanChunks`, `commitStudyPlanRevision`.
- 계획의 새 snapshot은 불변 DAY/GROUPS 청크(UTF-8 8KiB 이하)로 저장. 최대 12청크/요청 초깃값.
- `baseRevision` CAS, stageId, chunk hash·전체 canonical snapshot SHA-256, 누락·중복 검사, 안전한 `activeRevision` 마지막 갱신 구현.
- 기존 일정(날짜/배정순서/그룹)을 수정하지 않는 신규 토픽 편입·독립 새 계획 생성, 같은 planId의 동시 쓰기 충돌을 처리.
- 부분 업로드·중단 후에도 기존 활성 revision을 유지하고 무손실 재시도 가능해야 함.

### 3-4. 진도 이벤트 GET/POST와 중복 전송·경합 안전성

- 신규 signed GET: `studyProgress` (`planId,afterSeq,limit`).
- 신규 signed POST: `saveStudyProgress` (`changes[]`, 각 항목 operationId 및 expectedRowRevision).
- `done/miss/todo` 상태의 append-only 이벤트 원장, 서버 부여 per-plan serverSeq, per-key rowRevision 구현. 각 이벤트는 실제 계획의 날짜/토픽에 연결되어야 한다.
- 동일 operationId 동일 payload는 중복 기록하지 않고 기존 ACK 반환, 다른 payload는 거부.
- 두 기기에서 같은 key의 상태를 충돌시키면 CAS로 한 변경만 적용하고 나머지는 `REVISION_CONFLICT` 반환. 사용자 데이터 무조건 덮어쓰기 금지.
- 통신 타임아웃 후 동일 operationId 재시도 가능, 중간 batch 일부 성공은 applied/duplicate/conflicts 항목별 반환.
- `CacheService` mutationStatus(기존 120초)는 전송 상태조회용; 이벤트 로그/작업 장부가 영속 멱등성의 기준.
- 이벤트 조회/동기화 커서의 `highWatermark` 일관성, 부분 결과·보안 실패 처리.

### 3-5. 소규모 핵심 검증·코드/PR 인계

반드시 합성 데이터로 다음만 먼저 검증하고 불필요한 광범위 QA 루프는 생략:

1. 계획 1건 생성·signed GET 재조회, revision/hash·순서/날짜/그룹 정확성.
2. 100일·19060 슬롯 상당의 합성 계획을 청크로 저장·읽기·hash 복원; 실행시간/응답크기·시트 행수 기록(한도 초과 시 설계상 배치 크기 조정 근거).
3. 의도된 청크 누락/잘못된 hash/다른 기기 동시 계획 commit → 기존 activeRevision 유지, 충돌 반환.
4. done/miss/todo 및 동일 operationId 재시도 → 중복 0, 상태/회독별 구분 유지.
5. ACTIVE가 아닌 기기/서명 위조/nonce replay/invalid topicId → 쓰기 거부, 기존 학습정보·MASTER 원본 손상 0.

## 4. 구현 방법과 안전 경계

- 현재 운영 Code.js는 직접 덮어쓰지 않는다. 먼저 격리된 소스 후보/새 feature 브랜치를 만들고 기존 API 라우트의 **추가 분기**로 신규 기능만 구현한다.
- 뷰어·PDF·이미지·첨부·필기·신뢰기기/보안 관련 기존 코드 축약·삭제 금지.
- 가능하면 신규 파일 `study-note/backend/study-planner-sync.addon.gs`와 통합용 테스트 후보를 분리해 향후 실제 운영 소스에 안전하게 병합할 수 있게 한다. 단 실제 Apps Script 구조와 다르면 조사된 사실을 기준으로 수정하고 근거를 남긴다.
- Apps Script에서 한 번에 전체 계획 JSON 저장하지 말고 청크/배치. 실행시간 6분 제한 및 Google Sheets 1000만 셀 한도에 걸리지 않도록 분할.
- 개발 브랜치/PR에서 기존 소스와 미병합 PR 충돌 확인. CI 자동검사 결과와 실제 운영/실기기 검수를 분리.
- **LIVE MASTER 모든 원문·학습정보·PDF·첨부·보안·사용자 기기별 IndexedDB 무수정.**
- **Stage 3은 운영 main 병합, GitHub Pages 배포, 운영 Apps Script 배포, 실사용 시트 신설/쓰기 절대 금지.** 격리 시험용만 허용.
- 승인되지 않은 실제 브라우저 진도를 테스트에 사용하거나 수집하지 않는다.

## 5. 필수 산출물 및 증거

1. Stage 3 서버 candidate 소스와 격리 Sheets/Script 구성 방법(비밀키/시트 ID 공개 금지).
2. 스키마 헤더·API action/요청·응답 계약 및 Stage 2와의 일치표.
3. 5개 필수 시나리오 실제 검사 기록(실패·미실시·통과 명확히).
4. Commit SHA, Draft PR 주소, 수정 파일 목록, 운영 무변경 여부.
5. 미확인 이슈 및 보완 작업(특히 Apps Script 실제 운영 배포 코드/바인딩·용량/시간 성능).
6. **Stage 4 클라이언트 개발을 위한 완전한 독립 실행 작업요청서**. 기존 원본/보안/동기화 계약, 실행 범위, 단계별 인계/검증 조건 포함.

## 6. 완료 보고 형식

- 시작 기준 SHA, 실제 운영 확인 범위(미확인 제외), 격리 환경 설명.
- 서버 조회/쓰기·revision/CAS/멱등성 구현 완료 증거.
- 데이터 손실 방지·권한 보호 검증 결과.
- 자동/실제 기기 검수 분리.
- 완료/미완료 현황 및 이후 이행 위험.
- Stage 4 전체 작업요청 메시지.

**Stage 3 완료 후 즉시 Stage 4를 수행하거나 운영에 배포하지 말고, 먼저 결과와 다음 작업요청서를 보고한다.**
