# M6 — 고배율 성능·필기/제스처 기기 호환성 (격리 개발 전용)

**날짜:** 2026-11-03 (Asia/Seoul)
**베이스:** M5 HEAD 6d30445f7119bb7261cbe1ca51fe68d9ab2068fa
**실제 코드:** m6-interaction-policy.mjs, m6-runtime.js 및 기존 M4/M5의 해당 함수 최소 수정.

## 안전·라이선스 경계

- 기본 OFF. http://127.0.0.1 또는 localhost에서 URL 쿼리 m4-local=1, m5-local=1, m6-local=1 세 개가 모두 지정되어야 M6 개발 스크립트 로딩.
- MuPDF.js 1.28.1 및 PDF.js 6.5.438의 기존 M2 비공개 스테이징만 사용.
- AGPL 법적 검토 미완료. 공개 JS/WASM, 운영 main 병합, GitHub Pages 배포, Apps Script 버전·보안 설정 변경 금지.
- 기존 signed GET/mediaContent API, owner-only 변경 권한, 주석 schema 3, normalized-0-1 좌표와 사용자 PDF·필기 파일은 수정하지 않음.
- 실제 Galaxy Tab S11 S Pen과 iPhone 16 Pro Safari는 검수하지 못했으며 Chrome 에뮬레이션을 실기기 검수로 보고하지 않음.

## M6 실제 개발 내용

1. **기기별 메모리/렌더 예산:** 고메모리 데스크톱 base 36MiB, tile 32MiB, DPR 최대 3. 터치 태블릿/가로 모드 base 24MiB, tile 20MiB, DPR 최대 2.5. 저메모리 및 스마트폰 base 16MiB, tile 12MiB, DPR 최대 2. 4배 이상 확대는 전체 페이지 base 프리뷰 최대 12MiB, 현재 화면의 detail tile은 별도 고해상도로 렌더링.
2. **스크롤 타일 이벤트 통합:** 125ms debounce, 최대 360ms wait 정책으로 움직임 중 발생하는 많은 scroll 이벤트를 마지막 타일 요청으로 통합. 문서 전환·Worker 취소는 기존 경로 유지.
3. **핀치 중심점 보존:** 손가락 두 개의 중심을 PDF의 현재 CSS 정규화 위치로 기억한 뒤 Canvas 크기·flex 정렬 변경 후 scroller 좌표 보정. PDF CropBox와 주석 원본 데이터 변환 없이 표시만 개선.
4. **S Pen 입력 안전성:** 접촉/압력이 없는 hover형 pen pointerdown의 잉크 생성을 방지. 활성 pen 스트로크 중 추가 touch 접촉을 기존 palm reject와 연계. 도형/펜/압력/지우개/형광펜 기능 유지.
5. **뷰포트 재배치:** visualViewport resize, orientationchange 발생 시 관련 세 뷰어의 Canvas와 ink overlay layout을 한 프레임으로 합침. 소프트키보드 높이 변경만 있을 때 주석 입력 중 불필요한 재레이아웃을 방지.
6. **메모리 내 성능 계측:** M4 reference, M5 attachment의 base/tile 양쪽에서 렌더 대기 시간(ms), bytes, 실제 픽셀, 엔진, 확대율, region 여부를 각각 최근 16개 이벤트로 유지. 토큰/원본 PDF/사용자 주석 객체 기록·전송·영속 저장 없음.
7. **운영 경로 안전성:** 기존 M4/M5에서 M6 옵션이 꺼져 있으면 원래 함수 경로 유지. fallback PDF.js 안전 버전, 페이지·주석 스키마/레이아웃 유지.

## 로컬 비운영 테스트

1. M2 폴더에서 npm ci --ignore-scripts --no-audit --no-fund, node m2-stage-assets.cjs, node m2-verify-assets.cjs 실행.
2. M3 폴더에서 npm ci --ignore-scripts --no-audit --no-fund 실행.
3. M6 폴더에서 node --test tests/m6.test.mjs 실행.
4. M6 폴더에서 node tests/browser-smoke.mjs 실행. 임시 127.0.0.1 포트를 사용하고, 외부 요청은 차단하고 기존 mediaContent GET만 합성 PDF 응답으로 가로채기.
5. M1~M5 자동검사는 .github/workflows/mupdf-m6-ink-gesture-performance.yml. 실제 Windows Chrome 검증과 GitHub Ubuntu CI는 결과를 분리하여 보고.

## 실제 결과 (2026-11-03)

- M6 unit 9/9, M5 8/8, M4 7/7, M3 16/16, M2 10/10, M1 10/10 PASS (총 60개).
- M4 서브노트·교재 및 M5 첨부 PDF의 기존 별도 Chrome 테스트는 M6 OFF로 회귀 PASS.
- M6 Windows Chrome 156 (비운영 합성): MuPDF Worker 다중 페이지, CropBox/회전, 서브노트·교재 M4와 첨부 M5, PDF.js 안전 fallback, 첨부 간 이동, 2→1→2 빠른 페이지 변경 및 닫기 PASS.
- S Pen과 손바닥 PointerEvent 모의: hover 펜 0개 추가, 압력 0.35→0.78 펜 스트로크 1개 추가, 넓은 손바닥 터치의 추가 스트로크 0개. 주석 스키마 3 유지. 실제 S Pen 검증 아님.
- 핀치 중심 확대 오차: 약 0.47 CSS px (단일 합성 페이지/테스트 지점).
- 65회 scroll 이벤트가 1개 타일 스케줄 실행으로 통합됨(전체 렌더 횟수 아님).
- 첨부 4x/8x/10x: full preview 12,338,352 bytes(12MiB 이하), detail tile 약 18.98~19.00MB(32MiB 이하). detail density 약 2.0px/CSSpx, 10x preview density 약 0.137px/CSSpx로 가시 타일에 의한 확대 품질 향상.
- 교재 8x: base 12,338,352 bytes, detail tile 14,592,000 bytes, 원본 주석 키 유지.
- Chrome 태블릿 터치 에뮬레이션: 16MiB budget, pinch1.8x, 뷰포트 회전 대응 렌더 유지. iPhone 16 Pro 크기(402×874, DPR3, Safari User Agent)의 **Chromium 에뮬레이션**: 16MiB budget, DPR cap2, 첫 페이지 렌더 성공. 실제 Safari 아님.
- 브라우저 오류 0. 운영 Apps Script 및 Drive 원본 접촉 0; 합성 mediaContent 응답 5회 처리, 그 외 외부 요청 7회 차단. mutation 0.
- M3 npm audit 0, M1 민감정보 패턴 검사 163개 파일 0건. 패턴 검사가 모든 비밀정보 부재를 증명하지는 않음.

## M7에서 남은 핵심 차단 항목

실제 ACTIVE 기기의 signed GET/mediaContent 조회, 실사용 필기 Cloud 저장/복원, 실제 Galaxy Tab S11 S Pen·손바닥/팔 접촉, iPhone WebKit/Safari/안전영역, 큰 PDF/장시간 메모리·전력/성능 사용은 아직 검증하지 않음. 이들은 M7에서 적법한 통제 환경을 확보해 검수할 것.

AGPL 대응 소스·Apps Script 결합 범위·WASM 재현 빌드·소스 제공 고지는 법적 미확정이므로 공개 배포 금지. 운영 main/Apps Script/Pages/LIVE MASTER/Drive/실제 필기 변경 금지. M7 전체 인계서는 M7-HANDOFF-20261103.md 참조.
