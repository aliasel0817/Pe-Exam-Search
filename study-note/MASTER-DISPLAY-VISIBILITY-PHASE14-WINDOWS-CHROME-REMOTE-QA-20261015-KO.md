# 학습노트 Phase 14 — Windows Chrome 원격 호스트 독립 QA 및 LIVE 메타데이터 재확인 (2026-10-15)

> 작업 목적: Google Sheets MASTER X/Y 원문 무변경, PWA 표시 단계의 독립 항목·검증된 한글 우선 병기·모든 기술적 설명 보존. PR #18 Draft와 PR #8 Draft는 병합하지 않음.

## 기준
- 기준 main: `6e8527497a519a5da35e6838209aa628892e5ff9`
- Phase 13 완료 PR #18 HEAD(본 문서 작성 전): `7c280d24441d8a5ae96bdb60ec22f2cc23c0f2bd`
- Phase 12·13 및 PR #8 원문보존 기준서를 GitHub에서 직접 읽어 점검. 완료된 과거 검사를 새 실행 건수로 중복 계산하지 않음.
- 같은 HEAD의 GitHub Actions 조회: Visibility Browser QA / WebKit X Y Visibility QA / PDF upload regression **3개 완료·success**.

## LIVE Google Sheets 읽기 전용 재확인
- 운영 스프레드시트 `topic_study_data`, 탭 `암기장`, 열 26개·데이터 3,859행(+헤더 1행).
- A열 통합ID 3,859개, 중복 0, 공란 0; U열 Y 3,800개, N 59개.
- 조회만 수행; 셀 쓰기 0.
- X/Y 7,600셀·36,944요소 원문 무손실은 **Phase 12의 이전 직접 전수검증 실적**이며 이번 Phase 14에서 재실행하지 않음.

## 원격 Windows 환경
- Desktop Commander: 집 PC `aliasel` 온라인·ping 성공·PowerShell 명령 실행 성공. 회사 PC `DESKTOP-5H5J4TU` 온라인·ping 성공이나 명령 `spawn EPERM` 오류 재현.
- 집 Windows PC에서 Node v24.20.0 확인, Chrome 설치 확인.
- 시스템의 기존 사용자 프로필 또는 운영 PWA를 건드리지 않고 집 PC `%TEMP%\study-visibility-phase14-20261015` 임시 폴더에서 작업. PR HEAD 고정 SHA의 실제 `study-note.html`, Node/Chrome QA 스크립트 읽기 전용 복사.
- 검사 전용 Puppeteer Core 24.31.0 별도 설치(리포지터리 원본·잠금파일 무변경).
- Windows PowerShell에서 `node study-note/tests/test_technical_readability.cjs`: **45 PASS / 0 FAIL**.
- `CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe` 지정 후 `node study-note/tests/test_visibility_browser_qa.cjs`: **35/35 합성 토픽-화면 조합**, 토픽 이전·다음 **7/7**, 34px 하단 안전 영역 모의 **7/7**, 글자 150/200/250% 가로 넘침 0, 기존 번호·계층 줄바꿈 정상, 최하단 카드 가림 0.
- 화면폭 1280/1180/820/844/402/390/320px. 실제 앱 HTML·렌더러를 사용하지만 OAuth/IndexedDB/서버를 테스트용 복사본에서 비활성화하고 합성 자료만 주입하는 **헤드리스 Windows Chrome 자동화**.

## 검증 경계 및 결론
- 이번 결과는 Linux CI와 독립적인 Windows 호스트에서 실제 Chrome 실행 사실을 추가로 입증. 그러나 **사용자가 실제 브라우저에서 운영 계정으로 확인한 Windows Chrome 실기기 수동 QA는 아님**.
- iPhone 16 Pro Safari, Galaxy Tab S11 실물 QA 및 오프라인 캐시·실제 OAuth/LIVE 네트워크 흐름 QA는 미실행: **실기기 종합 0/3 유지**.
- 신규 결함 재현 0, 신규 코드 변경 없음. 기술적 의미 전수검수는 미완료.
- 과거 원문 의미 손실 3셀(T0493/X, T0466/W, T0521/X) 별도 승인 전 복원 보류.
- PR #8 변경 없음; `main`, 운영 LIVE, PDF, TTS, 서비스워커, Apps Script 변경·배포 없음.
- Apps Script 저장/함수 실행/재배포 불필요.
- 다음 작업: Windows 실제 계정 기반 비헤드리스 운영(또는 PR 미리보기 격리) X/Y 육안·캐시 QA, iPhone Safari/갤럭시탭 실기기 가로·세로 회전·확대·토픽 전환·하단 스크롤 확인. 검수 전 Draft 해제/병합/운영 배포 금지.
