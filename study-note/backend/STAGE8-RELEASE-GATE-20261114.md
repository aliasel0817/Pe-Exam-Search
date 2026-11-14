# 학습노트 다중 기기 동기화 — Stage8 출시 게이트 실행계획
2026-11-14 KST | PRE-RELEASE / NO DEPLOY | main·Pages·운영 Apps Script·LIVE MASTER 변경 금지

## 1. 기준선과 PR 의존성
- 운영 main 기준 SHA: 56bf0901ee7a7d8e41165a90d6b65e41893f8ee3. 실제 Pages 배포 바이트 및 GAS 배포 버전은 직접 확인되지 않아 미검증.
- PR #82 기준선, #83 설계, #84 격리 서버, #85 클라이언트, #86 최초 통합, #87 UI, #88 서버 round 검증 및 통합 CI, #89 출시 전 통합 후보.
- #85→#86→#87→#88→#89는 stacked PR. #82~#84는 별도의 main 기반 PR.
- **PR #84 원본 서버와 PR #88의 동일 경로 수정본은 add/add 충돌 가능.** 최종 후보에는 #88 수정본의 같은 날짜 분할 청크별 round 검증이 반드시 남아야 함.
- PR #89는 #82~#84의 문서/Stage3 테스트와 #88의 수정 서버를 합친 시험 스냅샷일 뿐, 그대로 main 병합하라는 지시가 아님. R/M MuPDF/AGPL 관련 다른 미병합 PR도 검토.

## 2. 격리 Google Sheets 및 인증 저장소 분리
- 기존 시험용 Google Sheets에는 학습계획·학습계획일정·학습계획진도·학습계획작업·테스트토픽 5개 시트가 있고, 헤더와 TEST ONLY 마커를 읽기 전용으로 확인.
- 시험용 파일 ID/비밀키는 공개 저장소에 기록하지 않음.
- 실제 Apps Script 프로젝트/배포 ID·버전, Script Properties, 합성 ACTIVE 신뢰기기와 실서버 인증은 확인되지 않음.
- 기존 인증 본체 Code.js의 getStudySheet_는 STUDY_NOTE_SPREADSHEET_ID로 열린 topic_study_data 이름 원장과 암기장 시트를 요구함.
- Stage3 PS3_context_는 PLANNER_SYNC_TEST_SPREADSHEET_ID가 STUDY_NOTE_SPREADSHEET_ID와 같으면 LIVE_BLOCKED.
- 따라서 실제 HMAC 검사를 위해서는 **운영과 독립된 합성 인증 원장** 및 **그것과 다른 ID의 합성 계획 원장**을 준비해야 함. 운영 신뢰기기/비밀키/실제 원본 원장을 시험용에 복사하지 않음.
- 테스트 Script 본체는 운영 Script의 설정과 Drive 파일을 참조하지 않도록 독립 설정·검증 필요.

## 3. 인증 라우트 시험 코드 (현재 미배포)
- Stage8 별도 호스트 브리지 파일은 test-only 코드이며 어느 운영 doGet/doPost에도 연결하지 않음.
- GET 세 액션 studyPlans, studyPlanSchedule, studyProgress만 허용하고, 기존 validateSignedGet_(['ACTIVE']) 결과를 확인해 PS3_get_에 전달.
- POST 네 액션 beginStudyPlanRevision, putStudyPlanChunks, commitStudyPlanRevision, saveStudyProgress는 기존 doPost 내 validateSignedMutation_(envelope,['ACTIVE']) 검증 성공 직후에만 브리지에서 PS3_post_로 연결.
- 기존 requestId/pollKey 멱등 상태·ACK/poll 처리를 보존하고, 클라이언트 공급 auth 객체를 검증 완료로 신뢰하지 않음.
- 브리지와 Stage3 서버 후보는 PLANNER_SYNC_MODE=ISOLATED_TEST 필요. 운영 Code.js나 배포 연결은 사용자 승인 전 변경 금지.
- Stage8 Node VM 보안검사는 실제 Code.js 내 검증 함수 원문과 **합성 세션 키/캐시/기기 표**로 수행. 실제 Apps Script 보안 PASS가 아님.

## 4. 실제 격리 Apps Script에서 해야 할 검증
1. 격리 Script 배포 ID/버전·속성·원장 접근 권한 확인
2. 합성 인증 원장 및 계획 원장 분리·TEST ONLY 마커 확인
3. ACTIVE 정상 HMAC 서명 GET/POST 7종 API 왕복
4. 무효 서명, PENDING/REVOKED/미등록 기기, nonce 재사용, 만료 타임스탬프 차단
5. operationId 중복, 응답 유실, 재시도, 계획/진도 CAS 충돌 및 충돌 원본 보존
6. 100일·5회독·3,812 토픽·19,060 일정, 8KiB 청크·SHA-256 완전 왕복
7. 청크 누락/중복/위변조, 분할 round 불일치, 중단·복구, 활성 revision 보존
8. 실제 요청 수, 크기, 지연, Apps Script 실행시간, Sheets 지연, LockService 경합, 호출 제한 실측
9. 결과 보존·비밀키 미로그·기존 사용자 데이터 완전 미접근 확인
실제 실측치가 없으면 합성 Node 19,060 PASS만 기록하고 실서버 성능은 BLOCKED.

## 5. 운영 출시 필수 회귀
- 오늘의 계획·시작일·회독·검색·필터·페이지당 10/20/30/50·신규 토픽·CSV/JSON·진도 복원
- 일반 학습정보(암기/미암기)·세 영역 동기화 성공/미전송/충돌 분리
- PDF·첨부·MuPDF·필기·오픈소스 고지·서비스워커·실제 신뢰기기 인증
- 합성 Node, 합성 Chromium, 실제 격리 Script/Sheets, 실제 운영, 사용자 PC·태블릿·스마트폰을 분리 보고
- 기존 study-note.html, service-worker.js, Code.js 바이트를 기준선과 비교
- 테스트 PASS는 운영 배포 승인이 아니며, 모든 차단 게이트가 PASS 전에는 출시 BLOCKED.

## 6. 사용자 별도 승인 1 — 코드 및 서버 운영 배포
1. 최신 main/Pages/Apps Script와 모든 PR·타 채팅 작업 재확인
2. 원본 소스·설정·중앙 데이터·이전 Apps Script 배포/복구 지점 확보
3. PR #82→#83 문서 → #84 수정 서버 후보 → #85→#86→#87→#88→필요시 #89의 의존성 순서로 통합 RC 재검토
4. PR #84/88 서버 add/add 충돌은 수정본 우선으로 명시 해결
5. 자동/격리 GAS/실제 Sheets/기존 기능 회귀 PASS·승인 SHA 보고
6. 사용자가 명시 승인한 범위만 main 병합 및 Apps Script 배포
7. 중앙 Sheets 신규 계획 관련 4개 시트만 승인 후 생성, 기존 MASTER/학습정보 원문 불변
8. GitHub Actions/Pages 실제 반영 및 인증/PDF/기존 학습정보 스모크 검사
9. 앱의 실제 사용자 최초 동기화는 계속 기본 OFF

## 7. 사용자 별도 승인 2 — 실사용 기기 최초 데이터 통합
1. PC, 태블릿, 스마트폰에서 각 기기의 전체 계획·진도·pending/conflicts/meta JSON을 개별 다운로드
2. 각 다운로드 파일 재선택, counts 및 SHA-256 재확인, 원본 파일 보관
3. 기준 기기 선택 후 7단계 마법사로 서버/로컬 계획·진도 미리보기
4. 일정 충돌, 완료/다시보기, 명시적 todo, 회독별 차이와 미전송을 원본 양쪽 보존 상태로 검토
5. 사용자 기기별 명시적 업로드/다운로드 승인 후 CAS·중복·충돌·중단 복구 확인
6. 서버 및 3기기 계획·진도 건수·SHA/rowRevision 대조, 실기기 UI/PDF/인증 검수
7. 장애 시 동기화 쓰기만 중단, 승인된 백업/작업 장부로 복구; 자동 덮어쓰기·삭제 금지

## 8. 최종 게이트
**운영 출시 PASS**는 실제 격리 Apps Script HMAC/nonce/ACTIVE·실제 Sheets 19,060건 안정성·기존 기능 회귀·복구 준비·사용자 승인 모두 충족한 뒤에만 가능. 미충족 항목이 하나라도 있으면 **BLOCKED**. 최초 실기기 데이터 통합은 별도 승인.
