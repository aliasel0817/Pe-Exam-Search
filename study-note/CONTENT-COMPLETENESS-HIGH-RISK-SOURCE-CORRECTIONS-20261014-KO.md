# 학습노트 핵심기술요소 정밀도 감사 — 8개 토픽의 10개 최소치환 시안과 T4036 원천 범위

- 날짜: **2026-10-14**. 기존 Draft PR #8의 **미승인 정정 제안서**, LIVE 변경 아님.
- 대상: LIVE `암기장` 정확한 ID/행/컬럼 및 공식 문서와 대조. **8개 통합ID, 10개 제안 위치**(T1212는 X/Y/Z 각 한 군데).
- 완료한 자동검사: 10개 대상 원문 조각이 지정 LIVE 셀 안에서 **각각 정확히 1회씩 존재(10/10)**; 후보 조각이 비어 있지 않음. 이는 사전 변경대상 탐지이며 기술적 완전성 최종통과나 LIVE 반영을 의미하지 않음.
- 변경 전후 같은 토픽 J/K/W/X/Y/Z의 다른 기술요소, 기존 용어·기출문항·인접 토픽과의 지식보존 검증 및 사용자 승인 전까지 **단 한 글자도 적용하지 않음**.

## 1. 근거 기반 최소변경 시안 (원문 전체를 GitHub에 공개하지 않음)

| 통합ID | 열 | 현재 문제 있는 *부분문구* | 미승인 최소치환 제안 | 근거/상태 |
| --- | --- | --- | --- | --- |
| T3144 | Y | `변경된 폐지항목만 추가 제공` | 기준 CRL 이후 폐지상태 변경(신규 폐지·보류 해제·폐지 사유 변경)을 제공하며 기준 CRL과 결합해 현재 상태를 판단 | RFC 5280 Sec 5.2.4 / 5.3.1; 기술범위 좁힘(확인) |
| T3151 | Y | `인증실패로 접속을 거부` | 자격·인가조건 또는 서비스정책을 충족하지 못한 요청을 거부 | RFC 2865 Sec 2/4; 거부조건 지나친 제한(확인) |
| T1212 | Y | `화면·입력만 단말과 전송` | 화면·입력정보를 기본 전송하며 클립보드·드라이브·장치 리디렉션은 정책에 따라 제한·차단 | Microsoft RDP redirection docs; 리디렉션 제어 누락(확인) |
| T1212 | X | `개인단말에는 화면만 전달` | 개인단말에는 원격 화면·입력을 제공하고, 리디렉션 허용 여부는 정책으로 통제 | Microsoft RDP redirection docs; Y와 같은 절대화 문제 |
| T1212 | Z | `개인단말에 기업데이터를 남기지 않고` | 클립보드·파일·장치 리디렉션과 단말 저장을 통제하여 기업데이터 잔존 위험을 줄이고 | Microsoft RDP redirection docs; 데이터 미잔존 단정(확인) |
| T1721 | Y | `필요한 결과만 지상으로 전송` | 관측 원자료·처리결과·상태정보를 필요에 따라 지상으로 전송하고 지상 명령·업데이트를 수신 | NASA DSN uplink/downlink overview; 결과만 전달이라는 배타적 단정 |
| T1213 | Y | `메시지 신뢰성·익명성을 보장` | 인증서·서명으로 메시지 출처와 무결성을 검증하고 가명성·비연결성·책임성을 균형 있게 지원 | ETSI TS 102 941(2021) privacy section; 익명성 보장 절대화 |
| T1556 | Y | `조건부 결제를 보장` | 해시 원상 공개와 시간잠금에 따른 조건부 지급·환불을 구성하되 경로·유동성·기한에 따라 결제 실패 가능 | Lightning HTLC guide; 지급 성공의 보장 오해 |
| T0165 | Y | `복구 불가능한 삭제·파기` | 정보 민감도와 선정된 삭제기법에 맞는 수준에서 데이터 접근·복원을 실행 가능한 노력으로 어렵게 하는 매체 정화 | NIST SP 800-88 Rev.2(2025); 절대적 복구불가 단정 |
| T0351 | Y | `최소비용으로 핵심가설을 검증` | 최소한의 노력으로 고객에 대한 검증학습을 최대한 확보 | Eric Ries MVP primary definition; 최소 비용만 강조 |

### 판정 상세

1. **T3144 Delta CRL**: RFC 5280은 Base CRL 이후 상태변화와 `removeFromCRL` 예외를 다루므로 기존 '폐지항목 추가만' 설명은 누락. **기술내용 범위 누락 확인**.
2. **T3151 RADIUS**: RFC 2865는 속성·서비스/인가 조건 불충족의 Access-Reject를 지원하므로 인증실패만 원인으로 한정할 수 없음. **조건 설명 부족 확인**.
3. **T1212 BYOD/VDI**: RDP 등 Remote Display Protocol은 화면/입력 외에 기기·드라이브·클립보드 리디렉션 설정을 허용할 수 있음. **VDI 서버측 처리 장점은 유지하되 단말 잔존 0을 보장하지 않도록** X/Y/Z 연동 검토.
4. **T1721 우주클라우드**: NASA 지상통신은 하향 원격측정/정보, 상향 원격명령을 다룸. 특정 현지 AI 임무에서 결과만 보낼 수 있다는 목표와 **모든 Ground Link가 결과만 보낸다는 명제**를 분리.
5. **T1213 C-ITS**: ETSI TS 102 941은 ITS Safety Message 프라이버시에서 익명성 단독보다는 가명성·비연결성을 적절한 해법으로 보고, 행동의 책임 추적 가능성과 균형을 요구. **임의로 100% 익명성 보장 단정 금지**.
6. **T1556 Lightning**: HTLC는 Hash Preimage와 Timelock을 이용한 조건부 청구/환불 구조이지 개별 결제 경로의 성공 보장은 아님. 원문 K/X/Z의 채널·라우팅/유동성 정보 보존.
7. **T0165 ILM**: NIST SP 800-88 Rev.2(2025)는 **주어진 노력수준에 비추어 대상 정보 접근을 불가능하게 만드는 것**으로 매체 정화를 정의. '어떤 상황에서도 복구 불가능'이라는 절대 표현과 구별.
8. **T0351 MVP**: Eric Ries 원 정의는 **최소 노력으로 최대 검증학습 확보**, 단순 최소 비용에 환원하지 않음. 원래 핵심가설/Build-Measure-Learn/Pivot 학습목적은 반드시 보존.

## 2. 원본 PDF도 의미가 충돌한 T4036 — 우선적 별도 처리

- LIVE T4036 제목: **비인간 신원(NHI, Non Human Identities)의 보안 취약점**. 개념은 첫 줄 AI 기반 **인간·조직 신원 위조**를, 둘째 줄 서비스·계정/기계신원 관리 결함을 함께 설명. K에는 NHI·IAM·Secrets·Credential Rotation·Workload Identity 등 NHI 중심 용어가 있음.
- 실제 연결 서브노트가 아니라 **교재 페이지키 SE-2:1, SE-2:2의 서로 다른 PDF 파일 두 개**를 파일/토큰과 연결해 **텍스트층 읽기 전용**으로 확인. 1페이지 본문은 서비스 계정·API Key·토큰·인증서·Workload·IoT 등 NHI 정의를 정확히 다루지만, 공격절차는 **음성·영상 OSINT/딥페이크/인간사칭** 중심. 2페이지에는 NHI 자격증명 악용 절차가 따로 이어지나, 공격유형은 또 인간 신원 위조와 NHI 에이전트 위조를 나란히 분류.
- 따라서 LIVE가 원본 내용을 **그대로 반영한 측면이 있으므로 데이터 입력 중 오류가 새로 발생했다고 단정할 수 없음**. 원전 해설 자체가 한 토픽에 **NHI 취약점과 AI 신원사칭 일반공격을 혼합한 의미범위 갈등**을 갖고 있음.
- OWASP Non-Human Identities Top 10(2025)의 NHI 취약점은 **부적절한 Offboarding, Secret Leakage, Vulnerable Third-party NHI, Insecure Authentication, Overprivileged NHI, Long-lived Secrets, NHI Reuse 등**이다. NHI는 서비스계정/키/토큰/워크로드 정체성으로 인간 얼굴·음성 사칭과 구분.
- **수정안 초안 지침(실제 셀 수정 아님)**: 주된 제목을 유지한다면 NHI 정의·공격면·권한/자격증명/수명주기 결함을 중심으로 I/J/K/X/Y/Z의 계층/역할을 재정렬하고, 인간 신원 위조/딥페이크/생동성 감지는 **접점이 있는 보조 시나리오로 보존**하거나 다른 학습토픽과 연결하여 기존 내용을 삭제하지 않음.
- 기존 실제 등록된 PDF 파일/토큰/페이지키와 T4036 직접연결 **변경 금지**. 완성된 의미정정은 사용자 학습 목적 확인 후 확정. PDF 2페이지는 **텍스트층만 확인**했으므로 이번 기록을 '화면 전체 시각검수 완료'로 합산하지 않음.
- 괄호문법 참고: T4036과 T3297에서 `1)`, `2)` 등 번호형 목록의 닫는 괄호를 오탐한 자동검사 결과를 재평가함. 3,799건 Y에 대해 숫자형 리스트 마커를 제외한 **실제 괄호불균형 0건**. 위 내용범위 문제와 구문 오류는 별도.

## 3. 별도 입력 대기 / 실제 서비스 영향

- **T4037**: 제목은 자율형 Agentic AI 위협·대응인데 J는 자율 Agentic AI 일반 정의이며 K/W/X/Y/Z·PDF 모두 공란. 이 이력은 10월 11일 백업부터 동일; 콘텐츠 신규 완성 및 출처 확정은 별도 승인 대상. T4036과 혼합 수정 금지.
- **T0000**: 학습대상 Y지만 '정보관리 기술사' 총괄항목으로 K와 PDF 부재, J/W/X/Y/Z는 있음. 이 토픽을 학습 제외로 바꾸거나 채우는 작업은 사용자 승인 없이 하지 않음.
- 본 PR은 **문서만 추가**. 승인 전 운영 LIVE 원문, 기존 교재·서브노트 원본/관계·토픽 연결, GitHub main, 메인뷰어/검색/인증/관리 UI 및 TTS 자산은 **전혀 수정하지 않음**.
- Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.

## 4. 공식근거(원문 그대로가 아닌 필요한 사실만 요약)

- RFC 5280 CRL Profile: https://www.rfc-editor.org/rfc/rfc5280
- RFC 2865 RADIUS: https://www.rfc-editor.org/rfc/rfc2865
- Microsoft Windows 365 RDP redirection controls: https://learn.microsoft.com/en-us/windows-365/enterprise/manage-rdp-device-redirections
- NASA DSN uplink/telemetry: https://science.nasa.gov/learn/basics-of-space-flight/chapter18-3/
- ETSI TS 102 941 V2.1.1(2021), privacy in ITS: https://www.etsi.org/deliver/etsi_ts/102900_102999/102941/02.01.01_60/ts_102941v020101p.pdf
- Lightning Labs HTLC: https://docs.lightning.engineering/the-lightning-network/multihop-payments/hash-time-lock-contract-htlc
- NIST SP 800-88 Rev.2 FINAL: https://csrc.nist.gov/pubs/sp/800/88/r2/final
- Eric Ries MVP definition: https://leanstartup.co/resources/articles/what-is-an-mvp/
- OWASP Non-Human Identities Top 10: https://owasp.org/projects/non-human-identities-top-10
