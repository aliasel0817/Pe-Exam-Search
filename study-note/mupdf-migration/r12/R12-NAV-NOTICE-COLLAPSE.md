# R12 — 오픈소스 고지 동시 숨김 및 설정 경유 대응 소스

2026-11-05 / Pe-Exam-Search Issue #45

## 목적

사용자가 학습 화면을 최대한 넓게 이용할 수 있도록 하단 토픽 이동 바 접기 시
**위·이전·목록·다음·아래·ⓘ 고지 6개 버튼을 함께 숨깁니다.**
작은 접기/펼치기 버튼은 계속 사용할 수 있습니다.

## AGPL 소스 제공

고지 버튼이 일시적으로 접혀 있더라도 웹앱 상단 **설정 → ⓘ 오픈소스 고지 · 대응 소스**
메뉴에서 운영 애플리케이션 소스, GNU AGPLv3 전문 및 제3자 라이선스
고지를 열 수 있습니다. 설정은 PC/태블릿/모바일에서 접근 가능합니다.

운영 대응 소스 접근 주소는 현재 GitHub Pages `main` 게시 소스와
일치하도록 `https://github.com/aliasel0817/Pe-Exam-Search/tree/main/study-note`을 사용합니다.
기존 불변 MuPDF 원본/라이선스 및 고정 릴리스 제공은 삭제하지 않습니다.

## 변경 코드

- `study-note/study-note.html`: 접힌 바 전체 숨김, 열린 고지창 자동 닫기,
  상단 설정에 오픈소스·대응 소스 메뉴와 링크.
- `study-note/mupdf-migration/r10/tests/r10-nav-browser-smoke.cjs`:
  실제 Chrome 5개 화면 크기에서 펼침 시 6개 버튼, 접힘 시 0개 버튼,
  설정 고지 3개 링크, 다시 펼치기 확인.
- `study-note/mupdf-migration/r10/tests/r10-nav-notice.test.cjs`:
  설정 고지 링크와 접기 CSS 검사.
- `study-note/tests/test_bottom_nav_scroll_collapse.cjs`:
  기존 이전/다음/목록/위/아래 이동, 접기·펼치기 회귀검사.
- `study-note/mupdf-migration/m7/tests/m7.test.mjs`:
  정확히 표시한 R12 UI 변경만 기존 HTML 동등성 검사에서 제외.
  학습 콘텐츠, 서명 GET, 필기 스키마 및 PDF 렌더러 보존.

## 실제 검증 결과

- Windows Chrome 156: PC(1440), 태블릿 뷰포트(768),
  iPhone 유사 뷰포트(402/375), 좁은 화면(320) **5/5 PASS**.
- 접기 전 6개 표시 → 접기 후 고지 포함 모두 숨김 → 설정 고지 링크
  및 전문 접근 → 펼치기 후 6개 복구: **PASS**.
- M7 + R4 + R10 보존 자동검사 **15/15 PASS**.
- 기존 Chrome 토픽 이동(320/390/820/1280) **PASS**.
- WebKit CI 운영 환경만 `ubuntu-latest`에서 `ubuntu-24.04`로 고정:
  Playwright 1.56.1의 Ubuntu 26.04 WebKit 설치 미지원 문제 해결 목적.
  앱·학습 데이터·PDF 코드와 무관한 테스트 인프라 수정.
- 외부 민감 요청 차단, 운영 데이터 쓰기 0회.
- 실제 태블릿/iPhone 물리 기기 검사는 미실행 (뷰포트 시뮬레이션과 구분).

## 운영 경계

독립 PC `DESKTOP-5H5J4TU` 경로
`E:\Professional_Engine\Download\Development\Pe-Exam-Search_nav_notice_r12_20261105`.
기준 main `c26b59e12561467594c8436d7a1c6ca9a5bb6177`.

운영 Google Sheets LIVE MASTER, Apps Script, PDF, 이미지, 첨부, 사용자 필기 및
인증 설정을 변경하지 않습니다. **이 문서는 새 운영 배포 승인이 아닙니다.**
별도 브랜치/PR에서 검증하고 사용자 명시 승인 전에는 main·Pages에 병합/배포하지 않습니다.
