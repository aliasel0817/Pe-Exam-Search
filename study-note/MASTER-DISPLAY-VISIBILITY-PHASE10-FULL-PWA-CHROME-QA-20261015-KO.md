# 학습노트 Phase 10 — 실제 PWA HTML 기반 Chrome 상세화면·반응형 QA (2026-10-15)

> **최상위 목표:** Google Sheets MASTER 원문 무변경, 특징(X)·기술요소/구성요소(Y)의 요소별 독립 줄과 한글 우선 표시, 영문·알고리즘·수치·수식·단계·설명 원문 무손실 유지. 이 문서는 **실제로 통과한 검사만** 기록하며 PDF/TTS/기존 감사 PR #8을 확장하거나 수정하지 않음.

## 1. 시작 기준 및 원본 변경 제한

- 운영 `main` SHA: `6e8527497a519a5da35e6838209aa628892e5ff9` (변경 없음).
- 가시성 개선 브랜치 `fix/study-note-display-preserve-authored-lines-20261014`, Draft PR #18 (미병합).
- 고정 기준서: PR #8의 `MASTER-DISPLAY-VISIBILITY-RAW-DATA-PRESERVATION-RECHECK-20261014-KO.md`.
- 이전 Phase 9 체크포인트 `MASTER-DISPLAY-VISIBILITY-PHASE9-COMMA-CHROMIUM-QA-20261015-KO.md`의 내용을 초기화하거나 되풀이하지 않음.
- LIVE `암기장` 조회(읽기 전용): 실제 3,859행, 학습 Y 3,800 / N 59, 통합ID 중복 0, T4037/T4038 존재.
- **이번 단계에서 LIVE Sheets 쓰기 0건, 기존 데이터 복원·수정 0건, 운영 배포 0건.**

## 2. 이전 QA와 이번 QA의 차이

이전 Phase 9에는 독립적으로 구성한 정적 표시 템플릿의 Chromium 검사까지만 기록되어 있었음. 이번에는 테스트 과정에서만 만들어지는 **PR #18 전체 `study-note.html` 임시 사본**을 Google Chrome 154 헤드리스에 직접 로드.

- **원본 PWA의 HTML, CSS, 실제 `setReadableStudyField` 및 `showTopicById`, `moveTopic` 함수 사용**.
- QA 임시 사본에서만 `init`의 원격 서비스/IndexedDB 초기화를 `bindElements()`로 대체하고 Google OAuth·TTS 외부 스크립트 비활성화. 원본 소스 파일·운영 서버는 변경하지 않음.
- 실제 운영 LIVE 원문 대신 **합성 토픽 5개**만 주입. 외부 네트워크/API/Google Sheets 쓰기 없음.
- X/Y의 독립 항목, 한글 우선 표시, MCTS 중첩 괄호 6요소, T4036 쉼표형 특징 6항목, T4038 기존 번호/하위계층, 긴 설명·수식(RFC 8446, TLS 1.3, HMAC-SHA256, 99.999% 등), 토픽 이전/다음 전환을 검증.
- GitHub Actions 검사 러너에 Noto Sans CJK KR 폰트를 설치하여 한국어를 네모 글리프가 아닌 정상 글자로 시각 확인. **실제 OS의 맑은 고딕 및 iOS Safari 렌더링과 동일하다고 주장하지 않음.**

## 3. 검증 증거 및 합격 범위

검사 실행: GitHub Actions **`38660230329`**, Chrome 버전 **154.0.8037.97**, CI 상태 **success**.

| 검사 종류 | 실제 확인 결과 |
| --- | --- |
| 가상 토픽 × Chrome 화면크기 | **5 × 4 = 20/20 합격** |
| 화면 너비 | Windows형 1280px, 태블릿형 820px, iPhone형 390px, 좁은 화면 320px |
| 화면 가로 넘침 | 문서 전체 **0건**, X/Y 표시영역 **0건** |
| MCTS 기술요소 / T4036 특징 | 각각 **6항목 독립 표시** |
| 기존 다중 줄 Y / 하이픈 X | 번호 추가 없이 `pre-wrap` 및 원문 개행 유지 |
| 수치·수식·표준명의 부분문자열 보존 | **예시 전부 통과** |
| 실제 앱 `showTopicById` / `moveTopic` | 4/4 화면크기에서 이전·다음 토픽 전환 성공 |
| 한국어 폰트 적용 후 스크린샷 | 20개 PNG 생성, 한글로 가독 가능 |

검사 결과와 화면 캡처: GitHub Actions run `38660230329`, artifact **`study-note-visibility-browser-3`** (ID `11938223859`, 만료 예정 2026-10-29). 원문 MASTER 데이터가 포함된 스크린샷 아님.

기존 기술표시 Node 회귀검사(별개): 같은 HEAD에서 기존 GitHub Actions run `38660230212` **success**, 이전 Phase 9의 기술표시 테스트 **40 PASS**. 이는 PDF 기능을 개발하거나 인터럽트를 재개한 의미가 아님.

## 4. 직접 확인된 화면 상태와 유보사항

- PWA 화면의 X/Y 요소명, 한글 우선 영문 병기, 행 구분, 기존 계층 줄바꿈은 Chrome 캡처에서 확인됨.
- **기존 고정 하단 탐색 버튼이 전체페이지 스크린샷의 특정 위치에서 내용 카드 위에 겹쳐 보이는 영역**은 있음. 이는 PWA 공통 탐색 UI의 고정 위치 동작이며, 이번 X/Y 파싱에 따른 텍스트 내용 손실로 판정하지 않음. 실제 스크롤·실기기 체감성 확인 전 무분별한 네비게이션 CSS 수정 금지.
- **실제 Windows 장치에서의 Chrome, 실물 iPhone Safari, Galaxy Tab의 브라우저 QA 미실시**. Linux Chrome 가상 화면을 실기기 테스트라고 부르지 않음.
- 운영 인증/서버/실사용 IndexedDB/Service Worker 조건도 이번 격리 QA 범위 밖.
- 원문 T4038의 `suface code` 철자는 콘텐츠 정확성 감사 후보일 뿐 표시 작업 중 자동 정정 금지.
- 과거 원문 손실 복원 제안 T0493/X, T0466/W, T0521/X는 PR #8 별도 관리 및 사용자 승인 전 보류.

## 5. 서로 분리한 진행률 (합산 금지)

- **화면 구조 자동 목록 표시:** 이전 Phase 9 전수검사 X **3,793/3,800**, Y **3,796/3,800**; 나머지 X 7/Y 4는 기존 번호형·하이픈·공란을 원문 그대로 보존하는 경우 포함.
- **원문 구조 무손실 검사:** 이전 Phase 9 LIVE 7,600/7,600셀, 원문 요소 36,944개 불일치/설명/숫자 토큰 누락 0. **이번 단계에서는 이 전수검사를 다시 실행했다고 주장하지 않음**. PWA 표시 코드 `study-note.html`은 그 이후 이번 Phase 10에서 무변경.
- **한글 우선 항목:** 이전 검사 기준 기술요소 12,023개 표시(의미감사 최종 합격과 무관).
- **전체 PWA DOM 오프라인 Chrome 검수:** 20/20 합격, 토픽 이동 4/4 합격(합성자료).
- **실제 Windows PC / iPhone / Galaxy Tab 기기 QA:** 미완료(0/3).
- **전체 기술적 의미검수:** 전수 미완료.
- **PDF 원본 감사:** 과거 기준 61건 시각 1차 대조, 화면 완료율에 합산 금지.
- **LIVE 정정·복원 승인 반영:** 0셀.

## 6. 코드·배포 상태 및 정확한 다음 작업

- Phase 10 추가 파일(브랜치 한정): `study-note/tests/test_visibility_browser_qa.cjs`, `.github/workflows/study-note-visibility-browser-qa.yml`. **이번 단계에서 기존 PWA 렌더러의 기능 코드 변경 없음**.
- 테스트 자동 실행 및 스크린샷 artifact 저장. PR #18을 Draft/미병합 유지하고, 운영 `main` 및 Google Sheets LIVE를 변경하지 않음. 감사 PR #8 보존.
- Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
- 다음 작업은 실제 기기 Windows PC, iPhone Safari, Galaxy Tab에서 PR #18 코드의 X/Y 줄바꿈·토픽 전환·가독성과 고정 하단 탐색 버튼의 체감 중첩 여부를 검증. 검사 미완료 상태에서 운영 배포·자동 병합 금지.
