# 학습노트 — 개인 노트(그림판) 후속 개발 인계서 v2 (2026-11-23)

## 변경 관리 (사실 기준)
- 저장소: aliasel0817/Pe-Exam-Search
- 운영 기준 main: `2a906718d62d5e930793d3f097922a53729afe57` (2026-11-23 조회 당시)
- 작업 브랜치: `feature/personal-note-paint-local-v1-20261123`
- Draft PR: https://github.com/aliasel0817/Pe-Exam-Search/pull/96
- 최근 기능·구문 수정 커밋: `5bcff5d9b3dd573eda8fba941771f6b17142791c` (이 문서 갱신 이전)
- 운영 main 병합: 하지 않음. GitHub Pages/Apps Script 배포: 하지 않음. Google Sheets LIVE MASTER 학습원문 변경: 하지 않음.
- 원격 장비 `DESKTOP-5H5J4TU`, `aliasel`: 2026-11-23 조회 시 모두 Offline. 실제 기기 검사 미완료.
- 원격 PC 공용 세션/PID/파일 삭제 또는 종료 명령은 실행하지 않음.

## 사용자가 확정한 요구사항
1. 기존 개인메모 입력창과 메모 저장 버튼 유지, 버튼 왼쪽에 개인 노트 추가.
2. 팝업 상단 현재 토픽명/공통 배경 체크/이미지 등록, 중간 그림판, 하단 접이식 도구/취소/저장.
3. 배경 이미지와 체크 여부 모든 토픽·모든 페이지 공통, 체크 기본 ON.
4. 토픽 통합ID마다 독립 다중 페이지.
5. 펜, 형광펜, 도형, 텍스트, 사진 추가·붙여넣기, 이동·크기, 지우개, 되돌리기.
6. 팝업은 외부 클릭·ESC로 닫지 않고 취소로만 닫기, 저장 시 팝업 유지.
7. 토픽·페이지 저장, 다시 열기·수정, 데이터 무손실, PC/태블릿/폰 간 동기화 목표.
8. 개발 80% : 필수 검수 20%, 비필수 검사 생략.

## 실제 개발 완료 — 브랜치에 코드 작성됨
- `study-note/study-note.html`: 개인 노트 버튼·독립 CSS/JS 로드.
- `study-note/personal-note.css`: PC·모바일 반응형 노트 팝업.
- `study-note/personal-note.js`: Canvas 그림판, 토픽별 복수 페이지, 공통 배경, 사진, 로컬 IndexedDB 분리 저장, JSON 전체 백업 및 가져오기, 서버 복원 버튼, 명시 저장/취소 보호, 원격 데이터 검사.
- `study-note/personal-note-cloud.js`: 기존 `buildSignedGetUrl`, `sendSecureMutation`, `hasActiveSecuritySession` 사용. REST-like signed API를 통하여 Base64url 분할/합치기, SHA-256, CAS 업로드, 서버 조회, 로컬 충돌 시 덮어쓰기 차단.
- `study-note/backend/personal-note-sync-isolated.addon.gs`: Google Apps Script용 독립 사설 Drive 폴더 시험 저장소. `PERSONAL_NOTE_SYNC_MODE=ISOLATED_TEST`, 승인 폴더 ID/READY/마커가 모두 없으면 fail-closed.
- `study-note/backend/personal-note-sync-signed-bridge.addon.gs`: 기존 서명 GET/POST 검증 뒤만 호출하는 API 게이트 후보. **실제 운영 Code.gs에는 병합·삽입하지 않음.**
- `study-note/backend/PERSONAL-NOTE-SIGNED-SYNC-DESIGN-20261123.md`: 명세, 보안·릴리스 차단, 백엔드 통합 위치.
- 테스트 `study-note/tests/personal-note-basic.test.mjs`, `study-note/tests/test_personal_note_browser.cjs`, `study-note/tests/test_personal_note_cloud_synthetic.cjs`, `study-note/tests/test_personal_note_isolated_backend.cjs`.
- CI `.github/workflows/study-note-personal-note.yml`는 GitHub Actions용 필수 검사만, **NO DEPLOY**.

## 검증 팩트
- 이전 커밋 `78f9357df3bb14d51df7b9f9899c85dc4ab6ccd2`의 전용 정적/서버 합성 테스트 PASS.
- 전용 합성 Chromium 브라우저 필기·다중 페이지·공통 배경·로컬 저장·다시 열기·팝업 종료 방지 PASS (전용 브라우저 테스트).
- 위 검사는 실제 운영 페이지/운영 Apps Script/실제 Galaxy Tab S11/iPhone Safari PASS가 아님.
- 마지막 이미지 URL 검증식 수정 후 `5bcff5d9b3dd573eda8fba941771f6b17142791c`의 전용 CI 최종 결과는 다시 조회할 것 (이 문서 작성 시 큐 대기).

## 미완료 — 절대 완료로 주장 금지
1. 현재 운영 Apps Script **최신 실제 코드** 확보 및 배포중인 원본과의 비교. `study-note/mupdf-migration/r5/source/Code.js`는 과거 v21 참조 소스일 뿐 실제 v23 전체 소스가 아님.
2. 실제 사설 테스트용 Drive 폴더/마커/Script Properties 준비 및 Apps Script API 연동·서명 GET/POST 실측.
3. 합성 2기기 테스트는 있지만 **ACTIVE 신뢰기기 2대의 실제 Google 서버 동기화 왕복** 미검증.
4. 페이지별 대량 이미지 데이터·DriveApp quota·동시 세션 충돌 및 오프라인 처리 실측.
5. 운영 안전 패치와 프로덕션 스키마/연동(현재 서버 애드온은 의도적으로 테스트 모드만 지원).
6. 기존 학습 원문/PDF/주석/첨부와의 전체 통합 실기기 회귀검증.
7. 사용자가 명시 승인하기 전 운영 main 병합·GitHub Pages 배포·운영 Apps Script 수정 절대 금지.

## 다음 우선작업 (8:2)
1. 현재 main/PR #96/마지막 CI 정확한 SHA·상태 다시 확인.
2. 필수 CI 오류만 수정. 브라우저/동기화 데이터 무손실·인증 위반은 필수 검사로 유지.
3. 실제 운영 Apps Script 최신 서버 소스를 **읽기 전용**으로 확보하여 서명 경로/기존 기능/스키마 대조. 확보 불가면 섣불리 서버 통합하지 않음.
4. 운영 원장/Drive와 전혀 다른 사설 시험용 폴더에서 ACTIVE/HMAC 서명, nonce 재사용 거부, 2기기 동시 편집/충돌, 여러 페이지·공통 배경 왕복 **필수 검증**.
5. 그 결과로 운영용 분기와 기능 활성화 게이트를 별도 브랜치/PR에서 준비, user 승인 전 deploy 금지.
6. PC Chrome/태블릿 S Pen/iPhone Safari 필수 확인. 장비 오프라인이면 '미검증'으로 보고.
7. 작업 종료 때마다 완료/진행필요/미검증 + 새 채팅 복사용 요청서 제공.

## 복사해 사용할 다음 채팅 작업요청서
개인 노트(그림판) PR #96를 이어서 개발해줘. GitHub aliasel0817/Pe-Exam-Search의 feature/personal-note-paint-local-v1-20261123 브랜치와 최신 main/미병합 PR을 먼저 비교하고, 실제 작업 파일·CI 결과를 검증해줘. 현재 브랜치는 로컬 그림판 및 다중 페이지, 공통 배경, 사진, JSON 백업/복원, 별도 클라우드 동기화 클라이언트와 격리 Google Apps Script 서버 후보를 작성한 상태지만, 실제 최신 운영 서버 소스/서버 연동/ACTIVE 실기기 왕복은 아직 확인되지 않았어. 다음 우선순위는 실제 운영 Apps Script 최신 원본 읽기 전용 확보, 독립 사설 시험 저장소에서 서명 API 통합 검증, 안전한 운영 연결 후보 마무리야. 개발:필수검수=8:2, 비필수 검수 생략, 학습 원문/PDF/첨부/주석/보안 기존 기능 보존. 사용자 승인 없는 main 병합/운영 배포 절대 금지. 각 작업 완료마다 실제 완료·미완료·미검증·브랜치/PR/SHA와 복사용 차기 작업요청서를 제공해줘.
