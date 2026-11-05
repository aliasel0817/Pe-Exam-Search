# R13 — 토픽 관리 팝업 독립 빠른 위/아래 스크롤

**기준일:** 2026-11-05 (Asia/Seoul)
**저장소:** aliasel0817/Pe-Exam-Search
**기준 main:** `533313ee94ea1d041f3c3a0afc7a3b7e8bf59a37`
**대상 PC:** `DESKTOP-5H5J4TU`
**독립 폴더:** `E:\Professional_Engine\Download\Development\Pe-Exam-Search_topic_manage_r13_20261105`
**브랜치:** `feature/r13-topic-manage-quick-scroll-20261105`

## 요구사항

토픽 관리 모달에서 원문, 등장배경, 필요성, 특징, 기술요소, 키워드,
관련토픽, PDF 페이지 및 첨부자료가 긴 경우 스크롤바를 오래 이동하지
않고 빠르게 위/아래 끝으로 이동한다.

이 모달에는 토픽 이전/목록/다음, 메인 화면 이동 바,
라이선스 고지 버튼은 추가하지 않는다.

## 실제 구현

- `#manageModal .manage-card`: 기존 독립 `overflow-y:auto` 영역 유지,
  `scroll-padding-top:56px`으로 고정 도구 영역을 고려.
- 관리 모달의 헤더 아래 `▲ 위` / `▼ 아래` 두 버튼 배치
  (`type=button`, 한국어 접근성 라벨 및 키보드 지원).
- `position:sticky;top:0`을 이용해 팝업 중간·맨 아래에서도
  버튼에 항상 접근 가능; 별도 화면 하단 floating overlay 없음.
- `jumpManageToEdge(edge)`는 관리 모달 내부 `.manage-card.scrollTop`
  **만** 변경. 메인 페이지 스크롤, 다른 팝업, 입력값 및 폼 제출 영향 없음.
- 모달을 새로 열면 팝업 스크롤을 위로 초기화.
- 관련 서버 API, Apps Script, 인증, 필기, PDF, 첨부자료,
  저장·수정 로직 변경 없음.

## 수정 파일

1. `study-note/study-note.html` — CSS/DOM/이벤트/내부 스크롤 함수
2. `study-note/mupdf-migration/m7/tests/m7.test.mjs` — 정확히 표시한
   R13 UI 추가만 동등성 검사에서 제외; 나머지 HTML 바이트 비교 유지
3. `study-note/mupdf-migration/r13/tests/r13-manage-scroll.test.cjs`
4. `study-note/mupdf-migration/r13/tests/r13-manage-scroll-browser.cjs`
5. `.github/workflows/study-note-r13-manage-scroll-qa.yml`
6. `study-note/mupdf-migration/r13/R13_TOPIC_MANAGE_SCROLL_REPORT.md`

## 검증 결과

- 이전 M7 보존 4/4 + 신규 R13 정적 4/4 = **8/8 PASS**.
- 최초 CI는 checkout 기본 얕은 복제 때문에 M7의 원본 역사 커밋을
  가져오지 못해 실패. 신규 R13 QA 워크플로만 `fetch-depth: 0`으로 고정해
  원본 소스 동등성 검사가 정상 실행되도록 수정함 (앱 코드 변경 없음).
- 실제 Windows Chrome 156.0.8078.49:
  - PC 1440×900
  - 업로드 스크린샷과 가까운 폭 860×768
  - iPhone 크기 402×874 (PC Chrome 뷰포트)
  - 320×740 좁은 뷰포트
- 4종 화면 모두 버튼 2개 표시, 클릭과 키보드 조작으로 최상단·최하단
  즉시 이동, 하단에서 sticky 유지, 모달 이외 화면 스크롤 미변경,
  테스트 입력내용 보존, 저장폼 자동 제출 없음, 닫기 정상: **PASS**.
- 외부 요청 8건 차단. 실제 Google Sheet/Apps Script 쓰기 **0건**.
- 태블릿/아이폰 **물리 기기 검수는 미실행**; 뷰포트 시뮬레이션과 구분.

## 운영 제한

이 브랜치와 Draft PR은 출시 승인이 아닙니다.
사용자가 R13 변경의 `main` 병합 및 GitHub Pages 운영 반영을
명시적으로 승인하기 전까지 운영 환경에 배포하지 않습니다.
LIVE MASTER 및 실사용 PDF/필기/인증정보는 읽거나 변경하지 않았습니다.
