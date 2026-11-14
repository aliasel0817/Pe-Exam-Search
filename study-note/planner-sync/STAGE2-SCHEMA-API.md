# 학습노트 다중 기기 학습계획 동기화 — Stage 2 데이터·API 확정 설계 v1

**작성:** 2026-11-13 KST · **범위:** 설계 문서 전용, 미구현/운영 미반영 · **업무비중:** 개발·설계 80%, 검수 20%

## A. 조사 기준·사실과 가정

- GitHub `aliasel0817/Pe-Exam-Search` · 기준 `main=56bf0901ee7a7d8e41165a90d6b65e41893f8ee3`. PR #81 병합, Stage 1 문서 PR #82 Draft, 열린 PR 19개(2026-11-13 조회).
- 운영 Pages의 `study-note/study-planner.js`와 최신 `main`의 실제 내용 일치(읽기 전용). 운영 Apps Script `health` 응답 `ok=true, schemaVersion=15, topicCount=3895`.
- 과거 R8 기록은 운영 Apps Script v21과 `study-note/mupdf-migration/r5/source/Code.js` 일치를 증빙하지만, **2026-11-13 현재 배포 버전 번호 및 Script Properties의 spreadsheetId는 직접 확인하지 못함.** Stage 3 서버 구현 전에 실제 소스를 별도로 재검증해야 함.
- 기존 프런트엔드: `study-note/study-note.html` 3189~3215(일반 IndexedDB), 4187~4257(학습정보 정규화/서명된 GET), 4357~4475(HMAC GET/POST, no-cors POST+poll), 7162~7240(암기/미암기), 7560~7590(50개 단위 일반 학습정보 동기화).
- 기존 학습계획: `study-note/study-planner.js` 4~24 (별도 IndexedDB v1: `pe-study-planner-v1` → `plans`/`progress`), 436~507(신규 토픽 편입/계획 생성), 539~600(기본 JSON 시딩·화면·진도 기록). 클라우드 API 없음.
- 기존 서버 참조: `study-note/mupdf-migration/r5/source/Code.js` 413~505(doGet/doPost action), 2596~2660(일반 학습정보), 3077~3135(서명/ACTIVE), 3339~3366(CacheService 요청 상태).
- 기본 계획: 100일·5회독, 3812개 고유 ID·19060개 배정. 현재 MASTER 3895개 ID(학습대상 Y 3834, N 61), 기본 계획 파일 기준 누락 Y 24개. **기기별 로컬 계획의 실제 편입 여부 미확인.**
- 기존 스프레드시트의 `학습정보` 등 원본 탭은 보존. 계획 저장을 위해 기존 `암기장`의 열/행을 재사용하지 않는다.

## B. 설계 결정 D01–D10

1. **D01 저장소:** 동일 신뢰기기 보안이 적용된 Apps Script + 원장에 분리된 4개 신규 시트. Stage 2에서 시트는 **생성하지 않음**. Stage 3은 독립 시험용 Sheets/Script에서 시작.
2. **D02 논리 구분:** 계획 메타데이터, 계획의 버전별 일자/그룹 청크, 날짜별 상태변경 이벤트, 계획 업로드 작업 장부. 로컬 기존 `plans/progress`는 보존.
3. **D03 클라이언트 선택 계획·날짜·페이지 크기**는 UI 선호값이므로 기기별 유지; 계획·일정·진도만 공유한다.
4. **D04 계획 변경:** 변경된 전체 일정/그룹 정의를 신규 불변 revision 청크로 분할 저장; 검증 성공 후 메타데이터의 `activeRevision`를 마지막에 단일 전환. 중단된 청크는 활성화하지 않음.
5. **D05 진행 기록:** `학습계획진도`는 최신 값 한 행만 덮어쓰는 대신 **append-only 이벤트**를 사용. 이벤트의 `(planId,serverSeq)` 유일성과 `operationId` 멱등성으로 재생/재시도 가능. 표시 상태는 동일 논리키의 가장 높은 serverSeq로 계산.
6. **D06 회독별 키:** `planId|YYYY-MM-DD|Tdddd` 고유 논리키. 같은 토픽의 서로 다른 날짜·회독은 별개. `todo`는 최초 기록 부재, '진도 초기화'는 명시적 `todo` 이벤트(tombstone).
7. **D07 충돌:** 서버가 부여한 revision과 클라이언트의 `expectedRevision` 비교(CAS). 클라이언트 시각 기반 최신 우선 덮어쓰기 금지.
8. **D08 안전한 전송:** 기존 ACTIVE/HMAC/nonce/전송 requestId/pollKey 유지. 앱 레벨 `operationId`는 **재시도에도 동일한 값**을 유지하는 별도 영속 ID. 기존 120초 CacheService만을 멱등성 저장소로 사용하지 않음.
9. **D09 최초 통합:** 로컬/서버 백업·비교·미리보기·동의 이전에 서버 쓰기와 로컬 덮어쓰기 금지. 상충 기록은 별도 보류함에 보존.
10. **D10 크기:** 메타/일정은 UTF-8 8KiB 이하 청크(초기 목표), 요청당 최대 12청크/약 100KiB, 진도 변경 최대 25건/요청·진도 GET 최대 300이벤트/페이지(응답 128KiB 이내). Stage 3 격리 테스트에서 수치 조정 근거를 남길 수 있다.

공식 제한 참고: Apps Script 최대 실행시간 6분/실행 및 Script Properties 값당 9KB (https://developers.google.com/apps-script/guides/services/quotas), Google Sheets 최대 1000만 셀·Excel 변환 시 셀당 50000자 초과 제거 (https://support.google.com/drive/answer/37603). 설계의 8KiB는 실제 사용 제한보다 보수적인 내부 상한이다.

## C. 신규 시트 스키마(물리 구조·키·유효성)

### C1. `학습계획` — 계획 메타·활성 버전

| 열 | 필드(영문) | 예 | 검증·의미 |
| --- | --- | --- | --- |
| A | planId | pe141-100d-2026 | PK; 영숫자·`_.-`, 2~80자. 기존 값 보존 |
| B | name | 제141회 … | 이름 1~100자; 이스케이프 출력 |
| C/D | start/end | 2026-10-22 / 2027-01-29 | ISO 날짜·순서 보장 |
| E | rounds | 5 | 정수 >=1; 기존 CSV 가져오기에도 호환되는 범위는 Stage 3 검증 |
| F | activeRevision | 1 | 0은 아직 커밋 없음, 양의 정수는 활성 스냅샷 |
| G | nextRevision | 2 | stage begin 시 단조 증가, 고아 revision 번호 재사용 금지 |
| H | activeHash | 64자 hex | 정규화 계획 전체 SHA-256 |
| I/J/K | dayCount/slotCount/groupCount | 100/19060/27 | 검증용 |
| L | progressSeq | 0 | 계획별 이벤트 증가 커서의 편의 캐시; **진도 이벤트 원본이 우선** |
| M | status | ACTIVE | ACTIVE/ARCHIVED; 자동 계획 삭제 금지 |
| N/O | createdAt/updatedAt | 서버 ISO 시간 | 클라이언트 시간은 정렬 근거 아님 |
| P | schemaVersion | 1 | 동기화 자체의 버전, 기존 전체 schemaVersion 15와 분리 |

현재 사용자 단일 소유 환경으로 설계. 다른 계정 데이터 접근은 ACTIVE 보안 소유자와 연계해 차단하고, 임의 클라이언트 ownerId를 신뢰하지 않는다. 소유자 경계가 다중 계정으로 확대되면 서버 검증된 ownerKey를 PK 접두부에 추가해야 한다.

### C2. `학습계획일정` — 불변 revision 청크

| 열 | 필드 | 의미 |
| --- | --- | --- |
| A/B/C | planId / revision / chunkKey | 복합 PK = planId·revision·chunkKey |
| D | kind | DAY 또는 GROUPS |
| E/F | date / round | DAY는 YYYY-MM-DD, round는 양수 또는 최종 점검일 null |
| G/H | partIndex / partCount | 0부터 시작, 누락·중복 금지 |
| I | payloadJson | DAY: 순서 보존된 `[["T0001","G15"],…]`; GROUPS: `[["G15","분류명"],…]` |
| J/K | chunkHash / stageId | 저장 바이트 SHA-256 / 업로드 세션 |
| L | createdAt | 서버 ISO 시각 |

- DAY는 배정이 0건인 날짜도 보존. `groups`의 표시명은 GROUPS 청크에, `ids/groups`의 인덱스 대응은 DAY 순서쌍에 보존.
- `chunkKey` 예: `DAY:2026-11-13:000`, `GROUPS:000`. 각 청크 payload ≤8KiB, 차수/날짜/파트별 복원 후 정규화.
- 활성 버전 변경 시 기존 revision 행을 덮어쓰지 않음. 리더는 메타데이터에서 확인한 활성 revision만 사용.
- canonical SHA-256은 `{id,name,start,end,rounds,groups:[code,name] 정렬,days:[{date,round,entries:[id,group]}]}` 전체의 순서가 정의된 UTF-8 직렬화로 계산. JSON 객체 키 순서와 정수/빈 문자열 처리 규칙은 서버·클라이언트 동일 테스트 벡터로 확정한다.

### C3. `학습계획진도` — append-only 회독 진도 이벤트

| 열 | 필드 | 의미 |
| --- | --- | --- |
| A/B | planId / serverSeq | 계획별 단조 증가, 중복 불가 |
| C/D/E | date / topicId / progressKey | `progressKey=planId|date|topicId`, 서버 일정에 실제 존재 확인 |
| F | status | done / miss / todo(tombstone) |
| G/H | previousRevision / rowRevision | 같은 progressKey의 직전 revision / 새 revision |
| I/J | operationId / payloadHash | 영속 멱등성 키 / 변경 내용 SHA-256 |
| K/L | deviceId / planRevision | 검증된 서명 기기 / 기록 당시 일정 revision |
| M/N | serverAt / clientAt | 서버 시각이 판정 기준; 클라이언트 시각은 진단용 |
| O | source | user / legacy-import / restore 등 원인 구분 |

- 물리적 행은 추가만 하고 지우지 않음. `rowRevision`은 같은 key마다 1씩, `serverSeq`는 한 planId 내 모든 성공 이벤트에 대해 증가.
- 동일 operationId·동일 payloadHash는 재시도 시 기존 결과 그대로 반환, 다른 내용이면 `OPERATION_REUSE` 거부.
- 결과 복원 시 같은 key의 가장 높은 serverSeq를 사용. `todo`는 다른 기기의 과거 done/miss가 되살아나지 않게 보존.
- 진행 카운트는 논리키별 최종 상태만 집계; 서버 seq의 빈 번호/캐시 불일치가 발견되면 원장 이벤트 스캔으로 복구하고 커서를 임의 전진시키지 않음.

### C4. `학습계획작업` — 계획 업로드 단계/멱등성

| 필드 | 의미 |
| --- | --- |
| operationId, stageId, planId, action | 작업 PK/업로드 세션/계획/작업 종류 |
| baseRevision, allocatedRevision | 기대 활성 revision / 서버가 할당한 새 revision |
| snapshotHash, expectedChunks, receivedChunks | 전체 hash / 수신 체크 / 누락 검출 |
| operationPayloadHash | 동일 operationId로 다른 요청 금지 |
| state, resultJson | STAGING / COMMITTED / CONFLICT / EXPIRED 및 결과 |
| deviceId, createdAt, expiresAt | 출처/시점/미완료 청크의 정리 후보 시점 |

- 커밋된 멱등성 작업 기록은 자동 삭제하지 않음; STAGING 장기 미완료만 별도 복구 규칙·백업 후 정리. 업로드 중간 실패를 '완료'로 표시하지 않는다.
- 대량 일정은 `begin → putChunks(여러 회) → commit`. 최종 검증 + 현재 activeRevision==baseRevision이면 LockService 하에서 메타의 activeRevision/activeHash를 **마지막에 갱신**한다.
- 처리 결과가 유실되었지만 activeRevision과 hash가 이미 같으면 `ALREADY_APPLIED`로 회복 가능. 기존 활성 일정은 언제나 읽기 가능.
- Sheets에는 DB 트랜잭션이 없음. 짧은 LockService 임계구역·불변 청크·마지막 커밋 포인터와 재실행 복구 규칙으로 **논리적 원자성**을 달성한다.

## D. 서버 API 계약 — 모두 미구현(설계)

기존 앱의 `buildSignedGetUrl(apiUrl, action, data)`, `sendSecureMutation(apiUrl, action, data)` 경로를 재사용. 서버 `doGet`/`doPost`는 소문자 action 분기이며 신규 action은 기존 기능을 제거하지 않는 **추가 분기**로만 제공. 서버/시트 권한은 모두 ACTIVE, HMAC/nonce/시간창/등록기기 검증 필수.

| 동작 | 전송/action | 입력 | 응답 핵심 |
| --- | --- | --- | --- |
| 목록·버전 확인 | signed GET `studyPlans` | 빈 객체 | planId,activeRevision,activeHash,progressSeq 등 |
| 활성 일정 페이지 조회 | signed GET `studyPlanSchedule` | planId,revision,offset,limit | chunks,hasMore,nextOffset,hash |
| 진도 이벤트 증분 조회 | signed GET `studyProgress` | planId,afterSeq,limit,untilSeq(후속 페이지에 고정) | events,hasMore,nextSeq,highWatermark |
| 계획 업로드 시작 | signed POST `beginStudyPlanRevision` | operationId,planId,baseRevision,meta,snapshotHash,expectedChunks | stageId,allocatedRevision |
| 일정 분할 업로드 | signed POST `putStudyPlanChunks` | operationId,stageId,chunks[] | accepted,duplicated,received |
| 활성 계획 확정 | signed POST `commitStudyPlanRevision` | operationId,stageId,baseRevision,snapshotHash | activeRevision,activeHash |
| 날짜별 진도 전송 | signed POST `saveStudyProgress` | changes[] (각 항목 operationId) | applied[],duplicate[],conflicts[] |

API의 GET query는 현행 signed `authPayload`를 사용; 서버 응답은 기존 `{ok:true,…}` 패턴. POST 본문은 기존 `{action,requestId,pollKey,signedPayload,auth}` 형태, `text/plain`/`no-cors` 제출 후 `mutationStatus` 폴링. 전송 requestId/pollKey는 짧은 상태조회용이고, **영속 operationId는 signedPayload 내부**에 포함한다.

### D1. 계획 생성/변경 예시 (설계 형식)

```json
{
  "action": "beginStudyPlanRevision",
  "data": {
    "operationId": "op-deviceA-uuid-001",
    "planId": "pe141-100d-2026",
    "baseRevision": 1,
    "meta": {"name":"제141회 100일 5회독","start":"2026-10-22","end":"2027-01-29","rounds":5},
    "snapshotHash": "<64-hex-sha256>",
    "expectedChunks": 123
  }
}
```

이것은 설명용 **논리 데이터**이고, 실제 POST 시 위 data만 서명 페이로드로 넣으며 action은 외부 전송 envelope에 위치한다. 시작 후 `putStudyPlanChunks`로 각 청크를 나누어 쓰고, 전체 길이·날짜·토픽·그룹·hash 검증에 성공한 후 `commitStudyPlanRevision`로 활성화한다. 사용자에게 commit 성공이 확인되기 전에는 '동기화 완료'를 표시하지 않는다.

### D2. 진도 변경 예시 및 응답(설계)

```json
{
  "action": "saveStudyProgress",
  "data": {
    "changes": [{
      "operationId": "op-deviceA-uuid-002",
      "planId": "pe141-100d-2026",
      "date": "2026-11-13",
      "topicId": "T4069",
      "status": "done",
      "expectedRowRevision": 0,
      "planRevisionAtWrite": 2,
      "clientAt": "2026-11-13T05:00:00Z"
    }]
  }
}
```

```json
{
  "ok": true, "done": true,
  "action": "saveStudyProgress",
  "applied": [{"operationId":"op-deviceA-uuid-002","rowRevision":1,"serverSeq":431}],
  "duplicate": [],
  "conflicts": [],
  "highWatermark": 431
}
```

충돌의 경우 항목은 `conflicts:`에 `progressKey, expectedRowRevision, serverRowRevision, serverStatus` 및 사용자에게 비교 가능한 요약을 반환한다. 접근 금지/스키마 오류는 `ok:false`, 명시적인 에러 코드와 함께 실패한다. 하나의 배치에서 일부 이벤트가 이미 성공한 후 장애가 발생해도 동일 operationId 재전송만으로 정확히 한 번 반영되도록 한다.

### D3. 동기화 실행 순서

- 일반 버튼 `학습정보 동기화`: 인증→일반 학습정보 동기화(기존 경로 유지)→계획 메타 GET→필요한 일정 revision GET→로컬 변경 비교/충돌 보류→진도 증분 GET→로컬 pending 이벤트 조건부 업로드→누락된 서버 이벤트 재조회→커서/마지막 성공시각 **최종 검증 후** 저장.
- 최초 실행은 별도 Stage 5 마이그레이션 모드가 우선한다. 자동 서버 쓰기/로컬 덮어쓰기 전 사용자 확인.
- GET 중 응답이 커지면 offset/afterSeq 페이징. **첫 진도 GET에서 반환된 `highWatermark`를 이후 요청의 `untilSeq`로 전달**하여 한 번의 읽기 세션 상한을 고정하고 중간 동시 쓰기 혼선을 막는다.
- 쓰기는 항목별 CAS 충돌을 반환한다. **기존 일반 학습정보의 전송 성공과 새 계획의 전송 실패는 분리된 상태로 사용자에게 표시**한다(부분 성공을 전체 동기화 완료라고 표시하지 않음).

## E. 안전/오류/성능 규칙

1. 요청 값의 planId/date/topicId 정규식·MASTER 통합ID·활성 일정 슬롯 존재를 검증한다. **단, 이전 계획에 이미 존재했던 N/삭제·비활성 토픽의 과거 일정/진도는 `legacy-import`와 기존 커밋 revision 근거가 있으면 보존(새 배정은 금지)**한다. 최종 점검 빈 날짜 및 기존 N 토픽을 임의로 삭제하지 않는다.
2. 서버 스프레드시트 ID는 **배포 Apps Script Script Properties에서 조회한 정확한 대상**으로만 사용. 이름만 같은 다른 Sheets 금지.
3. 같은 operationId로 다른 payloadHash면 `OPERATION_REUSE`, 서버 revision이 다르면 `REVISION_CONFLICT`, 배정되지 않은 key는 `SLOT_NOT_FOUND`, 인증 실패는 기존 보안 에러 체계를 사용.
4. 읽기 실패·타임아웃·429/서버 오류는 로컬 pending을 **유지**. 재시도 시 operationId 재사용; 사용자 완료 상태가 다른 장치에서 삭제되지 않음.
5. 기존 `saveLearningStates` 서버 로직은 날짜별 계획으로 바꾸거나 대체하지 않는다. 신규 진도 API는 독립적이다.
6. 서버 계획 업로드 중 최대 실행시간 초과를 피하도록 chunk batch; 시트는 한 행씩 API 호출하지 않고 범위 batch setValues/append로 최적화. 6분/실행 한도 및 Sheets 총 셀 수의 범위를 Stage 3에서 실측한다.
7. 취소/삭제: 현재 단계에서는 계획 **물리 삭제 없음**, 일정 변경은 revision, 진도 초기화는 todo 이벤트. ARCHIVED는 표시 필터에만 적용.
8. 앱 버전/서버 기능 호환: 서버가 `plannerSyncVersion`을 제공하지 않으면 신규 기능은 비활성·로컬만 유지(기존 일반 학습정보 동작 계속). 기능 토글 기본 OFF.
9. 어떤 QA도 실제 로그인된 사용자 기록을 '테스트용'으로 변경하지 않으며 별도 synthetic Sheets/Script 프로젝트에서 실행한다.

## F. 미확인·Stage 3 필수 확인

- 운영 배포판 현재 versionNumber, 실제 scriptId/스프레드시트 ID 바인딩, 배포된 Code.js와 R5 참조 소스의 **현재** 일치 여부.
- 단일 사용자의 실제 PC·태블릿·스마트폰에 저장된 계획 개수, 진도 건수, 서로 다른 편입 날짜/충돌 수.
- 8KiB 청크와 진도 25건 처리의 실측 속도/시트 메모리 비용. 초깃값은 설계 기본이며 성능 PASS가 아님.
- 서버 간 경합/중단 시 시트 부분 쓰기 복구 구현은 Stage 3에서 격리 테스트해야 함.
- Live MASTER, 운영 Apps Script, 운영 UI/Pages, 기존 사용자 진도 **변경 없음**.

**다음 문서:** `STAGE2-CONFLICT-MIGRATION.md`의 초기 통합·충돌 표를 이 스키마의 필수 구현 조건으로 적용한다.
