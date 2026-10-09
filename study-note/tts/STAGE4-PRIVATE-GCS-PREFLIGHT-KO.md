# TTS 4단계: 비공개 GCS 파일럿 업로드 전 안전 검증

2026-10-09 사용자 음성 품질 최종 합격: Aoede, 7개 MP3 (T0001 개념 1개, T2176 기술요소 2개, T2354 기술요소 4개).
검증 기록: 140개 단위 테스트 OK; 실제 합성 7회 984자 1612바이트; ZIP Windows 다운로드 성공.

1. 개인 MP3 및 JSON, requests 이력, ZIP 7개 모두 Cloud Shell에만 보존. GitHub에 업로드하지 않는다.
2. GCS 업로드, Cloud Run 신규 배포, main 수정은 승인되지 않았다. 기존 cloud-project.json 세 잠금 false 유지.
3. 업로드 준비 시 최종 7개 MP3만 대상으로 검증. 서버 측 index는 3개 항목만 포함하므로 지금은 학습노트 전체 재생에 필요한 topic 필드 MP3가 없다.
4. 4단계는 저장·인증·개별 파일 조회 시험으로 시작하고, 전체 학습노트 토픽명/연속 재생 통합은 추가 승인된 파일 구성이 준비된 뒤 진행한다.

Cloud Shell 명령 (무료, 읽기 전용):
```bash
cd "$HOME/pe-tts-dev" &&
git switch feature/ai-natural-tts-20261009 &&
git pull --ff-only &&
python3 -m unittest discover -s study-note/tts -p "test_*.py" -q &&
python3 study-note/tts/stage4_private_audio_preflight.py &&
python3 study-note/tts/upload_gcs.py \
  --audio-dir "$HOME/study-tts-quality-aoede-7x984" \
  --bucket study-note-tts-audio-558407087449
```

예상 결과: STAGE4 PRIVATE AUDIO PREFLIGHT PASSED 및 DRY RUN - NO CLOUD REQUESTS. API 호출·GCS 업로드·새 합성 없음.
실제 오디오 바이트 수는 Cloud Shell 소스에서 계산하므로 명령 수행 후 확인.

실제 GCS 업로드가 필요한 시점에 업로드 대상 7개 MP3, private manifest index, 예상 클라우드비, 인증/Cloud Run 조회 검증 범위를 사용자에게 안내하고 별도 명시 승인을 받는다.
기존 uploader --execute는 세 승인 잠금이 false이므로 사용 금지. 설정의 전역 승인 잠금을 true로 바꾸지 않는다.
