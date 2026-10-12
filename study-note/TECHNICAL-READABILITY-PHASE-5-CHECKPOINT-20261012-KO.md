# 학습노트 기술요소 한글 병기 — Phase 5 체크포인트 (2026-10-12)

## 기준과 범위
- 운영 기준 main: `6958cbdf9f73073a29c612cd274c1b8e7cf3c1a5` / 운영 앱: `4.6.8-context-from-features-rc1`
- 개발 브랜치: `feature/study-technical-glossary-phase5-20261012`, PR #6
- RC 앱 버전: `4.6.9-technical-glossary-phase5-rc1`
- 변경한 실행 파일: `study-note/study-note.html` — 앱 버전 문자열 및 `STUDY_TECHNICAL_GLOSSARY`만 수정
- 기존 용어 사전 347개 → **422개**. Phase 5에서 명확한 명칭 **75개** 추가
- 사용자 확정 A안(번호, 줄바꿈, `gap:.52rem`)과 PDF 위젯/주석/검색/관리/인증은 코드 변경 없음

## LIVE Google Sheets 읽기 전용 전수 비교
- 대상: 운영 `topic_study_data` 파일 `암기장` 시트(원본 쓰기 없음)
- 데이터 행 3,858 / 학습대상 Y 3,799 / N 59 / 컬럼 26
- 원본 기술요소 최상위 항목 22,424개, 표시 파서로 해석된 설명 요소 22,209개
- 기존 운영 main과 Phase 5 RC의 실제 표시 함수 `describeStudyTechnicalItem` 비교
- 신규 한글 뜻 표시 **157건**: MG 26 / SW 64 / SV 67
- 번역된 요소명 종류 79개(75개 단일 영문명 + 4개 슬래시 복합명칭 안의 요소명)
- 기존 요소 설명 문자열 변경 0건 / 파싱 성공·실패 전환 0건 / 중복 한글 병기 0건
- 기존 사전 347개 값은 전부 유지. 운영 LIVE 원문 내용은 그대로
- 학습대상 중 기술요소 원문 공란 1건: 원본 상태 그대로, 새 내용 생성하지 않음

## 의미 충돌 검수
- 다른 토픽에서 실제로 서로 다른 한글 뜻을 확인한 경우를 교차 대조
- 용어 출현·문맥에 따라 뜻이 달라질 수 있는 다음 9개는 전역 사전 추가 **보류**:
  `Work Product`, `Iteration`, `Regression`, `Usability`, `Application Layer`,
  `Data Format`, `Session`, `Cloud Storage`, `Sensor/Actuator`
- `Context`, `Control`, `Performance`도 공통 사전에 추가하지 않음
- 띄어쓰기만 다른 같은 의미의 병기는 전역 표제어를 유지하되, 동일 토픽의 키워드/특징이 우선

## 검사 결과
- 기존 오프라인 표시 단위검사: **26/26 통과**
- 독립 Chrome UI 회귀검사: **34/34 통과**
- PDF 뷰어 2종 x 반응형 폭 10개(320, 360, 375, 390, 414, 430, 600, 760, 1024, 1366): **20/20 통과**
- JavaScript 구문, 사전 키 고유성, 변경 범위 검사: 통과
- 테스트 중 외부 호출은 모두 차단한 오프라인/격리 브라우저 사용; Sheets 쓰기 0, TTS Cloud/GCS 호출 0
- 별도 실제 Galaxy Tab/iPhone 디바이스 QA는 **미실시**(Chrome 폭 에뮬레이션만 완료)

## 배포 정책과 보호
- TTS 제작/재합성, MP3 덮어쓰기, GCS 업로드, Cloud Run 재배포, 매니페스트 수정: 0
- Apps Script 수정 없음: **저장/함수 실행/재배포 불필요**
- 운영 시트 전체 치환 금지, W~Z 원문 보존, TTS 원문 SHA-256/MP3 관계 불변
- 기존 음성 실험 브랜치 2개 미변경·미병합
- RC가 운영 병합된 경우, merge SHA와 GitHub Pages 배포 확인 결과는 PR 기록 및 다음 체크포인트에 갱신

## 다음 작업
1. Pages 업데이트 확인 후 Windows 실제 PC / Galaxy Tab / iPhone 화면에서 대표 토픽 및 PDF 버튼 확인
2. 보류 9개와 기타 미번역 항목의 동일 토픽 K/X 기반 명확한 뜻만 단계적으로 확대. 전역 추측 금지
3. 원문이 16자 미만인 기술요소(Phase 4 스냅샷 1,949개)를 설명 충분/약어/보강필요/형식이상으로 분류. 실제 원문 보강은 사용자 범위 결정 후만 진행
4. 새 버전 이후 추가 변경 시 항상 최신 main SHA 재확인, A안 유지 및 브라우저 회귀검증
