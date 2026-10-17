# 핵심 기술요소 보존형 추가 제안 — T4003 / T2604 (운영 미반영)

2026-10-14. 기존 Draft PR #8. **LIVE A:Z, 교재 PDF 및 링크 변경 없음.**

## T4003 AI Accelerator Chips (TPU, NPU, ASIC)

- LIVE I/J/K/X는 세 종류 TPU·NPU·ASIC 명칭과 각 사용맥락을 보존. Y는 **Matrix/MAC Array, On-chip SRAM, Interconnect, Low-precision Datapath, Compiler/Dataflow, Host/Memory Interface**라는 **공통 하드웨어 6개 요소**를 정확히 구별.
- 연결 교재 `AI-2:87`의 읽기 가능한 텍스트층은 **TPU의 Systolic Array/Matrix Multiply Unit, NPU의 MAC+Activation, AI 전용 ASIC의 Custom Compute Engine/Fixed-function Logic, 온칩 메모리와 데이터 이동 비교**를 제시. TPU는 AI에 특화된 ASIC의 구현 범주와도 겹쳐 **완전히 상호 배타적인 세 분류**라고 단순화하지 않음.
- **추가 7번째 Y 요소의 미승인 시안** (기존 6개 요소는 모두 유지):
  - `유형별 특화구조(유형비교: TPU(Tensor Processing Unit, 텐서처리장치)는 Systolic Array·Matrix Multiply Unit 기반 텐서연산, NPU(Neural Processing Unit, 신경망처리장치)는 MAC·활성화 연산 중심 모바일·엣지 추론, AI ASIC(Application-Specific Integrated Circuit, 주문형반도체)은 특정 연산에 최적화된 전용 회로; TPU도 AI 전용 ASIC의 한 구현형태)`
- 사전검수: LIVE Y에는 `TPU`, `NPU`, `ASIC` 문자 자체가 0건; 반면 I/K/X에는 존재. 기존 Y의 위 6개 요소명은 **6/6 존재** 확인; 시안 추가분의 괄호 수 균형 확인.
- 최종 적용 여부 결정 전 실제 교재 표/그림의 연산구조 비교를 다시 확인하고 기존 암기항목과 역할설명이 중복·충돌하지 않는지 검수. **원천 텍스트층 확인이며 PDF 시각 완전검수 완료라는 뜻이 아님**.

## T2604 EGP (Exterior Gateway Protocol) / T2566 BGP 보존

- LIVE T2604는 역사적 개별 EGP 프로토콜과 **외부 라우팅 프로토콜의 분류 명칭**을 함께 사용할 위험. Y의 `Path Attribute`·정책 등 기술요소는 **현대 BGP 개념**과도 관련. 이미 **T2566 BGP(Border Gateway Protocol)** 별도 토픽이 존재하며 AS PATH·LOCAL PREF·NEXT HOP 등을 Y에 기록함.
- 원본 페이지: `NW:10` 서브노트에는 IGP/EGP 범주 설명과 EGP/BGP 개별명칭을 함께 기록, 교재 `NW:380`은 IGP/EGP 분류와 'RIP·EGP·BGP 비교' 기출문제를 포함. 제목만으로 어떤 의미를 택했는지는 확정할 수 없음.
- **표준 구별:** RFC 904의 EGP(1984, Historic)는 Neighbor Acquisition / Neighbor Reachability / Network Reachability라는 기능 및 Hello/I-Heard-You / Poll / Update 기반. RFC 4271의 BGP-4는 AS_PATH 등 경로속성과 정책 기반 라우팅을 정의.
- 사용자 의도 확인 전 **양자 중 하나로 무단 치환 금지**.

| 선택안 | I/J의 개념 방향 | J 정의 시안(50자 이하) | Y에 보존할 필수내용 |
| --- | --- | --- | --- |
| **A 분류 중심** | 외부게이트웨이 프로토콜 범주 | 자율시스템 사이의 라우팅을 분류하는 외부 게이트웨이 프로토콜 범주 | 자율시스템/경계라우터/정책/도달성 + EGP(개별 프로토콜)·BGP 하위 유형 구별 |
| **B RFC 904 중심** | 역사적 개별 EGP 프로토콜 | 인접 게이트웨이의 네트워크 도달성 정보를 교환하던 과거 라우팅 프로토콜 | Neighbor Acquisition·Reachability·Update 절차·Polling/Hello, 기존 BGP Path Attribute 지식은 별도 T2566 또는 연결 참조로 **반드시 보존** |

- J 글자 수 사전 검사 A=36자, B=39자; 둘 다 50자 이하. 선택안만 문서 작성 상태.
- 어느 선택안도 원래 T2604에 있던 실제 BGP 관련 용어를 **삭제하라는 지시가 아님**. T2566의 별도 기술요소·원본·연결은 보호.
- RFC 원문: https://www.rfc-editor.org/rfc/rfc904 / https://www.rfc-editor.org/rfc/rfc4271

## 보호·QA 조건

- 본 문서는 시안/정확성 판정 경계 기록이며 **자동 수정/병합/실서비스 반영 0**.
- LIVE 쓰기를 원할 경우 사용자 승인 후 통합ID/기대현재값/셀 원문·변경분/필수명칭·계층관계 비교/복구 지점을 지정한 소규모 테스트 선행.
- 기존 A안 가시성 UI, GitHub main, PDF 등록·페이지링크, 인증/관리/검색, TTS/MP3/GCS 불변.
- Apps Script **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
