# 6-2 — 토픽별 MP3 상태 자동 안내, 운영 배포 체크포인트

기준: 2026-10-10 (KST)

## 운영 배포

- 6-1 로그인 UX 운영 기준: `502de0e348f66536536f87591a8a25e4021007f2`
- 6-2 상태 안내 추가 운영 `main`: `1956e0805c4b6b1ae10e5fde58ec5e395ed44166`
- 사용 브랜치: `feature/ai-natural-tts-20261009`; RC `feature/ai-natural-tts-cached-status-20261010`
- 반영 파일은 `study-note/tts/natural-tts.js`와 `study-note/study-note.html` 두 개뿐.
- `study-note/study-note.html` 변경은
  `./tts/natural-tts.js?v=267bef93`로 캐시 버전값 바꾼 것뿐.
- `natural-tts.js` Git blob: `267bef93be56b93f83c35b03044c20cbef9150c2`.
- `study-note.html` Git blob: `5e25b579d4a3fec85ce6d3922e8d5b7757d876ab`.
- 합성, 업로드, Cloud Run 배포, Apps Script 실행·저장·재배포 없음.
- `cloud-config.json`, `service-worker.js`, Google Sheets 및
  기존 비공개 MP3 12개 모두 변경 없음.

## 개선 동작

1. 기존에 사용자 클릭으로 비공개 GCS 목록 매니페스트를 받은 경우,
   토픽 이동 시 메모리에 캐시된 목록과 로컬 SHA-256을 활용하여
   **토픽명 MP3 준비됨 / 미생성 / 원문 변경 / 경로 불일치** 상태를 표시.
2. 토픽 이동만으로 추가 Cloud Run, GCS 네트워크 조회를 절대 실행하지 않음.
   **매니페스트 미수신 상태에서는 미확인으로 두며, 음성 없는 토픽을
   무근거로 '미생성' 확정하지 않음.**
3. `T0000` 홈, 학습대상 N에서는 듣기/반복/상태 숨김 유지.
4. 본문 읽기 항목 선택은 유지. 음성 목록·원문 검증은 재생 전에 다시 적용.
   미생성 음성 자동 TTS 합성이나 외부 다운로드 없음.
5. 재생 중 다른 토픽으로 이동하면 안전 중지 안내를 우선하고,
   캐시 상태 메시지가 이를 덮어쓰지 않도록 함.
6. 빠른 토픽 전환으로 이전 SHA 검사 결과가 늦게 끝나도
   최종 현재 토픽의 상태만 표시하도록 ID 확인.

## 검증

- dev 전체 Node/Javascript 회귀 **119/119 PASS**.
- main 기준 최소 변경 RC 테스트 **70/70 PASS**.
- 실제 운영 GitHub Pages 배포와 원격 blob 비교는 이후 체크 완료 시 추가.
- 독립 TTS 파일럿 3기기 합격은 이전 사실; 최신 운영 PWA 3기기 테스트는
  사용자 확인 전이므로 미완료.

## 안전/고지

- Google 메인뷰 신뢰기기 인증과 비공개 음성용 Google ID 토큰 인증은
  별개임. 메인뷰 인증만으로 Cloud Run 보호 해제하지 않음.
- 음성 계정 재방문 Google One Tap은 지원 브라우저·기존 동의 시에만
  동작. Safari에서 버튼 로그인 필요 가능. ID 토큰은 메모리만 유지.
- 인증 후 매번 MP3 준비 확인 버튼 누를 필요 없음. 필요할 때만
  접힌 '연결·MP3 준비 진단' 선택.
- 대규모 3,800개 토픽 전체 생성은 미착수. 비용/범위 분석 후
  유료 TTS 합성·GCS 업로드 별도 승인 필요.
