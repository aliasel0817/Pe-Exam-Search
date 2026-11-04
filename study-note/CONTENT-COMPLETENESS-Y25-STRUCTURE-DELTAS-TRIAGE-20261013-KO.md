# 학습노트 MASTER Y 기술요소 이력변화 25건의 구조적 차이 분류 (읽기 전용)

- 기록일: 2026-10-13. GitHub 콘텐츠 감사 Draft PR #8 전용 문서.
- 대상: 2026-10-06 백업과 LIVE의 학습대상 Y 기술요소를 통합ID로 정렬하고, ' · ' 최상위 분절수 차이를 검출한 **25건**. 10/11 사본 대비 LIVE Y는 학습대상 3,799/3,799 정확히 동일함을 이전 체크포인트에서 확인.
- 진단 주의: **문자열 분절 수(중점/화살표/번호)**는 실제 필수기술요소의 개수와 다름. 괄호 중첩·제목 프리픽스·화살표·줄바꿈 번호를 고려해야 하며, 단순 5→1 검출만으로 다섯 항목이 한 항목으로 삭제됐다는 결론은 오류.
- 이번 분류는 **변경 경로 및 고유 핵심명칭 문자열 검사**이며, 원문 PDF·표준 전체의 완전성 최종 통과와 구분.

## 1. 6건 — ' · ' 열거에서 화살표 흐름·번호형 단계로 변경

| ID | 토픽 | LIVE 단계명 순서 확인 | 과거 대비 판정 |
| --- | --- | --- | --- |
| T0262 | RTE 개념도 | Event Detection → Real-time Integration → Real-time Analytics → Decision Engine → Action → Feedback | 기존 다섯 단계 유지 + Feedback |
| T0230 | ODS 개념도 | Source System → ETL/CDC → ODS → Operational Query → DW | 최신 통합데이터·운영조회가 ODS 및 후행 조회 역할로 구조화 |
| T0273 | SLA 개념도 | Service Requirement → SLA Target → Monitoring → Reporting → Review → Compensation | 서비스 수준·측정·보고·보상 관계가 선형 표현으로 변경 |
| T0352 | 린 스타트업 제품개발 사이클 | Build → Measure → Learn → Pivot/Persevere → 다음 가설 | 구성요소 분절 대신 피드백 사이클로 표현 |
| T0407 | 캐즘 개념도 | Innovators → Early Adopters → Chasm → Early Majority → Late Majority → Laggards | 시장 수용자 구분이 오히려 상세화 |
| T3297 | Model Inversion Attack | Model Query → Output Information → Sensitive Attribute Inference → Data Reconstruction → Attack Validation → Defense Control | 중점분리 6개 항목을 번호형 1)~6) 단계로 변경 |

- 기존 5개 요소(또는 T3297의 6개)와 LIVE의 각 핵심 명칭·단계 순서를 비교. **6건 모두 핵심 단계의 순서/개념이 기능적으로 식별됨**. 
- ' · ' 기준 분절 수가 1로 변한 이유는 **표기 구분자가 화살표 혹은 번호/줄바꿈으로 변경**된 것. 5~6개 요소의 실제 삭제라는 증거가 아님.
- 별도 자동 필수 순서검사에서 위 6건 전부 통과. 예: RTE 6개 단계, ODS 5개, SLA 6개, Lean 5개, Chasm 6개, Model Inversion 6개.

## 2. 17건 — 최상위 분절수 1개 증가 및 요소명 구체화

대상: **T0379, T0402, T0254, T0261, T0239, T0411, T0272, T0274, T0283, T0414, T0415, T0306, T0408, T0422, T0634, T0546, T2326**.

- 10/06 Y는 대체로 범용 문구 또는 짧은 요소명 5~6개로 기술. LIVE는 실제 기술구조·구성요소 명칭이 6~7개로 확장됨.
- 의미 단위의 예: T0379(아키텍처) Component/Relationship/Interface/Principle/Constraint/Quality Attribute, T0402의 Integration/Governance/AI Platform, T0254의 Process Discovery·Conformance Checking·Performance Analysis, T0414의 Open Call·Crowd·Platform·Incentive, T0306의 Inbound/Outbound/Coupled Innovation.
- 추가 항목 표기 검증: T0546 EI/EO/EQ/ILF/EIF/UFP 6기술요소+ISO/IEC 표기, T2326 IVF의 Embedding/Centroid/Inverted List/Coarse Search/Nprobe/Fine Distance 6개 요소, T0634 MVC의 User Request/Controller/Model/View Selection/Response 5단계가 LIVE Y에서 순서대로 확인됨. **이 3건 자동 순서검사 모두 통과**.
- **원래 있던 17건의 필수 세부 하위지식이 모두 보존됐다는 뜻은 아님**. 현재 확인은 가장 큰 구조변화 원인이 분절·구체화라는 것뿐, 진짜 손실은 원본/인접 토픽과 비교해야 확정할 수 있음.

## 3. 2건 — 기존 OSI 7계층 묶음의 정밀도 결함 유지

| ID | 백업(10/06) | LIVE | 원천에서 확인된 계층 구조 |
| --- | --- | --- | --- |
| T2714 | Session Presentation이라는 묶음 요소 존재 | Session/Presentation 묶음 유지 | NW:1(서브노트)·NW:76(교재)의 7계층 구분 |
| T2715 | Network DataLink라는 묶음 요소 존재 | Network/Data Link 묶음 유지 | NW:2(서브노트)의 7계층 구조와 NW:83(교재)의 응용계층 별도 설명 |

- 기존과 LIVE의 최상위 분절 수는 **6→7**이지만, 늘어난 1개는 'OSI(정식 원어)' 프리픽스이며 **7개 계층을 독립적으로 작성했다는 증거가 아님**.
- 이전 버전도 세션/표현 또는 네트워크/데이터링크를 결합했으므로, **10월 6일 이후 실질 계층 삭제로 단정할 수 없음**. 현재 X에는 7개 계층이 있으므로 토픽 전체 지식 누락은 아님.
- 7계층의 구성·역할을 Y에서도 일대일로 나타내는 정확성 보강 제안은 별도 NW2 원천 시각검수 문서에 보존.

## 4. 자동검사 재현사항

| 구분 | 검사 토픽 | 통과 |
| --- | --- | --- |
| 흐름/번호형 단계 명칭 및 순서 | T0262, T0230, T0273, T0352, T0407, T3297 | **6/6** |
| 별도 필수 구성요소 명칭 및 순서 | T0546, T2326, T0634 | **3/3** |
| OSI 7계층 각각을 독립 Y 요소로 표현 | T2714, T2715 | **0/2** (이미 알려진 묶음 결함) |

- 자동검사는 실제 LIVE Y 텍스트에서 필수 요소명들을 주어진 순서대로 검색함. **문자열 순서 테스트**이지 PDF 기술의 의미/정확성/하위절차 완전성 자동 검증은 아님.
- **25/25 구조 차이의 기술상 원인을 분류**했으며 이번에 추가로 발견된 새로운 단계 소실 확정 0건. 이미 존재하던 OSI 세부계층 분리후보 2건은 정밀 보강 필요.
- 과거 3,265건 전체 변경 중 **분절 수가 달라진 25건에만 적용되는 결론**. 분절 수 같은 나머지 변경에서 세부 지식 손실이 없다는 보증은 아님.

## 5. 다음 단계 및 운영변경 금지

1. LIVE Y의 나머지 변경 3,240건(분절 수 동일하나 영어 확장·서술 교체 가능)에서 **필수요소명·역할·하위단계 삭제 후보를 위험 기반 점검**. 약어의 영문 풀네임 병기가 늘어났다고 원문 지식보존을 자동인증하지 않음.
2. MG25의 정정 초안은 원천/표준 근거 확보 후 승인별로 최소 셀 제안. T0255·T0355·T0310 의미범위 충돌은 최우선 분리.
3. 현재 LIVE 저장/수정 **0건**, 운영 main 병합/배포 **0건**, PDF 등록 데이터 변경 **0건**. PR #8 문서만 추가.
4. Apps Script 저장·함수 실행·재배포 모두 **불필요**.
