# 학습노트 Phase 13 — Safari 계열 WebKit 모의 화면검수 (2026-10-15)

> **최상위 목적 재확인:** 운영 Google Sheets MASTER 학습 원문(X 특징·Y 기술요소)은 한 글자도 무승인 변경하지 않고, PWA 화면에서 항목별 개행·검증된 한글 우선 명칭·모든 영어/절차/수치/수식의 보존을 우선. PDF/TTS·전체 콘텐츠 의미감사는 주작업이 아님.

## 1. 기존 체크포인트 및 변경 범위

- 운영 `main` 기준 SHA `6e8527497a519a5da35e6838209aa628892e5ff9`; 가시성 개선 Draft PR #18 브랜치 `fix/study-note-display-preserve-authored-lines-20261014`.
- 고정 원문보존 기준서: 감사 Draft PR #8 `MASTER-DISPLAY-VISIBILITY-RAW-DATA-PRESERVATION-RECHECK-20261014-KO.md`.
- 기존 Phase 12: X 한글 우선 표현 1,837셀/3,145개 병기, 학습대상 X/Y 7,600셀·36,944요소 원문 무손실 직접 재검사, Node 45/45 및 Chrome 35/35 통과.
- **이번 Phase 13은 표시 함수와 CSS 자체를 추가 변경하지 않음.** 별도 자동화 `.github/workflows/study-note-visibility-webkit-qa.yml`과 합성 데이터 테스트 `study-note/tests/test_visibility_webkit_qa.cjs` 2파일만 추가.
- 인증/OAuth/IndexedDB/외부 스크립트를 **검수용 임시 HTML 사본**에서만 비활성화. 실제 PWA HTML/CSS/JS/토픽 선택 및 X/Y 렌더링 코드를 그대로 사용. 실제 사용자 LIVE 셀 내용은 GitHub public fixture/스크린샷에 복제하지 않음.

## 2. 직접 실행으로 확인한 검사

- GitHub Actions WebKit run: **`38700001033` / success**, Playwright WebKit 엔진(Linux).
- **합성 토픽 3개 × 화면 크기 4종 × 하단 안전 영역 일반/34px 모의 2종 = 24/24 화면 조합 통과.**
- 검수 화면: 휴대전화 세로 402px, 휴대전화 가로 844px, 태블릿 세로 820px, 태블릿 가로 1180px.
- 합성 사례: **검증된 고객/경쟁사/자사 영문-한글 병기**, MCTS형 중첩 괄호/긴 설명/수치·수식·표준명, **T4038 모양의 기존 번호·계층형 단계 및 하이픈 특징**.
- 화면 검증 결과: X/Y 화면 양쪽 **가로 넘침 없음**; 하단 스크롤 끝에서 고정 탐색 버튼에 학습 내용 **영구 가림 없음**; 원문 하위계층 줄바꿈 `pre-wrap` 유지. HTML 텍스트 본문과 원문 요소 속성 정확 확인.
- 한국어 Noto Sans CJK KR 적용 스크린샷 4장과 결과 JSON: GitHub artifact **`study-note-visibility-webkit-1` / ID `11956041496` / 2026-10-29 만료 예정**. `iphone-like-402.png`의 실제 이미지 열람으로 한글·기존 계층형 원문의 표시·줄바꿈을 확인.
- 동일 브랜치 Chrome 검증은 Phase 12 `38699006908`에서 35/35 성공, Node `38699006906`에서 45/45 성공.
- **WebKit Linux는 iOS Safari 그 자체가 아님.** 이 결과는 UI 엔진 모의검사에 한정하며 실제 iPhone Safari/갤럭시탭/Windows PC 실기기 QA 완료로 계산 금지.

## 3. 범위별 진행도와 운영 보호

| 구분 | 마지막 직접 검증 또는 확인 |
| --- | --- |
| 학습대상 | 3,800토픽 / 전체 3,859건(Phase 12 운영 LIVE 읽기 전용) |
| 구조적 X/Y 자동 목록 | X 3,793셀 / Y 3,796셀(비정형·기작성 계층/번호·공란 원문 유지 X7/Y4) |
| 원문 무손실 자동검사 | 7,600/7,600셀, 36,944개 원문 요소 불일치 0(Phase 12 직접 재검사; 이후 표시 기능 코드 무변경) |
| 한글 우선 표현 | Y 기존 12,023개 기술요소, X 3,145개 표현 추가(1,837셀) |
| Chrome 실 PWA 구조 모의 QA | 35/35 (Phase 12) |
| WebKit 실 PWA 구조 모의 QA | 24/24 (이번 단계) |
| 실제 Windows/iPhone/Galaxy Tab 기기 QA | 미완료 0/3 |
| 전문 기술적 의미검수 | 전체 완료 아님 |
| PDF 원본 감사 | 기존 체크포인트의 61토픽(별도) |
| LIVE 정정·과거 의미손실 복원 반영 | 0셀 |

- **이번 단계 실제 LIVE 수정 0셀, GitHub 운영 main 변경 0, 운영 PWA 배포 0, PR #8 병합/변경 0.**
- PR #18은 **Draft/Open/미병합** 유지. Apps Script 저장/함수 실행/재배포 **모두 불필요**.
- 운영 `service-worker.js`는 HTML network-first 조회로 설계돼 있으나, 실제 기기 캐시/오프라인/브라우저별 업그레이드 검증은 별도로 남음.
- **다음 작업:** 실제 Windows PC Chrome, iPhone Safari, Galaxy Tab 브라우저에서 원문과 X/Y 화면 비교 및 가로·세로 전환·하단 스크롤·토픽 이동 검수. 실기기 미완료 상태에서 정상 운영/배포 확정 금지. 콘텐츠 원문 복원 3셀(T0493/X, T0466/W, T0521/X) 무승인 반영 금지.
