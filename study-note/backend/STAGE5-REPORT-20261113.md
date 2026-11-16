# 학습노트 다중 기기 학습계획 동기화 — Stage 5 완료/제한 보고

**작성:** 2026-11-13 Asia/Seoul
**범위:** 별도 기능 브랜치의 합성 데이터 전용 개발 및 검증. 운영 미반영.

## 1. 기준선과 작업 소유권

- GitHub \`aliasel0817/Pe-Exam-Search\`의 작업 시작 시 main: \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\`.
- 1단계 #82, 2단계 #83, 3단계 #84, 4단계 #85 모두 미병합 Draft PR로 확인됨.
- Stage 5 작업 브랜치: \`feature/planner-sync-stage5-first-migration-20261113\`. Stage 4 PR #85의 마지막 head \`a3f1b26267494a5322edf847d2ccfa53a6357bd1\`을 부모로 분기한 **stacked Draft PR #86**, base \`feature/planner-sync-stage4-client-20261113\`.
- GitHub 원격 connector만 사용. 사용자 Windows PC/원격 프로세스/다른 채팅 워크트리 수정 없음.
- 운영 Pages URL의 실제 배포본/Apps Script 실배포 SHA·Script Properties 바인딩은 Stage 5에서 재검증되지 않아 **미확인**으로 유지. 과거 Stage 2 기록이 곧 현행 배포 증빙은 아님.

## 2. 개발 결과

| 파일 | 구현 내용 |
| --- | --- |
| \`study-note/study-planner-migration.js\` | 전체 5-store 일관성 백업, 안전한 SHA-256 manifest/파일 검증, 3-way 일정 비교·additive-only 병합, 이벤트별 done/miss/todo 충돌 판정, 첫 통합 저널·단계별 서버 검증·복구·안전한 무덮어쓰기 복원 |
| \`study-note/study-planner-migration-ui.js\` | 격리시험 전용 7단계 UI: 전체 백업→파일 재선택→서버 비교→미리보기→사용자 체크/승인→적용→검증. 취소·재시도·복원 메시지, 브라우저 새로고침 후 저널 복구 |
| \`study-note/study-planner.js\` | 테스트 환경에서만 Stage5 모듈 로딩. IndexedDB load 완료 후 마법사 mount. 기존 계획·진도 화면/저장 경로 보존 |
| \`study-note/tests/test_planner_sync_stage5_migration.cjs\` | 합성 IndexedDB·서버에서 백업 위변조/보호 게이트, 3-way 병합/충돌, 보존형 restore, 유실 ACK/재개/취소 검사 |
| \`study-note/tests/test_planner_sync_stage4_browser.cjs\` | Chromium 세 번째 독립 브라우저 프로필 Stage5 UI 파일 재선택·미리보기·승인·계획/진도 import 검사 |
| \`.github/workflows/planner-sync-stage5-migration.yml\` | Stage5 단위/통합 + Stage4 두 기기 기존 회귀 자동 실행 |
| \`study-note/backend/STAGE6-REQUEST-planner-sync.md\` | 다음 Stage6 전체 독립 실행 요청서 |

**데이터 불변식:** LIVE MASTER, 기존 \`학습정보\`, PDF·이미지·첨부·필기·보안키 및 사용자 실기기의 \`plans/progress\`는 변경하지 않음. \`study-note/study-note.html\` 원문/서비스워커/Apps Script 소스도 변경하지 않음.

## 3. 검수 및 증거

**최종 소스 검사 기준:** GitHub Actions \`Planner Sync Stage5 First Migration Synthetic\`, run \`43443299069\`, **SUCCESS** (실제 Google이 아닌 합성 서비스).

- \`STAGE5_MIGRATION_PASS\`: 기존 계획/진도 보존 백업, SHA-256 위변조 거절, 파일 확인 전 서버 접근 차단, 안전한 서버 import, 동일 key 완료/다시보기 충돌 원본 유지, 원격 ACK 유실 후 동일 operationId 재시도, 시작 후 브라우저 종료를 가정한 UPLOADING 저널 재개, 계획 3-way disjoint 추가 허용/서로 다른 날짜 충돌 보류, JSON 복원 원본 무덮어쓰기, 원격 취소 무쓰기.
- \`STAGE5_UI_BROWSER_PASS\`: 실제 Chromium(세 번째 **독립 합성 프로필**)에서 JSON 파일 재선택을 모사하고 화면의 미리보기/선택 승인 후 계획·진도 다운로드 검증.
- \`STAGE4_BROWSER_PASS\`: Stage4 PC·태블릿 역할 합성 프로필에서 v1→v2 보존, 새 계획 공유, 회독별 done/miss, 오프라인 재시도, 충돌, 중복 ACK 재검증.
- 구문검사 포함 JS 전 파일 PASS.

**검수 구분:** 자동(Node/fake IndexedDB) PASS / 실제 Chromium 합성 브라우저 PASS / 실사용 PC·태블릿·모바일 기기 검수 **미실시** / 실제 Apps Script·Google Sheets HMAC/nonce·19,060건 처리 실측 **미실시**.

테스트 브라우저의 \`File\` 재선택은 자동 모사이며 실제 사용자 파일 저장·복원 검수는 미실시. 전체 MASTER 대상 100일 19,060건의 **실서버 업로드 성능**도 검증되지 않았다.

## 4. 현재 위험 및 후속 단계 차단 조건

1. Stage 3 실제 격리 Apps Script 배포와 ACTIVE 신뢰기기/HMAC/nonce/Script Properties/스프레드시트 ID 검증, 서버 처리 성능/호출 한도 검증 **미완료**. Stage 8 운영 활성화 전 필수 게이트.
2. Stage5의 안전한 동일 planId additive 병합은 **공통 조상(기본 계획 또는 확정 버전) 검증 시에만** 허용. 근거 없는 계획 변경/날짜 이동/단순 최신 시각 비교는 보류한다.
3. Stage5 서버 이행은 사용자별 백업파일 확인/비교/선택 승인 후에만 가능하도록 개발했고, 현재 기능 플래그는 \`localhost/127.0.0.1\` 합성 transport에서만 ON.
4. Stage 4 이후 사용 중 다른 탭이 로컬 기록을 변경하면 최종 IDB readwrite 트랜잭션에서 원본을 다시 비교하며 **덮어쓰기보다 거래 중단**을 우선한다.
5. 장기간 오프라인·실제 Google Sheet 대규모 진도 이벤트·모바일 Safari 저장용량/진도 파일 복구 등은 Stage7 통합 검수와 Stage8 배포 전에 별도 검증 필요.
6. Stage 6은 동기화 상태/부분 성공/로컬 전용/사용 안내 번호/첫 통합 UX 가시성을 개선하는 단계이며, **본 PR에서 시작하지 않음**.

**승인 조건:** PR #86은 Draft. main 병합, GitHub Pages 운영 배포, 실제 Apps Script/Google Sheets/개인 기기 데이터 변경은 명시적 사용자 승인 전 금지. 다음 작업요청서 전문은 채팅 메시지 본문에 함께 제공.
