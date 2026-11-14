# 학습노트 다중 기기 동기화 — 6단계 최종 개발·검증 보고

**기준 날짜:** 2026-11-14 Asia/Seoul
**범위:** 격리 브랜치 UX 개발 및 합성 브라우저 핵심 검증. LIVE/운영 사용 금지.

## 1. 실제 기준선 및 선행 의존성

- 작업 시작 최신 main SHA: \`56bf0901ee7a7d8e41165a90d6b65e41893f8ee3\` (GitHub 조회).
- 미병합 Draft PR #82(기준선), #83(상세설계), #84(Apps Script 합성 서버), #85(IndexedDB/동기화 클라이언트), #86(전체 백업/최초 통합)가 모두 열린 상태였음.
- Stage6 전용 작업 브랜치: \`feature/planner-sync-stage6-ui-guidance-20261114\`. 부모는 #86 head \`d1236116244fc66cf6f5da2ccf6e37728d3b78cc\`, stacked Draft PR #87 base \`feature/planner-sync-stage5-first-migration-20261113\`.
- 실제 운영 GitHub Pages HTML/JS URL 웹 직접 열람은 접근 도구에서 실패함. 최신 GitHub main의 \`study-note/study-note.html\`과 보호 범위는 조회했지만 **현행 Pages 동작을 재검증했다고 주장하지 않음**.
- 실제 운영 Apps Script 배포 버전 및 Script Properties 바인딩을 확인하지 못했음. Stage3 격리 GAS HMAC/nonce 인증 및 19,060건 Sheets 성능 실측은 계속 **미검증, 출시 차단**.
- 원격 Windows PC/사용자 실제 기기에는 접근하거나 프로세스를 조작하지 않았음.

## 2. 개발 결과

| 변경 파일 | 6단계 범위 |
| --- | --- |
| \`study-note/study-planner-sync-ux.js\` (신규) | 3영역 동기화 카드·문구·진단. 기존 일반 학습정보 \`pe-study-note-db/meta:lastLearningSyncAt\` 새 성공 receipt를 **read-only** 확인; 이전 기록·실패 삼킴을 성공으로 표시하지 않음. 오류별 재시도/인증/오프라인/해시/저장공간 도움말. 1366/768/390 반응형 CSS |
| \`study-note/study-planner-sync.js\` | plans/progress pending/충돌 건수와 서버 성공 증거를 분리 저장. 부분 성공·충돌 미확인 영역을 전체 완료로 보고하지 않음. 기존 synthetic loopback flag 유지 |
| \`study-note/study-planner.js\` | 기존 학습정보 버튼과 Stage6 상태 브리지 (loopback 시험에만 연결), 섹션 ①~⑥ 안내 정정, \`④ 진도 백업\` / \`⑤ 진도 복원\` 번호·오류 참조 바로잡기. 현재 KST 시작일/오늘 N일차/회독·검색·필터·기존 진도 백업·복원 경로 보존 |
| \`study-note/study-planner-migration-ui.js\` | 7단계 마법사 진행 표시, 로컬/서버 계획 및 done/miss 충돌 원본 전체를 각각 펼쳐 조회, 서버 rowRevision, 최초 백업 검증·사용자 승인·안전 재시도/취소 상태와 오류 도움말 |
| \`study-note/tests/test_planner_sync_stage6_ux.cjs\` | 이전 legacy receipt는 '미확인', 새 유효 receipt만 성공, 3영역 상태와 부분 성공·오프라인·오류 도움말·Asia/Seoul 시간대 |
| \`study-note/tests/test_planner_sync_stage4_browser.cjs\` | 원래 Stage4/5 회귀 + Stage6 마법사 7항목/원본 두 기록 UI, 1366px·768px·390px 합성 Chromium 스크롤 검사 |
| \`.github/workflows/planner-sync-stage6-ux.yml\` | Stage6 Node + Stage5 합성 복구 + Stage4/5/6 3개 Chromium 독립 프로필 자동회귀 |
| \`study-note/backend/STAGE7-REQUEST-planner-sync.md\` | 7단계 전체 독립 실행 통합검수·릴리스 게이트 요청 |

**바이트 보호:** \`study-note/study-note.html\`, \`study-note/service-worker.js\`, MuPDF/AGPL/PDF·첨부·필기·인증/운영 Apps Script는 이 브랜치에서 미수정. LIVE MASTER \`암기장/학습정보\`, 관리기기/보안감사로그, 실기기 \`plans/progress\`도 수정하지 않음.

## 3. 핵심 실제 검사 결과 (코드 HEAD 기준)

- GitHub Actions \`Planner Sync Stage6 UX Synthetic Browser\`: run **43584557902**, commit \`d16b54becef8038b7b4d28b72e80e10a333dfdd6\`, **SUCCESS**.
- GitHub Actions \`Planner Sync Stage5 First Migration Synthetic\`: run **43584557921**, 동일 commit, **SUCCESS**.
- \`STAGE6_SYNC_UX_PASS\`: 3영역 receipt 독립 / 일반 상태 새 성공 증빙 없으면 미확인 / 이전 성공을 현재 성공으로 오인하지 않음 / 오프라인 및 KST 시각 / 오류별 안내.
- \`STAGE5_MIGRATION_PASS\`: 원본 전체 백업 해시 / 위변조 거부 / 승인 전 쓰기 차단 / 3-way 순수 추가만 병합 / 동일 키 충돌 보류 / 브라우저 종료·ACK 유실 재개 / 무덮어쓰기 복원.
- \`STAGE6_UI_BROWSER_PASS\`: 3개 Chromium 독립 프로필 + 화면 크기 **1366 / 768 / 390px**에서 bodyScroll 각각 1366 / 768 / 390, 넘침 없음. 7단계 UI, 로컬/서버 진도 원본 및 서버 revision 정보 표시.
- \`STAGE5_UI_BROWSER_PASS\`: 백업 파일 재선택→미리보기→명시 승인→합성 서버 계획/진도 내려받기.
- \`STAGE4_BROWSER_PASS\`: 기존 v1→v2 저장소 보존, 2기기 교차 진도, 오프라인 재전송/충돌·중복 ACK 없음.
- 테스트 중 중간 커밋에서는 합성 파일 라우팅 및 DOM 선택자/문구 기대치 오류가 있었으며 **최종 위 검증 HEAD에서 해결**됨.

**검수 유형 구분:** Node(fake-indexeddb) 자동검사 PASS / 실제 Chromium **합성 브라우저** PASS / 실제 Google Apps Script + Sheets/HMAC 실행 **미실시·미검증** / 사용자 소유 실제 PC·태블릿·스마트폰 **미검수**. 기존 PDF/첨부/필기 실브라우저 E2E는 이번 Stage6 신규 검사에 포함하지 않았고 파일 보존만 확인됨 (Stage7 필수).

## 4. 남은 출시 차단 조건

1. Stage3 격리 Apps Script 실배포 및 현재 인증 라우터·HMAC·nonce·ACTIVE 신뢰기기와의 실제 E2E 검증.
2. 실제 격리 Sheets 19,060+ 일정 업로드/조회/복구 성능·LockService·호출 한도/캐시 실측.
3. Stage7 기존 학습정보/PDF·MuPDF·첨부·필기·인증 기능의 실제 통합 회귀검사.
4. 실사용 기기별 전체 JSON 백업 및 사용자가 검증 후 명시 승인한 최초 데이터 통합(운영 전 금지).
5. #82~#87은 모두 Draft 미병합, Stage7/8에서도 올바른 의존성/병합 순서와 기존 main 변동을 다시 확인.
6. 신규 클라이언트 기능은 계속 합성 loopback + explicit \`PE_PLANNER_SYNC_TEST_ENABLED\` + 테스트 transport 조건 외 OFF. 사용자의 운영 Google Sheets에 접근하지 않음.

## 5. 작업 종료·인계

Stage6 UI 개발과 본 범위의 합성 핵심검사 완료. PR #87 Draft 상태로 main/Apps Script/Pages 배포 금지. Stage7 테스트 및 결함 보완은 별도 요청 후 시작하며 7단계 전문은 \`STAGE7-REQUEST-planner-sync.md\` 및 채팅 본문에 함께 제공.
