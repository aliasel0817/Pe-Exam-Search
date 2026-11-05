# R14 — 토픽 관리 팝업 하단 화살표 및 표시/숨김

**작업일:** 2026-11-05 (Asia/Seoul)
**저장소:** `aliasel0817/Pe-Exam-Search` / **운영 기준 main:** `be59071e46e9c46661630b3a5ec5694991068447`
**대상 PC:** `DESKTOP-5H5J4TU`
**격리 경로:** `E:\Professional_Engine\Download\Development\Pe-Exam-Search_topic_manage_r14_worktree_20261105`
**브랜치:** `feature/r14-topic-manage-bottom-dock-20261105`

## 요청된 동작

토픽 관리 모달 하단에 **◀ ▲ ▼** 세 가지 아이콘을 표시.
▲·▼는 기존처럼 폼 내부의 최상단 및 최하단으로 즉시 이동하며,
◀ 버튼은 ▲·▼만 접고 ▶로 바뀜. ▶를 누르면 다시 두 화살표 표시.
버튼 텍스트 `위` / `아래`는 표시하지 않고 접근성 라벨 및 설명은 유지.
접기 상태는 현재 팝업 세션에서만 적용하며, 다음에 열면 기본 펼침.

**핵심:** 취소/저장/학습대상 N 처리 버튼과 스크롤 화살표는 서로 다른
레이아웃 영역에 배치하여 어느 배율 및 스크롤 위치에서도 겹치지 않음.

## 구현 방식

- 원래 관리 팝업 전체 `.manage-card`가 스크롤되던 구조를
  `display:flex;flex-direction:column;overflow:hidden`의 외곽 카드,
  `#manageScrollBody` (내부 세로 스크롤 폼) 및
  `.manage-quick-scroll` (항상 접근 가능한 별도 하단 푸터)로 변경.
- 기존 `.modal-head`는 상단, 폼은 중간, 빠른 화살표 푸터는
  CSS `order:2`로 최하단에 정렬.
- `#manageForm`의 취소·저장·학습대상 N 버튼, 원문 입력/편집,
  첨부·PDF 편집 및 관리 로직은 그대로 중간 스크롤 영역 내에 유지.
- `#manageQuickToggleBtn`: 버튼 유형 `button`,
  `aria-controls=manageQuickArrows`, `aria-expanded`, 한국어
  `aria-label` 및 `title`, 사용 중 ◀/▶ 아이콘 전환.
- `#manageJumpTopBtn`, `#manageJumpBottomBtn`: 44×44px 이상,
  표시는 ▲/▼ 아이콘만. `#manageScrollBody.scrollTop`만 변경.
- 새로 관리 팝업을 열면 맨 위로 이동 및 화살표 다시 표시.
  메인 스크롤·사용자 데이터를 변경하지 않음.

## 변경 범위

- `study-note/study-note.html` — 관리 모달 CSS/HTML/JS에 한정.
- `study-note/mupdf-migration/m7/tests/m7.test.mjs` — 엄격한
  원문 HTML 바이트 동일성 검사는 유지하고, 정확히 표시된 R14 레이아웃
  세 곳만 복원·제외한 뒤 기존 M0~R13 변경과 함께 비교.
- `study-note/mupdf-migration/r13/tests/r13-manage-scroll.test.cjs`
  및 `r13-manage-scroll-browser.cjs` — 기존 회귀검사 확장.
- `study-note/mupdf-migration/r14/tests/r14-manage-bottom.test.cjs`
  — R14 구조/보존 테스트.
- `.github/workflows/study-note-r13-manage-scroll-qa.yml` — 새 테스트 포함,
  Pages 배포 권한 없음.

## 직접 실행한 검증

- M7 엄격한 원문 보존: **4/4 PASS**.
- R13 정적 관리 UI: **4/4 PASS**.
- R14 구조·저장/인증 보존: **4/4 PASS** (병합 전 최종 확인).
- 실제 Windows Chrome 156.0.8078.49: PC 1440×900,
  스크린샷 크기 860×768, iPhone 크기 모의 402×874,
  좁은 모바일 크기 320×640 검사 **4/4 PASS**.
  별도 푸터가 취소·저장·학습대상 N과 겹치지 않음, ▲·▼ 즉시 이동,
  ◀/▶ 접기·펼치기, 버튼 너비/높이, 입력 내용 유지, 키보드 조작,
  모달 닫기, JS 오류 0건, 운영 쓰기 요청 0건 확인.
- 실제 iPhone Safari 및 Galaxy Tab S11 실기기는 **NOT VERIFIED**.

## 보호 및 배포 조건

Apps Script, LIVE MASTER, 실제 원본 PDF·이미지·첨부, 실사용 필기·주석
및 인증정보는 변경하지 않음. 다른 채팅 브랜치·PID·프로세스 변경 금지.
**이번 요청은 R14 운영 `main` 병합/Pages 배포를 승인한 문서가 아님.**
독립 브랜치·Draft PR 검수 후 사용자 명시 승인 전까지 운영 변경 금지.
