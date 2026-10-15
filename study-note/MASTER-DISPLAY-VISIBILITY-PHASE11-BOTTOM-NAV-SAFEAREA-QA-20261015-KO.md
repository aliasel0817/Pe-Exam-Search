# 학습노트 Phase 11 — 하단 탐색 가림·안전 영역 대응 및 실제 PWA Chrome 재검수 (2026-10-15)

> **최초 목적 고정:** 운영 Google Sheets MASTER의 X(특징)/Y(기술요소·구성요소) 원문은 그대로 유지하고, PWA 화면에서 요소별 개행·한글 우선 이름·원문 내용·절차·수치·수식 무손실 가시성을 확보. 콘텐츠 PDF 의미감사는 보조 트랙이고 PR #8을 수정하거나 자동 병합하지 않음.

## 1. 기준 및 수정 범위

- 기준 `main` SHA `6e8527497a519a5da35e6838209aa628892e5ff9`; 기존 Draft PR #18 브랜치 `fix/study-note-display-preserve-authored-lines-20261014`.
- 고정 원문보존 기준서: PR #8 `MASTER-DISPLAY-VISIBILITY-RAW-DATA-PRESERVATION-RECHECK-20261014-KO.md`.
- 재활용한 이전 체크포인트: Phase 9 (X/Y 7,600셀 자동검사), Phase 10 (5개 합성 토픽 × 4개 Chrome 화면크기 테스트).
- **이번 코드 변경은 운영 앱 `study-note/study-note.html`의 본문 하단 CSS 3곳뿐.** 숫자식 목록·설명·한글명 포매터 함수 및 인증·검색·관리·PDF·TTS·Apps Script·서비스워커는 수정하지 않음.
- 추가 검사: `study-note/tests/test_visibility_browser_qa.cjs` (스크롤, 이전 토픽 잔여 CSS, 150% 글자, 34px 안전 영역 모의검사).
- **LIVE Google Sheets 쓰기 0셀, 운영 main 수정 0, 운영 배포 0, PR #8 변경 0.**

## 2. 실제 재현한 문제와 수정

| 검사조건 | 원래 결함(회귀검사 실패 증거) | 변경 후 재검사 결과 |
| --- | --- | --- |
| Chrome 820px 태블릿 폭, 최하단 스크롤 | 마지막 `페이지 · 참고정보` 카드 bottom **1140.42px**, 고정 탐색 nav top **1114px** → 약 **26.42px 가림**. 원인: `@media max-width:980px`의 `.content {padding:18px}`가 기존 본문 하단 여백(94px)을 덮어씀 | 본문 하단 padding **94px**; 카드 bottom **1064.42px**, nav top **1114px** → **약 49.58px 여유**. 정상 |
| Chrome 390px 폭 + iOS 유사 **34px 하단 안전 영역 모의** | 모바일 본문 하단 padding **88px**, nav 높이 **95px**; 상세 하단 **756.22px**, nav top **749px** → 약 **7.22px 가림** | 모바일 padding **122px**, nav 높이 **95px**, 상세 하단 **722.22px**, nav top **749px** → **약 26.78px 여유**. 정상 |
| 기본 PC CSS, 태블릿 CSS, 모바일 CSS | 고정 nav에 안전 영역 추가 시 본문 여백 부족 위험 | 기본/태블릿/모바일 세 구간 모두 `env(safe-area-inset-bottom)`과 `--bottom-nav-h` 고려 |

변경사항은 **MASTER 또는 기술요소 파싱이 아닌 화면 하단 여백**만 조정. 오해 소지가 있는 번호/계층형 항목을 자동 분리하거나 재작성하지 않음.

## 3. 실행으로 검증한 결과

- 실패 재현: GitHub Actions `38661495554`에서 **820px 하단 카드 가림** 검출, 이후 CSS 보정.
- 모바일 안전영역 모의 실패 재현: GitHub Actions `38661833570`에서 **390px, 34px safe-area** 시 7.22px 가림 검출, 이후 CSS 보정.
- 최종 브라우저 테스트 코드/기능 코드 HEAD **`bacb49307e5a6e38a9efe0012773678a0b6f260a`**.
- 최종 Chrome 성공: GitHub Actions **`38661946897` / success**.
- 전체 PWA HTML·CSS·실제 `setReadableStudyField`, `showTopicById`, `moveTopic` 기반 격리 QA. OAuth·IndexedDB 및 외부 스크립트는 **임시 테스트 사본에서만 비활성화**, 합성 토픽만 사용하고 운영 Sheets에 쓰지 않음.
- `1280/820/390/320px` × 합성 토픽 5개 = **20/20 화면 조합 합격**. 이전/다음 이동 **4/4**, 원문 번호 계층 전환 시 CSS 잔여 **0**, 150% 글자 확대 시 문서·X/Y 가로 넘침 **0**, 하단 카드 도달 가능 **4/4**.
- 같은 네 화면폭 각각에서 **34px 하단 안전 영역 CSS `env(...)` 모의검사 4/4 합격**. 최종 nav top과 상세 bottom 위치 검사에서 가림 **0건**.
- 한글 Noto Sans CJK KR 적용한 Chrome 154 헤드리스 스크린샷은 GitHub Actions artifact **`study-note-visibility-browser-9` (ID `11939351770`, 2026-10-29 만료 예정)**에 보관됨.
- 같은 HEAD 기술표시 Node 테스트: GitHub Actions `38661946916`, **40/40 통과, 실패 0**.

## 4. 화면 콘텐츠 보존과 진행률은 별개로 기록

- **이번 Phase 11에서는 본문 하단 CSS와 테스트만 수정. X/Y 원문 파싱 코드의 변경 없음.** 따라서 기존 Phase 9 원문보존 자동검사 `7,600/7,600셀, 원문 요소 36,944개, 구조·설명·한글/영문/수치 토큰 누락 0`를 재사용. 이번에 새로 7,600셀을 재조회·전수실행했다고 주장하지 않음.
- 기존 Phase 9 목록 적용 수치: **X 3,793/3,800셀, Y 3,796/3,800셀**. 나머지 X 7/Y 4셀은 기존 계층형/번호형/비정형·공란의 **의도적 원문 유지** 대상 포함, 모두 신규 오류 아님.
- 검증 근거가 있는 한글 우선 기술요소 12,023개(기존 Phase 9 수치), 전체 기술 의미감사 합격과 다름.
- **전체 의미검수:** 미완료. 과거 원문 손실 T0493/X, T0466/W, T0521/X 3셀은 PR #8 별도 복원 후보, 승인 전 LIVE 미반영.
- **PDF 원본 감사:** 과거 61건 시각 1차 대조, 본 화면 가시성 진척과 합산하지 않음.
- **LIVE 정정 반영:** 0셀.

## 5. 남은 실기기 QA 및 다음 재개 지점

- 본 검사는 **Linux Chrome 154의 4개 뷰포트·합성 데이터·34px 안전 영역 모의** 검증. **실제 Windows PC Chrome, iPhone Safari, Galaxy Tab 실기기 사용성 검증은 아직 미실시**. 운영 인증/서버/캐시 조건도 범위 밖.
- 원격 PC 상태 확인: `aliasel`은 오프라인, `DESKTOP-5H5J4TU`는 ping 응답하지만 터미널 실행 `spawn EPERM`으로 실제 Windows 브라우저 자동검수 불가.
- 실제 기기에서 상세 X/Y 항목 줄바꿈, 가로·세로 회전, Safari 홈 인디케이터, 하단 탐색에 의한 가림, 스크롤 후 토픽 이동을 확인한 뒤 PR #18 운영 반영 여부 결정.
- **PR #18 Draft/미병합 유지, 운영 main/Sheets 무변경, PR #8 Draft 보존.**
- Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
