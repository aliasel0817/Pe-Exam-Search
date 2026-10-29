# MASTER 핵심지식 전수감사 — 교차필드 약어 후보 8토픽·원본 PDF 15페이지 시각검수 (2026-10-14)

> 기존 Draft PR #8 후속 문서. 운영 Google Sheets/PWA/PDF/페이지키/Apps Script/TTS **읽기 전용·미변경**. 사용자 승인 전 어떤 콘텐츠도 실제 반영하지 않음. 이 문서는 이전 보고서/로드맵을 지우지 않고 새 증거만 추가함.

## 1. 적용 기준과 진척

- 운영 `main` SHA `6e8527497a519a5da35e6838209aa628892e5ff9`; 작업 브랜치 `docs/study-technical-phase7-semantic-review-20261012`, Draft/Open PR #8.
- 지난 체크포인트의 **직접연결 원본 PDF 실제 시각 1차 대조 39토픽**에서 이번 추가 **8고유 토픽·15원본 PDF 페이지**: 누적 **47/3,799**, 잔여 **3,752**. 검수 진행 지표는 원본 페이지/도식 1차 대조이지 **47건 기술의미 최종합격을 뜻하지 않음**.
- 학습대상 3,799건의 I(토픽제목)·X(특징)·Y(핵심 기술요소)를 대상으로 별도 자동 약어 재검출. 이 검사는 정규화·불용어·정규식이 기존 Phase 7~13의 130개 후보 규칙과 다르므로 **127개라는 별도 탐지 합계가 나왔으며 이전 130개 확정 대기집합을 변경·대체하지 않음**. 기존 위험후보 수 통계와 절대 합산하거나 문제발생/해소 수로 보지 않음.
- 선택 표본은 T1788, T1435, T0160, T2560, T3187, T3804, T3253, T2858. 이 8개 모두 LIVE A 통합ID, I/J/K/X/Y, P/Q 직접원본 링크와 Drive 분할파일 ID를 읽기 전용 대조함.
- PDF 15/15의 원본 분할 1페이지 이미지를 직접 열고 표·순서·수치를 판독. 원문 PDF 전체·교재의 다른 장/인접 토픽을 전부 검수한 것은 아님. PDF 연결·페이지키 무변경.

## 2. PDF 시각검수 전체 연결 추적

| ID | 도메인 | 실제 연결 원본 페이지 | 이미지에서 확인한 핵심, LIVE Y와의 대조 |
| --- | --- | --- | --- |
| **T1788** | SV | 서브노트 `SV:5`, 교재 `SV:359` | ToA/TOA, TDoA/TDOA, AoA/AOA의 **표기 대소문자만 상이**. LIVE Y는 거리/시간차/각도와 동기화·Anchor·NLOS 역할까지 구별함. **약어 누락 오탐 해소**, Y 자동수정 불필요 |
| **T1435** | SV | 서브노트 `SV:18` | 원본 실제 그림은 Visual SLAM의 Sparse/Dense 및 LiDAR SLAM의 **ICP·NDT 등록(정합)**을 분류. LIVE Y는 센서·랜드마크·상태추정·지도·Loop Closure라는 일반 6요소는 정확하지만 **대표 알고리즘 분류**가 직접 표현되지 않음. 원본형 알고리즘 보존후보 |
| **T0160** | MG | 서브노트 `MG:54`, `MG:55`; 교재 `MG:125` | HOLAP은 ROLAP 상세원장 + MOLAP 집계큐브 혼용. LIVE Y의 `Relational Store`·`Multidimensional Cube`·`Query Router`·`Drill-through` 등은 이 구조·관계를 이미 설명. **ROLAP/MOLAP 약어 자체 Y 미반복은 독립 오류 아님** |
| **T2560** | NW | 서브노트 `NW:5` | ARP 헤더 도식은 6개 필드 관계를 설명해 현재 Y의 구성요소명과 실질 일치. 그러나 PDF 설명행 **`Address length layer 2: Ethernet → 8`은 수치 오류**. **RFC 826**의 Ethernet MAC은 48비트=**6바이트**, IPv4 프로토콜 주소는 **4바이트**, ARP hlen=6/plen=4. 현 LIVE Y에는 길이값 자체가 없어 LIVE 원문 수치 오류가 아닌 **원전 자체 오류+대표 필드값 신규 보존후보** |
| **T3187** | SE | 서브노트 `SE:36`, `SE:63`, `SE:67` | SSL/TLS 레코드·핸드셰이크·키교환·인증서 역할 시각 확인. LIVE Y가 Client/Cert/Handshake/SessionKey/Record/CertValidation로 표현하여 주요 구성은 보존, X는 레거시 SSL이 TLS로 대체됨을 이미 구별. **표제 SSL/TLS 약어를 Y에 무조건 반복하지 않음**, TLS 1.3 방식을 과거 SSL 도식에 그대로 합성하지 않음 |
| **T3804** | CA | 서브노트 `CA:12`, 교재 `CA:159` | 실제 교재의 핵심 표/회로: SRAM **대표 6T(6 트랜지스터) 플립플롭·Refresh 불필요**, DRAM **대표 1T1C(1 트랜지스터+커패시터)·Refresh 필요**. LIVE X는 SRAM/DRAM 이름만, Y는 공통 `Cell/Decoder/Wordline/Bitline/SenseAmp/ReadWrite` 하드웨어. **유형별 셀/리프레시 관계의 Y 별도 보존 제안** |
| **T3253** | SE | 서브노트 `SE:49` | 원전의 표에 `Forth Edition`이라고 적혀 있고 LIVE 제목에도 **같은 영어 철자 오기**. ISO/IEC 15408의 **2022년 5부 구성(Part 1~5)** 및 ISO/IEC 18045 연계는 LIVE Y에 원래 존재. 공식 ISO는 **ISO/IEC 15408-1:2022의 4th edition**, **2026년 제5판(ISO/IEC 15408-1:2026)** 별도 발행·2022판 교체. 2022년 기준 역사적 학습토픽과 2026년 현행 버전은 분리해야 함 |
| **T2858** | NW | 서브노트 `NW:31`, 교재 `NW:191` | IEEE 802.11 기반 WLAN의 AP·STA·BSS·ESS·CSMA/CA 구조 시각 확인, LIVE Y에서 구성요소 대다수 보존. 다만 X의 **PHY/MAC 계층 구별**을 Y가 명시적으로 독립 설명하지 않으므로 **선택적 아키텍처 관계 보강안**. 원본의 OFDM 일괄표현을 모든 802.11 PHY에 강제 적용하지 않음 |

## 3. 공식 기술표준과 오류의 책임 경계

### T2560 원천 PDF 숫자 오류(상)

- **원본 위치:** `NW:5`, ARP 구조 도식 오른쪽 아래 `Address length layer 2: 이더넷 → 8`.
- **공식 사실:** RFC 826의 Ethernet 주소는 **48비트=6옥텟**, ARP `ar$hln=6`. RFC 1188에서도 48비트 MAC 사용 시 Hardware Address Length **6**, IPv4 Protocol Address Length **4**로 명시. `ar$hrd=1`(Ethernet), `ar$pro=0x0800`(IPv4), `ar$op=1/2`(Request/Reply).
- **판정:** 원천의 `8`을 LIVE에 복제하면 실제 오류 생성. LIVE Y는 길이를 수치로 단정하지 않으므로 **현재 Y 자체의 수치 오기라고 주장하지 않음**. PDF 파일·이미지 수정/덮어쓰기/토픽 링크 변경 금지. 학습노트에 올바른 값이 필요한지는 미승인 정정안으로만 관리.
- **신규 Y 7번째 구성요소 미승인 시안:**
  `이더넷/IPv4 대표 필드값(Hardware Type=1, Protocol Type=0x0800, Hardware Address Length=6바이트(48비트), Protocol Address Length=4바이트, Operation=1(Request)·2(Reply))`
- 원래 Y의 `Hardware Type / Protocol Type / Hardware Length / Protocol Length / Operation / Sender/Target Address` 여섯 역할 **전부 보존**. 일반 ARP에는 하드웨어 종류에 따라 길이가 다를 수 있으므로 숫자를 `Ethernet/IPv4` 사례로 한정.

### T3253: 영어 철자 오기와 판본 갱신을 **분리** (상)

- **원문:** `공통평가기준(CC)의 국제 표준 종류 (Forth Edition 기준)`.
- **한 조각 최소 치환 후보(I열, 미승인):** `Forth Edition` → `Fourth Edition`; 기존 제목 기타 문자열 전부 유지. 한국어로는 `제4판`의 의미.
- **기준연도 별도 주의:** 2022년 CC:2022 및 ISO/IEC 15408:2022 파트 체계를 비교하던 당시 교재의 학습목적을 무단 변경하지 않음. ISO가 **2026년 ISO/IEC 15408-1:2026 (제5판)** 및 `15408-4:2026`, `15408-5:2026` 등을 발행하여 2022년판을 대체함. 이 정보는 **2026년 최신 판본 관련 별도 학습표/주석 후보**이지 원전 2022년 토픽을 일괄 2026년판으로 치환하라는 결정이 아님.
- 참고: ISO의 edition 숫자는 **Part별로 다를 수 있음**(2022년 Part 4/5는 초판), `Fourth Edition = Part4`라고 오해하지 않도록 **시리즈 기준과 각 Part의 edition 차이**도 병기해야 함.
- **증빙:** 원본 자체에도 `Forth`가 있으므로 과거 원장 가독성 변경으로 새로 만든 오자가 아님.

## 4. 추가적인 보존형 Y 기술요소 제안(모두 미승인)

### T1435 — SLAM 대표 알고리즘·유형
`알고리즘·유형(Visual SLAM은 Sparse/Dense 및 특징점 기반 지도작성, LiDAR SLAM은 ICP(Iterative Closest Point, 반복최소거리)·NDT(Normal Distributions Transform, 정규분포변환)로 스캔 정합; EKF·Particle Filter·Graph Optimization 등으로 자세·지도 추정)`

- 원본이 직접 강조하는 **Visual/LiDAR SLAM**과 **Sparse/Dense/ICP/NDT**를 보존하면서, LIVE X에서 이미 언급한 필터/그래프 기반 추정기법도 별개의 역할로 구별. 기존 6요소는 건드리지 않음.
- 원본 페이지 전체가 여러 토픽의 합본이므로 **SV:18에서 SLAM 구역에 해당하는 표·그림만** 대조. 다른 SDV/자율주행/보안/DTaaS 내용과 혼합하지 않음.

### T3804 — RAM 유형별 셀/유지 방식
`메모리셀 유형비교(대표적 SRAM은 6T(트랜지스터 6개) 플립플롭 셀로 리프레시가 불필요하고, DRAM은 1T1C(트랜지스터 1개·커패시터 1개) 셀로 주기적 리프레시가 필요)`

- 셀 유형과 메모리 블록 공통 구성을 **대체 관계가 아닌 보완 관계**로 설명. 반드시 모든 SRAM 설계가 6T라고 절대화하지 않고 **대표적**이라고 제한. 기존 Memory Cell/Decoder/Wordline/Bitline/SenseAmp/ReadWrite **6개 보존**.
- 이미 다른 SRAM/DRAM 개별 토픽이 있으므로 중복·답안 구성량은 최종 승인 전 검토.

### T2858 — IEEE 802.11 계층구조 선택형
`PHY/MAC 계층관계(IEEE 802.11은 무선 PHY의 변조·전송과 MAC의 매체 접근·프레임 처리를 구분하여 정의하며 AP·STA·BSS/ESS·CSMA/CA 구성에 연결)`

- 기존 Y의 AP/Station/BSS/ESS/CSMA-CA/Security Association **6개 명칭·역할 삭제 없음**.
- 이미 X에 PHY/MAC이 존재하는 만큼 **독립 요소 추가의 시험답안 가독성·중복성**을 판단한 다음 승인할 선택형 후보. 제목의 IEEE를 Y에 반복하지 않았다는 이유만으로 자동 오류 판정하지 않음.

## 5. 2026-10-06 과거 원장 대조와 자동 보존검사

- 2026-10-06 `topic_study_data_BACKUP_MASTER_CONTENT_ENRICHMENT_FINAL_APPLIED_20261006`에서 8개 토픽을 **각각 통합ID로 조회**. T3804는 이전 백업 행 **3665**, T3253은 **3321**으로 LIVE 행(3667·3323)과 다르므로 **행번호로 단순 대조하지 않고 ID로 재매칭**하여 확인.
- 해당 백업 Y에서 새로 주목한 `T1435의 ICP/NDT`, `T2560의 ARP 6바이트 길이`, `T3804의 6T/1T1C`, `T2858의 PHY/MAC 독립관계`가 이미 별도 Y 요소로 명시되지 않았고, T3253의 I 오자도 기존 백업부터 존재. **최근 가독성 변경으로 '삭제'된 문제라고 주장하지 않음**.
- 영문 확장·괄호 추가로 10월 6일 X/Y 문자열이 현재와 달라도 의미상 구성요소를 직접 확인. 단순 `oldY === newY` 문자열 불일치만으로 기술요소 손실 확정하지 않음.
- 대상 ID/열 재조회 **5/5** (T1435·T2560·T3804·T2858는 Y, T3253은 I); 기존 Y 구성요소 **6/6 각각 원본 문자열 전체 보존**, 제안 요소는 각 **1번씩만 추가**하는 모의검사 **4/4 통과**, 제안만 제거하면 완전한 이전 Y로 **4/4 복원**. T3253 I의 `Forth Edition` 기존 조각 지정 셀 **정확히 1회**, 이 한 조각만 치환하는 모의검사 및 역치환 원문 복원 **1/1 통과**.
- T1788 표기 정규화 후 추가 정정 불필요; T0160 HOLAP 원본 구조 이미 Y 보존; T3187 SSL 핵심구조와 X의 TLS 교체 의미 보존. **3건은 약어 기반 오탐/낮은 위험 분리**, 원문 수정 금지.
- T2560은 **'약어 이름 누락' 검사로 자동 포착한 토픽이지만**, 발견된 실제 문제는 **연결 원본 PDF의 숫자 오류**임. 검출 원인과 의미판정 사유를 혼동하지 않음.
- 검사 통과는 **사전 자동변경 시뮬레이션**일 뿐 원본 PDF 자체 편집, LIVE 수정, 사용자 승인, 화면 표시 회귀, 전체 의미감사 완료가 아님.

## 6. 공식 근거

- RFC 826 Ethernet ARP 주소/필드: https://www.rfc-editor.org/rfc/rfc826.html
- RFC 1188 하드웨어 길이 6·프로토콜 길이 4: https://www.rfc-editor.org/rfc/rfc1188.html
- ISO/IEC 15408-1:2022 Fourth Edition: https://www.iso.org/standard/72891.html
- ISO/IEC 15408-1:2026 Fifth Edition: https://www.iso.org/standard/15408-1
- ISO/IEC 15408-4:2026(Part4 framework): https://www.iso.org/standard/15408-4
- ISO/IEC 15408-5:2026(Part5 packages): https://www.iso.org/standard/15408-5
- CC:2022 Parts 1–5 공식 명세: https://www.commoncriteriaportal.org/cc/

## 7. 대기열과 비변경 보증

1. **최상위 후보:** T2560 원전 `8` 수치 오류를 반드시 원문 주의사항으로 보존하고 RFC 826 근거의 정확한 학습값을 승인후 안전 반영. 원본 PDF 수정·연결 변경 절대 금지.
2. **판본 이슈:** T3253의 2022/2026 구분과 `Forth` 오기를 별개로 관리; 2026 최신 표준 반영 전략을 원전 학습 의도와 함께 추가 논의.
3. **구성·유형:** T1435 및 T3804의 원전 종류/대표기법 정보를 Y에 신규 요소로 보존할지 기존 유형별 다른 토픽과 교차검토. T2858은 선택형.
4. **기계검사 확대:** 기존 Phase 7~13의 130개 대기집합 중 나머지 도메인·기술별 10~30토픽씩 PDF 이미지와 실제 LIVE 요소/공식 규격을 병렬 검증하고 중복검수 배제.
5. **실제 수정·병합:** 사용자의 셀별 명시적 승인 전 `암기장` **0셀**, `main`/PWA/Code.gs **0파일**, PDF 원본/관계/연결 **0건**, TTS/MP3/GCS **0건**, PR 병합/운영배포 **0건**.
6. Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
