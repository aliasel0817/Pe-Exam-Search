# R3 — Artifex / 자격 있는 법률 전문가 서면 확인 질문서 (미발송)

**작성일:** 2026-11-04 (Asia/Seoul)
**문서 성격:** 법률 상담을 위한 기술 사실관계와 질문 초안. **법률 자문·판정이 아니며 발송되지 않았음.**

## 1. 실제 시스템 구조

- GitHub Pages 정적 프런트엔드: `study-note/study-note.html`, `service-worker.js`.
- 원본 PDF 고화질 렌더: browser/Worker 내 MuPDF.js `mupdf@1.28.1` 및 JS/WASM.
- 대체 렌더: PDF.js 6.5.438 (비운영 브랜치), 기존 운영 PDF.js 3.11.174.
- 원본 PDF 조회: 별개 Google Apps Script HTTPS API의 `referencePdfContent` ACTIVE 기기 signed GET. 서버 측 등록 Sheet의 페이지·파일 매핑으로 Drive PDF 식별.
- 첨부 PDF 조회: 기존 공개 `mediaContent` GET 정책 보존.
- 학습원문: Google Sheets LIVE MASTER; 원본 PDF/이미지/첨부: Google Drive; 사용자 필기: schema 3, normalized 좌표, 사용자/페이지/첨부 key 및 서버 동기화.
- 인증: Google 계정 소유자/ACTIVE 기기 기반, HMAC·timestamp·nonce·session TTL, Script Properties에 보호해야 할 비밀키 존재.
- 브라우저 프런트·Apps Script API·사용자 PDF·사용자 필기는 운영 중 실제로 상호작용하지만, 소스·비밀정보·사용자 자료를 동일하게 공개할 수 없음.
- 아직 MuPDF JS/WASM을 외부 배포하지 않았고, 운영 main에 병합하지 않았음.

## 2. 소스·빌드 관련 확인 사실

1. npm 패키지 `mupdf@1.28.1` 라이선스 표시는 `AGPL-3.0-or-later`; Artifex는 AGPL/상용 이중 라이선스 안내.
2. npm 패키지 gitHead 및 정확한 upstream 릴리스 소스 커밋 `20061bd45183f5a2bff8f43675e4da91e5ac2901` 일치 확인.
3. 실제 upstream 소스와 하위 모듈 18개를 R3 전용 비공개 디렉터리에 원본 git SHA로 체크아웃.
4. 공식 1.28.1 `tools/build.sh`는 EMSDK **4.0.8**, Linux, `BUILD=small`을 기본으로 사용. 기능 제외/컴파일 정의는 소스 매니페스트 참조.
5. npm 1.28.1 패키지 JS·WASM·LICENSE 파일 4개의 해시와 크기가 이전 M2 잠금 파일과 일치.
6. 현재 Windows 원격 PC의 Linux/EMSDK/make 조건 미충족으로 **실제 C→WASM 재빌드 및 동일 바이너리 확인은 미완료**.
7. `platform/wasm`의 upstream 1.28.1 소스에는 package-lock이 없고 npm 일부 의존성에 범위/최신 지정이 있어, 정확한 게시 바이너리의 도구/의존성 잠금 증거가 추가로 필요함.

## 3. 법률 질문 — 서면 답변 필요

1. **프로그램 결합 범위:** GitHub Pages의 MuPDF.js 브라우저 렌더러가 별도 배포된 Google Apps Script HTTP API와 signed GET을 통해 통신하는 형태는 AGPL의 결합 저작물/파생물/별도 독립 프로그램 중 어떤 범주인가? 판정의 사실·기준은?
2. **서버 소스 범위:** 해당 구조에서 Corresponding Source 공개 의무가 발생한다면, Apps Script Code.js, `referencePdfContent` 보조 소스, 필기 저장·복원, 인증/기기 관리 구현 중 어디까지 포함하는가? API 분리만으로 별도 저작물이라 볼 수 있는가?
3. **수정 여부:** MuPDF C 소스 자체는 수정하지 않고, JS Wrapper와 애플리케이션을 연동한 경우 대응 소스·설치 스크립트의 범위는?
4. **네트워크 사용자 권리:** AGPL 제13조 등의 원격 네트워크 상호작용 사용자에 대한 소스 제공 방식, 웹 UI에 표시할 문구/링크/버전/공지/기한을 구체적으로 제시해 달라.
5. **빌드 동등성:** `mupdf@1.28.1`에서 제공된 WASM과 byte-for-byte 동일한 결과를 얻는 데 필요한 정확한 emsdk, npm resolved dependencies, OS/container/toolchain revision, build flags, 패치·submodules·폰트/CJK/ICC·minification 옵션은 무엇인가? 동일 바이너리가 아니라면 AGPL Corresponding Source 조건에 충분한 재빌드 가능성을 어떻게 증빙하는가?
6. **제3자 사용 허가:** MuPDF 내부 폰트·CJK CMaps·ICC 프로필·서브모듈과 pdf-lib/PDF.js/SheetJS 등의 고지 및 별도 라이선스 충돌 가능성 검토 방법은?
7. **개인·비밀 데이터:** Google Sheets LIVE MASTER 행, Drive 원본 PDF, 사용자가 작성한 필기, 인증 로그/기기 식별자, Google Script Properties·HMAC·OAuth 비밀키를 공개 소스와 분리하면서 대응 소스 의무를 충족하려면 필요한 코드·설정 예시는 무엇인가?
8. **상용 라이선스:** Apps Script 및 프런트의 비공개 유지가 필요할 때 적용 가능한 상용 MuPDF 계약의 필수 제품/사용자 규모/서버·브라우저/재배포 범위/비용/지원 조건은?
9. **비공개 검수:** 라이선스/배포 판단이 끝나기 전에 사용자 소유 Galaxy Tab S11과 iPhone에서 비공개 테스트를 진행하는 경우 허용 가능한 접근·파일 제공·범위와 고지 조건은 무엇인가?
10. **후속 배포:** AGPL 또는 상용 조건을 충족한 다음 GitHub Pages, Apps Script, 대응 소스 다운로드 URL에서 반드시 해야 하는 고지·배포·보존·사용자 통지·변경 이력 절차는?

## 4. 요청할 증빙과 판단 기록

- Artifex 또는 적격 법률 전문가의 **서명·날짜가 있는 서면 검토**, 적용 구조 및 버전 범위 명시.
- 선택지 A: AGPL 준수로 공개 가능한 최소/충분 Corresponding Source 구성과 사용자 접근 경로.
- 선택지 B: 상용 MuPDF 라이선스 사용 시 비공개 프런트·Apps Script 범위를 유지할 수 있는 계약 조건.
- 각 선택지별 필요한 소스·NOTICE·라이선스 표기·빌드/설치 스크립트 체크리스트.
- 전자적/서면 계약 완료 및 사업·기술적 배포 GO 판단을 사용자에게 보고하기 전까지 법률·배포 차단 유지.

## 5. 현재 판정

**BLOCKED:** 법률 서면 검토 미실시, 상용 계약 없음, 실제 WASM 재현 빌드 미완료, 대응 소스 제공 범위 미확정.

**사용자에게 별도 승인 없이 이 문서를 외부에 전송하거나 Artifex에 문의하지 않는다.**

공식 근거:
- https://artifex.com/licensing
- https://github.com/ArtifexSoftware/mupdf/blob/1.28.1/platform/wasm/BUILDING.md
- https://github.com/ArtifexSoftware/mupdf/blob/1.28.1/platform/wasm/tools/build.sh
- https://www.gnu.org/licenses/agpl-3.0.html
