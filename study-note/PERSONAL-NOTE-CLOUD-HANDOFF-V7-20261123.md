# 개인 노트 Google 클라우드 동기화 후속 인계 v7 (2026-11-23)

## 이미 운영 반영된 항목 — 중복 배포 금지
- PR #96: 브라우저 로컬 개인 노트 그림판 초기 운영 배포 완료
- PR #97: A4 794×1123, 답안지 라인 배경, 기본 100% 확대·축소, 스크롤/손 도구, 모바일 버튼, 사진 이동 범위, 도형·펜 도구 운영 `main` 병합 완료
- 최신 운영 PR #97 병합 커밋: `37c53067f856e3f9d5733baf8349495a0ca6e7f1`
- Pages Actions Run #45141140645: build/report/deploy SUCCESS
- 원격 PC에서 운영 `study-note.html`, `personal-note.js`, `assets/personal-note-answer-sheet-a4.svg` HEAD 응답 200 OK 및 2026-11-23 08:45:31 GMT 수정 시각 확인
- 개인 노트 필수 합성 Chromium/정적 CI(기존 PR #97의 Run #45140146777): SUCCESS. 별도 Windows 오프라인 캐시 테스트는 `sw-install` 단계에서 Puppeteer Runtime.callFunctionOn timeout FAIL. 사용자 실사용 검수 및 오프라인 동작 검수는 미실시.
- LIVE MASTER 기존 학습 원문, 운영 Apps Script 및 기존 PDF/필기/첨부/보안에는 쓰기 작업 미실시.

## 클라우드 동기화 진행 상황
- 운영 페이지의 공개 Apps Script 배포 URL은 `study-note.html` 소스의 `DEFAULT_API_URL`로 확인함. **배포 URL은 소스 프로젝트의 Script ID가 아니며 v23 운영 서버 원본 확보를 대신하지 못함.**
- 원격 장비 `DESKTOP-5H5J4TU` 온라인, `clasp list --json`은 기존 격리용 Apps Script 3개만 조회. 운영 v23 원본 프로젝트는 동일 계정 목록에서 확인되지 않음.
- 현재 repo `study-note/backend/personal-note-sync-isolated.addon.gs` 및 `personal-note-sync-signed-bridge.addon.gs`는 실제 운영 배포되지 않은 `ISOLATED_TEST` 전용 서버 후보. 클라이언트 `personal-note-cloud.js`는 운영 서버가 `personalNoteStatus` 서명 API를 지원할 때만 동작.
- 운영 Apps Script 소스/ACL이 불명확하므로 운영 서버에는 개인 노트 API를 추가하거나 운영 저장소·MASTER를 수정하지 않았음.
- 따라서 **PC/태블릿/스마트폰 실제 Google 클라우드 동기화는 미완료·미검증**. 사용자는 현재 각 브라우저 로컬 저장 및 JSON 백업을 이용해야 함.

## 이번 후속 작업: 완전히 독립된 Google Apps Script 시험 프로젝트
- 현재 채팅에서 `DESKTOP-5H5J4TU`의 독립 절대 경로 `C:\Users\user\Dev\PePersonalNoteIsolated20261123` 생성. 타 프로젝트/채팅 작업 폴더에 쓰기 없음.
- 전용 standalone Apps Script 프로젝트 `PePersonalNoteIsolated20261123` 신규 생성 및 프로젝트 자체에만 `clasp push` 성공.
- 복사한 파일: `appsscript.json`, `pn_isolated_server.gs`, `pn_signed_bridge.gs`, `pn_stage_readonly_test.gs`. 운영 배포 및 서버 속성 설정하지 않음.
- `pn_stage_readonly_test.gs`은 `PropertiesService` READ-ONLY, ACTIVE/PENDING 차단·무설정 서버 차단·키 유효성 검사만 수행하는 의도이며, 구글 Drive 쓰기 명령 없음.
- `clasp status`에서 위 4개 파일 추적 확인. `clasp run PN1_stageSelfTest` 시 Google 측 `NOT_FOUND` 오류가 발생했으므로 실행 결과는 **PASS가 아니며 미검증**. 원인을 추측하지 말고 스크립트 API 권한·실행 가능 설정/액세스를 확인할 것.
- 운영 Apps Script 프로젝트 및 기존 사용자 데이터에는 아무 작업도 하지 않음.

## 다음 개발 우선순위 (개발 80 : 필수 검수 20)
1. 운영 배포된 Apps Script v23 **전체 소스 및 Script ID를 읽기 전용으로 확보**. 적법한 Google 계정에서 Script 프로젝트 공유 또는 해당 운영 프로젝트에 대한 연결 권한이 필요함.
2. 배포 중인 실제 보안/서명 인증(GET `validateSignedGet_`, POST `validateSignedMutation_`, ACTIVE·HMAC·nonce·owner)·저장소 구조·기존 데이터 스키마를 확인. 운영 원본 없이 추측 병합 금지.
3. 새 독립 시험 프로젝트에서 전용 Drive 폴더/마커/Script Properties를 사전 승인된 절차로 준비하고 Apps Script 함수를 실제 실행해 격리 파일 CAS, chunk SHA256, 2기기 다중페이지/배경 이미지/사진 왕복을 확인. `NOT_FOUND` 문제를 먼저 해결해야 함. 시험 데이터 외 접근 금지.
4. 실제 운영 소스와 비교한 정확한 부분적 패치만 별도 브랜치/PR에 만들고 기존 인증·MASTER·PDF/필기/첨부·기기 등록 보존.
5. 사용자 별도 승인 이후 개인 노트 운영 Apps Script 배포·Pages 연동/실제 ACTIVE 왕복. 기존 PR #97의 프런트엔드 운영 배포는 완료된 작업으로 유지.
6. 검증/미검증 및 최신 main/PR/커밋을 정확하게 보고. 비필수 검수는 사용자 사용 중 문제 보고 시 수정.

## 새 채팅에 복사할 요청
학습노트 개인 노트 클라우드 동기화 개발을 이어서 진행해줘. PR #96 로컬 기능과 PR #97 A4·답안지·확대축소·스크롤·모바일 UI는 운영 main에 병합되고 Pages가 배포됐으니 반복하지 마. 운영 커밋은 `37c53067f856e3f9d5733baf8349495a0ca6e7f1`. 전용 격리 테스트 Apps Script 프로젝트 `PePersonalNoteIsolated20261123`이 회사 PC DESKTOP-5H5J4TU의 `C:\Users\user\Dev\PePersonalNoteIsolated20261123`에 생성되어 코드 4개 파일을 clasp push했으나 clasp run은 NOT_FOUND로 실제 실행 미검증이야. **현재 운영 v23 Apps Script 전체 원본 및 Script ID는 확보하지 못했어**. 먼저 적법한 운영 계정 연결/프로젝트 공유를 통해 소스를 읽기 전용 확보하고 기존 ACTIVE/HMAC/nonce 인증을 분석해. 이후 독립 시험 전용 Drive 폴더를 사용해 실서버 왕복을 검증한 뒤 새 운영 패치 PR을 만들어줘. 사용자 승인 없는 추가 main 병합·운영 Apps Script 배포는 금지. 기존 LIVE MASTER 학습 원문·PDF·필기·첨부·주석·인증 설정 보호. 개발/필수 검수 비율 80:20, 비필수 사용자 실사용 검수, 기기 공유 기능은 실제 검증 전 완료로 주장 금지. 항상 완료/미완료/미검증과 PR/SHA를 보고해줘.
