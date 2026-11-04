# 학습노트 기술지식 완전성 감사 — AI 가속기·EGP·MRC 의미경계 정밀검수

- 기준일: 2026-10-14, Draft PR #8의 신규 읽기 전용 검수. 운영 `main` · LIVE 시트 · Drive PDF · TTS 변경 없음.
- 작업 시작 시 기존 `CONTENT-COMPLETENESS-AI-NW-PRESERVATION-PROPOSAL-20261014-KO.md`가 이미 존재하여 중복 교정안을 만들지 않고 **의미범위 위험과 원전 추가 근거만 보강**.
- LIVE 통합ID 및 행: T4003 = 행 2045(AI), T2604 = 행 2640(NW), T1936 = 행 1935(AI). I/J/K/X/Y·P/Q 현재 내용을 직접 재조회.
- 원본 PDF 전체 이미지를 이번 검수에서 시각 확인한 것은 아님. 이전 원본 텍스트층 확인 결과는 검토 배경일 뿐, 여기서는 LIVE/공식 외부규격의 범주 관계를 확인.

## 1. T4003 — TPU·NPU·ASIC는 배타적인 세 반도체 분류가 아님

- LIVE 제목: `AI Accelerator Chips (TPU, NPU, ASIC)`. X는 TPU(텐서연산), NPU(신경망), ASIC(특정 AI Workload)으로 기능특성을 비교. Y는 Matrix/MAC Array, SRAM, Interconnect, Low-precision Datapath, Compiler/Dataflow, Host/Memory Interface 6개 공통 구조.
- **Google 공식 TPU 아키텍처**는 TPU를 **Machine Learning을 위해 설계한 ASIC**이라고 직접 정의하며, TPU의 TensorCore가 Matrix Multiply Unit(MXU: Systolic Array), Vector Unit, Scalar Unit 등을 포함한다고 설명한다.
- 따라서 `TPU/NPU/ASIC`를 상호 배타적인 동일 계층의 세 칩 *종류*로 표시하거나 `ASIC는 TPU와 다른 제3종`이라고 단정하면 기술적으로 오해 위험. 일반 범주인 **ASIC(응용특화 집적회로)** 안에 TPU 같은 특화 가속기가 포함될 수 있으며, NPU도 특정 신경망처리 특화 프로세서 계열.
- **수정안 설계 조건**: 기존 Y의 6개 공통 하드웨어 구조·용도를 모두 보존하고, 별도의 `분류기준/관계` 항목 후보를 더해 **설계형태(ASIC 등), 사용목적(TPU/NPU), 연산구조(Systolic Array/Matrix Multiply·MAC)**를 다른 축으로 설명. NPU가 언제나 동일한 회로구조를 쓴다는 단정 금지.
- **미승인 신규 항목 제안(7번째 후보)**: `분류·용도 관계(TPU는 행렬연산 특화 ASIC의 한 구현이고 NPU는 신경망 연산 특화 가속기 계열이며 ASIC는 주문형 집적회로의 설계형태 범주, 구현별 연산구조·메모리·컴파일러 제약을 비교)`.
- 선행 제안 문서와 충돌 시 **위 범주 포함관계를 우선 재검증**. 신규 항목 추가는 단순 표제 약어 복원이 아니라 **상·하위 분류관계의 정확성 보존** 목적.
- 공식 근거: https://docs.cloud.google.com/tpu/docs/system-architecture-tpu-vm / https://docs.cloud.google.com/docs/compute-area/tpus

## 2. T2604 — EGP 범주와 역사적 고유 프로토콜 구분

- LIVE I/J의 EGP 설명은 '서로 다른 AS 간 경로 교환'이라는 **외부 라우팅 범주**에 적합. X는 초기 EGP에서 BGP로 발전한다고 설명. Y는 AS/Border Router/Reachability/**Policy/Path Attribute**/Inter-AS Session을 나열.
- **RFC 904(1984)**의 역사적 `Exterior Gateway Protocol`은 이웃 게이트웨이 인지·유지/Reachability 교환(Neighbor Acquisition, Hello/I-H-U, Poll, Update)에 초점. 이것은 **BGP-4의 경로속성 기반 정책 라우팅** 자체가 아님.
- **RFC 4271**의 BGP-4는 AS 간 경로정보와 정책적 Path Attribute(ORIGIN/AS_PATH/NEXT_HOP 등)를 사용. BGP의 ORIGIN Attribute가 'EGP' 값을 갖는다고 **BGP와 EGP가 같은 프로토콜이라는 뜻은 아님**.
- **판정**: Y의 Policy/Path Attribute는 `외부 라우팅 범주로서 EGP`를 설명하는 경우 **적절할 수 있음**. 다만 제목을 RFC 904의 특정 `EGP 프로토콜`로 읽는 사람에게는 고유 메시지 절차가 빠진 대신 BGP 속성이 섞인 구성으로 오독 가능.
- **보존형 최소 명확화 제안**: J 또는 X에 `외부 게이트웨이 프로토콜이라는 분류명(현대 BGP 포함)과 역사적 EGP(RFC 904) 고유 프로토콜은 구별`이라는 정의범위를 표시하는 안. 이전 Y의 6개 구성요소를 근거 없이 삭제하거나 BGP 전용 단계로 전체 대체하지 않음.
- 원본 NW:10/NW:380은 분류 도식 중심이라는 과거 텍스트층 확인이 있으나 이번에는 PDF 화면 전체를 재검증하지 않았으므로 **어느 해석이 원래 시험문항의 목적이었는지 확정 보류**.
- 공식 근거: https://www.rfc-editor.org/rfc/rfc904 / https://www.rfc-editor.org/rfc/rfc4271

## 3. T1936 — MRC 추출형·생성형은 모델구성 역할과 다른 분류축

- LIVE J는 질문·문서의 정답 구간 또는 내용을 추론하는 기계독해. X에는 `Extractive` / `Generative MRC`가 모두 명시.
- Y는 질문·지문·인코더·어텐션·정답 예측기·평가라는 **공통 기능구조**, 예측기 설명에서 `Span 또는 생성 Text`를 이미 구분.
- **판정: Y에서 Extractive/Generative 약어를 독립 2요소로 열거하지 않았다는 사실만으로 오류 확정 불가.** Y의 기능구성 분류와 X의 정답 산출방식 분류는 별개의 축이며 현재 Y 예측기에서 양 방식을 기술함.
- 후속 원본 `AI:19` 서브노트, `AI-1:181` 교재의 정답 구간·생성형 구별 도식과 평가방법을 대조해 두 방식의 조건/예제를 유지하는지 판단. 원본 시각검수 전에는 Y 항목 추가·삭제 보류.

## 4. 단계·변경 보호

| 대상 | 기술문서 교차검토 | 원본 PDF 화면 시각검수(이번) | 새 정정 후보 | LIVE 적용 |
| --- | --- | --- | --- | --- |
| T4003 | 공식 TPU/ASIC 분류 확인 | 미실시 | 7번째 비교요소의 **범주 포함관계** 정교화 | 0 |
| T2604 | RFC904 vs RFC4271 경계 확인 | 미실시 | 개념 범위 명확화안, 원전 학습의도 보류 | 0 |
| T1936 | LIVE X/Y 자체 논리 교차확인 | 미실시 | 우선 현상 유지, 원본 대조 대기 | 0 |

- 이 3건은 기존 130개 약어 불일치 자동후보 중 **일부 의미검토**이며 130건 전부의 검수 완료가 아님.
- 제안은 원본 전체 텍스트를 공개 저장소에 복사하지 않았음. 기존 출처유형별 PDF 페이지키·토픽연결 보존.
- Apps Script **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**. 운영 GitHub `main` 병합 없음.
