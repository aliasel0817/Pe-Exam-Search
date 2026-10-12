# 학습노트 Phase 12 — 10~15자 기술요소 설명의 개별 의미검수 체크포인트 (2026-10-12)

## 운영 기준 및 금지사항
- 기준 GitHub main SHA: `df003d34b00dff00bdbf370de62a9389f94d8e8e`, Phase 7~11은 Draft PR #8에만 존재. 운영 앱 `4.6.9-technical-glossary-phase5-rc1`.
- LIVE `topic_study_data / 암기장` **읽기 전용**: 데이터 행 3,858, Y 3,799 / N 59, 26열.
- 운영 Google Sheets 원문, PDF·검색·관리·인증 기능, HTML/CSS/JavaScript, 앱의 A안 번호/줄바꿈/`gap: .52rem`, MP3/TTS/GCS·매니페스트·Cloud Run 변경 없음.
- 최초 16자 미만 추출 **1,949건**은 후보 추출 기준이며, 절차 도식의 마지막 괄호가 포함될 수 있으므로 '1,949개 독립 기술요소 설명'으로 단정 금지.

## 이번 100건 선정 및 검수 방법
1. 10~15자 후보 1,779 중 강한 표현 패턴 76 제외 시 1,703. 앞선 Phase 8~9의 정확한 통합ID+요소명 63건과 Phase 10의 문맥우선 60건·계층표본 80건을 원래 시트 순서/표본식으로 재현해 제외. **시작 잔여 1,500건**으로 독립 재확인.
2. 잔여에서 기술적 오해 단서(`실패/거부/격리/상태/제거/연산/분포` 등)의 문맥우선 도메인별 **58개**, 절차 화살표의 추가 7개, 앞선 후보와 중복 없는 도메인별 균등간격 **35개** = **정확히 100개**. 표본 추출은 `floor((j+0.5)*N/q)`; 무작위·통계 대표표본이 아님.
3. 선정 항목마다 통합ID, 토픽명(I), 개념(J), 키워드(K), 특징(X), Y열 요소명·설명의 관계를 대조. 외부 공식 기술자료가 있는 4건은 별도 표준 대조. 다른 88건은 **토픽 내부 문맥의 1차 적합성 판단**이며 기술표준 전문 확인/절대 무오류 보증이 아님.
4. 변경/보강 판단 없이 **유지 가능 88 / 의미 정밀도 재검토 4 / 화살표 절차형 원문 별도 유지 8**로 분류.

### 4건 추가 정밀도 검토 (원문 수정 안 함)
| 통합ID | 도메인 | 요소명 | 현재 짧은 설명 | 검토 근거 |
| --- | --- | --- | --- | --- |
| T1099 | SW | 테스트수준(Unit·Integration·System·Acceptance) | 검증대상의 통합범위로 분류 | ISTQB는 수준을 대상뿐 아니라 목적·책임·기준으로 구별. 인수시험은 사용자·사업의 인수요건에 초점 |
| T1918 | AI | Mean/Variance(평균/분산) | 잠재분포의 μ·σ를 출력 | σ는 표준편차, σ²는 분산. VAE 인코더는 μ, 분산 또는 log σ² 등을 인코딩하므로 라벨과 기호의 정밀도 확인 필요 |
| T2017 | AI | Input Image/Frame(입력 이미지/프레임) | 얼굴이 포함된 영상을 입력 | 얼굴 없는 이미지·프레임도 정상 검출 입력. 얼굴이 없으면 빈 검출 결과가 가능 |
| T2772 | NW | FIN Passive(수동 종료) | 반대 방향의 송신종료를 요청 | RFC 9293: FIN은 그 송신자의 이후 데이터 송신 종료에 해당. 상대 방향 종료 '요청'으로 오인되지 않도록 능동/수동 FIN 문맥 확인 |

**정밀도 후속 = 오류 확정이 아님. 원문 자동 교정·추가 생성 금지.** T2772의 인접 `FIN Active`도 같은 원칙으로 병행 확인.

### 절차형 8건 — 일반 짧은 기술요소 설명과 분리 (원문 보존)
| 통합ID | 도메인 | 토픽 | 구조 검토 근거 |
| --- | --- | --- | --- |
| T0071 | MG | BSC의 CSF와 KPI 도출과정 | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0068 | MG | BSC 구축 절차 | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0184 | MG | ISO/IEC 38500 개념도 | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0038 | MG | BCM 프로세스 (수행절차) | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0065 | MG | BRE 아키텍처 (시스템 구조도) | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0045 | MG | BI 구성도 | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0146 | MG | EDW 구성도 | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |
| T0167 | MG | ILM(Information Lifecycle Management)  운용 메커니즘 | 여러 단계의 `→` 또는 `↔` 연결문에서 마지막 괄호만 추출됨. 전체 절차·화살표·중첩괄호 보존 |

## 문맥상 유지 가능 88개 — 식별자·요소명 추적목록
- 아래는 **현 설명으로 1차 역할식별 가능** 판정이며, 기존 설명을 다시 쓰거나 축약하지 않았음. 원문 전체 설명은 비공개 LIVE 시트에서만 확인.
- **MG (12)**: `T0115` Monitoring ; `T0032` Dashboard ; `T0133` Monitoring ; `T0103` Preprocessing ; `T0198` Benefit Owner ; `T0305` Trough of Disillusionment ; `T0074` Snapshot Time ; `T0083` DSS(Deliver, Service and Support, 제공·서비스·지원) ; `T0024` Messaging/Routing ; `T0150` Enterprise Search ; `T0012` Primary Metric ; `T0319` Licensee
- **SW (28)**: `T0854` Hierarchical Link ; `T0525` Router ; `T0749` Component ; `T0636` Notify/Update ; `T0804` ConcreteVisitor ; `T0885` Move Method/Field ; `T0728` Roles/Independence ; `T0892` State Transition ; `T0725` User Story ; `T0650` Governance ; `T0914` Requirement Collection ; `T0898` Random Sampling ; `T0869` Development Cost ; `T0846` Alternative ; `T0923` Contract A/B/C ; `T0805` Verification/Validation ; `T0876` Reference Architecture ; `T0701` Service Registry ; `T0890` Independent Pipeline ; `T0863` Data Obfuscation ; `T0787` Interface Contract ; `T0575` Part 4 Test Techniques ; `T0939` 신뢰성 ; `T0916` Implementation ; `T1148` 조달 ; `T0740` SW(Software, 소프트웨어) 대가산정의 New Development ; `T0594` 정보화 비전/원칙 ; `T0919` Integrated Project
- **SV (20)**: `T1487` VM(Virtual Machine, 가상머신)/Container ; `T1392` Unique POI(Point of Interest, 관심지점) ID(Identifier, 식별자) ; `T1280` Security/Protection ; `T1585` Mobile Hypervisor/Container Layer ; `T1824` Vehicle Sensor/GNSS(Global Navigation Satellite System, 위성항법시스템) ; `T1556` Watch/Revocation ; `T1614` Transaction ; `T1514` Contract/License ; `T1516` Data Interpretation ; `T1632` Cleansing ; `T1660` Environment Sensor ; `T1209` Classification/Decoding(분류/해독) ; `T1820` Encryption/KMS(Key Management Service, 키관리서비스) ; `T1735` Robots/Politeness ; `T1547` Object/Reference Beam ; `T1775` Authentication/Consent ; `T1656` Integration ; `T1752` Data/Fact ; `T1717` Constraint/Axiom ; `T1699` XR(Extended Reality, 확장현실)/Simulation(시뮬레이션)
- **DB (9)**: `T2377` Relationship(관계) ; `T2458` Tuple Uniqueness(튜플 유일성) ; `T2507` Fourth Normal Form(제4정규형) ; `T2341` Partition/Replication(분할/복제) ; `T2329` Object Class(객체 클래스) ; `T2429` Scope Definition(범위 정의) ; `T2397` Primary Key(기본키) ; `T2443` Throughput(처리량) ; `T2425` Threshold(임계값)
- **NW (7)**: `T2619` Cumulative ACK(누적 확인응답) ; `T2690` Input Channels(입력 채널) ; `T2888` Sender Window(송신윈도우) ; `T2888` ACK(Acknowledgement, 확인응답) Processing(처리) ; `T2652` Tunnel Egress(터널 출구) ; `T2542` First ACK(Acknowledgement, 확인응답) ; `T2690` Demultiplexer(역다중화기)
- **AI (8)**: `T1888` Centering/Whitening(중심화/백색화) ; `T1909` State(상태) ; `T2044` State(상태) ; `T1874` Pooling(풀링) ; `T1895` Memory(메모리) ; `T1860` Governance(거버넌스) ; `T1906` Covariance Matrix(공분산 행렬) ; `T2015` Fairness/Safety Test(공정성/안전 테스트)
- **SE (2)**: `T3172` Modular Exponentiation(모듈러 거듭제곱) ; `T3416` Chip Authentication/Passive Authentication(칩인증/수동인증)
- **ST (2)**: `T2148` Mean μ(평균 μ) ; `T2126` Pearson(피어슨)

## Phase 12 누적집계 (10~15자 기술요소)
| 구분 | Phase 11 누적 | Phase 12 추가 | 최신 |
| --- | ---: | ---: | ---: |
| 1차 개별 문맥검수 | 279 | 100 | **379** |
| 현재 유지 가능 | 266 | 88 | **354** |
| 정밀도 후속 후보 | 11 | 4 | **15** |
| 절차·화살표 형식 보존 | 2 | 8 | **10** |
| 미검수 | 1,500 | -100 | **1,400** |

**남은 1,400건 도메인별:** MG 216 / SW 766 / SV 283 / DB 50 / NW 43 / AI 35 / SE 6 / ST 1 / AL 0 / CA 0. 이 합계는 위의 도메인별 선정 100개를 정확히 차감한 값.
- 이번 100건에서 **기술적 오류 확정 0**, 원본 학습설명 수정 0.
- Phase 6의 16자 미만 별도 62건 재판정은 이 수량에 중복 가산하지 않음.
- 1,949건 후보 중 절차·구성도는 별도로 취급해야 하며, 숫자가 곧 수정 필요 항목 수를 뜻하지 않음.

## 공식 기술 근거
- ISTQB (ASTQB 공개 시험수준): https://astqb.org/2-2-test-levels-and-test-types/
- Keras VAE 예제 (z_mean, z_log_var): https://keras.io/examples/generative/vae/
- PyTorch 공식 VAE 코드 (mu, logvar): https://github.com/pytorch/examples/blob/main/vae/main.py
- Google ML Kit FaceDetector API (미검출 시 빈 목록): https://developers.google.com/android/reference/com/google/mlkit/vision/face/FaceDetector
- RFC 9293 (TCP 연결종료의 FIN 의미): https://www.rfc-editor.org/rfc/rfc9293

## 다음 작업 및 변경 검증
- 남은 1,400건의 다도메인 문맥검수 확대. 특히 SW 766, SV 283, MG 216을 우선.
- 정밀도 후보는 표준/동일 토픽 문맥을 추가 확인하되 **Google Sheets 원문 수정은 별도 승인 전 금지**.
- `T4037` K/W/X/Y/Z 공란, Galaxy Tab/iPhone 실제 PDF·학습표시 기기 QA는 미완료 항목으로 유지.
- 이번 변경은 **GitHub 문서 1개 추가뿐**. Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
