# MASTER 핵심기술요소 감사 — Phase 12 신규 14토픽·18원본 PDF 및 최소정정 시안 (2026-10-14)

> 본 문서는 기존 **Draft PR #8**의 추가 읽기 전용 감사 체크포인트. LIVE Google Sheets `암기장`, 교재·서브노트 PDF 원본·페이지키·연결, PWA, Apps Script, TTS 및 운영 `main` **변경 없음**. 교재 내용과 외부 공식 표준이 충돌하면 임의로 일치시키지 않고 출처별 차이로 표시. 운영 반영은 별도 사용자 승인 필요.

## 1. 상태 및 완료지표의 경계

- 운영 `main` 기준 SHA `6e8527497a519a5da35e6838209aa628892e5ff9`; 보존 브랜치 `docs/study-technical-phase7-semantic-review-20261012`, PR #8 Draft/Open/미병합.
- LIVE 기준 전체 **3,858건 / 학습대상 3,799 / 제외 59**의 데이터 구조가 이전 검수에서 확인되었고, 이번 세션에서 시트 탭·행수 메타데이터 및 아래 **14개 토픽의 실제 통합ID·I/K/X/Y·P/Q**를 읽기 전용 재조회.
- 직전 직접연결 원본 PDF **시각 1차 대조 47토픽**, 이번 **신규 14토픽·고유 분할 PDF 18개(각 1페이지)** 실제 페이지를 이미지 렌더링해 표·수식·순서·관계를 확인. **누적 61/3,799토픽, 미대조 3,738**. 동일 페이지를 공유하는 2개 토픽(T2178/T2181의 AL:7, T0619/T0622의 SW:48)은 페이지 파일 수에서 1번만 집계.
- **PDF 시각 1차 대조 = 최종 기술적 합격이 아님.** 연결된 페이지의 핵심사항과 LIVE Y를 직접 비교한 것이며, 원본 전권·인접 토픽·현행표준 모든 조항 전수감사가 끝난 것은 아님.
- **중요:** GitHub 문서 저장과 시트 접근 성공은 운영 PWA 전체에 버그가 없다는 기능검증이 아님. 이번에는 PWA·Apps Script 기능 테스트/코드 수정/배포를 하지 않음.

## 2. 실제 원본 이미지별 감사대상 — 14토픽 / 분할 PDF 18페이지

| 통합ID | LIVE 행 | 직접 연결 원본 PDF 페이지키 | 원본 대조 판정 |
| --- | ---: | --- | --- |
| T2178 벨만-포드 | 2125 | 서브노트 `AL:7` + 교재 `AL-2:91` | V-1 완화, 음수 간선, 도달 가능한 음수순환 추가완화 검사 및 거리/선행정점 보존. 별도 정정 없음 |
| T2181 다익스트라 | 2164 | 서브노트 `AL:7` + 교재 `AL-2:83` | 거리테이블·최소거리 선택·완화·확정·선행정점의 6요소 보존. 필수 **비음수 간선 적용조건은 K/X에 있으나 Y에는 없음** → 중간우선 보존형 추가 후보 |
| T2238 퀵 정렬 | 2186 | 서브노트 `AL:4` + 교재 `AL-2:40` | Pivot→Partition→좌/우 재귀정렬→기저조건 보존. 평균/최악 시간복잡도는 X/K에 명시. 새 수정 불필요 |
| T2245 플로이드-워셜 | 2169 | 교재 `AL-2:89` | 모든 정점쌍 거리행렬, k 경유 DP 갱신, 음수순환 대각 검사, O(V³) 설명이 X/Y에 보존. 별도 정정 없음 |
| T2772 TCP 핸드셰이크 | 2677 | 서브노트 `NW:18` | 원본 그림의 SYN→SYN/ACK→ACK 및 FIN→ACK→FIN→ACK 4단계를 실제 시각 확인. Y는 FIN Active / FIN Passive / TIME_WAIT로 묶으며 **첫 FIN에 대한 중간 ACK** 역할 독립 설명 부재. 미승인 추가안 |
| T2599 DNSSEC | 2699 | 서브노트 `NW:22`, `SE:62` | NW:22 원본에 **NSEC** 용어가 별도 나타남. Y는 DNSKEY/RRSIG/DS/Trust Anchor/Validator/Key Rollover만 보존하여 **서명된 부재 증명** 요소 직접 누락. RFC4034(NSEC)/RFC5155(NSEC3) 근거의 추가안 |
| T2873 Selective Repeat | 2540 | 서브노트 `NW:8` | 송·수신 윈도우, 순서외 패킷 보관, 선택적 재전송은 기존 Y에 존재. 원전에는 동등한 송수신 윈도우를 기술하나 **시퀀스 공간 대비 최대 윈도우 크기**가 명시되지 않음. 학술 근거로 추가후보 |
| T0619 MDA 핵심기술 | 490 | 서브노트 `SW:48` | UML/MOF/XMI/QVT/OCL/코드생성 기술이 LIVE Y에 구분. 원본과 주요 구조 일치, 정정 불필요 |
| T0622 MDD 변환 | 493 | 서브노트 `SW:48` | 원본 PIM→PSM 등 변환모델/규칙과 Y의 Source/Target/Meta-model/Rule/Engine/Traceability 관계 보존. 정정 불필요 |
| T3157 RSA | 2927 | 서브노트 `SE:58` + 교재 `SE:96` | LIVE 제목에 `Rivest, Charmir, Adleman`. 서브노트에는 **Charmir** 오기가 있지만 교재 SE:96에는 **Shamir** 정상. IETF RFC2828·원저자 1978 RSA 논문도 Shamir. **I열 오기 최소치환 확정 후보** |
| T3312 블록암호 운영모드 | 2904 | 서브노트 `SE:53` | ECB/CBC/CFB/OFB/CTR 유형, IV/Nonce 관리가 Y에 표현돼 기존 원본 핵심범위 보존. GCM 등 현대 AEAD 모드 미기재만으로 무단 추가·오류 판정 금지 |
| T1961 MCTS | 1867 | 서브노트 `AI:2` + 교재 `AI-1:104` | Y는 Selection/Expansion/Simulation/Reward/Backpropagation/Action Selection으로 일관; **K만 '오류 역전파'**. 교재 AI-1:104에는 시뮬레이션 결과·노드 가치 역전파를 기술. MCTS의 보상·방문 통계 갱신을 신경망 오류역전파와 혼동하는 **K열 용어오류** |
| T1916 Transformer·MoE | 1892 | 교재 `AI-1:300` | 현재 직접연결 페이지는 Transformer 기본 아키텍처에 집중. MoE 세부 Router/Gate·Experts·Sparse 활성화의 **모든 근거가 이 페이지에서 판독되지는 않음**. LIVE Y에는 구성요소 6개가 이미 있으므로 오류 확정/연결 변경 없이 **다른 원전 페이지 추적 검수 보류** |
| T2507 정규형 | 2263 | 서브노트 `DB:3` | 원본 도표 자체도 BCNF의 모든 결정자가 **후보키**라고 표현. **형식적 정의는 비자명 FD X→Y의 X가 슈퍼키**. 원본 내용을 무조건 따를 경우 생길 기술오류로, LIVE Y의 '후보키'를 '슈퍼키'로 정확히 정정하는 시안 필요 |

> 원본 PDF 18개 파일: `AL_0007`, `AL-2_0091`, `AL-2_0083`, `AL_0004`, `AL-2_0040`, `AL-2_0089`, `NW_0018`, `NW_0022`, `SE_0062`, `NW_0008`, `SW_0048`, `SE_0058`, `SE_0096`, `SE_0053`, `AI_0002`, `AI-1_0104`, `AI-1_0300`, `DB_0003`. 해당 페이지는 판독용 로컬 이미지로만 렌더했으며 PDF 원본 수정/덮어쓰기/페이지 연결 변경 없음.

## 3. 확정도 구분: 명확한 용어·개념 오류 3개 셀(미승인)

### 3-A. T3157 / I열 — RSA 풀네임 오기

- 기존 LIVE 토픽명: `RSA (Rivest, Charmir, Adleman)`.
- **한 조각 제안:** `Charmir` → `Shamir`. 나머지 I열 문자 전부 보존.
- 원본 `SE:58`에는 동일 오기가, `SE:96`에는 Shamir 정상 표기가 공존. 공식 명칭은 Rivest–Shamir–Adleman.
- **2026-10-06 백업 I열에서도 동일 오기**. 이번/최근 Y 약어 확장에 따른 변형이 아님.

### 3-B. T2507 / Y열 — BCNF '후보키'를 '슈퍼키'로 정정

- 정확한 기존 조각: `모든 결정자가 후보키가 되도록 강화`
- **한 조각 제안:** `비자명 함수 종속의 결정자가 슈퍼키임을 요구`
- 관계형 데이터모델 BCNF의 정확한 조건: 임의의 **비자명 함수 종속 X→Y에서 X가 슈퍼키(superkey)**. 후보키는 최소 슈퍼키이고 슈퍼키와 동일개념이 아니므로 '항상 후보키'는 지나치게 좁은 정의.
- 원본 `DB:3` 표에도 후보키 표기가 있어 **원천 오류를 그대로 LIVE로 계승한 사례**. 상기 후보는 원본에 없는 내용을 덧씌운 일반 지식이 아니라 **대학 데이터베이스 강의자료의 공식 정형 정의와 교차확인한 정정안**임을 구분.
- First/Second/Third/BCNF/Fourth/Fifth 6개 정규형명 및 순서·나머지 역할 **전부 존치**. **2026-10-06 백업에도 동일 문제**.

### 3-C. T1961 / K열 — '오류' 역전파 혼동

- 정확한 기존 조각: `오류 역전파`
- **한 조각 제안:** `보상·방문횟수 역전파`
- 원본 `AI-1:104`: 시뮬레이션의 결과를 노드의 가치에 누적/역전파. MCTS에서는 노드의 방문횟수와 결과통계를 부모 방향으로 갱신하는 기본 Backpropagation과, 신경망 파라미터의 오차 기울기를 전파하는 Backpropagation을 **개념적으로 구별**.
- LIVE X/Y의 Selection→Expansion→Simulation→Reward→Backpropagation은 이미 정확한 범위로 표현. **K만 부분 정정하고 X/Y를 다시 작성하지 않음**.
- **2026-10-06 백업 K열에서도 같은 용어 문제 존재**.

## 4. 근거기반 요소 누락·절차 설명 후보 4개 셀(보존형·미승인)

### T2599 / Y열 — 서명된 부재증명 핵심요소

- 현재 Y의 DNSKEY/RRSIG/DS/Trust Anchor/Validator/Key Rollover **여섯 개 요소 전부 유지**.
- **일곱 번째 요소 추가 시안:** `NSEC/NSEC3(서명된 부재증명으로 질의한 이름·레코드유형이 없음을 검증하며 NSEC3는 해시된 이름을 사용)`
- 연결 원본 `NW:22`의 NSEC 및 **RFC 4034 §4, RFC 4035 §5.4, RFC 5155 §1** 확인. NSEC3가 모든 프라이버시 문제를 완전히 해결한다고 단정하지 않음.

### T2873 / Y열 — Selective Repeat 시퀀스 공간 제약

- 기존 Send Window/Receive Buffer/Individual ACK/NAK-Timeout/Sequence Number/Selective Retransmission **6개 존치**.
- **일곱 번째 요소 추가 시안:** `윈도우 크기 제약(m비트 순서번호에서 동일 크기의 송·수신 윈도우 W를 각각 2^(m-1) 이하로 제한해 이전 프레임과 새 프레임의 순번 혼동을 방지)`
- 원본 `NW:8`은 송수신 윈도우, 순번, 선택 재전송 설명까지는 있음. **정량 W 제한은 원본에 직접 기재돼 있지 않으며** Washington University in St Louis/UC Irvine 전산 강의자료를 외부 근거로 덧붙인 후보. 동일 크기 송수신 창과 modulo 순번 재사용의 정형 조건으로만 설명.

### T2181 / Y열 — Dijkstra 필수 전제조건(중간 위험)

- 원래 Source/Distance Table/Priority Queue/Relaxation/Finalized Set/Predecessor **6개 존치**.
- **일곱 번째 요소 추가 시안:** `비음수 가중치 조건(모든 간선 가중치가 0 이상일 때 최단거리 확정의 탐욕적 선택이 유효하며 음수 간선에서는 일반적으로 최적성 보장 불가)`
- LIVE **K/X에는 비음수 가중치가 이미 명시**되어 있으므로 Y 누락을 곧바로 전체 학습지식 소실로 보지 않음. Y 기술요소의 필수 적용조건을 독립적으로 보존할 선택안.

### T2772 / Y열 — TCP 네 단계 종료의 중간 ACK

- 원본 `NW:18` 도식에 **FIN→ACK→FIN→ACK** 확인.
- Y에는 SYN/SYN-ACK/ACK/FIN Active/FIN Passive/TIME_WAIT 6개가 있어 종료 절차의 중간 ACK가 독립적으로 명시되지 않음.
- **` · FIN Passive` 앞에 삽입하는 보존형 요소:** `FIN ACK(수신 측이 첫 FIN을 확인응답해 반종료 상태로 전환)`.
- 반종료·마지막 ACK·TIME_WAIT 및 기존 6개 이름 존치. 전송환경에서 FIN과 ACK가 결합될 수도 있으므로 **모든 실제 패킷이 정확히 네 개로만 전송된다고 절대화하지 않음**.

## 5. 이전 백업·자동 회귀검사

- 2026-10-06 백업 `topic_study_data_BACKUP_MASTER_CONTENT_ENRICHMENT_FINAL_APPLIED_20261006`에서 T3157/T2507/T1961/T2599/T2873/T2181/T2772/T1916 **8토픽의 통합ID와 I/K/X/Y를 직접 대조**. 새로 확인한 RSA 철자/BCNF/오류역전파 오류 3건과 핵심 제약/부재증명 역할 부재는 **2026-10-06 원장에도 같은 형태로 존재**. **최근 신규 가독성 보강으로 내용이 삭제되었다고 분류하지 않음**.
- 변경 대상 LIVE 셀 **7건 직접 재조회**: T3157/I, T2507/Y, T1961/K, T2599/Y, T2873/Y, T2181/Y, T2772/Y.
- 기존 특정 조각 변경 4건(T3157/I, T2507/Y, T1961/K, T2772/Y): **4/4 원문 대상조각 정확히 1회**, 인접 문구 보존 및 역치환으로 **4/4 전 원문 완전 복원**.
- 기존 Y에 새 조각만 덧붙이는 3건(T2599/Y, T2873/Y, T2181/Y): **3/3 원래 Y 전체 접두부분 완전 동일**, 신규 요소만 정확히 1회 나타나며 제거하면 기존 전체 문자열 **3/3 복원**.
- 총 **7/7 대상 셀/ID 일치 + 모의 수정 역변환 자동검사 통과**. 기존 Y의 6개 기술요소는 단어명/역할 삭제 없이 유지. **운영 LIVE 실제 수정 0건**.
- 의미·기술 근거는 §3~4의 원본 이미지 및 공식문서로 별도 판정. **모의검사 통과 ≠ 실제 운영 변경·배포·앱화면 검증 완료**.

## 6. 우선순위 및 미해결

| 분류 | 결과 |
| --- | --- |
| 우선 교정제안 | T3157/I, T2507/Y, T1961/K — 3개 확정적 용어/정의 오류 |
| 추가 요소 제안 | T2599/Y(상), T2873/Y(상), T2772/Y(중), T2181/Y(중·중복가능성) — 4개 조건부 보강 |
| 원문 보존·지식 유지 | T2178, T2238, T2245, T0619, T0622, T3312 — 6건은 본 페이지상 핵심 대응관계 충족 |
| 원본 커버리지 보류 | T1916 MoE — 연결 PDF AI-1:300은 Transformer 중심, MoE 세부 페이지 추가 추적 필요. PDF 연결·페이지키 무승인 변경 금지 |

전체 14개 토픽의 공식표준 모든 조항과 답안의 의미충돌이 최종 통과된 것은 아님. 관련 토픽들 사이에 명칭/수식 충돌이 있는지 추가 검수가 필요함.

## 7. 공식/학술 근거 링크

- RSA 공식 용례 — RFC 2828(RSA Rivest-Shamir-Adleman): https://datatracker.ietf.org/doc/rfc2828/ ; 원저자 논문 목록: https://people.csail.mit.edu/rivest/pubs.html
- BCNF 슈퍼키 조건 — Aalto University OpenCS: https://opencs.aalto.fi/en/courses/databases/part-8/4-normalization ; RPI 대학 강의노트: https://cs.rpi.edu/~sibel/csci4380/fall2026/course_notes/normalization.html
- MCTS simulation/result 통계 역전파 — https://link.springer.com/article/10.1007/s10462-022-10228-y
- DNSSEC NSEC/NSEC3 — https://www.rfc-editor.org/rfc/rfc4034.html ; https://www.rfc-editor.org/rfc/rfc4035.html ; https://www.rfc-editor.org/rfc/rfc5155.html
- Selective Repeat half-window 제한 — Washington University lecture: https://www.cse.wustl.edu/~jain/cse473-21/ftp/i_3tcp.pdf ; UCI lecture: https://ics.uci.edu/~cbdaviso/ics153/sum03/chapter3/chap3.pdf
- TCP 연결·종료 기초 — https://www.rfc-editor.org/rfc/rfc9293.html

## 8. 보존원칙·다음 작업

1. **이 문서만 PR #8 브랜치에 저장**, 기존 검수기록/백업 삭제 금지, 자동 병합 금지.
2. 7개 셀 시안을 **사용자 승인 전 LIVE 적용 금지**. 운영 Sheets / PDF / 페이지키·연결 / PWA·Apps Script / TTS 모두 무변경.
3. T1916 연결 교재 `AI-1:300` 뒤의 MoE 세부 페이지 원본 자료를 **읽기 전용으로 추가 확인**하여 주제 커버리지와 실제 결손을 구별.
4. 이후 NW·SE·SW·AI·DB·AL의 세부 알고리즘·RFC 메시지 순서·수치·표준 명칭을 10~30토픽 단위로 확대.
5. Apps Script **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.


## 9. T1916 인접 원천 확장자료 3페이지 추가 추적 — 보류 사유 세분화

> 이 추가 조회는 **PDF 기능 실사용 시험·등록·링크 수정이 아님**. 직접 연결된 기존 `AI-1:300` 외의 교재 인접 페이지를 **읽기 전용 조사**한 후속 증거이며, '직접연결 페이지의 시각 1차 대조 61토픽/18이번 페이지' 누적 지표는 그대로.

- 직접 연결 원문: `T1916`의 Q열 `AI-1:300` 한 페이지. `PDF페이지연결_20260928`에서도 기존 직접 연결 **1건**으로 확인.
- Google Drive 검색·파일원본 이미지 실제 확인: `AI-1_0301.pdf`(301페이지)은 Transformer 인코더/디코더·Positional Encoding·Masked Self-Attention·Softmax의 세부구성, `AI-1_0302.pdf`(302페이지)은 **MoE의 게이팅 네트워크·전문가 모델·희소 활성화·출력 조합 도식과 표**, `AI-1_0303.pdf`(303페이지)은 **Transformer와 MoE 비교표**. 이 세 페이지는 **현재 토픽에 직접 연결되어 있지 않은 인접 원본 참고자료**이므로 18개 연결 PDF 수에 합산하지 않음.
- 추가 3페이지와 LIVE T1916/Y: **Self-Attention, Router/Gate, Expert Network, Sparse Activation, Load Balancing, Expert Aggregation의 6개 핵심구조가 상호 일관**. 원전 302/303에는 'Gating Network / Expert Model / Output Combination'의 대응이 명확. 300만 보았을 때의 'MoE 원본 내용 자체 미확인' 보류는 **해소**.
- 새로운 **학습화면 자료접근성 개선 후보**: 해당 토픽 PDF 연결이 300 한 장뿐이면, 사용자가 보강하지 않는 한 `302~303`의 MoE 핵심 비교표/도식을 토픽 등록페이지 목록에서 **직접 선택할 수 없는 상태**. 별도 **PDF 페이지 링크 보강 제안만 작성 가능**. 사용자 별도 승인 전 PDF페이지키/연결/파일 등록/기능시험/원본 이동·변경은 금지. 본 프로젝트에서 PDF 기능 인터럽트가 종료됐다는 정책 유지.
- **원전 자체의 영어 오기 발견:** `AI-1:302` 제목은 `MOE(Mixture of Exports)`로, 올바른 기술명은 **Mixture of Experts**. 같은 교재 303쪽에서는 `Mixture of Experts`로 정확히 기재되어 표기가 충돌. Google Research의 MoE 공식 연구설명 역시 Experts. LIVE T1916의 X열은 **`MoE(Mixture of Experts, 전문가 혼합)`로 이미 정확**하므로 LIVE 수정 후보가 아니라 **원전 자체 오기 주의 항목**으로만 등록.
- 현 시점 T1916의 **Y 자동정정 0개**, PDF 매핑 변경 0개, 운영 배포 0개. 전체 3,799토픽 정확성 최종합격 수는 별도.
- 기술 근거: https://www.research.google/blog/mixture-of-experts-with-expert-choice-routing/ 및 https://arxiv.org/abs/1701.06538
