# 학습노트 Phase 17 — PR #18 격리 미리보기 실기기 QA 준비·차단기록 (2026-10-15)

> **최상위 목적:** 운영 Google Sheets MASTER 원문을 보존하고, PWA X(특징)·Y(기술요소/구성요소)에서 검증된 한글 우선 요소별 독립 행을 표시. 번역 불확실한 기술명은 원문 유지하며 설명·알고리즘·단계·수치·수식·표준번호의 삭제·축약 금지. 기존 콘텐츠 감사 PR #8, PDF·TTS 작업, LIVE 정정은 본 작업에서 수행하지 않음.

## 1. 작업 재개 시 읽기 전용 직접 확인
- 운영 `main` `6e8527497a519a5da35e6838209aa628892e5ff9`; PR #18 출발 HEAD `9208eca7d15502d2994cd52c9a8087109337489d`, Draft/Open/미병합(38커밋·15파일); 기존 PR #8 HEAD `ea9027d32bf6106c6d1d068c1d4f02e16cff00d1`, Draft/Open/미병합.
- `MASTER-DISPLAY-VISIBILITY-RAW-DATA-PRESERVATION-RECHECK-20261014-KO.md`(PR #8)와 Phase 16 검증 기록 재조회.
- 기준 HEAD의 Chrome Actions `38741145284`, WebKit `38741145382`, 기존 회귀 `38741145327` 모두 Success임을 조회.
- 운영 LIVE Google Sheet `암기장` 메타데이터 재확인: 3,860행(헤더 포함), 26열. A열을 읽어 9개 대표 토픽 위치 확인; 연결된 Sheet 읽기 전용으로 X/Y 실자료 9토픽 확보, 통합ID·학습대상 Y 대조 통과. **LIVE 쓰기 0셀**.

## 2. Windows 물리 호스트의 비헤드리스 Chrome 실행: 실제 완료 범위
- 집 PC `aliasel`에 Desktop Commander로 접근하여 Windows 대화형 세션 **1**(Explorer도 세션 1)에 연결되어 있음을 확인, Chrome 실행파일·Node·기존 QA 의존성 확인.
- 별도 Windows TEMP 경로 `%TEMP%\study-visibility-phase17-20261015`에 격리 프로필 `browser-profile`을 사용하여 Windows Chrome **headless:false**(실제 GUI 실행)를 시작.
- **`PHASE17_HEADFUL_SMOKE_PASS`**: 단순 비공개 `data:` 페이지의 제목·텍스트·뷰포트를 Chrome DOM에서 확인. Chrome UA 155.0.0.0.
- **이 성공은 PR #18 HTML 실행, 사용자 로그인, 실제 운영 PWA 조작 또는 X/Y GUI QA 성공을 뜻하지 않음.** 이전 Phase 16의 headless 데이터 QA와 분리 보고.

## 3. 실제 LIVE 원문 화면검수 후보 9개
- T1362: 소수점 주파수 `13.56MHz` 및 NFC 구성요소
- T2801: IEEE/WAVE 표준번호·긴 설명
- T3332: Y 952자 장문, 중첩 영문/한글, 모바일 줄바꿈
- T4036: X 쉼표형 6개 특성·Y 기존 번호형
- T4038: 이미 작성된 X 하이픈 줄 및 Y 계층형 번호
- T3297: Y 기존 단계 번호, X 복합 번역
- T2133: PDF/CDF 수학 용어·수식형 표기
- T4037: 기존 X/Y 공란
- T0001: 검증된 X 한글 우선 영문 병기
- 해당 X/Y 문자열은 공개 문서·PR 커밋에 복사하지 않음. QA 용 비공개 JSON을 집 PC TEMP `study-visibility-phase17-20261015\live-preview-private.json`에 쓰는 동작은 성공 응답을 받음. **원격 연결 장애로 파일 삭제 여부를 확인하지 못했으므로 다음 연결 성공 시 삭제 확인 필요**. 해당 데이터는 원래 사용자가 관리하는 집 PC 안에만 복사함.

## 4. 원격 장애 및 미완료 명시
- PR #18 HEAD HTML을 집 PC TEMP로 읽어오는 `Invoke-WebRequest` 원격 명령이 무응답 타임아웃; 파일 실제 복사 완료 여부는 미확인.
- 이후 Desktop Commander `ping`·`get_file_info`가 실행 대기 후 최종 타임아웃. **동일 명령을 반복하거나 파일 다운로드를 성공으로 보고하지 않음**.
- 회사 PC `DESKTOP-5H5J4TU`: 기기 목록 온라인이나 명령 실행 `spawn EPERM` 재현.
- **PR #18의 실제 DOM을 GUI Chrome에서 열어 클릭하는 Phase 17 검수는 미실시**; PC 실제 로그인·운영 데이터 네트워크·PWA 캐시, iPhone 16 Pro Safari, Galaxy Tab S11 실제 브라우저·회전·터치·하단 안전영역은 모두 미검증.
- 현재 보안·가용성 범위에서 LAN 공개 서버, 외부 프록시, 새 GitHub Pages 배포, 터널, OAuth/권한 변경은 실행하지 않음.

## 5. PR 미리보기 격리의 읽기 전용 소스 검토
- PR #18 `study-note/service-worker.js`: `CACHE_NAME=pe-study-note-shell-v4-6-3-rgb-keyboard`, HTML GET에 network-first(`cache:no-store`)와 cache fallback. HTML 응답의 캐시 내용은 새 HTML을 온라인 조회한 뒤 갱신될 수 있음.
- `study-note.html`의 `init()` 경로에서 동일 상대경로 `./service-worker.js` 등록, IndexedDB 로딩과 운영 데이터 복구 흐름 실행. 따라서 **운영 Pages와 같은 origin/scope에서 임의의 미리보기를 실행하지 않음**.
- 후속 미리보기는 PR 고정 SHA 파일을 `http://127.0.0.1`의 **로컬 전용 origin**에서 실행하고 테스트 복사본에서 init/OAuth/Apps Script/서비스워커 등록을 비활성화, 외부 네트워크 차단. 별도 임시 Chrome 프로필 사용, MASTER 원문은 임시 메모리 렌더링만 허용.
- 이 안전한 미리보기 방법은 **코드 검토로 작성한 실행 계획**이며, Phase 17에서 앱 자체 화면 검증까지 실행했다고 주장하지 않음.

## 6. 원문보존·진행률·다음 정확한 작업
- Phase 15·16에서 검증한 X 구조적 목록 **3,798/3,800셀**, Y **3,796/3,800셀**, 합계 **7,594/7,600=99.92%**는 이전 단계 실적. 이번 Phase 17에서 렌더러를 수정·재실행하지 않았으므로 완료 수 신규 증가 **0셀**, 새로운 무손실 검증 완료 **0셀**.
- X/Y 직접 표시 잔여 6셀은 이전 확인된 공란/기작성 번호 구조 보존이며 부당한 강제 분리 금지. 기술적 의미 전수검수와 PDF 원본 감사 등 별도 집계 유지.
- 역사적 원문 의미 손실 최소 3셀(`T0493/X`, `T0466/W`, `T0521/X`)은 원문 화면 표시 개선과 별개, 사용자 승인 전 복원 보류. LIVE 정정·복원 적용 **0/3**.
- **실제 사용자 PC·태블릿·모바일 통합 QA 0/3 유지**. Windows GUI Chrome 시작 시험은 독립 사전조건 통과이며 PC 로그인 실기기 QA의 완료로 합산하지 않음.
- 앱 코드 수정 0, 기존 테스트 수정 0, `main` 병합 0, 운영 배포 0, PR #8 변경 0. Apps Script 저장/함수 실행/재배포 모두 불필요.
- 다음 재개 순서: 집 PC 원격 복구 여부 **1회만 확인** → TEMP의 PR HTML 다운로드 상태·비공개 JSON·Chrome 임시 프로필 상태 확인 → 로컬 `127.0.0.1` 미리보기에서 PR 고정 SHA 검증 후 X/Y 항목 원문·스크롤·실제 버튼 이동을 비헤드리스 Windows Chrome에서 검증 → 즉시 비공개 샘플·캡처 정리 → iPhone/Galaxy는 실제 기기 접근 가능한 시점에 별도 검수, 자동화와 구분 → 결과 검증 후에만 후속 체크포인트 기록.
- 운영 `main`, LIVE, PR #8 변경 및 PR #18 병합은 금지 상태 유지.
