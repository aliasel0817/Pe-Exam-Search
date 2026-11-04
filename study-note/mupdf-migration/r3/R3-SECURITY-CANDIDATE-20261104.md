# R3 — signed mutation 사전 캐시 예약 위험 분석 및 비운영 후보 설계

**범위:** 실제 Apps Script 버전21의 `doPost` 호출 순서 정적 분석. 운영 서버·원본 코드는 **수정하지 않음**.

## 1. 실제 코드상 확인된 순서

R2의 읽기 전용 v21 Code.js에서 `doPost(e)`는 `requestId`, `pollKey`, `action`의 기본 형태를 확인한 다음 `claimMutationRequest_(requestId,pollKey)`를 호출하고, 이후 `registerdevice` 처리 또는 `validateSignedMutation_(envelope,['ACTIVE'])` 인증을 수행한다.

`claimMutationRequest_`는 ScriptLock 하에서 CacheService에 `processing` 상태를 기록한다. 따라서 임의 `requestId`와 형식에 맞는 `pollKey`만 넣어도 **새 캐시 항목 생성을 시도할 수 있는 구조**다. 유효한 사용자 권한 상승·데이터 수정은 관찰되지 않았고, 이미 캐시에 존재하는 값에는 pollKey가 접근 자격 역할을 한다.

추가로 `doPost`의 오류 처리에서는 `requestId,pollKey`가 있으면 오류 상태가 캐시될 수 있는 경로가 보인다. 이는 실제 보안 서버 접근 없이 로컬 정적 판단만으로 확인된 위험 구조이며, 공격 성공이나 대규모 장애를 주장하지 않는다.

## 2. 변경을 즉시 강행하지 않은 이유

- 기존 `claimMutationRequest_`는 lock을 자체 획득하므로 외부에서 동일 ScriptLock을 보유한 채 재사용하면 **중첩 잠금 위험**이 있다.
- 기존 ACTIVE 서명 검증은 HMAC·TTL·nonce를 확인하고 nonce 사용 기록을 남긴다. 무조건 인증을 먼저 하면 동일 요청의 합법적인 중복 재전송이 nonce 재사용으로 거부되어 **멱등성·재시도 계약 회귀**가 발생할 수 있다.
- `registerdevice`는 구글 코드 인증·등록·세션 발급·관리 PIN 회복 등 별도 흐름이라 정상 signed mutation과 같은 코드로 바꿀 수 없다.
- 검증 과정 자체가 기기 `마지막접속일시`를 갱신할 수 있으므로 무단 운영 테스트는 기존 무변경 조건에 맞지 않는다.
- CacheService의 TTL/용량·LockService의 대기시간, Google Apps Script 실제 실행 제한과 오류복구에 대한 관측이 부족하다.

## 3. R3 독립 후보 — 개발 산출물

`r3-verified-idempotency-candidate.mjs`은 실제 Apps Script에 연결되지 않은 순수 합성 테스트 코드다.

새 `ACTIVE` signed mutation은 단일 잠금 경계 안에서 (a) 기존 status **읽기만** 하고, (b) status 없으면 서명/nonce/세션을 검증한 다음, (c) 유효한 요청만 `processing` 상태를 예약한다. 이미 완료/진행 중인 동일 id+pollKey 요청은 기존 cached status를 반환해 중복 처리를 피한다. 실제 작업 완료/오류는 **인증·예약에 성공한 요청만** 기록한다. 비정상 서명으로는 캐시 항목을 쓰지 않는다.

별도 검증한 합성 계약: invalid signed request → 캐시 기록 0; 정상 → 단일 실행; 중복 → 캐시 응답; 동시 중복 → 단일 예약; 작업 오류만 오류 캐시; `registerdevice`는 명시 차단.

**이 코드는 운영 Code.js 패치가 아니다.** 실제 통합 전 아래 검토/개발이 필수다.

1. 동기 LockService 구현과 `CacheService.getScriptCache` 동작을 정확히 반영한 Google Apps Script 후보 어댑터 작성
2. 서명 검증의 Drive/Sheets 호출이 lock을 장시간 점유하지 않도록 재검토
3. 등록/Recovery 흐름을 별도로 리팩터링하고 기존 구글 인증·PIN·Rate limit·등록 상태 보존
4. 실제 기존 CacheService TTL과 requestId/pollKey 키 계산 및 idempotent status API 보존
5. 합성 반복/동시 요청과 인증 거부 회귀검사 통과
6. 별도 사용자 승인/격리 서버 전까지 실제 Apps Script 코드·버전·설정/데이터 변경 금지

## 4. owner-only·필기 서버 안전 상태

- R2/v21 정적 코드는 기기 등록 시 허용 이메일 및 ownerSub 일치를 검사한다.
- 기존 ACTIVE 서명·PENDING/REVOKED 검사 코드를 변경하지 않았다.
- `saveannotations`, 사용자/페이지/첨부 key, 주석 schema 3 및 normalized 좌표는 그대로 유지.
- 실제 운영 owner-only 인증, 의도적 위조/nonce replay, 주석 영속 저장·복원 검사는 허가·백업·격리 환경이 확보되지 않아 **NOT VERIFIED/BLOCKED**.

## 5. R3 조치 및 다음 조건

R3 결과: 위험 **설계 분석 + 격리 후보 코드 + 단위검사**까지 완료. 운영 패치 여부는 **추가 통합 설계가 결정되기 전에는 보류**한다. R4에 넘기기 전에 격리 환경에서 등록 경로와 nonce 멱등성 계약을 해결해야 하며, 사용자 승인 없이 운영 스크립트 변경은 금지한다.
