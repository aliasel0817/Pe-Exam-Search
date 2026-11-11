# Phase 11 — 누적 정밀도 후보의 공식 근거 검토 및 T4037 공란 이력 (2026-10-12)

## 기준·범위
- 운영 main `df003d34b00dff00bdbf370de62a9389f94d8e8e`, 운영 PWA `4.6.9-technical-glossary-phase5-rc1`. Phase 7~10은 Draft PR #8에만 기록.
- LIVE `topic_study_data / 암기장`: 읽기 전용. 사용자 원문·기존 MP3·TTS·PDF·관리·인증·스크립트 변경 없음.
- **이번 단계는 Phase 8~10의 '개별 의미검수 279건'에 새로운 요소를 더한 것이 아님.** 기존 정밀도 후보 14건의 우선순위를 세분화하고, T4037 이력을 별도 확인한 단계임.

## 기존 정밀도 후보 14건의 기술적 위험도 재분류

### A. 기술 범위·조건 누락의 영향이 큰 6건 — 우선 정확성 검토
| 통합ID | 도메인 | 요소 | 검토 근거 |
| --- | --- | --- | --- |
| T3144 | SE | Delta CRL | RFC 5280의 상태 변경에는 보류 해제 `removeFromCRL` 포함. 단순 '폐지 항목 추가'로 축약한 내용이 삭제/변경까지 포괄하는지 우선 확인 |
| T3151 | SE | RADIUS Access-Reject | RFC 2865: Attribute 조건 불충족, 서비스/정책 등으로 거부 가능. '인증실패'만으로 한정하면 해석 범위를 좁힐 수 있음 |
| T1212 | SV | VDI Remote Display Protocol | Microsoft RDP는 화면·입력 이외에도 정책 허용 시 클립보드·드라이브·장치 등의 리디렉션을 지원. '화면·입력만'의 전제 조건 필요 |
| T1721 | SV | 우주클라우드 Ground Link | NASA/ESA 자료상 우주-지상 링크는 결과뿐 아니라 원자료, 원격명령, 원격측정 등도 전달. 현지처리의 '전송량 감축 목표'와 '항상 결과만'을 구별 |
| T1213 | SV | C-ITS Security Credential | ETSI TS 102 941은 단순 익명성 대신 가명성·비연결성·책임성을 함께 요구. 익명성 '보장'의 무조건적 단정 피할 필요 |
| T1556 | SV | Lightning Network HTLC | Lightning Labs의 조건부 지급/환불 원리에 따르면 지급 성공은 사전이미지·경로/잔액 등 조건에 종속. '조건부 결제 보장'이 무조건 성공으로 읽히지 않도록 확인 |

### B. 시험답안 용어정밀도·표현 검토 5건 — 보강 여부 미확정
| 통합ID | 도메인 | 요소 | 검토 근거 |
| --- | --- | --- | --- |
| T1586 | SV | Contrast/Text Size | WCAG가 규정하는 명도 대비·확대 조건과 '가독성 보장'을 구별 |
| T0165 | MG | Secure Disposition | NIST SP 800-88r2의 제거 수준은 주어진 노력 수준에서 접근 불가능을 목표로 함. '복구 불가능'의 절대적 단정과 차이 |
| T0351 | MG | MVP | Eric Ries의 정의는 최소 노력으로 검증학습을 최대화. '최소비용'만으로 목적을 좁히지 않도록 문맥 확인 |
| T1923 | AI | Zero-shot / Few-shot Learning | 토픽의 '예시 제공·문맥 내 추론'과 일반 ML에서의 학습 설정 개념을 구분 |
| T2429 | DB | Measurement | '오류건수·비율을 실행·측정'은 측정규칙 실행과 오류지표 산출을 혼합하여 표현상 명확성 확인 필요 |

### C. 동일 토픽의 K/X·절차 전체 문맥상 유지 가능 3건
| 통합ID | 도메인 | 이유 |
| --- | --- | --- |
| T0032 | MG | BAM Alert의 '즉시'는 이상·지연을 조기에 알려 대응을 촉진한다는 기능목표와 연결됨. 별도 0지연 보장은 서술하지 않음 |
| T0133 | MG | Messaging의 실시간성/비동기성은 별개 성질로 공존 가능하며 특징·토픽 문맥과 충돌하지 않음 |
| T1269 | SV | Fast Data의 '즉시'는 저지연 스트림 분석/행동의 목표로 문맥상 이해 가능. 물리적 0지연을 보장한다고 단정하지 않음 |

- **누적 상태 갱신 (Phase 10 기준 279개): 현재 유지 가능 266 / 기술정확도 후속 11 / 원본 형식 별도 유지 2 / 미검수 1,500.**
- 11건은 실제 오류로 확정된 건수가 아니며, 자동 원문 수정/새 학습내용 생성/대량치환은 허용하지 않음. 6건은 사용자 학습에서 오해 위험이 커 우선순위를 높인 것.
- Phase 7 별도 62건의 후속 후보(T0083/T0708/T0759)는 **이 279/11건 집계에 추가하지 않음**.

## T4037 공란의 읽기 전용 이력 비교
- LIVE 통합ID **T4037**(SE)은 학습대상 `Y`, 개념(J) 있음, 키워드(K)·등장배경(W)·특징(X)·기술요소(Y)·필요성(Z) 공란.
- **2026-10-06 작업 MASTER**(3856 행), **2026-10-06 최종 반영 백업**(3856 행): T4037 ID 없음.
- **2026-10-11 생성된 'topic_study_data의 사본'**: 통합ID T4037은 현재 운영과 동일한 행에 존재, **5개 열 공란도 동일**.
- 따라서 해당 토픽은 10월 6일의 두 선행 자료 이후 10월 11일 사본 생성 전 추가된 것으로 판단되며, Phase 7~11 검수 중 셀이 비워진 것이 아님.
- 원본 J열은 Agentic AI 일반 정의에 초점이 있어, 토픽명 '자율형 Agentic AI 위협 및 대응방안'과 정의의 초점이 일치하는지도 별도 의미검수 필요.
- T4036 또한 10월 6일 두 선행 자료에는 없었으나 10월 11일 사본과 운영 시트에는 존재. 원인·등록 주체·정확한 등록 시간은 확인되지 않음.
- **운영 원본의 K/W/X/Y/Z 자동 생성·수정 금지.**

## 공식 참고자료
- RFC 5280 인증서 폐지상태: https://www.rfc-editor.org/rfc/rfc5280
- RFC 2865 RADIUS Access-Reject: https://www.rfc-editor.org/rfc/rfc2865
- Microsoft RDP 부가 리디렉션: https://learn.microsoft.com/en-us/azure/virtual-desktop/redirection-remote-desktop-protocol
- NASA Deep Space Network 명령·원격측정: https://science.nasa.gov/learn/basics-of-space-flight/chapter18-3/
- ESA 우주-지상 Telemetry / Telecommand: https://www.esa.int/Enabling_Support/Space_Engineering_Technology/Onboard_Computers_and_Data_Handling/Telemetry_Telecommand
- ETSI TS 102 941 C-ITS 프라이버시: https://www.etsi.org/deliver/etsi_ts/102900_102999/102941/02.02.01_60/ts_102941v020201p.pdf
- Lightning Labs HTLC: https://docs.lightning.engineering/the-lightning-network/multihop-payments
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- NIST SP 800-88 Rev.2: https://csrc.nist.gov/pubs/sp/800/88/r2/final
- Eric Ries MVP 정의: https://leanstartup.co/resources/articles/what-is-an-mvp/

## 비변경 보증 및 후속
- 운영 Sheets 쓰기 0, 운영 JS/HTML/CSS·A안 번호·줄바꿈·`gap:.52rem` 변경 0.
- 기존 PDF·검색·관리·인증·주석 코드 변경 0; TTS/MP3/GCS/Cloud Run/매니페스트 변경 0.
- Apps Script **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
- 다음: 미검수 **1,500건**의 도메인별 문맥검토 확대. 우선 A군 6개는 정밀도 판단 근거를 유지하되 **원문 교정은 사용자 별도 승인 전까지 금지**.
- 실제 Galaxy Tab / iPhone PDF 조작 및 화면 QA는 미완료.
