# Aoede 학습노트 운영 연동 + 6단계 대량 음성 산정 인계

기준일: 2026-10-10

## 운영 반영 확정
- 기존 운영 PWA URL:
  `https://aliasel0817.github.io/Pe-Exam-Search/study-note/study-note.html`
- 종전 안전 복구 기준 `main`: `37ad2f9aad50dc928a0b159dc1c3d7cf37a8db3c`
  (여기에는 사용자가 이미 검증한 독립 시험 페이지 2개 포함).
- 2026-10-10 활성화: `d6ca657cd21c1d57f2d35412eb42b8a8d2300bcf`.
- T0000/학습제외토픽 숨김 후 운영: `cd10716dbdfa253852a192802d94670f058488a7`.
- 모바일 JS 캐시 무효화: `f3b0cd635a3757eebfb21ba75912f5ea76a8a863`.
- 기준 대비 운영 변경 파일은 정확히 세 개:
  1. `study-note/study-note.html`
  2. `study-note/tts/natural-tts.js`
  3. `study-note/tts/cloud-config.json`
- 기존 PDF·필기·주석·학습상태·문제검색·설정·관리 및 Apps Script 코드에 변조 없음.
- Cloud Run 수정, GCS 업로드/삭제, 추가 합성, Google Sheets 수정 없음.
- GitHub Pages HTML/JS/설정 HTTP 200 확인. 정식판에서 Google 로그인과 재생
  *실기기 최종 검증은 사용자 확인 대기*. 독립 시험 페이지는 PC/태블릿/iPhone
  사용자 실기기 청취·긴누르기 합격.
- 사용자의 승인을 추가로 요구하지 않고 사전 승인 범위에서 안전한 단위로 진행.

## 운영 TTS 정책
- 여성 Aoede 음성만 선택 가능. 별도 Google ID 토큰 로그인 후 GCS private signed URL 조회.
- 짧게 듣기/정지, 550ms 길게 옵션 팝업(12px 드래그 취소), 바로 옆 1회↔2회 반복.
- 기본은 '현재 토픽 1개 + 토픽명만' (본문 6개 OFF), 음성 준비 확인 후 본문 선택.
- T0000(홈, 시트 Y)와 학습대상 N은 음성 버튼을 숨기고 API를 호출하지 않음.
- T1961(띄어쓰기 차이), T2354(SQL 영문 확장)는 **정확히 두 가지** 음성 합성 당시
  제목 SHA-256에 일치할 때만 재생 허용. 본문 필드 해시는 예외 없이 검사.
- 모르는 토픽/변경 원문/미생성 음성은 유료 합성 없이 상태 표시 후 중단.
- 초기 TTS 연결만으로는 TTS API, 서명 URL, MP3 다운로드 수행하지 않음.

## LIVE 운영 암기장 읽기 전용 집계
- 데이터 출처: Google Sheets `topic_study_data`, 탭 `암기장`, 2026-10-10.
- 데이터 행: 3,856; 학습대상 Y 3,797, N 59.
- T0000(홈 전용) = Y지만 **합성에서 제외**; 실제 학습 토픽 = 3,796개.
- 3,796 × 7(토픽명·개념·등장배경·필요성·특징·기술요소·키워드)
  = **26,572개 원문 필드**, 전부 채워짐.
- 읽기 원문 문자 수 합계 = **3,866,717자** (토픽명·본문만, 음성 라벨/문장변환 제외).
- 기존 비공개 GCS Aoede: 매니페스트 8필드/12 MP3, 2개 명칭차이 버전은 유지.
- 단순 field 수 기준 남은 필드는 최대 **26,564개**. 실제 TTS 요청 수는
  `generate_mp3.split_speech`의 220자/4200 UTF-8 바이트 상한으로 인해
  이 수치보다 많을 수 있음. 비용은 이 숫자만으로 확정하지 말 것.
- 처음에 발견된 키워드 1건 미기입은 홈 T0000에 한정되므로 학습토픽 누락 아님.

## 6단계: 비용 없는 합성량 정밀 검수
- `study-note/tts/stage6_bulk_volume_preflight.py` 신규 추가.
- Google Cloud/TTS/GCS/Sheet 네트워크 요청, 쓰기, 파일 생성 기능 없음.
- *개인 소유 기기에만 보관하는* 전체 토픽 JSON이 준비된 뒤 실행 예시:

```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 study-note/tts/stage6_bulk_volume_preflight.py \
  --input "$HOME/study-note-tts-all-topics-private.json" \
  --batch-size 10
```

- 이미 승인된 index를 로컬에 안전하게 확보한 경우에만
  `--manifest "$HOME/private-audio-index.json"` 지정.
- 결과: 합성 예상 **정확한 220자 문장분할 요청 수 / 문자/UTF-8 바이트**,
  배치별 규모와 기존 오디오 SHA 중복 방지 통계. 매니페스트 파일은 원격 MP3
  존재 자체를 증명하지 않으므로 정식 합성/업로드 전에 별도 readback 필요.
- 위 파일 경로는 예시이며 파일 생성이나 내보내기를 수행한 상태가 아님.
- 실제 3,796개 음성 생성은 별도 비용·사용한도 산정과 소규모 순차 배치 검증 이후.
  기존 12개 MP3, Cloud Run, GCS index 원본 덮어쓰기는 금지.

## 자동 테스트
- TTS PWA/HTML/게이트웨이/스탠드얼론 JS: **102/102 통과**.
- GCS 보호/기존 TTS 기록/Stage6 오프라인 산정 Python: **74/74 통과**.
- 실제 운영 PWA 본문 MP3 청취는 사용자가 다시 확인해야 함.
- Apps Script 저장·함수 실행·재배포 모두 불필요.

## 안전 되돌리기
- 문제가 생기면 임의로 GCS 또는 Apps Script를 되돌리지 말고,
  우선 운영 GitHub `study-note.html`을 종전 blob
  `6272c91d63d61a3ad310d95cdc053bbcf8df00bf`에 복구하면
  TTS 코드 로딩/표시만 제거되며 PDF/필기/학습데이터는 그대로 유지됨.
- 추가된 `natural-tts.js`와 `cloud-config.json`은 사용되지 않으므로
  버그 조사 전 삭제할 필요 없음. 모든 변동은 GitHub commit history에 남음.
