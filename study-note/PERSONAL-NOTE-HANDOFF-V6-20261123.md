# 개인 노트(그림판) 기능 후속 작업 인계서 v6 — 2026-11-23

## 관리 원칙
- 기존 운영 로컬 그림판 반영은 PR #96, main SHA `fb17c1b72b57e62fca94ce4fa58b9aa57e6c96f6`에서 완료됨. 완료된 작업을 미완료로 다시 취급하지 말 것.
- 이번 요청 신규 작업: `feature/personal-note-a4-cloud-ux-20261123`, **Draft PR #97**, 사용자 승인 없는 이번 PR main 병합/Pages/Apps Script 운영 배포 금지.
- Google Sheets LIVE MASTER 학습 원문, 기존 PDF/첨부/교재/주석/학습 계획/인증/보안 원본 변경 금지.
- 개발:필수검수 비율=80:20. 사용자가 실사용 중 문제를 발견하면 후속 수정; 불필요한 검사 생략하되 필수 보안/무손실 확인은 생략하지 말 것.

## 현재 독립 브랜치의 코드 변경 (main 미반영)
- `study-note/assets/personal-note-answer-sheet-a4.svg`: 업로드된 1페이지 정보관리기술사 답안지의 선/칸 배열을 재현하고 `번호`/ `1쪽` 텍스트 제거한 공통 배경용 SVG. 원본 PDF의 실제 픽셀을 GitHub에 직접 저장한 파일은 아니며 선 구조를 재구성한 텍스트 SVG다. 모든 페이지에 A4 contain-fit 방식으로 표시함.
- `study-note/personal-note.js`: A4 고정 용지(794x1123), 화면 기본 100%(CSS 기준), 확대/축소 25~300% 25% 단계, 스크롤바 및 손 도구로 팬, 이전 노트의 좌표는 정규화해 유지, 사진 이동/크기 조절을 페이지 밖으로 넘기지 않도록 제한, 공통 답안지 배경을 최초 기본으로 사용. 기존 PDF/교재/서브노트의 도형 11종과 비슷한 선택 옵션을 개인 노트에 추가, 사진 첨부 유지, 도구 접기 ▼ / 펼치기 ▲ 수정.
- `study-note/personal-note.css`: PC/태블릿/스마트폰 버튼, 글씨, 도구바 축소; A4 페이지는 기기에 맞춰 강제 축소하지 않고 스크롤과 손 도구로 이동.
- `study-note/service-worker.js`: 신규 공통 양식 오프라인 캐시 포함 및 별도 캐시 버전.
- `study-note/tests/test_personal_note_browser.cjs`: A4 기본 크기, 배율, 도구 버튼, 삼각형, 스마트폰 너비의 스크롤/손 도구, 저장·재열기 확인.
- `.github/workflows/study-note-personal-note.yml`: SVG 파일 변경을 전용 CI 감시 대상으로 추가.
- 별도 로컬 산출물: 업로드된 PDF의 `번호`, `1쪽`만 제거한 A4 300dpi 실제 이미지 `/mnt/data/answer_sheet_A4_clean_300dpi.png`, `/mnt/data/answer_sheet_A4_clean.pdf`; GitHub에는 현재 선 구조 재현 SVG만 반영됨. 다운로드 링크는 현재 채팅 세션에서만 검증됨.

## 필수 자동검사 최종 근거
- 개인 노트 전용 GitHub Actions run `45140006327`: `personal-note-checks` SUCCESS, `browser-essentials` SUCCESS.
- 브라우저 합성검사는 A4 794x1123, 기본 100% 및 125% 왕복, 도구 펼침 방향, 도형 선택, 모바일 390px 화면 가로 스크롤 및 손 도구 이동, 개인 노트 저장/불러오기 확인.
- 이번 작업에 펜 유형(연필·볼펜·붓펜·만년필) 선택 UI도 추가됨. 기존 도구 엔진 자체를 통째로 이식한 것은 아니며 UI/지원 범위 확장임.
- 실제 ACTIVE 구글 서버 연결, iPhone Safari/S Pen 실제 사용자 검수 및 운영 Pages 실행은 **하지 않았음**. 합성 검사를 실기기 검수로 보고하지 말 것.

## 실행/검증 상태
- GitHub 독립 브랜치 생성 확인. 실제 운영 main은 수정하지 않음.
- 전용 CI 초기 변경 커밋 PASS; 가장 최신 코드에 대한 Actions Run 상태는 후속 확인할 것.
- 원격 PC `DESKTOP-5H5J4TU` Online, 사용자 Windows 홈 `C:\Users\user`. 다른 채팅 세션/프로세스 변경·중지 없음.
- `clasp list --json`에서 격리 테스트 Apps Script 3개만 확인; **운영 배포된 Apps Script v23 최신 전체 소스는 확보하지 못함**. Google Drive Apps Script MIME 검색에도 해당 운영 소스가 나타나지 않음. 기존 주석/신뢰기기 인증을 추측으로 복제/교체하는 것은 금지.
- 따라서 **클라우드 다중 기기 동기화는 아직 운영에서 구현·검증·반영하지 못했음**. 기존 서버 애드온은 `study-note/backend/personal-note-sync-isolated.addon.gs`와 서명 브리지 후보이며 `ISOLATED_TEST` 전용. 이 브랜치에서 운영 Apps Script를 변경하거나 배포하지 않았음.
- 실기기 PC/태블릿/iPhone 사용자 테스트는 요청에 따라 사용자가 실제 사용하면서 진행할 예정이며, 이 독립 브랜치는 아직 운영 반영 전.
- 기존 메인 이외 원격 PC 작업트리/프로세스 또는 타 대화 세션과 충돌 없도록 절대 경로·소유권 확인.

## 다음 단계 (미완료)
1. Draft PR #97의 가장 최신 CI 결과를 확인하고 **필수 오류만 수정**. 기존 PR #96의 로컬 버전 기능 회귀 방지.
2. 최신 운영 Apps Script v23 프로젝트 소스 및 배포 ID를 접근 가능한 적법한 계정에서 읽기 전용으로 확인. 현 원격 clasp 계정에선 독립 시험 3개만 조회됨. 확보 전 운영 호스트를 추정해서 수정하지 말 것.
3. ACTIVE/HMAC/nonce/owner 인증을 유지하며 독립 Drive 폴더/Apps Script 시험 환경에 개인 노트 문서 API 연결 및 2기기 왕복·충돌 무손실 검증.
4. 동일 토픽 페이지/사진/필기 및 공통 배경 설정의 클라우드 동기화를 실제 연결한 이후 운영 서버 반영 후보 제안.
5. 사용자가 별도로 승인하면 PR 병합 및 Pages, Apps Script 배포를 진행하고 브라우저/Pages/readback 검수 수행.
6. 종료 시 완료/미완료/미검증, PR/SHA 및 새 채팅용 복사 가능한 작업요청서 보고.

## 새 채팅 복사용 작업요청서
학습노트 개인 노트 후속 개발 Draft PR #97(브랜치 `feature/personal-note-a4-cloud-ux-20261123`)을 이어서 진행해줘. PR #96의 개인 노트 로컬 운영 배포는 이전에 완료됐으므로 재작업하거나 다시 배포하지 마. PR #97에는 A4 기본 페이지·정리된 답안지 SVG 배경·100% 기본 확대축소·손 도구·스크롤·모바일 압축 버튼·기존 필기 도구 11종 유사 선택·오른쪽 이미지 잘림 방지가 구현돼 있어. 가장 최근 PR SHA/CI부터 확인하고 필수 오류만 수정해. 남은 핵심은 운영 Apps Script v23 실소스 확보 및 기존 ACTIVE/HMAC/nonce 보안 체계 아래의 개인 노트 전용 Google 클라우드 동기화 실제 개발/검증이야. 원격 DESKTOP-5H5J4TU는 online이지만 clasp list로는 격리 시험 프로젝트 3개만 확인돼 운영 소스를 아직 찾지 못했어. 실제 원본 없이 운영 Apps Script를 추측으로 덮어쓰지 마. 개발 80%·필수 검수 20%, 사용자 실사용 검수, LIVE MASTER·기존 파일·첨부·필기·보안 무손실, 타 채팅 원격 세션 보호, 승인 전 main 병합/배포 금지. 실제 수행한 완료/미완료/미검증, PR·SHA와 다음 채팅 작업요청서를 반드시 남겨줘.
