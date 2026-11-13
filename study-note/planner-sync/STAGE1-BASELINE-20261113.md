# 학습노트 다중 기기 학습계획 동기화 — Stage 1 기준선 (2026-11-13, KST)

> 상태: **Stage 1 read-only analysis complete**. 이 문서는 운영 main, LIVE MASTER, 사용자 진도 및 인증 데이터를 수정하지 않고 작성한 인계 기준선이다.
> 후속 단계에서 수치·경로가 달라지면 원본을 지우거나 추측으로 갱신하지 말고 새로운 스냅샷과 근거를 추가한다.

## 1. Git/운영 기준선

- Repository: `aliasel0817/Pe-Exam-Search`
- 조사 시 `main`: `56bf0901ee7a7d8e41165a90d6b65e41893f8ee3`
- 학습계획 변경 PR #81은 이 커밋에 병합 완료. 관련 기능: 신규 토픽 편입, 100일 일차 표시, 별도 학습계획 생성.
- 운영 URL: `https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html`
- 운영 `study-planner.js`를 읽기 전용으로 받아 현재 main 파일과 콘텐츠 일치 확인.
- GitHub Actions Pages 배포와 기존 MuPDF R9 release gate는 병합 커밋에서 성공 기록.
- 조사 시 미병합 PR 18개: MuPDF M1–M7 및 R0–R8 (#52–#68, 일부 겹침), 문서 PR #8. **이들을 임의 병합·변경하지 않는다.**
- 운영 Apps Script: 프런트엔드 기본 서명된 API, `health` 읽기 전용 응답 정상 (`ok=true`, `schemaVersion=15`, 토픽 3895, 기존 학습정보·보안·주석 시트 준비 완료). `health`에는 현재 배포의 versionNumber가 나타나지 않는다.
- 2026-11-04 R8 보고서에서 운영 배포 **v21** 소스가 `study-note/mupdf-migration/r5/source/Code.js`와 바이트 단위 일치했다고 확인. **현재 v21 유지 여부와 Script Properties의 직접 바인딩 ID는 이번 1단계에서 독립적으로 재검증하지 못했다.** 향후 운영 쓰기 이전에 실제 배포판 소스를 최신 pull/비교해야 한다.
- `study-note/mupdf-migration/r7/source/Code.js`는 분리된 후속 실험 소스이며 운영 소스라고 간주하지 않는다.

## 2. 실제 Google Sheets 읽기 전용 조사

- 운영 추정 원장 이름 `topic_study_data`; 이름이 동일한 다른 파일도 존재하므로 **실제 스크립트 속성의 스프레드시트 바인딩 확인 전에는 이름만으로 수정 대상 결정 금지**.
- 현재 조회한 원장 `암기장`: grid 3896행(헤더 포함), 26열. 유효 통합ID 3895건, `학습대상=Y` 3834건, `N` 61건.
- 기본 `study-plans/pe141-100days.json`: 100일/5회독, 고유 3812개 토픽, 배정 19060건.
- 파일 기준 신규 `Y` 미편입 24개. `N`인데 정적 계획에 남아 있는 ID 2개 (`T1865`, `T3125`); 자동 삭제 금지.
- **신규 24개는 정적 JSON과의 차이만 뜻함.** 사용자가 이미 각 기기에서 24개를 편입했는지는 이번 조사로 알 수 없음. 재편입 전 기기 및 중앙 상태 확인 필수.
- 기존 탭: `암기장`, `학습정보`, `관리기기`, `보안감사로그`, `주석동기화`, PDF/첨부 관련 시트 등.
- `학습정보` 헤더: 통합ID, 즐겨찾기, 학습상태, 개인메모, 최종학습일시, 복습횟수, 미암기횟수, 업데이트일시, 수정버전, 최종미암기일시. A열 값이 있는 기록 165행(조회 시점).
- **`학습계획`·`학습계획일정`·`학습계획진도` 같은 전용 탭 없음.** 원문인 `암기장`의 기존 열/값을 동기화 저장소로 사용하지 않는다.

## 3. 현재 프런트엔드 데이터 경로

| 데이터 | 코드/저장 | 서버 동기화 상태 |
| --- | --- | --- |
| 원문/MASTER | `study-note.html`의 `pe-study-note-db` (`topics` 등) | 읽기 갱신, 원문 별도 관리 |
| 일반 학습정보 | `pe-study-note-db`의 `learningStates` | signed GET `learningStates`, signed POST `saveLearningStates` 구현 |
| 계획 원문 | `study-planner.js`의 `pe-study-planner-v1` DB, `plans` store | 없음. 최초 기본 JSON 로컬 저장. 추가/편입도 로컬 |
| 회독 진도 | 같은 DB의 `progress` store | 없음. key=`planId|date|topicId`; status=`done`/`miss`, updatedAt |
| 현재 선택 계획 | `localStorage`의 `peStudyPlanner.active.v1` | 없음(기기별 UI 선호값) |
| 페이지 크기 | `localStorage`의 `peStudyPlanner.pageSize.v2` | 없음(기기별 UI 선호값) |

- `study-planner.js` `openDb`: IndexedDB v1, `plans`(keyPath id)·`progress`(keyPath key).
- `load`: 로컬 `plans` 읽은 후 기본 `pe141-100d-2026`가 없으면 정적 기본 파일을 1회 저장. 기존 로컬 계획은 서버와 비교하지 않음.
- `record`: 학습계획에서 실제 토픽 클릭 후 `암기/미암기`를 선택하면 컨텍스트 또는 현재 날짜를 기준으로 로컬 `progress` put. `todo`는 별도 레코드가 아닌 기록 부재.
- `plannerExtendPlan`·`plannerCreateAutoPlan`·CSV/JSON 복원도 로컬 `plans`만 변경.
- 일반 학습 기록은 `study-note.html`의 `recordLearningResult`→`updateLearningState`→`syncSingleLearningState`와 연결되어 있으나, 같은 이벤트로 호출하는 `StudyPlanner.record`는 서버 전송을 하지 않음.
- 기존 `syncLearningStates`: 일반 학습정보 dirty 기록을 50건씩 전송한 뒤 원격 목록을 받아 업데이트. **계획/진도 조회·전송은 포함되지 않음.**
- UI 문구 실측: `plannerManagement`의 제목은 '학습계획 추가 · 진도 백업/복원 사용 안내', 하위 `planner-local-info`는 기기별 저장을 명시. `plannerExport`와 `restoreProgressUpload`의 알림에는 기능 번호 **③/②**가 일부 남아 있으나 화면의 현재 백업·복원 번호는 **④/⑤**임. Stage 6에서 동기화 설명과 번호 불일치를 함께 수정.

## 4. 운영 Apps Script / 보안 구조

- 공개 소스 기준 `Code.js`의 `doGet`은 `learningStates`, `securityStatus`, `annotationsync` 등을 지원하며 계획·진도 GET action은 없음.
- `doPost`는 `saveLearningStates`, `saveAnnotations`, PDF·첨부·관리기기 갱신 등을 지원하나 계획·진도 POST action은 없음.
- 학습정보 쓰기: `LockService.getScriptLock`으로 직렬화, 기존 `updatedAt`이 더 늦으면 쓰기 무시. **다중 기기 시각 차이·동일 시각·동시 수정에 대한 확정적 충돌 해결은 아님.** 이 로직을 계획/진도에 단순 복제하지 않는다.
- 인증: 신뢰기기 ACTIVE, 등록된 Google 계정, HMAC 서명, nonce/시간창, 요청 ID와 pollKey 기반 비동기 처리. 계획/진도 API도 **동일 인증·검증 경계** 사용.
- 보안 설정/등록기기/토큰/개인메모 원문 등 민감정보는 본 문서에 기록하지 않음.
- 이미 등록된 plan JSON 원본이 수십만 자이므로 Google Sheets 한 셀에 무제한 직렬화하지 말고 일정 **일별 행 또는 안전한 크기의 청크** 사용 설계 필요.

## 5. 데이터 손실·충돌 위험 (우선순위)

| 위험 | 심각도 | 방지 요구 |
| --- | --- | --- |
| 최초 동기화 시 여러 기기의 서로 다른 동일 ID 계획을 한쪽으로 덮어씀 | 매우 높음 | 기기별 백업/스냅샷 → 원격 읽기 → 비교 → 명시적 병합/충돌 보류 |
| 같은 계획·날짜·토픽을 PC와 모바일에서 달리 체크 | 높음 | 서버 revision/조건부 갱신, 충돌 표시/정책; 클라이언트 시각만 믿지 않기 |
| 오프라인에서 수정 후 새 기기로 이동 | 높음 | 변경내역(dirty/operationId) 큐, 재접속 후 중복 없이 전송 |
| 전송 성공/응답 타임아웃에 의한 중복 저장 | 높음 | 서버측 영속적인 idempotency, retry-safe mutation |
| 일정 변경 중 다른 기기의 진도 기록이 '고아'가 됨 | 높음 | 계획 일정 revision와 진도 결합; 삭제 금지, 매핑 보존 |
| 기본 계획 자동 시딩과 원격 계획 중복 | 높음 | 최초 로컬 시딩/원격 병합 순서 확정, 고정 planId 처리 |
| 완료 대신 '미암기'가 최신 상태만 보고 잘못 사라짐 | 중상 | 암기상태와 회독별 일자 상태 별도 저장 |
| 스프레드시트/Apps Script 배포판 대상 착오 | 높음 | 실제 scriptId·배포버전·Sheet 바인딩 확인, 운영 릴리즈 전 게이트 |
| 각 기기 선택 계획/날짜·페이지 크기가 제각각 | 낮음 | 서버에 저장할 공유 데이터와 개인 UI 선호값 분리 |
| 동기화 후 UI가 갱신되지 않거나 로컬 캐시가 구버전 | 중간 | 렌더 갱신·서비스워커 업데이트, 최소 PC/태블릿/모바일 스모크 테스트 |

## 6. 현재 검증 / 미검증

**확인됨(읽기 전용)**
- GitHub main SHA, PR #81 병합 및 미병합 PR 목록; 운영 planner JS와 main 동일
- Google Sheets 실제 메타데이터·헤더·통합ID/학습대상 집계 및 원본 기본 계획 차이
- 운영 Apps Script `health` 응답 및 기본 인증 설정 여부(비밀값 열람 없음)
- 소스 기반 IndexedDB/동기화/백업/복원/API 인증 경로

**미확인(검증했다고 주장 금지)**
- PC/태블릿/스마트폰의 실제 IndexedDB 계획·진도 레코드 수 및 충돌 여부
- 2026-11-13 현재 Apps Script 정확한 deployment versionNumber 및 Script Properties 스프레드시트 ID
- 새 계획/진도 서버 API 동작 — 아직 구현되지 않음
- 운영 데이터 통합, 실제 다기기 동기화, 실기기 회귀검수 — 미실시

## 7. Stage 2로 넘길 확정 경계

1. 기존 저장소와 원문은 삭제/덮어쓰지 않는다. 데이터 모델은 최소 `plans` + 일정 + `progress` 분리.
2. 서버측 계획/진도 각각 고유키·revision·updatedAt·operationId·device provenance·상태를 갖추고 충돌 방지 규칙을 정의한다.
3. 최초 동기화는 **백업 → 서버 읽기 → 로컬/서버 비교 → 병합 미리보기 → 사용자 확인 → 저장**을 기본으로 설계한다.
4. 평상시에는 기존 `학습정보 동기화` 버튼에 통합하되 기존 일반학습 정보 저장은 회귀 보호한다.
5. 오프라인 동작과 재접속 후 동기화는 필수. 시트 새 탭/행은 Stage 2 승인 설계 이후 격리된 시험용 사본에서만 개발.
6. 작업 비중: 설계·구현·이전·UI **80%**, 표적 테스트·출시 확인 **20%**. 테스트의 양을 늘리기보다 충돌·원본 보호·인증·기본 기능 회귀에 집중한다.
7. Stage 2는 설계·문서화만. 별도 승인 없이는 운영 main, 운영 Apps Script, LIVE MASTER 및 기기별 IndexedDB 변경 금지.
