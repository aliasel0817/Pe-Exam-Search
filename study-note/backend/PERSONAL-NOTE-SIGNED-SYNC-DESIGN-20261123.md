# 개인 노트 서명 동기화 개발 후보 — 운영 반영 금지 (2026-11-23)

## 현재 상태와 신뢰 기준
- 기준: GitHub `main` 2a906718d62d5e930793d3f097922a53729afe57.
- 개인 노트 작업 브랜치: `feature/personal-note-paint-local-v1-20261123`, Draft PR #96.
- 현재 운영 Apps Script의 실제 최신 전체 소스, Script Properties, 배포 ID 및 클라우드 저장소 설정은 **이번 세션에서 확보되지 않음**.
- 저장소 `study-note/mupdf-migration/r5/source/Code.js`는 참고용 이전 서버 소스 (기존 v21 기준)이며 **현재 운영 소스로 가정하지 않음**.
- Google Drive 연결에서 Apps Script MIME 검색 결과 0건, 등록된 원격 PC `DESKTOP-5H5J4TU`와 `aliasel` 모두 오프라인.
- **새 클라우드 기능은 아직 운영 및 실제 Google Apps Script에 적용되지 않음.**

## 작업 파일
- `study-note/personal-note.js`: 기존 토픽별/페이지별 편집기 + 클라우드 전송 연결 + 충돌 시 로컬 보호 + 편집가능 JSON 백업.
- `study-note/personal-note-cloud.js`: 기존 호스트 제공 `buildSignedGetUrl` / `sendSecureMutation`, ACTIVE 인증 상태 확인, 청크 분할, SHA-256, CAS, 읽기 전용 원격 복구.
- `study-note/backend/personal-note-sync-isolated.addon.gs`: Drive의 **독립 사설 시험용 폴더**에만 읽고 쓰는 서버 모듈, 구버전/운영 원장 수정 없음.
- `study-note/backend/personal-note-sync-signed-bridge.addon.gs`: 허용 action과 검증된 ACTIVE 컨텍스트만 전달하는 격리 라우팅 후보.
- `study-note/tests/test_personal_note_cloud_synthetic.cjs`: 모의 두 기기 동기화 및 CAS 충돌 테스트.
- `study-note/tests/test_personal_note_isolated_backend.cjs`: 실제 Drive에 접근하지 않는 모의 DriveApp/호스트 인증 테스트.
- `study-note/tests/test_personal_note_browser.cjs`: 합성 Chromium 브라우저의 페이지/배경/저장/팝업 최소 검사.
- `.github/workflows/study-note-personal-note.yml`: 개인 노트 전용 최소 검사(NO DEPLOY).

## API 계약 (운영 호스트 연결 전 시범 구현)
클라이언트 서명 GET:
- `personalNoteStatus`: 상태/스키마/청크 크기 확인 (ACTIVE+HMAC)
- `personalNoteDoc`: `{key,mode:'meta'}` 또는 `{key,mode:'chunk',revision,index}`
서명 POST:
- `personalNoteBegin`: `{key,baseRevision,hash,totalChunks,length}`
- `personalNotePart`: `{uploadId,index,chunk}`
- `personalNoteCommit`: `{uploadId}`

저장 키:
- `global`: 전체 토픽 공통 배경 등록 이미지와 표시 설정
- `index:<SHA256(topicId)>`: 토픽 통합 ID 및 페이지 순서
- `page:<SHA256(topicId)>:<pageId>`: 페이지별 필기·그림·사진 객체

문서는 JSON을 UTF-8/Base64url로 인코딩하고 최대 8MiB/문서, 16KiB씩 최대 512개 청크를 업로드. SHA-256을 검증한 후 서버 수정버전 CAS로 확정. 다른 기기의 수정이 발견되면 자동 덮어쓰기를 중단하고 로컬 자료를 보존.

## 서버 격리 활성 조건
```text
PERSONAL_NOTE_SYNC_MODE=ISOLATED_TEST
PERSONAL_NOTE_SYNC_FOLDER_ID=<별도 사설 시험용 Drive 폴더 ID>
PERSONAL_NOTE_SYNC_READY=READY:<동일 폴더 ID>
```
위 폴더 내부에 정확한 이름 `PERSONAL_NOTE_ISOLATED_TEST_ONLY` 마커 파일이 있어야 함. 누락되면 서버 모듈은 즉시 차단. 이 속성들을 운영 Script 또는 운영 Drive 폴더로 설정하지 말 것.

## 호스트 연결 요구사항 (실제 운영 서버 소스를 확보하고 비교한 후)
1. **실제 최신** `Code.gs`/확장 소스와 현재 배포버전을 읽기 전용으로 확보해 백업 및 대조.
2. 기존 `doGet`의 허용 action 분기에 `PN1_isGet_(action)` 조건이 있을 때만 `PN1_signedGet_(params)` 반환. 이 내부에서 반드시 `validateSignedGet_(...,['ACTIVE'])`를 호출.
3. 기존 `doPost`의 `validateSignedMutation_(envelope,['ACTIVE'])` 성공 이후 기존 분기에 `PN1_verifiedPost_(action,verified)`만 추가. HMAC, nonce, 세션, 요청 멱등성 및 mutationStatus 기존 함수 절대 수정 금지.
4. 별도 모듈의 Drive 폴더 외에 `topic_study_data` 및 LIVE MASTER 6개 학습/첨부 시트, PDF, 기존 동기화 시트 읽기/쓰기 금지.
5. 기존 보안 데이터에 비밀키나 사용자 ID를 로그·PR에 기록하지 않음.
6. 새로운 API가 정상 응답하기 전 클라이언트는 로컬만 저장하며, 클라우드 저장을 했다고 표시하지 않음.
7. 스테이징 ACTIVE 인증, 무서명/변조/nonce 재사용/PENDING/REVOKED 거부, 두 기기 왕복, 오프라인 재저장, 이미지·필기 무결성의 **필수 검수만 수행**.
8. 실제 운영 서버용 변경은 검증 및 **별도 사용자 승인** 없이는 적용/배포하지 않음.

## 중요한 미완료
- 실제 운영 Apps Script v23 소스·배포 계약 확인, 실제 Drive 폴더 스테이징 준비 및 서비스 연동 **미완료**.
- 서버 모듈 현재 모드 `ISOLATED_TEST`만 허용하며 운영 쓰기를 의도적으로 차단.
- 실제 ACTIVE 신뢰기기 간 왕복 동기화, 모바일 Safari/Galaxy Tab 실기기 및 브라우저 저장공간 한도 **미검증**.
- 메모 충돌의 자동 병합/화면 선택형 해결은 미구현. 현재 데이터 손실 방지를 위해 안전하게 중단.
- 대량 필기/사진의 DriveApp 저장 처리량·지연·쿼터와 테스트용 스테이지 청소 정책 실측 미완료.
- 실제 운영 main/Apps Script/Sheets/Drive·인증은 이 PR에서 수정하지 않았음.

## 후속 진행 원칙
- 개발 80% / 필수 검수 20%, 불필요한 검수 생략. 필요한 무손실/인증 검사는 유지.
- 매 작업 시작 시 GitHub 최신 main·해당 PR SHA·미병합 변경·실제 운영 소스 확인.
- 다중 채팅 원격 PC 소유권, 절대 경로, 작업 프로세스 분리.
- 작업 완료/미완료/미검증 및 다음 채팅용 복사용 작업요청서 제공.
