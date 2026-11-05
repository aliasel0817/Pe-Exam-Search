# R15 — 토픽 관리 하단 화살표를 메인 이동 바처럼 작은 플로팅형 캡슐로 변경

**작업 기준:** 2026-11-05 (Asia/Seoul)
**저장소/Issue:** aliasel0817/Pe-Exam-Search / #45
**기준 운영 main:** `d93f066edee11bb4196ac7e878100ce69e2e3c20`
**PC:** `DESKTOP-5H5J4TU`
**독립 작업 폴더:** `E:\Professional_Engine\Download\Development\Pe-Exam-Search_topic_manage_r15_20261105`
**브랜치:** `fix/r15-topic-manage-floating-scroll-dock-20261105`

## 요청 및 사용성

- 업로드된 현재 토픽 관리 화면의 기존 하단 전체 폭 화살표 구역을
  메인 화면 이전·목록·다음 이동 바와 같은 **독립적인 둥근 플로팅형 캡슐**로 변경.
- 팝업 **오른쪽 아래**, 흰색 반투명 배경·테두리·그림자·둥근 모서리.
- 펼침 시 `▲ ▼ ◀`, 접힘 시 `▶` 버튼만 표시.
- 토픽 이전·목록·다음·오픈소스 고지는 관리 팝업에 추가하지 않음.
- 취소·저장·학습대상 N 처리의 기존 폼 구조/정렬과 저장 로직은 그대로 유지.

## 핵심 안전 설계

캡슐은 레이아웃 내 별도 예약된 `.manage-quick-scroll` 영역으로,
`align-self:flex-end;width:max-content` 처리함. CSS `position:fixed`
또는 `absolute`로 저장 버튼을 덮지 않음.
`#manageScrollBody` 내부에 기존 `#manageForm`과 취소·저장 버튼을 보존.
캡슐 접기는 `is-collapsed` 클래스만 바꿔 그림자/배경을 줄이고,
기존 `aria-expanded`, 한국어 접근성 라벨과 `▶` 재열기 기능을 보존.
`▲/▼`는 `#manageScrollBody.scrollTop`만 조작하며 서버 쓰기·폼 제출 없음.

## 수정 소스

- `study-note/study-note.html`: 하단 캡슐 CSS, 관리 팝업 캡슐 내부의
  ▲ ▼ ◀ 순서, 접기 시 캡슐 축소 스타일 제어.
- `study-note/mupdf-migration/r13/tests/r13-manage-scroll.test.cjs`
  및 `r14/tests/r14-manage-bottom.test.cjs`: 새 작은 캡슐 구조 검증.
- `study-note/mupdf-migration/r13/tests/r13-manage-scroll-browser.cjs`:
  실제 Chrome 캡슐 너비/모서리/그림자/축소 너비 검증.
- `study-note/mupdf-migration/r15/tests/r15-floating-dock.test.cjs`:
  네 개 신규 정적 검사.
- `.github/workflows/study-note-r13-manage-scroll-qa.yml`:
  R15 QA 및 원문 보존 검증 추가.

## 실제 검증

- 원문/PDF/필기 보존 M7 4/4 + 기존 R13 4/4 + R14 4/4
  + 신규 R15 4/4 = **16/16 PASS**.
- 실제 Windows Chrome 156.0.8078.49: 1440×900, 860×768,
  402×874, 320×640 **4/4 PASS**.
- 해당 화면에서 캡슐 너비 제한·둥근 모서리·그림자·우측 위치,
  ▲/▼ 실제 이동, ◀/▶ 접기/펼치기, 접힌 폭, 저장·취소
  겹침 없음, 기존 입력값 유지, 폼 자동 제출 0건, 본문 스크롤 영향 없음,
  브라우저 오류 0건, 운영 서버 쓰기 0건 확인.
- 실제 태블릿·iPhone 물리 기기 검수는 NOT VERIFIED (Chrome 뷰포트 모의만).
- LIVE MASTER, Apps Script, PDF/이미지/첨부·필기 데이터·키/인증정보 미변경.

## 배포와 복구

사용자가 기존 대화에서 정상 검증된 단순 UI 수정은 매번 별도
재승인 없이 실제 `main`/GitHub Pages까지 반영하도록 명시 허용함.
운영 main 백업 브랜치를 생성하고 최신 PR/SHA/CI를 확인한 다음
이 R15 PR **한 건만** 병합, Pages 실제 배포 및 Chrome 운영 UI를 검수.
검증 실패 시 NO-GO, 실제 수정 범위와 결과를 보고.
기존 미병합 PR과 다른 채팅 파일·프로세스를 변경하지 않음.
