# 3단계 사전 작업 — 실제 학습 토픽 5건의 비공개 오프라인 DRY RUN

기준: 2026-10-09. 기본 음성은 사용자 청취 선정 `ko-KR-Chirp3-HD-Aoede`.
**실제 Google TTS 합성, GCS 업로드, Cloud Run 재배포, 운영 main 수정은 미승인 상태.**

## 준비 완료 상황
- 사용자가 Cloud Shell에서 전체 81개 기존 테스트 통과(`OK`) 확인.
- Aoede + `pronunciations.ko-candidates.json` (발음 검수 후보 30건)으로 가상 T99991 토픽 DRY RUN 성공: 3회, 96자, 232 UTF-8바이트, 유료 API 요청 0.
- LIVE `topic_study_data` / `암기장`에서 **읽기 전용**으로 학습대상 Y 5건을 확인:
  T0001(경영정보·3C 분석 종류), T1961(인공지능·MCTS), T2238(알고리즘·퀵 정렬), T2176(알고리즘·B+Tree), T2354(DB·SQL).
- 원문을 GitHub에 복사하지 않고, 기존 `for_speech` 치환 규칙을 별도 계산해 사전 추산: **35요청·4,577자·8,674바이트**, 최대 세그먼트 771바이트(4,200바이트 미만).
- Chirp 3: HD 단가를 US$30/100만 자로 가정할 때 무료 구간 밖이라면 합성료 약 US$0.14. 실제 과금·무료구간은 프로젝트 상태에 따라 다름. 합성은 아직 실행하지 않음.

## Windows PC에서 비공개 샘플 JSON 만들기 (유료 API 호출 없음)
1. 실제 Google Sheet `topic_study_data`를 열고 **암기장 탭** 선택.
2. 메뉴 **파일 → 다운로드 → 쉼표로 구분된 값(.csv, 현재 시트)**. Windows에서 파일명을 `study-note-live.csv`로 변경.
3. Cloud Shell 터미널 상단 **점 세 개(⋮) → Upload file**로 CSV를 Cloud Shell 홈 디렉터리에 업로드. 작업 폴더(`pe-tts-dev`) 안에는 업로드하지 않음.
4. Cloud Shell에 아래 명령을 순서대로 실행.

```bash
cd "$HOME/pe-tts-dev" &&
git switch feature/ai-natural-tts-20261009 &&
git pull --ff-only &&
python3 -m unittest discover -s study-note/tts -p "test_*.py" -v
```

```bash
cd "$HOME/pe-tts-dev" &&
python3 study-note/tts/prepare_real_sample_csv.py   --csv "$HOME/study-note-live.csv"   --out "$HOME/study-tts-private/real-5.json"   --ids T0001,T1961,T2238,T2176,T2354
```

정상 출력: `PRIVATE SAMPLE READY: 5 Y topics`. CSV에서 필수 컬럼 누락, 학습대상 N, ID 미존재, 같은 ID 중복, 이미 존재하는 출력 파일 등이 있으면 중단. **기존 JSON을 덮어쓰지 않고 저장 권한 0600으로 제한.**

```bash
cd "$HOME/pe-tts-dev" &&
python3 study-note/tts/generate_mp3.py   --input "$HOME/study-tts-private/real-5.json"   --out "$HOME/study-tts-private/dry-run-audio"   --voice ko-KR-Chirp3-HD-Aoede   --pronunciations study-note/tts/pronunciations.ko-candidates.json   --fields topic,concept,background,necessity,features,components,keywords   --max-topics 5 --max-new-requests 35
```

정상 출력: `DRY RUN - NO API CALLS`. 요청 수·문자 수·바이트 수가 사전 추산과 일치하는지 확인. 원본 Sheet가 수정되었으면 값이 달라질 수 있으므로 무조건 합성하지 않음.

## 개인정보·비용·보안 보호
- 원본 CSV와 결과 JSON은 사용자 Cloud Shell의 **개인 비공개 파일**. 공개 GitHub 저장소, 업무 채팅, GCS 운영 버킷에 업로드하지 말 것.
- 파일 업로드와 DRY RUN은 TTS API 합성/Cloud Run 재배포/GCS 업로드를 전혀 실행하지 않음.
- 실제 사용자 학습 내용은 합성 API 호출 전에 입력 텍스트에 사용되므로, 별도 명시적 동의(토픽 수, 필드 수, 요청 수, 글자 수, 비용 가능성 포함)가 있어야 함.
- 기존 Cloud Shell의 MP3·manifest·ledger는 열거나 변경하지 않음. 프로젝트의 `ttsGenerationApproved=false`, `gcsUploadApproved=false`, `cloudRunRevisionUpdateUserApproved=false` 유지.
- Google Sheets·Apps Script 수정 없음. **저장/함수 실행/재배포 필요 없음.**
