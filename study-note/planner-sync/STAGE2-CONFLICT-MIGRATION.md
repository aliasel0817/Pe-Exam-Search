# 학습노트 다중 기기 동기화 — Stage 2 충돌·초기 통합·오프라인·복구 설계 v1

**2026-11-13 · 설계 전용(미구현)** · 기준 main `56bf0901ee7a7d8e41165a90d6b65e41893f8ee3`
연계: `STAGE2-SCHEMA-API.md`, Stage 1 문서 Draft PR #82

## 1. 보존 우선 불변식

- P1. 사용자가 어떤 기기에서 남긴 학습계획·회독 날짜별 기록도 최초 통합이나 동기화 과정에서 **자동 삭제·초기화·다운그레이드하지 않는다**.
- P2. 원본 MASTER `암기장`, 기존 `학습정보`, PDF/이미지·첨부·필기·신뢰기기 설정에 **기록 변경을 가하지 않는다**.
- P3. 동일 `planId|date|topicId` 키의 `done`와 `miss`가 충돌하면 어느 쪽도 자동으로 승자로 선택하지 않으며 양쪽 값을 사용자에게 표시한다.
- P4. 동일 planId의 일정이 다를 때 로컬 전체 계획을 서버 계획으로 치환하거나 반대로 덮어쓰지 않는다. **계획 스냅샷 보관과 3-way diff 확인이 선행**된다.
- P5. 실패 시 부분 업로드를 성공이라고 표시하지 않는다. 기존 사용 화면과 오프라인 진도 기록은 계속 작동한다.
- P6. 진도는 토픽 전역 `studyStatus`와 **독립**. 1회독 완료가 2회독 완료로 전파되지 않는다.
- P7. 중앙 데이터의 커서·리비전은 서버가 결정하고, 클라이언트 시계·동기화 버튼 횟수·통신 지연으로 승자가 결정되지 않는다.

## 2. 최초 동기화 절차(한 기기씩 승인, PC→태블릿→모바일 순서 예시)

0. **사전 게이트:** 서버 `plannerSyncVersion>=1` + ACTIVE 신뢰기기 + 기능 토글 확인. 허가 없으면 로컬 전용으로 그대로 사용하고 이유를 안내.
1. **로컬 읽기 전용 동결 스냅샷:** 현재 `pe-study-planner-v1/plans`, `progress`를 읽고 plan 수, day/slot 수, progress별 건수, SHA-256 manifest 생성. 메모리 또는 별도 백업 저장소에 **수정 전 원본**을 저장. 기존 plan/export JSON과 progress/backup JSON도 사용자가 내려받도록 안내.
2. **독립 백업 완료 확인:** 복구 가능한 JSON 원본이 준비되고 사용자가 확인하기 전 `plans/progress`에 서버 자료를 덮어쓰지 않는다. 각 기기마다 별도로 백업(다른 기기의 기록은 서버만으로 추측 불가).
3. **서버 목록 조회:** signed GET `studyPlans` → revision/hash 비교. 서버 계획 없는 상태도 유효한 첫 마이그레이션 케이스.
4. **일정 비교:** planId별 최신 스냅샷, 로컬 스냅샷, 알려진 공통 조상(기본 `pe141-100days.json` 해시 또는 마지막 동기화 revision)을 순서·그룹명까지 비교. 서버 일정은 페이징으로 끝까지 가져와 SHA 검증 후에만 판단.
5. **기본 계획 자동 시딩 중복 처리:** 로컬에 정적 기본 계획이 1회 들어간 것은 **사용자 편집본이라는 증거가 아님**. 기본 해시와 같은 로컬 시드는 서버본과 1개로 병합하되, progress는 별도 보존. 단 서버 일정이 다르면 hash/추가 슬롯 분석 없이 덮어쓰기 금지.
6. **양쪽 진도 비교:** 각 planId의 `studyProgress` 사건 로그를 seq=0부터 끝까지 읽되, 서버 `highWatermark`를 한 읽기 세션 내에서 고정. 로컬 event의 최초 revision이 없을 수 있으므로 `legacy-import` 원인 태그로 식별.
7. **병합 미리보기:** '완전 동일', '안전한 신규 편입', '기기 고유 새 계획', '진도만 추가', '충돌 보류' 수량과 예시 제공. 시작일 다른 신규 24개처럼 같은 토픽/회독 날짜가 다른 경우 **충돌**. 진도 `done`와 `miss` 상충도 표시.
8. **사용자 승인:** 추가 가능한 부분만 체크해 업로드. 충돌 항목은 별도 보류함에 원본 둘 다 저장하고 사용자 선택 전 서버에 일괄 쓰지 않는다. 사용자가 취소해도 원래 로컬로 정상 학습 가능.
9. **업로드:** 계획은 begin → 청크 업로드 → hash 검증 → commit. 진도는 하나의 로컬 항목에 고유 `operationId`를 고정하여 CAS 저장. 성공된 부분만 ACK, 실패/충돌/인증 오류는 dirty 보존.
10. **다운로드·검증:** 다시 서버 activeRevision/hash·진도 seq 조회, 로컬의 병합 대상에만 적용. 계획/진도 건수·hash·서버 커서가 일치하면 해당 기기만 '초기 통합 완료'로 표기.
11. **다른 기기 반복:** 태블릿/스마트폰의 첫 접속도 1~10을 독립 수행. PC가 클라우드를 초기화했다는 이유로 다른 기기의 미전송 기록을 지우지 않는다. 아직 접근하지 않은 기기는 '미확인/미통합'으로 남긴다.

### 초기 통합 트랜잭션 상태 모델

`UNINITIALIZED → BACKED_UP → COMPARED → REVIEW_REQUIRED → UPLOADING → VERIFIED → SYNC_READY`

- 통신 실패: `UPLOADING → PENDING_RETRY`; 백업·operationId·완료 ACK 보존 후 재개.
- 일정/진도 충돌: `REVIEW_REQUIRED → CONFLICT_HELD`, 충돌 없는 부분의 동기화만 허용.
- 사용자가 취소: `REVIEW_REQUIRED → LOCAL_ONLY`; 현재 로컬 원본 변동 없음.
- 복구: 백업 파일에서 신규 **로컬 사본**으로 복원, 서버에는 별도 수동 revision/조건부 쓰기 없이는 롤백 금지.

## 3. 충돌 판정 테이블(확정 정책)

| 상황 | 판정 | 자동 허용 작업 | 필요한 사용자 결정 |
| --- | --- | --- | --- |
| 서버에 planId 없음, 로컬에만 있음 | 신규 계획 후보 | 최초 백업·미리보기 후 서버 신규 생성 | 처음 올릴 계획 확인 |
| 서버/로컬 계획 ID·hash 완전 동일 | 동일 | 중복 업로드 건너뛰기, 로컬 serverRevision 채움 | 없음 |
| 로컬 정적 기본 계획 vs 서버가 기본 계획+신규 토픽 | 서버 순수 상위집합이면 안전 | 로컬 백업 후 서버의 추가 슬롯만 병합 | 최초 이행 승인 |
| 로컬 계획이 서버보다 신규 슬롯만 추가, 기존 슬롯 순서/그룹/라운드 불변 | 확장 가능 | **서버 최신 revision 기준** 새 스냅샷 재생성/미리보기 | 최초 승인 또는 기존 승인된 정상 변경 |
| 두 기기에서 서로 다른 토픽을 서로 겹치지 않는 날짜/라운드에 추가 | 조건부 3-way 병합 | 공통 조상 확인 + 서로 다른 신규 슬롯 union 가능 | 최초 병합은 사용자 승인 |
| 같은 토픽·회독의 학습 날짜가 서로 다름 | **일정 충돌** | 원본 2개 보관, 자동 합집합 금지 | 어느 편성 선택/별도 사본 |
| 날짜·그룹·기존 슬롯 변경/삭제, 공통 조상 불명 | **계획 충돌** | 아무것도 삭제하지 않고 보류/분기 | 개별 조정 또는 새 planId 분기 |
| 서로 다른 planId, 이름만 같음 | 독립 계획 | 두 계획 모두 별도 유지 | 중복 정리 여부는 후속 수동 |
| 로컬 진도만 있고 서버 해당 key 없음 | 새 진도 후보 | 백업·서버 일정 확인 후 expectedRowRevision=0 업로드 | 최초 업로드 승인 |
| 서버 진도만 있고 로컬은 todo(기록 없음) | 원격 진도 | 인증된 서버 이벤트 수신 후 반영 | 최초 이행 승인 |
| 서로 같은 key와 status, operationId도 같음 | 중복 전송 | 1회만 인정(서버 event idempotency) | 없음 |
| 같은 key, 클라이언트와 서버 상태가 다름(done vs miss 등) | **진도 충돌** | 둘 다 보존, 새로운 자동 쓰기 금지 | 수동 상태 선택→새 작업 |
| 과거 done, 다른 기기가 명시적 todo 초기화 | CAS 기준 | revision 일치하면 todo tombstone 수용 | 충돌이면 양쪽 보존 |
| N으로 분류되거나 MASTER에서 사라진 과거 토픽이 기존 계획에 남음 | 역사 데이터 | **과거 계획·진도 보존**, 새 배정에서는 별도 검증 | 경고/후속 정리 승인 |
| 서버 최신 revision과 로컬 expectedRevision 다름 | REVISION_CONFLICT | 최신 서버 재조회, 로컬 pending 유지 | 재병합 또는 일정 확정 |
| 보안 세션 만료/신뢰기기 대기(PENDING) | AUTH_BLOCKED | 오프라인 기록과 대기 큐 유지 | 기기 인증/승인 후 동기화 |

**동일 planId의 동일 토픽이 5회 다른 날짜에 들어간 편성은 '다른 편성'이지 무조건 10회 복습할 신규 데이터가 아니다.** 무제한 합집합을 금지한다.

## 4. 로컬 IndexedDB 호환 설계

- 기존 `pe-study-planner-v1` DB 이름과 `plans`, `progress` 데이터는 유지. Stage 4에서 version 1→2 증가 시 **새 objectStore만 추가**: 예 `syncMeta`, `pendingOps`, `syncConflicts`, `preSyncSnapshots`. 기존 store 삭제/clear/onUpgrade 전체 덮어쓰기 금지.
- 진행 기록 원래 필드 `{key,planId,date,topicId,status,updatedAt}` 보존; 추가 필드 `serverRowRevision,serverSeq,pendingOpId,dirty,source`는 하위 호환.
- 첫 업그레이드 때 기존 진도에 필드가 없다고 무조건 원격 덮어쓰기 금지. 기존 항목은 migrationPending으로 분류하고 서버 동일 key와 비교하여 승인을 받는다.
- 안전한 오프라인 편집: 결과 저장과 outbox 항목 쓰기는 **하나의 IndexedDB readwrite 거래**에서 처리해야 하며, 쓰기 성공 전 '서버 반영'으로 표시하지 않음. 원본 학습정보 기록 흐름과 별개.
- 계획 생성/신규 토픽 편입/CSV·JSON 가져오기는 모두 현재 로컬 계획 revision을 기반으로 pendingSnapshot을 생성한다. 서버 확정 전 로컬에서 계속 보이며 미전송 표시.
- 원격에서 내려받은 계획이 사용 중인 날짜를 바꿔도 active plan/day 및 페이지 크기 등 UI 선택값은 무조건 초기화하지 않음. 접근 불가능한 날짜라면 사용자에게 안내하고 안전한 기본 날짜 제안.

## 5. 정상/오프라인/경합 동기화 알고리즘

### 5-1. 초기화 이후의 정상 경로

1. 기존 일반 학습정보는 원래 `syncLearningStates` 구현을 재사용한다(호환·에러 분리).
2. 계획 목록 GET→revisions/hashes 비교. 변경된 서버 일정만 chunk GET·hash 검증 후 병합 가능 범위만 적용.
3. 진도 GET `afterSeq=lastVerifiedSeq`로 delta 읽기; 응답의 `highWatermark`까지 페이지를 수신하고 이벤트를 적용.
4. pendingOps 각 항목을 `operationId` 그대로 서버에 CAS 전송. 성공 ACK 또는 서버 이벤트에 같은 operationId가 보이면 clean으로 전환.
5. 충돌한 pending은 그대로 두고 사용자 충돌함에 표시. 새 서버 이벤트를 다시 GET하여 갱신, planRevision/lastVerifiedSeq을 영속 저장한다.
6. '동기화 완료'는 일반 정보·계획·진도 **세 영역 각각** 성공하고 dirty/conflicts가 남지 않았을 때만 표시. 부분 성공은 영역별 수량·시각 표시.

### 5-2. 진도 이벤트 서버 작성 알고리즘(설계 의사코드)

```text
for each validated change, within server LockService:
  - find existing event by operationId (scoped to signed owner)
  - if found and payloadHash same: return DUPLICATE (no append)
  - if found and payloadHash differs: OPERATION_REUSE
  - lookup latest event for (planId,date,topicId)
  - verify slot exists in active or explicitly approved historical revision
  - if latest.rowRevision != expectedRowRevision: return CONFLICT
  - newSeq = max(actual persisted events.serverSeq for planId) + 1
  - append ONE immutable event {newSeq, rowRevision+1, status, operationId, ...}
  - flush; return APPLIED, newSeq; update plan.progressSeq cache if possible
```

- **실제 이벤트 로그가 진실 원천(source of truth)**. 서버 plan 메타 progressSeq 캐시가 오래되면 로그에서 재계산하여 복구. appscript 단독 requestStatus 캐시(120초)는 쓰기 멱등성의 근거가 아님.
- 요청 묶음은 항목별 applied/duplicate/conflict를 반환. 처리 중 일부 성공 후 예외가 나더라도 재시도 시 event operationId로 중복 인식, 실패 항목은 같은 operationId로 재개.
- 하나의 event append + flush 성공 여부가 확인되지 않으면 ACK 금지. 통신 응답이 사라지면 같은 opId로 조회/재시도.
- 설계의 O(n) event 탐색은 대규모에서 느려질 수 있으므로 Stage 3은 **합성 이벤트 2만 건** 기반 실행시간 측정 필수. 대용량에서 6분 한도/지연 초과면 운영 이전에 보조 인덱스 또는 컴팩션(원본 보존)으로 보완; 무검증 낙관 PASS 금지.

### 5-3. 오프라인, 시간차, 중복

- 네트워크 없음/세션 미인증: 로컬 완료·다시보기 정상 저장. 상태 `미전송 N건`, 네트워크/승인 복구 후 동기화.
- 서버로 POST는 보냈지만 `mutationStatus` 확인이 실패: 새 operationId를 발급하지 말고 원래 ID를 보존, 서버에서 동일 ID가 반영되었는지 확인/재시도.
- 두 기기에서 같은 key를 동시에 작성: 서버 lock 안의 CAS가 한 작업을 통과시키고 나머지는 CONFLICT; **last-write-wins 자동 선택하지 않는다**.
- 클라이언트 `clientAt`은 참고; 인증용 요청 timestamp ±허용창은 기존 로직 적용. 시간 오차/오프라인 오래된 요청을 재서명할 때는 **새 전송 envelope**를 만들되 앱 영속 operationId는 재사용.
- 기존 UI의 '미학습'은 아직 이벤트 없음이며, `todo` 이벤트는 분명한 리셋이므로 원격의 이전 done/miss를 되살리지 않는다.
- progress GET 페이지는 고정 `highWatermark`까지만 순회. 네트워크 실패 시 마지막 **검증된** 커서부터 재시작하며 중간 페이지 유실을 건너뛰지 않는다.

## 6. 백업·복원·롤백 정책

| 상황 | 안전 처리 |
| --- | --- |
| Stage 3 격리 개발 | 사용자 데이터가 아닌 synthetic 테스트 시트 사용, 원본 불변 |
| Stage 4 IndexedDB 스키마 업그레이드 | 기존 store 유지, 업그레이드 전 backup manifest 및 사용자가 보관 가능한 JSON 제공 |
| 최초 통합 사용자가 취소 | 서버 반영 없음, 로컬 계획·진도 기존대로 사용 |
| 계획 청크 일부만 업로드 후 중지 | activeRevision은 이전 값 유지, STAGING 유지/안전한 폐기 후보 |
| 계획 commit 성공이나 응답 손실 | 서버 activeRevision + hash 재확인 후 ALREADY_APPLIED, 새 계획 중복 생성 금지 |
| 진도 일부 성공 후 응답 손실 | 원래 operationId 그대로 재시도; 로그의 중복 검출로 exactly-once 효과 |
| 다운로드 도중 브라우저 종료 | 완전한 snapshotHash 검증 전 현재 계획 교체 금지 |
| 사용자가 수동 JSON 진도 복원 | 로컬 스냅샷+겹침 preview 후 적용, 동기화 대기 큐 생성; 서버 자동 업로드 금지 |
| 운영 롤백 필요 | feature flag OFF로 서버 쓰기 중단; 기존 로컬·서버 기록은 그대로 보존 |
| 복원 후 서버와 기록이 다름 | 백업으로 기존 로컬을 되살리되 서버 기록을 파괴하지 않고 비교·재동기화 요청 |

## 7. 사용자 화면 제안(별도 Stage 6 구현)

- 오늘의 학습 계획 통계 한 줄의 시작일/일차 정보는 유지. 작은 보조 문자열: `마지막 동기화 HH:mm · 미전송 N건`.
- 상태: `동기화됨`, `미전송 N건`, `충돌 N건(검토 필요)`, `오프라인`, `인증 필요`, `첫 통합 백업 필요`.
- `학습정보 동기화` 버튼 클릭은 일반 학습정보 + 계획 + 날짜별 진도 영역을 순차 처리하되 별도 결과 집계.
- 기존 `학습계획 추가 · 진도 백업/복원 사용 안내`: "이 기기만 저장"을 초기 준비 여부에 따라 "신뢰기기 간 공유/미전송은 기기에 보관"으로 변경. JSON은 **안전용 독립 백업**으로 유지하며 동기화 대체/덮어쓰기 수단으로 혼동하지 않도록 설명.
- 실제 백업/복원 섹션은 화면 ④/⑤이므로 기존 알림 문자열의 '②에서 백업', '③ 복원' 등 남은 번호를 수정.

## 8. Stage 2 종료 시점의 사실/미확인

**설계 확정:** 3-way 일정 비교와 CAS 진도, 분할 불변 계획 스냅샷, append-only 변경 로그, durable operationId, 최초 이행 단계/충돌 분류/rollback.
**미검증:** 기기별 실제 IndexedDB 상태/파일 백업, 운영 server source version 현재값, 배포 Script Properties 바인딩, synthetic 2만 건 성능, 오프라인/다중 기기 실제 실행. **어느 것도 완료 PASS로 표기하지 않는다.**

**Stage 3 목표:** 격리된 시험 시트와 Apps Script 후보에 최소 읽기·쓰기 API 구현. 사용자 로컬 데이터 병합 및 운영 배포는 Stage 4~8 이후.
