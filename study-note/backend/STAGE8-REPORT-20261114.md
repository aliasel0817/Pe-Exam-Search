# 학습노트 다중 기기 학습계획 동기화 — 8단계 실행 결과
기준: 2026-11-14 KST | 검증 브랜치: test/planner-sync-stage8-release-preflight-20261114 | **출시 판정: BLOCKED**

## 1. 개발 및 결함 수정

### 작업 결과
- 1~3단계 설계/검사 문서를 7단계 수정 서버 후보 및 4~6단계 코드를 보존하는 별도 브랜치에 함께 구성. main 미변경.
- 격리 테스트 전용 기존 ACTIVE/HMAC/nonce 인증 호스트 브리지 후보 추가. 운영 Code.js의 doGet/doPost는 변경하지 않았으며 브리지는 어디에도 운영 라우팅하지 않음.
- 기존 Code.js에서 validateSignedGet_, validateSignedMutation_, validateDeviceSignature_ 원문을 추출해 Node VM의 합성 키/기기/캐시 환경에서 실행하는 8단계 회귀 검사 추가.
- 호스트 브리지의 GET/POST 허용목록이 상속된 Object.prototype 키를 승인할 수 있는 경우를 확인, hasOwnProperty 검사로 보완하고 constructor/toString/__proto__ 테스트 추가.
- 기존 관리 UI 회귀검사의 2026년 6단계 이전 안내문 고정 기대값을 실제 6단계에서 표시되는 운영 로컬 저장/자동 공유 차단/독립 백업 문구로 교체. 기존 섹션/버튼/다운로드/복원 테스트 유지.
- 기존 MASTER 학습계획 브라우저 테스트의 과거 2026-11-13 고정 '23/100일차' 기대값을 실제 Asia/Seoul 현재 날짜에 따른 올바른 날짜 표시 검증으로 수정. 실제 학습계획 코드는 변경하지 않음.
- 별도 출시 승인 게이트 및 사용자 기기별 백업·통합·복구 절차 문서화.

### 안전성 및 보호
- 운영 main, GitHub Pages, Apps Script 배포/Script Properties, Google Sheets LIVE MASTER 및 사용자 기록 변경 없음.
- study-note.html blob SHA 74f35aff44bd1b0521dcbb8244d3c859a1538adc, service-worker.js SHA a0290738b2a29dc951bbe693008985d32f0ffb21, 기존 운영 Code.js SHA 9457b67d61742fce1e70f2ce18f6c386a478b9ee. CI에서 기준 main과 동일한 blob SHA임을 확인.
- R/M 계열 기존 MuPDF/AGPL PR 및 다른 채팅의 작업은 조작하지 않음. Windows 원격 PC는 online으로 나타났으나 명령이 spawn EPERM 실패, PC 소스/프로세스 미조작.
- 사용자 PC·태블릿·스마트폰의 IndexedDB/백업은 접근하거나 통합하지 않음.
- 기존 합성 시험 Google Sheets 5개 탭 및 TEST ONLY 마커를 읽기 전용 확인. 실제 Sheets 원본/운영 자산 전체 바이트 검증을 주장하지 않음.

## 2. 최신 기준선
- main 56bf0901ee7a7d8e41165a90d6b65e41893f8ee3 (8단계 종료 전 재조회).
- PR #82~#88은 모두 open Draft, 미병합.
- PR #89는 PR #88을 base로 하는 신규 Draft 통합 시험 브랜치; 운영 병합 아님.
- PR #84 원본의 planner-sync-stage3-isolated.addon.gs 와 PR #88 수정본은 동일 경로 add/add 병합 위험. 최종 후보는 #88 청크별 round 일치 검증을 보존하도록 명시적으로 충돌 처리 필요.
- 실제 GitHub Pages의 배포 바이트는 웹 접근 실패로 최신 검증 미수행.
- 실제 Apps Script 배포 버전/속성/신뢰기기 인증은 미확인.

## 3. 통합검사 매트릭스

| 검사 | 결과 | 증빙 수준 |
|---|---|---|
| 서버 GET/POST 7종 계약 | PASS | Stage3+7 Node VM synthetic |
| 100일/5회독/3812토픽/19060배정 | PASS | Node VM 101청크·SHA 왕복 |
| operationId/CAS/todo/highWatermark | PASS | Node VM synthetic |
| 유효/무효 HMAC, nonce 중복, 만료, ACTIVE/PENDING | PASS | 기존 Code.js 검증 함수 원문 + 모의 키/시트/CacheService, 실제 GAS 아님 |
| 실제 격리 Apps Script 배포/GET/POST/HMAC | 미검증/BLOCKED | 테스트 Script deployment 및 실행 권한 미확인 |
| 실제 격리 Google Sheets 19,060 데이터 처리·LockService/할당량 | 미검증/BLOCKED | 별도 Sheet 존재 및 헤더만 확인 |
| 전체 백업/위변조/최초 통합/충돌/복구 | PASS | Stage5 synthetic 재검사 |
| 상태 분리·오프라인·안내·접근성 일부 | PASS | Stage6 Node + Chromium synthetic |
| 1366/768/390 독립 Chromium 프로필 | PASS | STAGE6_UI_BROWSER_PASS |
| 기존 계획 관리·CSV/JSON·새 계획·신규 토픽 5회 배정 | PASS | 실제 Chromium synthetic, 기존 19,060→19,180 보존 |
| 기존 PDF 형식·서명된 PDF 백엔드 관련 자동검사 | PASS | Node-based/synthetic, 실사용 MuPDF 필기 검수 아님 |
| 기술요소 가독성 | PASS | 자동 테스트 53건 / FAIL 0 |
| 실제 운영 PDF/MuPDF/필기/신뢰기기/서비스워커 E2E | 미검증 | 실제 사용 환경 미접근 |
| 사용자 PC/태블릿/모바일 최초 백업·병합 및 실기기 QA | 미검증/BLOCKED | 사용자 데이터 미접근 |
| 운영 source byte protection | PASS | Git blob SHA 3개 CI 검증 |
| 운영 main 병합/Apps Script/Pages 배포 | 수행 안 함 | 사용자 명시 승인 없음 |

## 4. CI 및 합성 성능
- GitHub Actions 이름: Planner Sync Stage8 Isolated Release Preflight (NO DEPLOY)
- 성공 run: 43596887963, job: 132453198453, 테스트 코드 SHA: f26cb2ea1587ff19151b44abfbbaef68db1e8651. 결과 SUCCESS.
- Stage7/8 통합: 100일, 3812토픽, 19060일정, 101청크, BEGIN=1 PUT=9 COMMIT=1 GET=5 progress POST=4.
- POST JSON 합성 누적 404,512 bytes, 최대 개별 POST 48,323 bytes, Node VM mock 실행 464ms. **이는 Google Apps Script/Google Sheets 성능이 절대 아님.**
- 기존 학습계획 MASTER 기반 19,060건에 신규 대상 토픽 24개*5회=120건을 합성 브라우저에서 편입해 19,180건 확인, 진도 보존 PASS.
- Chromium 1366/768/390 및 기존 관리 QA 390/820/1280, MASTER 브라우저 390/820/1280에서 수평 overflow 없음.
- 기존 서명 PDF 백엔드·PDF 표시 검사와 기술요소 가독성 53 테스트 PASS.
- RELEASE_READY=false 를 CI에서 명시. 실제 서비스 활성화 기능은 여전히 OFF.

## 5. 실제 서버 검증을 차단하는 구조적 항목
- 실제 격리 GAS 배포/프로젝트/실행 권한을 확인할 수 있는 연결 도구가 없음. Google Drive에 격리 시험 Sheet가 있다는 사실만으로 Apps Script 배포가 존재하는 것은 아님.
- 기존 보안 호스트 Code.js의 getStudySheet_는 STUDY_NOTE_SPREADSHEET_ID에 지정된 topic_study_data 및 암기장 시트를 요구.
- Stage3 PS3_context_는 STUDY_NOTE_SPREADSHEET_ID와 PLANNER_SYNC_TEST_SPREADSHEET_ID가 같으면 LIVE_BLOCKED 거부.
- 안전한 실제 HMAC E2E를 위해서는 운영과 완전히 독립된 합성 **인증 원장**과 그와 다른 **계획 시험 원장**, 시험용 ACTIVE 기기/세션 키 및 격리 Script가 추가로 필요. 운영 인증 원장·키를 절대 시험용에 복사하지 않음.
- 현재 Code.js doGet/doPost에는 새 계획 동기화 API 라우트가 미연결. Stage8 시험 브리지 파일은 운영에 미적용.

## 6. 안전한 다음 조치와 승인 체계
- 먼저 실제 격리 GAS/인증 원장 및 별도 계획 원장의 안전한 접근권한·배포 버전 확보, HMAC/nonce/ACTIVE·7 API 실측, 19,060건 실제 Sheets/LockService/quotas 시험, 전체 회귀 재검증.
- PR #82~#89 스택 구조, #84와 #88 동일 경로 충돌, MuPDF/AGPL 미병합 PR을 재검토한 뒤 통합 RC가 PASS해야 함.
- 별도의 사용자 명시 승인 전 main/Pages/GAS 및 중앙 Google Sheets 변경 금지.
- 배포 승인이 난 뒤에도 최초 실기기 데이터 병합은 기본 OFF; PC·태블릿·모바일 각각의 전체 JSON 백업·파일 재선택·SHA 확인과 사용자 기기별 별도 승인 필요.
- 충돌 원본 보존, 동시 수정 CAS, operationId 재전송, 승인된 백업 복구 후 전체 상태 재검사.

**최종 결론: 합성/자동 통합검사는 PASS. 실제 Apps Script 인증 및 실제 Sheets 19,060건 처리, 실제 서비스/실기기는 미검증. 운영 출시는 BLOCKED.**
