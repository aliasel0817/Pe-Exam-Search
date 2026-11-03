# M5 — 첨부 PDF MuPDF.js 전환 (격리 개발 전용)

**범위:** 학습노트 첨부 PDF의 멀티페이지 고화질 렌더링 엔진을 기존 PDF.js에서 M3/M4의 MuPDF로 **독립 개발 브랜치 내에서만** 연결. 서브노트·교재(M4)는 그대로 보존.

## 운영·AGPL 금지 게이트

- **기본 OFF.** `http://127.0.0.1:<port>/study-note/study-note.html?m4-local=1&m5-local=1` 또는 localhost의 정확한 opt-in일 때만 M5 실행.
- 공개 GitHub Pages, HTTPS 또는 제3자 호스트에서는 M5 개발 스크립트 로딩 자체가 비활성. MuPDF JS/WASM과 PDF.js 6.5.438 바이너리는 기존 M2 `.m2-private/` 비공개 스테이징만 사용한다.
- 기존 `fetchMediaContent(getApiUrl(),attachmentId)`의 `mediaContent` 조회 API를 그대로 호출. owner-only 쓰기 권한/인증 정책/첨부 데이터 구조/Server Script Properties를 변경하지 않는다.
- AGPL-3.0-or-later의 대응 소스/Apps Script 결합 범위 미확정. 공개 WASM, 외부 테스트 서버, GitHub Pages 배포, Apps Script 변경은 **금지**. 재사용한 M2 release gate를 우회하지 않는다.
- 회귀 테스트는 합성 PDF만 사용. 브라우저 실험에서 외부 웹 요청을 모두 차단하고 `mediaContent` API 응답을 합성 데이터로 가로채므로 실제 운영 Apps Script/Drive에 접근하지 않는다.

## 구현

- `m5-attachment-adapter.mjs`: M3 Worker 우선 / MuPDF main-thread 대체 / PDF.js 6.5.438 fallback에 대해 M4의 통합 엔진을 재사용하며 다중 페이지 bounds(CropBox/rotation), Canvas 렌더, 표시 영역 타일, 25MiB 첨부 PDF 제한, 36MiB 기본 페이지/32MiB 타일 예산, 문서 객체 자원 해제를 제공.
- `m5-attachment-ui.js`: 기존 PDF.js 페이지 보기 함수들에 비운영 분기만 추가. 원본 `renderPdfViewer`와 페이지 이동/축소/확대 버튼·터치·마우스 이벤트를 그대로 사용하면서 실제 `attachmentId:pageNumber` 주석 키와 기존 `schemaVersion=3 / normalized-0-1` 오버레이를 유지한다.
- 새 문서를 열거나 페이지를 변경하면 앞선 로딩·Worker·타일 요청을 AbortController와 serial로 취소하여 늦게 도착한 이전 페이지가 새 화면을 덮지 못하게 한다. 상태 칩에는 실제 렌더러(MuPDF.js/PDF.js)를 표시한다.
- `study-note.html`에 로컬 전용 게이트, 진입 분기, CSS 타일·상태 칩, 명시적 개발 스크립트 로딩만 추가. **기존 PDF.js 함수 내용은 분기 이후 원문 그대로 유지**.
- `tests/m5.test.mjs`: 8개 테스트 (로컬 게이트·기존 `mediaContent` API·첨부 메타데이터·주석·원본 복구·파일 크기·메모리 예산·자원 해제·스크립트 파싱).
- `tests/browser-smoke.mjs`: Windows Chrome 156에서 실제 `study-note.html`을 열어 합성 첨부 2개(첫 문서 2페이지, 두 번째 1페이지), 페이지 이동·회전CropBox·기본 고화질·3x 타일·마우스 스크롤·연속 페이지 요청·메모리 내 합성 필기 유지·PDF.js fallback·닫기·터치 핀치를 검증. **기기 에뮬레이션은 실기기 검수 아님**.

## 비운영 실행 방법

1. 다른 채팅의 작업 폴더와 프로세스를 조작하지 말고 **M5 기능 브랜치의 별도 Clone** 생성.
2. `study-note/mupdf-migration/m2`에서 `npm ci --ignore-scripts --no-audit --no-fund`, `node m2-stage-assets.cjs`, `node m2-verify-assets.cjs`.
3. `study-note/mupdf-migration/m3`에서 `npm ci --ignore-scripts --no-audit --no-fund`.
4. `study-note/mupdf-migration/m5`에서 `node --test tests/m5.test.mjs`.
5. 같은 M5 폴더에서 **이 작업이 관리하는 Windows Chrome만** `node tests/browser-smoke.mjs` 실행. 테스트 서버는 임시 `127.0.0.1` 포트이며 종료 후 외부 서비스에 잔여 프로세스를 두지 않는다. 테스트 파일은 외부 공개/업로드 금지.
6. `node --test study-note/mupdf-migration/m4/tests/m4.test.mjs` 및 기존 M3/M2/M1 검사를 실행. M4의 첨부 뷰어 불변 검사는 M5가 삽입한 **정확한 지역 분기 3줄만 제외하고 기존 코드 본문 전체가 byte-equal**인지 계속 검사하도록 M5 브랜치에서 보완했다.
7. CI는 `.github/workflows/mupdf-m5-attachment-viewer.yml`. 무조건 green으로 보고하지 않고 실제 GitHub Actions 상태를 확인한다.

## 합성 테스트 증거 — 2026-11-03

- 실제 Chrome 156: 첫 첨부 1페이지 2216×2955px, 2페이지(회전 CropBox) 2216×1773px, engine `mupdf-worker`, 정상 PDF 2페이지 페이지 이동.
- 별도 합성 첨부 1페이지 성공. zoom 3x에서 detail tile 18,982,048 bytes (< 32MiB), z-index tile 2 / 필기 3.
- PC 마우스 pan scroll x=1106→1251, y=668→758. 연속 페이지 요청 2→1→2를 병렬 요청해 최종 page2 및 정확한 annotation key 유지, 남은 타일 0.
- 메모리 내 테스트 스트로크 1개를 page1에 생성, page2 방문 후 page1으로 돌아와 스트로크 1개 복원: **서버·브라우저 저장소에 대한 영속 저장 검증이 아닌 메모리 호환성 테스트**.
- 강제 PDF.js 6.5.438 안전 복구 페이지 렌더, 창 닫기 후 문서 상태 해제 성공.
- Chrome 터치 에뮬레이션 pinch 1.8x 성공. 실제 Galaxy Tab S11 S Pen/iPhone Safari 검사 **미수행**.
- 테스트 중 원본 mediaContent 요청 4회 모두 가상 HTTP 응답으로 처리. 외부 나머지 요청 5건 차단. 실제 Apps Script/Drive 접촉 0, 변경 API 0, 오류 메시지 0.
- M5 8/8, M4 7/7, M3 16/16, M2 10/10, M1 10/10 자동검사 PASS. npm audit runtime 0건. M1 휴리스틱 민감정보 155파일 검사 0건.

## 남은 검수 및 위험

1. 실제 ACTIVE 신뢰기기에서 `mediaContent` 조회 및 서버 권한 정책이 정상인지 (읽기 전용) 검수 미실시.
2. 기존 사용자 PDF·필기 데이터 전체, 실제 필기 cloud sync 저장/복원, S Pen/손바닥 방지, iPhone Safari, 장시간 메모리/배터리 측정 미실시.
3. 서버 현재 소유자 검증 보강 후보(M1)는 운영 미적용으로, M5는 보안 정책을 **변경하지 않았지만** 서버 owner-only 권한의 완전성을 새로 증명하지 않음.
4. AGPL/대응 소스/Apps Script 결합 관계 법적 판단 미확정. 공개 배포 불가, 사용자 승인 전 main·Apps Script·GitHub Pages 운영 변경 절대 금지.

다음 단계 M6는 실기기 및 성능·필기 호환성 개발/검증이며, 자세한 요청서는 `M6-HANDOFF-20261103.md` 참조.
