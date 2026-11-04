# R4 — 운영 반영 전 최종 준비·점검·복구 실행계획 (DRY-RUN 문서, 미실행)

**작성일:** 2026-11-04. **R4에서 운영 변경/병합/배포 실행 금지.**

## 0. 정확한 적용·승인 단위

- GitHub 저장소: https://github.com/aliasel0817/Pe-Exam-Search
- 운영 main/integration R4 착수 기준: `e758fc3145add56f151ec4231927001c28a142b6`.
- 누적 Draft PR #52~#62, R4 Draft PR은 생성 후 번호/HEAD를 실제로 채울 것.
- R3 시작 HEAD `6e1cd8de3f2be35033490a001c364b110a4d79ad`; R4의 실제 최종 SHA는 GitHub 확인 후 기록.
- 실제 운영 Apps Script 기본 배포는 R2 당시 **버전 21**이 확인되었으나, 향후 재조회 필수.
- 운영 Pages URL: https://aliasel0817.github.io/Pe-Exam-Search/study-note.html
- 발효 전 확인 필요: GitHub Actions 자동 배포 트리거, app의 기본 PDF.js 3.11.174/CVE-2024-4367 대응, R3/R4 M2 배포차단 게이트, 성능/실기기, rollback.

## 1. R4 준비된 개발물

- Artifex AGPL 법률 적용 분석/상용 경로 선택지: `R4-AGPL-LEGAL-ASSESSMENT-20261104.md`.
- AGPL 전문 `licenses/AGPL-3.0.txt` — npm M2 SHA 일치.
- 고지/무보증/저작권 UI `r4-license-notice.js` — **루프백 개인 미리보기로만 활성화**, 존재하지 않는 소스 링크 노출 금지.
- 대응 소스 목록 초안 `R4-SOURCE-CATALOG-DRAFT.json` — Git 추적 파일명·SHA 목록만, **완전 소스 제공이 아님**.
- 정적 비밀정보/배포 승인 검사 `r4-release-readiness.cjs` + `r4-approval-state.json` — NO-GO 유지. 법률·운영 승인 없는 상태를 GO로 전환하는 코드는 없음.
- R3의 실제 MuPDF 1.28.1 원본·18개 모듈은 이전 독립 `.r3-private/`에 **보존**. 본 R4 PR/CI에는 포함하지 않음.

## 2. 출시 차단 해소 후 실제 배포 **전** 확정할 사항

1. **라이선스 선택**:
   - AGPL: Artifex/전문가가 승인된 해석에 따라 프런트 및 필요한 Apps Script·개발 스크립트·제3자 소스의 대응 범위를 확정하고 실제 누구나 접근 가능한 대응 소스 URL 생성. 버전별 소스/바이너리 일치(정확한 SHA 동일성 자체는 필수조건이 아님), 라이선스 전문·NOTICE·변경 고지·권리 보존.
   - 상용: 실제 브라우저 배포·Apps Script 연동 및 사용자 수를 포함한 서면 계약을 체결하고 계약에 맞는 고지/지원 조건 확인.
2. **WASM 출처/빌드 증거**: Linux EMSDK 4.0.8/Node22/정확한 1.28.1 소스+18 submodules로 실제 `npm run prepack` 실행 및 dist/source/도구/패치/의존성 기록; byte-for-byte 일치 실패 이유 추적(해시 불일치만으로 라이선스 자동 FAIL 판정 금지).
3. **실서버 안전성**: 인증 원본 PDF signed GET이 기기 마지막 접속 시각을 바꿀 수 있는 점을 포함한 사용자 승인, 격리된 계정·시트·테스트 PDF·필기 백업/복구 확보. ACTIVE/PENDING/REVOKED, owner-only 및 schema3 저장·복원 검증.
4. **실기기**: Galaxy Tab S11 실제 S Pen·손바닥과 iPhone 16 Pro Safari 핵심 검수 또는 명확한 허용 위험/잔여 차단 결정.
5. **공개 전에 비밀정보 검사**: 공개 가능한 실제 전체 소스 패키지를 정밀 검토해 Script Properties, Drive ID, 세션/서명 키, 사용자 PDF/주석 등이 빠졌는지 확인. 자동 스캐너 0건만으로 안전 보증 금지.
6. **정확한 승인 요청서**: 승인될 R4/누적 PR SHA, 메인 병합 방향, Apps Script 수정 유무/배포 ID/버전, Pages URL, MuPDF 바이너리/라이선스 URL, 복구 계획을 사용자에게 보여주고 **별도 명시 승인**을 받는다.

## 3. 별도 승인받은 **다음 단계**에서만 실행할 운영 순서

1. 대상 PC·작업 폴더·Git status·원격 head/main/integration·미병합 PR·타 채팅 세션 소유권 재확인.
2. 운영 소스·기존 GitHub Pages commit, 운영 Apps Script 실행 버전, 설정·필기/주석/파일의 승인된 **비밀 백업** 및 복원 가능성 확인. 백업은 공용 Git/CI에 업로드 금지.
3. 통합 순서는 **M1→M2→M3→M4→M5→M6→M7→R0→R1→R2→R3→R4** 의존 관계 고려. 모든 PR이 같은 integration base를 가리키는 누적 PR이라는 점에 주의: 각 PR을 무조건 순차 squash/중복 병합하지 않고, 최종 검증된 누적 브랜치 트리와 diff를 확인해 단일 통합 계획 수립.
4. 별도 통합 검증 브랜치에서 CI 및 중요한 기존 PDF/주석/인증·학습 UI를 점검. 우발적으로 Pages 자동 배포가 일어나지 않도록 먼저 workflow 트리거 확인.
5. 사용자 승인한 방식으로만 main 병합; 새 GitHub Actions 결과와 실제 Pages 배포 commit 확인.
6. Apps Script 변경이 명시 승인된 경우에만 기존 deployment/버전 및 Script Properties 보존하면서 승인 범위의 push/version/deploy. 미승인 Code.gs 수정/배포 금지.
7. MuPDF 바이너리/라이선스 고지를 법적으로 허용된 방식으로 배포하고, **실제** 공개 소스 링크가 배포 버전과 대응하는지 브라우저에서 확인. 그때만 로컬 고지 UI를 승인된 운영 고지 UI로 승격.
8. Windows PC/Tab S11/iPhone Safari, 서브노트·교재·첨부 원본 PDF, schema3 필기 저장/복원을 승인된 안전범위에서 검증. 핵심 결함 발견 시 운영 중단/승인된 rollback 절차.
9. 실제 GitHub Pages·Apps Script 배포와 원본 데이터, 사용자가 확인한 결과를 기록하기 전에는 운영 완료로 보고하지 않는다.

## 4. 복구·롤백의 기본 정책 (자동 실행 스크립트 없음)

- Pages: 기존 확인된 `main` SHA 및 이전 Pages 배포 workflow/run ID를 보존. 롤백은 **별도 사용자 승인과 충돌/의존성 확인**을 거친 복구 커밋·PR로 수행. git reset/force push 금지.
- Apps Script: 이전 확인된 **운영 버전 21** 및 배포 ID/Script Properties를 기록. 새 버전이 실패하면 **별도 승인**을 받고 동일 배포의 이전 안전 버전으로 되돌리는 방법을 검토. 실제 백업 없는 비밀키/소유자/ACL 변경 금지.
- 파일/필기: LIVE MASTER·Drive PDF/첨부/주석은 복구 전 백업·실사용 버전의 schema3/normalized 좌표 확인. 실제 데이터 복구를 테스트 격리 사본 밖에서 임의 실행 금지.
- 모바일 고배율 메모리/배경 복귀 문제: 승인된 원상복구 계획 외에 공용 서버/PID 일괄 종료 금지.

**이 문서에서 실제 배포·병합·서버 변경·사용자 데이터 쓰기는 수행하지 않았음.**

## 5. 최종 판정과 다음 사용자 액션

현재 **NO-GO**. 사용자가 법률 경로 선택(AGPL 전체 소스 공개 vs Artifex 상용 계약), 개인 물리기기/격리 데이터 검수 방법, 운영 대상 승인 범위를 결정해야 다음 단계에서 배포 가능성 재평가가 가능함. 미확정 조건을 자동으로 PASS 처리하지 않는다.
