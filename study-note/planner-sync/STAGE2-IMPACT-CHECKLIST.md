# 학습노트 다중 기기 동기화 — Stage 2 영향 범위·8단계 체크리스트 v1

**문서 목적:** 단계별 독립 개발/리뷰/인계 시 요구 누락과 원본 변경을 막는 단일 체크리스트.
**확정 기준일:** 2026-11-13 KST · **main:** `56bf0901ee7a7d8e41165a90d6b65e41893f8ee3` · 1단계 PR #82 Draft(아직 main 미병합) · 운영 데이터 변경 없음.

## 1. 정확한 변경 후보와 금지 대상

| 대상 | 현황 근거 | 후속 구현 범위 | 반드시 보존 |
| --- | --- | --- | --- |
| `study-note/mupdf-migration/r5/source/Code.js` | 과거 운영 v21과 일치했던 참고 스냅샷. doGet 413~, doPost 468~, signed auth 3077~, 학습정보 2596~ | **Stage 3 실제 배포된 Code.js를 새로 읽기/대조한 격리된 새 백엔드 후보에 신규 action만 추가** | 기존 기능의 역사적 소스 그대로; archive 원본 덮어쓰기 금지 |
| `study-note/backend/` 신규 addon/통합안 | 기존 PDF addon/백엔드 자료 포함 | Stage 3 신규 sync handler와 시트 바인딩/헤더/검증/락 로직 제안 | PDF·첨부·보안 라우트 불변 |
| 새 시험 Google Sheets | 현재 LIVE 원장에는 전용 학습계획 탭 없음 | Stage 3 **합성 자료를 담은 격리용** 4개 시트 작성·조회 | LIVE MASTER 암기장·학습정보/관리기기 무변경 |
| `study-note/study-planner.js` | 4~17 IndexedDB v1, 436~507 계획 변경, 539~600 로컬 저장/표시 | Stage 4 IndexedDB v2 점진 업그레이드, outbox, 계획·진도 동기화; Stage 5 이전 마법사; Stage 6 안내 문구 | 기존 `plans/progress`와 완성된 100일 회독/그룹/페이징 |
| `study-note/study-note.html` | 3189~3215 기존 DB, 4357~4470 signed API, 5198 버튼, 7211~7235 학습 결과, 7560~7590 기존 동기화 | Stage 4 기존 동기화 버튼에 planner bridge, Stage 6 상태 표시/오류 안내 | 기존 일반 학습정보·인증·PDF/이미지·서브노트·TTS·필기·검색 |
| `study-note/service-worker.js` 및 앱 shell | 기본 캐싱은 유지, planner JS 캐시 포함 | Stage 6/8 검증 후 필요한 캐시 버전·신규 코드 전달 | 오프라인 자산·기존 PWA 설치 보존 |
| `study-note/tests/*`, `.github/workflows/*` | PR #81의 Chromium/Windows planner QA 존재 | Stage 3 서버 synthetic fixture, Stage 7 작은 수의 핵심 회귀만 추가 | 다른 채팅의 테스트 결과나 CI job 무단 변경 금지 |
| `study-note/planner-sync/*.md` | Stage 1 PR #82, Stage 2 별도 문서 | 버전 명세·단계 인계·검증표 기록 | 기존 문서 삭제/축약 금지 |

> 운영 Script Properties나 실제 Google Apps Script 배포를 변경하려면 Stage 8 명시적 사용자 승인 필요. Stage 3은 isolated test deployment만 가능.

## 2. 변경하지 않을 핵심 동작(회귀 보호 대상)

1. MASTER 토픽 원문/개념/기술요소의 온라인·오프라인 조회, 개별 필드 수정 기능.
2. 기존 학습정보의 즐겨찾기, 개인메모, 기억함·미암기 기록, 복습횟수/미암기횟수/최종 학습시각.
3. 100일 5회독 기존 3812개 통합ID의 일자별 19060건 배정; 신규 Y 24건 편입 여부는 **기기별 확인 전 가정 금지**.
4. 페이지 크기 10/20/30/50, 학습 그룹·진도 필터·검색·날짜 이동, 최초 시작일/오늘 일차를 표시하는 기존 통계.
5. 새 학습계획 생성(기간·회독·토픽 대상), CSV/JSON 가져오기, 원본 JSON 백업, 진도 JSON 백업/복원.
6. PDF/이미지·첨부자료·원본 페이지 매핑·브라우저 캐시·주석/필기 동기화 및 PDF.js/MuPDF 관련 상호 독립 기능.
7. Google OAuth·ACTIVE 신뢰기기·보안감사·HMAC·nonce·응답 폴링의 기존 검증.
8. 기존 main/미병합 MuPDF M1~M7, R0~R8 PR #52~#68 및 PR #8에 포함된 작업은 임의 수정/병합하지 않음.
9. 다른 채팅이 열어 둔 원격 Windows 터미널·PID·Git 작업영역은 소유권 확인 없이 사용/종료/재설정 금지.

## 3. 작업비중 80:20, 총 8단계/32개 세부 작업

| 단계 | 주요 작업/점검 | 체크 건수 | 전체 노력 | 이번 단계 상태 |
| --- | --- | ---: | ---: | --- |
| 1 | GitHub/운영/Sheets/기기 구조 증거 수집 및 기준선 | 4 | 8% | DONE · PR #82 |
| 2 | 시트·API·revision/충돌·첫 통합·Stage 3 요청서 | 4 | 10% | **설계 작성 완료**(검토용 PR 미병합) |
| 3 | 격리 서버·4개 시트·서명 API·테스트 | 5 | 20% | TODO |
| 4 | 클라이언트 outbox·GET/POST·일반 동기화 버튼 연결 | 5 | 21% | TODO |
| 5 | 각 기기 첫 통합·상충 계획/진도 보존·복구 | 4 | 14% | TODO |
| 6 | 사용자 안내·컴팩트 상태/오류·백업/복원 설명 | 3 | 7% | TODO |
| 7 | 표적 자동/브라우저/보안/오프라인/다기기 회귀 | 4 | 15% | TODO |
| 8 | 최종 승인/별도 병합·배포/운영 응답 확인 | 3 | 5% | TODO |
| **합계** | | **32** | **100%** | **Stage 1~2 설계만** |

Stage 1~6 = **개발·설계 80%**; Stage 7~8 = **검수·출시 20%**. *비중은 완료 예정 시간/기간을 보장하지 않으며 작업 집중도를 뜻함.*

### 단계별 상세 완료 조건

- **Stage 1**: [x] 1단계 READ-ONLY 기준선; [x] 실제 Sheets 헤더; [x] 운영 JS; [x] 2단계 인계 완료.
- **Stage 2**: [x] 4시트/해시/append-only 스키마 명세; [x] GET/POST/영속 opId 명세; [x] 최초 이행·충돌·오프라인/복원 정책; [x] 3단계 독립 요청서 작성.
- **Stage 3**: [ ] 운영 배포판 버전·Script 바인딩 읽기 전용 확인(불가 시 미확인); [ ] isolated Sheets/Apps Script 4시트 생성; [ ] signed API·분할 업로드; [ ] 진도 이벤트·CAS/idempotency; [ ] 최소 서버 합성 검사와 API 계약.
- **Stage 4**: [ ] DB v1→v2 안전 업그레이드(기존 2 stores 불변); [ ] 동기화 queue; [ ] GET/POST 및 server snapshot hash; [ ] 기존 버튼 영역별 결과 통합; [ ] 오프라인/재시도.
- **Stage 5**: [ ] 첫 실행 백업; [ ] 기본 plan ID 및 신규 토픽 중복 탐지; [ ] 초기 진도 합치기·충돌 보류; [ ] 중단/복원/다음 기기 마이그레이션.
- **Stage 6**: [ ] 전체 안내 텍스트(기기별 저장/번호 오류) 수정; [ ] 마지막 동기화·pending·충돌 컴팩트 표기; [ ] 사용성(최초 동기화/수동 JSON 백업과 원격 공유 차이) 확인.
- **Stage 7**: [ ] 필수 병합·다기기·중복; [ ] 오프라인/경합; [ ] 인증/원문 보존; [ ] 기존 학습·PDF/첨부·390/820/1280 반응형. 사용자 소유 PC/태블릿/모바일 검수는 별도 보고.
- **Stage 8**: [ ] 사용자 main/실운영 배포 명시적 승인; [ ] 승인된 파일만 별도 PR 병합 및 Apps Script·Pages 순차 배포; [ ] 실제 운영 버전·서버/파일 응답·진도 백업 확인.

## 4. Stage 7 최소 회귀 시나리오(12개 이내, 초기 구현 시 재사용)

| # | 확인 대상 | 성공 판정 |
| --- | --- | --- |
| 1 | 기존 기본 계획 로컬 로딩/기본 5회독 | 3812개/19060건 및 과거 진도 불변(합성 fixture) |
| 2 | 새 계획 생성 후 다른 기기 동기화 | 동일 planId/버전/날짜/그룹/토픽 수 |
| 3 | 신규 토픽 5회 편입 | 기존 배정 불변, 새 토픽 5회 정확 배정 및 중복 0건 |
| 4 | PC done→다른 기기 | 동일 날짜/key done, 다른 회독은 todo |
| 5 | 태블릿 miss→PC | 동일 날짜/key miss, 기존 일반 학습정보 별개 |
| 6 | 오프라인에서 2건 입력 후 재접속 | 2건 보존, pending 0, 원격 seq 정확 증가 |
| 7 | 동일 operationId 재전송/응답 손실 | 이벤트 중복 0, 두 번째는 duplicate ACK |
| 8 | 같은 key의 동시 done/miss | 1건 적용, 다른 1건 충돌 보류, 손실 0 |
| 9 | 같은 planId에 다른 날짜로 같은 신규 토픽 추가 | 일정 충돌 표시, 자동 10회 배정 금지 |
| 10 | 첫 통합 취소/부분 업로드 후 재시도 | 기존 IndexedDB 원본 보존/active revision 이전 유지 |
| 11 | 인증 실패(PENDING·revoked·nonce replay)/입력 위변조 | 서버 쓰기 차단, 보안 원본 불변 |
| 12 | 일반 학습·PDF·첨부 기본 동작 및 390/820/1280 화면 | 기존 필수 기능 정상, 가로 오버플로 없음 |

각 시나리오는 mock/synthetic data 기준. **실제 사용자 기기 검수는 별도 PASS/미확인** 표로 구분한다. 불필요한 대량 화면 캡처나 모든 토픽 전수 검사를 필수 조건으로 삼지 않는다.

## 5. Stage 3 이전 사실 확인/허용 범위

- Stage 2 중 READ-ONLY 확인: main SHA, PR 목록, 운영 Pages planner.js 문자열, Apps Script health 스키마 15, Google Sheets에 전용 학습계획 탭 없음.
- **미확인:** 실제 운영 Apps Script versionNumber/Script Properties spreadsheetId(이전 R8의 v21 보고만 확인), 각 기기 IndexedDB 계획·진도 목록, 운영에 신규 동기화 기능 실행 여부(현재 없음).
- Stage 2 문서 작업 중 production sheet write, Script project mutation, local user DB access, GitHub main 수정·배포 **없음**.
- Stage 3에서는 test-only branch + Draft PR. 타 채팅의 PR과 파일이 겹치면 먼저 현재 main/상대 PR diff 검토 후 별도 파일 후보로 격리.
- 승인된 운영 배포는 Stage 8. Stage 3/4/5/6/7의 기능 완료 보고와 실제 서비스 출시 보고를 혼동하지 않음.

## 6. 공통 인계 최소 필드

Stage/수행일자; 현재 main SHA; 원격 기기/절대경로/소유 세션; 읽은 자료/서버 배포 확인 결과; 변경 브랜치·PR·SHA; 수정 파일/시트; 보호한 원본; 통과 테스트(자동)/실기기; 위험·미확인; 다음 단계 요청서. 새 채팅에서 문서 링크로 먼저 기준선을 복원하되, **현재 운영 상태는 항상 다시 조회**한다.
