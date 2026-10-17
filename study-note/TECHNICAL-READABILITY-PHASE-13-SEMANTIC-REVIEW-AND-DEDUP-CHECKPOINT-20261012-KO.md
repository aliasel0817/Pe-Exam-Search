# 학습노트 Phase 13 — 짧은 기술요소 설명 50개 문맥 의미검수 및 이력 중복 방지 (2026-10-12)

## 기준과 안전선
- 운영 main SHA(작성 직전 재확인): `df003d34b00dff00bdbf370de62a9389f94d8e8e`.
- 작업 대상: Draft/Open PR #8, 개발 브랜치 `docs/study-technical-phase7-semantic-review-20261012`, 작성 직전 SHA `507aac12f71f3f9e2cd1a750282f24b7108a4813`. **운영 main에는 병합하지 않음.**
- LIVE Google Sheets `topic_study_data` > `암기장`, 스프레드시트 ID `11aQTUgWWC1KXYCI7KHQdAXjhJiov5sZvhkDRIh0Cl4A`: **읽기 전용**. 그리드 3,859행(헤더 1 포함), 데이터 3,858행, 학습 Y 3,799 / N 59, 26열.
- 운영 앱 버전 `4.6.9-technical-glossary-phase5-rc1`. Phase 5의 영문 용어 한글 병기, 메인뷰어 A안 번호·줄바꿈·`gap: .52rem`, 전체 설명 보존. 코드·인증·PDF·검색·관리·첨부자료·주석 기능 무변경.
- TTS/MP3/GCS/매니페스트/Cloud Run 비변경. 운영 Google Sheets 원문/Apps Script 변경 **0건**.

## 후보 모수의 독립 재확인
- 시트 Y열을 **괄호 중첩을 고려한 최상위 ` · `/줄바꿈**으로 분해하고 각 부분의 마지막 괄호를 짧은 설명으로 검출. 길이는 괄호 안의 유니코드 글자 수(공백 포함)로 산정.
- 줄별 독립 마지막 괄호를 무조건 추출하면 1,951개가 감지되지만, `T4036`의 번호식 자유서술 2개는 기술요소 설명이 아닌 **거짓 양성**. 이 두 건 제외 시 **1,949건 = 9자 이하 170 + 10~15자 1,779**로 Phase 7~12와 일치.
- Phase 12 누적 기준은 **379건(유지 354 / 정밀도 15 / 절차 원문 10), 미검수 1,400건**. 이전 표본추출을 다시 신규 검수로 가산하지 않음.

## Phase 13 이번 읽기 전용 문맥검수 — 총 50개 요소
- SW **25**, SV **15**, MG **10**. 각각의 현재 Y 설명을 같은 토픽의 제목·개념(J)·키워드(K)·특징(X) 및 주변 Y 요소와 대조함.
- **기존 설명으로 현재 문맥 유지 가능(K): 32**, **표/구성도/비교에서 짧은 역할표기가 적합(D): 16**, **의미 정밀도 후속(P): 2**.
- 이 50건은 **이번 채팅에서 읽고 개별 재판정한 요소의 수**이며, 과거 379건과 *상호배타적인 순수 신규 50건*이라고 확정하는 수가 아님.
- Phase 10의 140건과 Phase 8의 비탐지 표본 59건의 **전체 통합ID+요소명 명세가 공개 체크포인트에 부재**. 기존 문서에 명시적으로 등장하는 주요 항목과는 구별했지만, 비공개 전체 대조표를 회수하지 못했으므로 중복 가능성을 엄격히 통제.
- 따라서 **공식 누적 분모는 379/1,779, 잔여 1,400을 유지**. 429/1,350 등 미검증 수치로 변경 금지. 이번 50건의 ID·요소명을 다음 중복 제거용 추적대장으로 사용.
- 이번 결과에서 **기술적 오류 확정 0, 원문 변경 0**. K/D는 동일 토픽 문맥의 1차 적합성 판정일 뿐 각 기술표준 원문 전체를 일일이 대조한 심층 보증이 아님.

### 항목별 판정대장
판정코드: **K = 현 문맥 유지**, **D = 도식·표·비교에 적합**, **P = 의미 정밀도 후속**. 공개 저장소 보호를 위해 전체 K/X/Y 원문은 싣지 않고 요소명과 판단 근거만 기록함. 아래 요소명의 '구성요소:' 등 공통 접두어는 표시에서 생략함.

| 통합ID | 도메인 | 토픽 | 기술요소명 | 판정 | 개별 근거 |
| --- | --- | --- | --- | :---: | --- |
| T0005 | MG | 5 Force 구성도 | Rivalry | D | 산업 내 기존 경쟁의 강도에 해당하는 도식 축을 식별. |
| T0005 | MG | 5 Force 구성도 | Threat of New Entrants | D | 진입가능성과 진입장벽을 연결하는 경쟁요인 도식 설명으로 적합. |
| T0005 | MG | 5 Force 구성도 | Buyer Power | D | 구매자 교섭력을 평가하는 위치·기능이 다른 경쟁요인과 구분됨. |
| T0008 | MG | 7S Model | Style | K | 조직 리더십·의사결정 방식을 나타내며 Strategy/Staff와 구분됨. |
| T0008 | MG | 7S Model | Staff | K | 인력구성·배치·육성의 관리영역으로 7S 다른 요소와 구별됨. |
| T0014 | MG | ACCU | Measurement Interval | K | 동시접속 관측의 표본 간격과 평균 집계주기를 나타내는 역할이 명확함. |
| T0014 | MG | ACCU | Observation Count | K | 평균 산정에 사용되는 관측 횟수의 역할이 주변 요소와 연결됨. |
| T0015 | MG | ACU | Measurement Period | K | 기간별 평균을 산정하는 시간창 설정 요소로 문맥에 부합. |
| T0015 | MG | ACU | Observation Count | K | 평균의 표본 수를 가리키는 보조 지표로 역할 식별 가능. |
| T0015 | MG | ACU | ACU (Average Concurrent Users) | P | 같은 시트 T0014는 동시접속 시점별 평균을 명시하나 이 토픽은 총접속·활성사용자 평균처럼 읽힐 여지가 있음; 지표 정의 정합성 검토. |
| T0626 | SW | Microsoft SDL | Threat Modeling | K | 자산·위협경로·신뢰경계 확인을 보안 개발 수명주기의 설계활동으로 구분. |
| T0626 | SW | Microsoft SDL | Security Review | K | 릴리스 전 보안 검토·승인 단계로 인접 시험·설계 요소와 역할 구별. |
| T0666 | SW | RAD 기법 모델 | Requirements Planning | K | 요구와 범위를 초기에 정하는 RAD 계획 단계로 문맥 적합. |
| T0666 | SW | RAD 기법 모델 | Cutover | K | 시험·전환·교육·운영 배포의 인도 단계에 연결. |
| T0667 | SW | RAD 모델 구성도 | Requirements Planning | D | RAD 네 단계 중 요구계획의 시작 위치를 표시하는 간결한 도식 설명. |
| T0667 | SW | RAD 모델 구성도 | Construction | D | 사용자 피드백을 반영하는 반복 구현·시험 단계로 다른 단계와 구분됨. |
| T0667 | SW | RAD 모델 구성도 | Cutover | D | 운영 전환 및 교육 구간을 표현하며 앞선 Construction과 구별됨. |
| T0692 | SW | SDLC | Testing | K | 통합·시스템·인수 시험은 시험단계의 주요 예시; 같은 토픽 Implementation이 단위구현을 담당해 시험종류 완전열거로 해석하지 않음. |
| T0693 | SW | SDLC 구성도 | Test | D | 시험단계의 단위·통합·시스템 검증을 요약한 구성도 표기로 적절. |
| T0693 | SW | SDLC 구성도 | Deployment/Operation | D | 시험 이후 배포·서비스 운영 단계의 위치와 기능을 식별. |
| T0693 | SW | SDLC 구성도 | Maintenance | D | 배포 이후 변경·개선과 피드백으로 이어지는 단계로 적절. |
| T0694 | SW | SDLC 프로세스 | Requirement Management | K | 요구 수집·분석·기준선의 관리역할을 단계별 흐름에서 식별. |
| T0694 | SW | SDLC 프로세스 | Design Process | K | 아키텍처와 상세설계 수행 범위로 다른 구현 단계와 구별됨. |
| T0694 | SW | SDLC 프로세스 | Construction | K | 코딩·빌드·단위검증을 구현활동으로 묶은 문맥이 적합. |
| T0694 | SW | SDLC 프로세스 | Verification/Validation | P | 단계별 시험·요구충족만으로 명세 적합성 검증과 사용자 목적 충족 확인의 차이가 충분히 드러나는지 검토; 시험 외 분석·점검도 수단이 될 수 있음. |
| T0694 | SW | SDLC 프로세스 | Maintenance Process | K | 운영단계의 변경·개선 관리로 개발 중 변경관리와 구분 가능. |
| T0733 | SW | SW 위기 | Maintenance Burden | K | 규모·복잡도 증가에 따른 변경·이해비용 상승이라는 문제축에 부합. |
| T0771 | SW | SWEBOK | Requirements | K | 요구 도출·분석·명세·관리를 다루는 지식영역 역할을 식별. |
| T0771 | SW | SWEBOK | Testing | K | 시험 설계·실행·관리라는 SWEBOK 지식영역을 간명하게 표시. |
| T0771 | SW | SWEBOK | Maintenance | K | 인도 후 SW 변경·진화 활동에 대한 지식영역 설명으로 적합. |
| T0771 | SW | SWEBOK | Configuration Management | K | 형상·버전·변경통제로 산출물 일관성을 확보하는 지식영역에 부합. |
| T0771 | SW | SWEBOK | Engineering Management | K | 계획·측정·품질·위험을 포함하는 공학관리 영역으로 읽힘. |
| T0772 | SW | SW 개발 방법론 | Process | K | 수행단계와 절차를 정의하는 방법론 요소로 Technique와 구별됨. |
| T0772 | SW | SW 개발 방법론 | Technique | K | 분석·설계·구현·시험의 수행기법이라는 역할이 명확함. |
| T0772 | SW | SW 개발 방법론 | Role | K | 참여자의 책임과 협업방식을 정하는 요소로 산출물과 구분됨. |
| T1207 | SV | BaaS 구성도 | Database/Storage | D | 구조화 데이터·파일 저장의 플랫폼 내부 구성요소로 도식 적합. |
| T1207 | SV | BaaS 구성도 | Push Service | D | 백엔드 이벤트를 단말로 전달하는 별도 서비스 역할이 분명함. |
| T1238 | SV | CSB 구성도 | Cloud Providers | D | 클라우드 브로커 반대편의 실제 자원공급자를 나타내는 도식 역할. |
| T1360 | SV | MSP | Patch/Configuration | K | 서비스 제공자의 패치·구성 운영 범위를 SLA 기반 관리와 연결. |
| T1578 | SV | 멀티클라우드 | Unified Monitoring/Cost | K | 복수 클라우드 환경의 관측·비용관리 요소로 식별 가능. |
| T1611 | SV | 분산 클라우드 | Network Connectivity | K | 분산된 실행영역과 중앙 관리영역을 연결하는 필수 네트워크 역할. |
| T1642 | SV | 소버린 클라우드 | Encryption/Key Control | K | 규제·주권 요구에 따른 키 통제 위치를 나타내는 전형적 요소. |
| T1712 | SV | 오픈스택 프로젝트 구성요소 | Glance | K | 가상머신 이미지 관리·제공 서비스로 다른 OpenStack 구성요소와 구별. |
| T1715 | SV | OpenStack | Nova | K | Compute 담당 프로젝트를 표식하는 짧은 구성요소 설명으로 적합. |
| T1715 | SV | OpenStack | Neutron | K | 네트워크 기능 담당 프로젝트를 Nova와 구별하는 표식에 적합. |
| T1739 | SV | 유틸리티 컴퓨팅 구성도 | Metering | D | 자원 사용량 계측 뒤 과금으로 넘어가는 단계도 역할이 명확. |
| T1739 | SV | 유틸리티 컴퓨팅 구성도 | Billing | D | 계측된 사용량을 비용산정에 연결하는 도식 단계로 적합. |
| T1801 | SV | 클라우드 SLA | Remedy/Credit | K | SLA 미충족 시 협약에 정의한 구제·서비스 크레딧 항목으로 기능 식별; 모든 계약의 보상 보장을 뜻하는 것으로 단정하지 않음. |
| T1806 | SV | 클라우드 마이그레이션 방법 | Rehost | D | 6R 전략 비교에서 아키텍처 변경을 억제하는 이전 유형의 위치가 명확. |
| T1806 | SV | 클라우드 마이그레이션 방법 | Retire | D | 이전 없이 불필요한 시스템을 폐기하는 6R 선택지로 다른 경로와 구별. |

## P 2건 상세 근거와 후속 확인점
1. **T0015 / MG / ACU(Average Concurrent Users)**: 해당 Y의 평균 요소는 기간 안의 사용자 수 평균처럼 읽힐 여지가 있고, 개념·키워드·특징 역시 평균 **동시** 접속 규모인지 기간별 이용자/활성사용자 평균인지 미분리. 반면 인접 **T0014 / ACCU**는 각 관측 시점 CCU(동시접속자수)의 평균을 명시함. ACU의 Concurrent를 살린 정의인지, 사용자 수의 다른 집계지표를 의도했는지 후속 명확화가 필요. 현재 원문 재작성·보강·오류 확정 금지.
2. **T0694 / SW / Verification/Validation**: 현재 한 줄은 시험과 요구 충족을 중심으로 요약함. NASA의 Software V&V 설명은 **Verification = 해당 단계의 명세·요구 충족**, **Validation = 실제 이용자·임무 목적 충족**을 구별하고, 시험 이외 분석·시연·검사 등의 수단도 제시. 토픽의 단계·산출물 관리와 충돌한다고 단정할 수는 없으나 답안 표현상 두 의미를 나눌 필요가 있는지 후속검토. 원문 변경 금지.

공식/기술 참고:
- NASA IV&V Software Overview: https://www.nasa.gov/ivv-overview/
- NASA Product Verification: https://www.nasa.gov/reference/5-3-product-verification/
- NASA Product Validation: https://www.nasa.gov/reference/5-4-product-validation/
- NIST Hybrid Cloud (도메인 문맥 참고): https://csrc.nist.gov/glossary/term/Hybrid_cloud
- ACU(평균 동시접속자) 정의 비교를 위한 업계 사용 예: https://cloud.tencent.cn/developer/article/1856534

## 변경검증 및 다음 단계
- 작성 파일: 이 체크포인트 문서 **1개 신규 추가**. 기존 Phase 7~12 문서와 운영 HTML/JavaScript/CSS, 시트, Apps Script의 내용 수정 없음. 공개 저장소에 비공개 학습자료 전체나 MP3를 게시하지 않음.
- 문서 스스로는 작성 이후 커밋 SHA를 고정 기재할 수 없으므로, **작성 이전 개발 SHA는 위에 기재하고 작성 후 SHA는 GitHub Commit/PR에서 확인**한다.
- 과거 Phase 8·10의 상세 표본 원장을 확보·대조한 후에만 이 50개 중 순수 신규분을 기존 379건에 누적 및 잔여 1,400에서 차감. 그 전에도 이 50건의 개별 판정과 체크포인트 자체는 유효.
- 이후 SW 766 / SV 283 / MG 216 등 잔여 대상을 개별 확장하되, 최신 추적대장의 통합ID+요소명 **쌍**을 먼저 대조. 짧다는 이유로 자동 보강 금지.
- Phase 12에서 이월된 15건 정밀도 후보, 9자 이하 170건의 추가 의미검토, T4037의 K/W/X/Y/Z 공란 및 개념 정합성, 영문 한글뜻 미표시, 실제 Galaxy Tab/iPhone 조작 QA는 **완료로 간주하지 않음**.
- Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
