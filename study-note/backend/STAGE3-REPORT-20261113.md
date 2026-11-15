# Stage 3 검수·배포 경계 보고서 (2026-11-13 KST)

## 1. 작업 기준선
- 기준 GitHub main: `56bf0901ee7a7d8e41165a90d6b65e41893f8ee3`.
- Stage 1/2 인계: Draft PR #82 / #83. Stage 3 개발: Draft PR #84.
- 운영 Pages 동기화 미지원 상태 유지. 운영 Apps Script 현재 배포 versionNumber 및 Script Properties 실제 바인딩 ID **미확인**.
- 작업 PC: 원격 Windows 실행/다른 세션 조작 **하지 않음**. GitHub 독립 브랜치 + 격리 Google Sheets만 사용.

## 2. 구현 상태
- 신규 독립 소스 `study-note/backend/planner-sync-stage3-isolated.addon.gs` 작성.
- ACTIVE로 검증된 호출 컨텍스트를 필수로 요구하는 `PS3_get_/PS3_post_` 후보 작성. 단 **실제 HMAC 검증 라우터에 아직 삽입하지 않음**.
- 계획: 메타, DAY/GROUPS 분할 청크, plan SHA-256, stage begin/put/commit, 버전 CAS, 병렬 STAGING 차단, 중단/재시도, commit ACK 중복 복구.
- 진도: `planId|date|topicId` key, done/miss/todo 이벤트 원장, per-key rowRevision, per-plan serverSeq, operationId 영속 중복/재사용 거절.
- 운영 격리 킬스위치: `PLANNER_SYNC_MODE=ISOLATED_TEST`, 명시 시험 원장 ID, 다른 LIVE ID, TEST ONLY 마커 검사.
- 서버 연동 설명: `study-note/backend/README-planner-sync-stage3-isolated.md`.
- Native Google Sheets 격리 원장 `학습계획 동기화 Stage3 격리시험용 - 합성데이터 전용 20261113`: `학습계획`, `학습계획일정`, `학습계획진도`, `학습계획작업`, `테스트토픽` 5개 탭과 각 헤더를 connector로 재조회·확인. TEST ONLY 합성 토픽 1건. **LIVE 원본에서 복사한 진도/토픽 0건**.
- 로컬 synthetic XLSX fixture도 별도로 제작했지만 실제 Google 원장으로 import하지 않았다.

## 3. 검증 결과 — 사실과 한계 구분
| 검사 | 결과 | 근거/한계 |
| --- | --- | --- |
| 데이터 구조/헤더 격리 원장 생성 | PASS | Google Sheets 메타데이터 및 A1:P2 읽기 |
| 소스 구문 검사 | PASS | JS 파서 및 GitHub Actions Node 실행 |
| 정상 계획/100일 19,060 배정 synthetic 분할 commit & 재조회 | PASS (mock) | GitHub Actions `Planner Sync Stage3 Synthetic Backend` |
| 손상된 청크/병렬 STAGING/commit 재전송 | PASS (mock) | synthetic runner |
| done/miss/todo·revision 충돌/동일 operationId 재전송 | PASS (mock) | synthetic runner |
| ACTIVE 컨텍스트 부재/production mode/실원장 ID 차단 | PASS (mock) | 직접 모의 검증 |
| 실제 Google Apps Script Code.js doGet/doPost HMAC/nonce 통합 실행 | **미검증/미구현** | connector에 Apps Script 프로젝트 생성·배포 실행 도구 없음, 운영 라우트 무변경 |
| 실제 격리 Apps Script + Sheets 19,060건 처리 시간/호출 크기 | **미검증** | Node in-memory 결과를 실제 앱 성능으로 간주 금지 |
| LIVE MASTER/실기기 진도 데이터 이관 | 미실시(계획대로) | Stage 5 이후 |
| 사용자 PC/태블릿/모바일 직접 조작 | 미검증 | 원격 장비/사용자 기기 오염 방지 |

## 4. 추가 보완 필수
1. **Stage 3 서버 end-to-end는 아직 완료가 아님.** 격리 Apps Script 독립 프로젝트와 시험용 credential 설정, HMAC/nonce 검증, 실제 Sheets I/O를 안전하게 수행한 후에만 서버 PASS라고 보고.
2. 현재 계획 진도 handler의 선형 시트 전체 스캔/청크 해시 검사는 Mock에서만 빠르게 실행됨. 19,060 슬롯/다수 progress 이벤트에 대한 실측과 batch/인덱스 개선 전 운영 절대 금지.
3. 실제 운영 Code.js, 배포 버전, Script Properties ID 확인 전에는 운영 소스와 통합 금지.
4. Stage 4 클라이언트 개발은 **feature flag 기본 OFF + mock/test-only**. Stage 5 최초 데이터 통합 준비 전 기존 로컬 데이터 원격 덮어쓰기 금지.
5. 기존 기술사 내용·메모·암기 상태/ PDF·첨부·주석, 원격 다중채팅 세션을 한 번도 변경하지 않음.

## 5. 다음 단계
Stage 4 웹앱 IndexedDB v2, pending queue, 계획/진도 클라이언트 GET/POST, 기존 동기화 버튼 연동을 **mock/test-only**로 개발한다. Stage 3 실제 격리 Apps Script/HMAC 통합 미검증 사항은 Stage 4 완료 조건에서 별도 차단 게이트로 유지한다. `study-note/backend/STAGE4-REQUEST-planner-sync.md` 전체 요청서는 채팅 메시지 본문에도 제공한다.

**운영 main 병합/배포 및 Google Sheets LIVE MASTER 변경 없음.**
