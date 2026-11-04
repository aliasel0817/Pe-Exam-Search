# 학습노트 MuPDF.js 운영 반영 승인 요청서 — 승인 보류용 초안

**작성:** 2026-11-04 (Asia/Seoul)
**상태:** **승인 요청 미실시 / NO-GO**. 이 문서는 향후 차단 조건 해소 후 정확한 변경 범위·버전을 사용자에게 제시하기 위한 템플릿이며, 현재 운영 반영을 승인받았다는 뜻이 아니다.

## 1. 승인 전에 반드시 채울 근거

| 필수 근거 | R3 종료 상태 | 승인 전 필요 사항 |
|---|---|---|
| 공식 MuPDF 1.28.1 C 소스·18개 submodules | PASS (비공개 checkout) | 실제 반영할 소스/변경 기록 잠금 |
| npm 패키지(JS/WASM/LICENSE) 해시 | PASS (M2 잠금과 일치) | 실제 C→WASM 재현 증거 |
| Emscripten 4.0.8 Linux 빌드 | BLOCKED | 빌드·결과 비교·dependency 잠금 확인 |
| AGPL 결합/Apps Script 소스 범위 | BLOCKED | Artifex/적격 법률 전문가 서면 판단 |
| Corresponding Source·NOTICE | DRAFT | 완전한 소스/빌드·설치/고지 제공 방안 확정 |
| 보안/비밀정보 분리 | DRAFT | 전체 공개 후보를 별도 정밀 검사 |
| ACTIVE PDF 및 owner-only | NOT VERIFIED | 명시 승인·격리·백업/복구로 안전한 검사 |
| 주석 schema3/서버 저장·복원 | BLOCKED | 실제 격리 계정·테스트 자료·백업 승인 |
| Galaxy Tab S11 / iPhone 16 Pro | NOT VERIFIED | 적법한 실기기 최소 수용검수 |
| M1~R3 PR 충돌·최종 CI | 진행 중 확인 | 최종 SHA 및 CI 실조회 |
| 운영 백업/롤백 | 미작성 | GitHub Pages / Apps Script 기존 버전 복구 계획 |

위 **필수 조건**이 해소되지 않으면 사용자에게 운영 승인 요청을 보내지 않으며 기존 M2 release gate CLOSED를 유지한다.

## 2. 조건 충족 후 사용자에게 명확히 승인받을 작업

아래 각각의 항목에 정확한 SHA/브랜치/버전/대상 URL/복구 계획을 적는다.

- [ ] 승인 대상 GitHub 누적 PR 및 최종 main 병합 SHA: **미확정**
- [ ] 라이선스/대응 소스 공개 방식과 필요한 고지 문구: **미확정**
- [ ] 실제 공개 MuPDF JS/WASM 버전과 SHA-256: **소스 재빌드·법률 검토 미완료**
- [ ] Apps Script 코드 변경 필요 여부·구체 함수·기존 배포 ID·배포 버전: **미확정**
- [ ] GitHub Pages 배포 대상 및 자동 배포 영향: **미확정**
- [ ] ACTIVE 원본 PDF·필기 저장/복원 검사 범위와 백업: **승인 전 실행 금지**
- [ ] 실제 PC/Tab/iPhone 검사 조건·계정·일정: **접속/법률 경로 미확보**
- [ ] 오류 발생 시 복구 기준/절차 및 사용자 연락: **작성 필요**

**R3 Draft PR은 운영 반영 승인 대상이 아니다.**

## 3. 중대한 원칙

- “R3 개발 완료”와 “운영 공개/배포 GO”를 구분한다.
- 사용자 명시적 승인 없는 main/integration 병합, 운영 Apps Script push/version/deploy/Script Properties 변경, Pages publish, MuPDF 공개 및 실제 데이터 쓰기 금지.
- 실제 법률 서면·재현 빌드·격리 인증·실기기 필수 검증 없이 개발자의 임의 판단으로 승인 조건을 완화하지 않는다.
- 승인 후 작업 중 새 중대한 위험이 확인되면 추가 승인 전 진행 중단, 기존 데이터·인증·동시 채팅 작업 보호.
- 승인 이후에도 실제 GitHub Actions·Pages·Apps Script 실행본 확인 없이 완료를 선언하지 않는다.

**현재 사용자에게 요청할 승인:** 운영 배포 승인이 아니라, 필요하다면 **Artifex 법률 상담 및 별도 격리 테스트 환경 구성**에 관한 구체적인 승인을 향후 별도 요청할 수 있다. 이 문서만으로 해당 승인을 가정하지 않는다.
