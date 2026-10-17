# 핵심기술요소 완전성 감사 — SRM 원어 병기 정정 제안 (운영 미반영)

- 일자: 2026-10-13
- 대상: 학습콘텐츠 가독성·완전성 감사 PR #8(Draft), 운영 LIVE 읽기 전용
- 성격: **검증된 최소 치환안 3개**의 기록. 최종 승인 전 원문 저장/수정/병합 금지.

## 1. 근거

1. 현재 LIVE 암기장 T0361의 토픽명(I)은 SRM: Service Component Reference Model을 명시.
2. 같은 토픽과 T0364의 서브노트 MG:15, MG:16 텍스트층에서 SRM은 Service Component Reference Model로 표기됨. 원본 전체 도식·본문은 추가 검수가 필요함.
3. 미국 Federal Enterprise Architecture 원전의 SRM 명칭도 Service Component Reference Model. 공식 정의는 비즈니스·성과 목표에 대응하는 서비스 컴포넌트 분류체계. https://georgewbush-whitehouse.archives.gov/omb/egov/a-4-srm.html
4. LIVE T0361/Y와 T0364/X, T0364/Y에는 SRM(Service Reference Model, 서비스참조모델)이 포함되어 상기 원어와 충돌.

## 2. 정확한 치환 제안 — 변경 대상 3개 셀

| 통합ID | 열 | 현재 해당 부분(전체 원문 아님) | 제안 부분 |
| --- | :---: | --- | --- |
| T0361 | Y(기술요소) | SRM(Service Reference Model, 서비스참조모델) | SRM(Service Component Reference Model, 서비스 컴포넌트 참조모델) |
| T0364 | X(특징) | 동일 | 동일 |
| T0364 | Y(기술요소) | 동일 | 동일 |

- **그 외 모든 셀 및 해당 셀의 나머지 문장·기술요소 순서·설명은 그대로** 보존.
- 치환 전 실제 셀 값 재조회, 해당 문자열의 **셀당 출현 수 1** 검증; 일치하지 않으면 변경 중단.
- 적용 전/후 구성요소 수·상세 설명 문자열·괄호 균형 점검 필수.
- 단순 약어 병기 수정으로 SRM 계층의 서비스 도메인→서비스 타입→서비스 컴포넌트 완전성을 해결했다고 간주하면 안 됨. 계층 누락은 별도 원천자료 확인 후 신규 제안서로 처리.

## 3. 다른 검수 대기 후보와의 구별

- T0393: K/X와 원천 페이지에 PEST·5 Forces·SWOT 등 도구 목록이 있으나 Y의 기술요소명이 충분한지 추가 검토 필요. 아직 신규 Y 구성 제안 확정 아님.
- T0343: 디지털 안전 3법의 세 법률명이 Y에 빠졌다는 의심은 강하지만, 원문 서브노트의 전체 구조를 검증하기 전까지 일괄 목록 치환 금지.
- T0353: CRISP-DM 6단계를 원천 토픽이 따르는지 확인 전 Y 6단계 자동 추가 금지.
- T4037: 원래부터 K/W/X/Y/Z 공란인 별도 대상; 이 정정안과 혼합 금지.

## 4. 승인·변경 상태

- 검증된 **정정 제안 3셀**: 작성 완료.
- 운영 LIVE Sheet 반영: **0셀**, 사용자 명시 승인 후에만 소규모 작업.
- GitHub main 및 실행 HTML·PDF·인증·관리·검색 기능: 변경 없음.
- TTS/MP3/GCS/Cloud Run: 변경 없음.
- Google Apps Script: **저장 불필요 / 함수 실행 불필요 / 재배포 불필요**.
