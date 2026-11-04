# M7 — 운영 반영 별도 승인 요청서 (검토용, 실행 권한 아님)

**현재 요청은 사용자의 운영 병합/배포 승인을 받은 상태가 아님. M7 PR은 개발 검토용 Draft 전용.**

## 현재 결정
- 비공개 합성 PDF 품질 게이트: 제한적 통과.
- 외부 공개 / GitHub Pages / MuPDF JS-WASM 배포 / 운영 Apps Script / LIVE MASTER 수정: **금지, NO-GO**.
- M7 소스의 통합 브랜치 PR 검토는 가능하지만 운영 적용 자체를 승인하지 않음.

## 운영 승인 전 별도로 확보해야 할 근거
- [ ] Artifex/전문가 서면 AGPL 결합·대응 소스 범위 판단 또는 상용 라이선스 확인.
- [ ] MuPDF 1.28.1 WASM과 대응 C 소스/빌드 재현, NOTICE/제3자 라이선스, 공개 소스 완전성.
- [ ] Script Properties 비밀값/Drive/사용자 데이터/개인정보 분리 검토.
- [ ] 운영 Apps Script 실제 소스 및 배포 버전 백업·함수별 diff·서명 GET/인가/owner-only/ACTIVE-PENDING-REVOKED 증명.
- [ ] 백업 가능한 별도 테스트 계정·PDF·필기 데이터의 저장/복원 회귀검사.
- [ ] Windows 실사용 Chrome, 물리 Galaxy Tab S11 S Pen/손바닥, 물리 iPhone 16 Pro Safari WebKit 수용검사.
- [ ] 대형 문서 및 장시간 CPU/RAM/Worker close 성능 측정.
- [ ] 운영 PDF.js 구버전 CVE 대응 및 외부 공개 보안검토.
- [ ] Issue #45 최종 완료 조건과 Google Drive 원본 PDF 접근 확인.
- [ ] 최종 M7 PR CI 전체 PASS 및 코드 리뷰/복수 브랜치 충돌 해결.
- [ ] 사용자의 **명시적 운영 main 병합 승인** 및 **별도 Apps Script/Pages 배포 승인**.

## Artifex / 법률 전문가 확인 질문
1. 별도 HTTP 호출을 사용하는 JS/WASM 브라우저 앱과 비공개 Apps Script API가 하나의 AGPL-covered combined work인지? 연결 방식별 범위의 서면 판단은?
2. 사용자가 AGPL 조건으로 MuPDF를 배포하려면 프런트 코드·서버 코드·설치 및 빌드 스크립트를 어느 범위까지 제공해야 하는지?
3. npm mupdf@1.28.1에 포함된 WASM을 재현할 공식 MuPDF 원본 버전, patch, emsdk/toolchain, configure 옵션, 제3자 아티팩트는 무엇인지?
4. 비공개 Script Properties, 사용자 원본 PDF, 첨부, 필기 데이터의 비공개 유지와 의무 대응 소스 제공 범위가 양립하는지?
5. 상용 라이선스가 필요한 경우 대상(브라우저 MuPDF/WASM, 기존 서비스, 서버 결합, 사용자 수)에 맞는 조건과 비용은?

## 승인 분리
1. 개발 Draft PR 검토: M7 브랜치만 대상으로 가능.
2. integration 병합: 별도 승인 요청.
3. 운영 main 병합: 또 다른 명시적 승인 요청.
4. 운영 Apps Script 코드·버전·Script Properties 변경: 각각 사전 승인.
5. GitHub Pages / 공개 MuPDF 배포: 법률·보안·실기기 수용검수 완료 후 별도 승인.

**본 문서는 승인 요청을 준비하는 산출물이며 실제 승인을 대신하지 않는다.**
