# R4 제3자 소프트웨어 고지·라이선스 초안 (NOT A FINAL RELEASE NOTICE)

**상태:** 2026-11-04, R4 개인 검토용. 운영 배포용으로 게시하지 않음. 실제 포함 파일과 라이선스 내용을 마지막으로 검증 후 적용.

## 사용 예정 MuPDF 렌더러

- **Component**: MuPDF / MuPDF.js, npm `mupdf@1.28.1`, JavaScript binding, C engine compiled into WebAssembly.
- **Copyright**: © Artifex Software, Inc. 및 해당 저작권자(실제 각 파일 헤더 확인 필요).
- **License offered**: GNU AGPL-3.0-or-later 또는 별도 상용 라이선스.
- **License text**: `licenses/AGPL-3.0.txt` (공식 npm 패키지 LICENSE와 동일 SHA-256).
- **Upstream source**: https://github.com/ArtifexSoftware/mupdf/tree/1.28.1
- **Exact upstream commit**: `20061bd45183f5a2bff8f43675e4da91e5ac2901`.
- **Source availability**: 아직 사용자에게 제공되지 않음. **승인된 실제 배포 버전과 일치하는 공개 다운로드/저장소 URL 확정 전에는 서비스에 사용 금지.**
- **Modification notices**: MuPDF C 엔진 원본은 현재 수정한 증거 없음. 학습노트의 자체 adapter/Worker/UI 파일은 별도 소스 제공 범위 검토 대상. 변경한 버전에는 변경 사실·날짜·라이선스를 표시해야 함.
- **No warranty**: 해당 라이선스 전문에 명시된 범위에서 무보증.
- **PDF metadata/producer**: 기존 원본 PDF는 읽기·렌더만 하므로 생성·변조하지 않음. PDF를 생성/저장하는 새 기능이 생길 경우 Artifex 권장 Producer/메타데이터 공지를 별도 검토.

## 기타 실제 사용/후보 라이브러리

| 구성요소 | 코드에서 확인된/이전 문서 버전 | 고지/라이선스 후보 | 최종 검증 |
|---|---|---|---|
| PDF.js | 운영 3.11.174, 신규 fallback 6.5.438 | Apache-2.0 | 실제 배포물 및 LICENSE 전문 확인 필요 |
| pdf-lib | 1.17.1 | MIT | 실제 배포물/저작권 고지 확인 필요 |
| SheetJS CE (xlsx) | 0.18.5 | 이전 M2 문서에 Apache-2.0 기재 | 실제 배포 소스의 정확한 파일별 라이선스·고지 재확인 필요 |
| MuPDF 18 thirdparty git submodules | R3 manifest에 SHA 기재 | 각 파일별 다양한 라이선스 가능 | 완전한 소스/파일별 저작권 및 Notices 최종 확인 필요 |

R3에서 18개 모듈 중 16개는 루트 LICENSE/COPYING/NOTICE 후보 파일이 확인되었지만, `leptonica`, `libjpeg`는 루트에서 해당 이름의 파일을 찾지 못했음. 하위 디렉터리/README/COPYRIGHT 등 검토 필요. 루트 후보가 없다고 무허가 소프트웨어라는 뜻이 아님.

## AGPL 최종 서비스 화면 고지에 필요한 실제 항목

- 누구나 접근 가능한 **오픈소스/저작권 고지 메뉴**.
- MuPDF·라이선스 명칭과 Artifex 저작권·해당 저작권자의 권리 보존.
- AGPL 전문을 읽을 수 있는 정상 링크/동일 라이선스 파일 제공.
- 무보증 및 재배포·소스 이용 조건에 대한 명확한 안내.
- **실제로 공개된 해당 서비스 버전과 일치하는 완전한 Corresponding Source 링크**(조건을 만족하기 전에는 링크 생성/표시하지 않음).
- 빌드·설치 스크립트, 필요한 SDK·의존성 소스·패치·변경 고지.
- 기존 PDF.js 및 pdf-lib 등의 별도 라이선스, 포함할 NOTICE.
- 비밀정보/사용자 자료는 실제 대응 소스 패키지에서 제외하며, 대신 수정·설치 가능한 안전한 설정 템플릿 제공.
- Artifex 상용 라이선스 계약을 체결할 경우 **계약이 정한 별도 고지 의무로 조정**, AGPL 의무 면제를 추측하지 말 것.

**고지 준비 자체는 실제 라이선스 준수·상용 허가 또는 외부 공개 승인을 의미하지 않는다.**
