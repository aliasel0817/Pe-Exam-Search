# 학습노트 Phase 18 — Windows PR #18 실제 앱 초기화·캐시/토픽 전환 QA (2026-10-16)

> **고정 최초 목적:** LIVE Google Sheets MASTER 특징 X/기술요소·구성요소 Y 원문은 수정하지 않고, 독립 줄·검증된 한글 우선 화면 표시를 개선. 모든 요소명·설명·알고리즘·하위 단계·숫자·수식·표준번호를 보존. PR #8 감사·정정 이력 별도 보존, PDF/TTS 작업 재개 금지.

## 1. 최신 상태 및 사용자 검수 구분
- 작업 전 운영 `main`: `6e8527497a519a5da35e6838209aa628892e5ff9`.
- PR #18 이전 HEAD `49202e9f48648da1c3527231d87cfdf453bab92f`, Draft/Open/미병합; PR #8 HEAD `ea9027d32bf6106c6d1d068c1d4f02e16cff00d1`, Draft/Open/미병합.
- 기존 Phase 17 및 PR #8 최상위 원문보존 기준서 읽기 전용 재확인.
- 사용자가 iPhone 16 Pro와 Galaxy Tab S11에서 **운영 URL/main**을 직접 검수해 이상 없음을 보고. 이는 **운영 버전 2대 정상**으로 기록하되 **미병합 PR #18을 실기기 검증한 결과는 아님**.
- Phase 15 기준 목록 구조 적용: X 3,798/3,800셀, Y 3,796/3,800셀, 합계 7,594/7,600셀=99.92%. 직접 표시 6셀은 공란·이미 번호/계층형 원문. 이번 단계 X/Y 포매터 수정 없음; 신규 적용 건수 0.
- Phase 12 전체 7,600셀/36,944요소 구조적 무손실 자동검증 및 Phase 16 Windows 315/315 실제 LIVE 읽기 전용 표본 검증은 **이전 시점 실적**으로 보존. 이번 새로운 전수검사라고 중복 계산하지 않음.

## 2. 사용자 Windows PC 원격 접근 한계 — 실제 계정 로그인 여부는 미검증
- 이번 시점 집 PC `aliasel`: Desktop Commander **Offline**(마지막 확인 약 10시간 전). 기존 Phase 17 집 PC TEMP의 9개 LIVE 표본·임시 Chrome 프로필 삭제 여부는 **집 PC 재연결 전 확인 불가**.
- 회사 PC `DESKTOP-5H5J4TU`: Online·ping 성공, 실제 Windows 명령 실행은 `spawn EPERM` 재현. 별도 계정/Chrome 프로필 파일 또는 인증 토큰을 추출·복사하거나 권한을 우회하지 않음.
- 따라서 **집/회사 PC의 실제 Google 인증이 완료된 브라우저 세션 확인, 인증된 상태의 읽기/관리 허가, 실제 사용자 PWA 캐시 갱신/오프라인 복구는 미완료**. 이 항목을 별도 Windows CI 통과와 혼동하지 않음.

## 3. 새 Windows 통합검사 — Windows GitHub Actions에서 실제 PR HTML 사용
- 신규 `study-note/tests/test_visibility_windows_cache_qa.cjs` 및 `.github/workflows/study-note-visibility-windows-cache-qa.yml`만 **PR #18 브랜치에 추가**.
- 테스트 소스는 PR HEAD의 **실제 `study-note.html`의 모든 HTML·CSS·JS 및 실제 `service-worker.js`/manifest**를 localhost `127.0.0.1`에서 제공. `DOMContentLoaded init`, 원본 IndexedDB 업그레이드/저장/복원, 원본 UI 이전·다음 버튼, 실제 서비스워커 캐시를 그대로 실행.
- GitHub 제공 Windows 호스트의 설치 Chrome에서 **별도 임시 프로필** 생성, 외부 모든 페이지 요청 차단; 테스트 콘텐츠는 **합성 토픽 4건**만 주입. Google OAuth, 사용자 세션, Apps Script, LIVE Google Sheets 데이터 또는 저장 API 접속 없음.
- 테스트에서 캐시 응답의 A/B 마커만 로컬 서버의 임시 HTML 응답에 덧붙임. **리포지터리 PR 본문 HTML 파일 자체 변경 없음**.
- 검증 항목 7개 전부 통과:
  1. 실제 전체 PWA 초기화 + 새 IndexedDB 생성·접근
  2. 신규 격리 프로필의 **미인증** 상태 `hasActiveSecuritySession()===false` 및 UI 미인증 배지 확인(**실제 Google 로그인 성공 검사가 아님**)
  3. 합성 X/Y 요소 원문 속성·순서, 한글 우선 영문 병기, 실제 이전/다음 버튼 클릭, 토픽 이동 후 앞 토픽 내용 잔류 없음
  4. 실제 서비스워커 등록 및 버전 A 앱 셸 캐시
  5. 온라인 재접속 시 network-first로 버전 B HTML 다운로드 및 캐시 갱신, IndexedDB 토픽 복원
  6. 네트워크 오프라인 재접속 시 최신 B 캐시 fallback, 로컬 데이터와 탐색 버튼 정상
  7. 390px 화면에서 IEEE 기술규격 802.11p/802.1X 원문 보존, 가로 넘침·하단 탐색 가림 없음.
- CI 로그: `WINDOWS_PREVIEW_AUTH_GATE_PASS`, `WINDOWS_PREVIEW_UI_PASS`, `WINDOWS_PREVIEW_CACHE_A_PASS`, `WINDOWS_PREVIEW_CACHE_UPDATE_PASS`, `WINDOWS_PREVIEW_OFFLINE_PASS`, `WINDOWS_PREVIEW_MOBILE_PASS`, `WINDOWS_PREVIEW_CACHE_QA_PASS 7 checks`.
- Windows 신규 워크플로 Actions **`38825257292` Success**. 결과 artifact `study-note-windows-preview-cache-1` (ID `12015281149`, 테스트 개인정보·LIVE 원문 없음). 추가 CI: 기존 Chrome `38825257215` Success; WebKit `38825257232` Success; 기존 회귀 `38825257225` Success.

## 4. 보존·배포·미완료
- 이번 GitHub 파일 변경은 **추가 테스트 스크립트와 GitHub Actions workflow 2개뿐**. 본문 `study-note.html`, 서비스워커, 원문 데이터, 용어집, 기존 번호·계층형 처리 코드 변경 0.
- 운영 `main` 미변경, LIVE 데이터 무승인 수정 0셀, PR #8 자동병합/수정 없음, PR #18은 Draft/Open/미병합, 운영 배포 0.
- 과거 LIVE 의미 손실 T0493/X, T0466/W, T0521/X 3셀의 복원은 별도 승인 전 보류(0/3). 기술적 의미 전수검수 미완료. PDF 원본 감사 기존 61/3,800토픽(약 1.61%)이며 이번 단계 확대하지 않음.
- **실기기 사용자 검수:** 운영 버전 iPhone/태블릿 2/2 정상 보고; PR #18 실물 PC·태블릿·스마트폰 0/3(별도 Windows 호스트의 Chrome 자동화는 실물 계정 로그인 검수와 다름).
- Google Apps Script `Code.gs` 변경 없음: 저장 불필요 / 함수 실행 불필요 / 재배포 불필요.
- 다음 정확한 재개점: 사용자 집 PC `aliasel`을 온라인으로 만든 뒤 원격 접속→ Phase 17 미정리 비공개 TEMP 자료 우선 삭제 확인→ 이미 인증된 실제 PC Chrome에서 **현재 운영 URL**의 인증 상태·캐시 기록을 비파괴적으로 확인→ 별도 프로필/localhost에서 PR #18 미리보기 재실행·실제 클릭/화면 확인. 운영 사용자 Chrome 인증 세션의 쿠키·토큰 추출/전송 및 프로필 초기화 금지. 실제 로그인 상태 확인이 필요하면 사용자 비밀번호를 요구하지 말고 기존 세션의 UI 상태만 관찰. PR #18 운영 main 병합·배포는 실기기 검수 및 명시적 승인 전 보류.
