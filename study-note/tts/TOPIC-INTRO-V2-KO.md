# 학습노트 TTS — 토픽명 자연음성 안내 문장 v2

기준일: 2026-10-10
개발 브랜치: `feature/ai-natural-tts-20261009`
선정 음성: `ko-KR-Chirp3-HD-Aoede`

## 사용자 확정 요구
기존 토픽명 단독 발음 대신 "토픽명에 대한 설명"을 먼저 읽고 잠깐 쉰 후 본문을 읽는다.

### 예시
- `B+Tree` → `B+Tree에 대한 설명, [pause short]`
- `SQL` → `SQL에 대한 설명, [pause short]`
- `몬테카를로 트리검색` → `몬테카를로 트리검색에 대한 설명, [pause short]`
- `SQL`이 사전에서 `에스큐엘`로 교정된 경우 → `에스큐엘에 대한 설명, [pause short]`

`[pause short]`는 음성에는 태그로 읽히지 않고 Chirp 3 HD markup 입력에서 짧은 쉼으로 처리한다.
그다음 읽기 순서는 **개념 → 등장배경 → 필요성 → 특징 → 기술요소/구성요소 → 키워드**.
본문 6개 항목의 `개념은`, `등장배경은` 등 기존 제목/쉼 형식은 그대로 유지한다.

## 소스 구조와 과거 검증 보호
- `generate_mp3.py`는 과거 합성/품질 승인 기록의 해시가 고정된 **불변 레거시 합성기**다.
- 사용자 요청으로 이 파일을 변경하지 않았다 (Git blob SHA: `81d1a029e8cefc9d51877afaf31d53dd86f96944`).
- 새로운 `topic_intro_v2.py`의 `topic_intro_text()`와 `plan_v2()`만 미래 토픽명 합성 계획에 **명시적으로** 사용한다.
- source `topicName`/Google Sheets/학습 JSON 원문은 변경하지 않고, `originalHash`는 기존 원문의 SHA-256 그대로 유지한다.
- 새로운 spoken input은 `speechHash` 및 MP3 경로가 달라지므로 이전 `토픽명만` MP3는 새 안내 음성으로 재사용하지 않는다.
- 기존 T0001/T2176/T2354 합격 MP3 7개는 **본문 3개 항목**이며 변경하거나 재생성하지 않는다.
- 과거 토픽명 MP3는 보존하되 이후 새로운 스타일로 재합성할 시 별도 새 파일을 만든다. 오디오 및 ZIP 덮어쓰기 금지.

## 안전성·실행 경계
- `topic_intro_v2.py`는 현재 **조회·생성 계획 전용 DRY RUN**이다.
- `--execute`나 Google Cloud API 호출 경로가 없다. 신규 유료 음성 합성 기능은 **현재 없음**.
- Cloud Run 배포·GCS 업로드·운영 main 반영·Google Sheets·Apps Script·PDF/필기 관련 변경 없음.
- `cloud-project.json`의 `ttsGenerationApproved`, `gcsUploadApproved`,
  `cloudRunRevisionUpdateUserApproved` 3개 승인 잠금 모두 `false` 유지.
- 추가 합성은 사용자에게 토픽 수/호출 수/문자 수/비용 가능성을 보고하고 **개별 승인**을 받은 뒤,
  별도 전용 실행기를 추가하여 수행한다.
- 운영 PWA의 완전 연속 읽기는 신규 토픽명 MP3 및 나머지 선택 본문 MP3 확보 전까지 활성화하지 않는다.

## Cloud Shell에서의 무료 검증(원할 때만)
```bash
cd "$HOME/pe-tts-dev"
git switch feature/ai-natural-tts-20261009
git pull --ff-only
python3 -m unittest discover -s study-note/tts -p 'test_*.py' -q
python3 study-note/tts/topic_intro_v2.py \
  --input "$HOME/study-note-tts-real-5.json" \
  --pronunciations study-note/tts/pronunciations.ko-candidates.json \
  --fields topic --max-topics 5
```

예상: `Ran 167 tests`, `OK`; 이어서 `TOPIC INTRO VERSION: topic-about-v2`와
`DRY RUN - NO CLOUD/API REQUESTS, NO FILE WRITES, NO SYNTHESIS` 출력.
명령은 실제 음성 합성/업로드를 하지 않는다. 과거 합성 실행기 실행 금지.

## 현재 테스트
신규 Python 테스트 `test_topic_intro_v2.py` 14개(문장 형식/용어 사전/원문 불변/
원음성과 해시 구별/기존 본문 보존/재생 순서/파일 덮어쓰기 차단/DRY RUN)
모두 통과 (Windows 임시 다운로드에서 수행).
전체 Python 테스트는 Linux Cloud Shell 조건에서 최종 확인 필요:
Windows 전체 167개 중 Linux bash/권한 전용 테스트 및 시스템 줄바꿈 차이로 실패.
과거 Cloud Shell 테스트 153개 통과 기록은 그대로 유효하다.
