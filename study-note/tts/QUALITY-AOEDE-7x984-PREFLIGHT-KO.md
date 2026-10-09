# Aoede 품질 보정 최종 7x984 사전 검증

2026-10-09 Cloud Shell DRY RUN 실제 수치: T0001 개념 1회 80자 132B, T2176 기술요소 2회 346자 630B, T2354 기술요소 4회 558자 850B.
합계 7회 984자 1612B. 기존 사용자 승인 7회 939자보다 45자 증가하였으므로 **7x984 실제 합성은 아직 미승인**.

품질 변경: 개념은/등장배경은/필요성은/특징은/기술요소 및 구성요소는/키워드는 이후 짧은 쉼을 삽입.
현재 스크립트 quality_aoede_7x984_preflight.py는 별도 실행 기능이 없는 읽기 전용 검증기이며 파일 생성이나 TTS API 호출이 불가능.

Cloud Shell 명령:
    cd "$HOME/pe-tts-dev" &&
    git switch feature/ai-natural-tts-20261009 &&
    git pull --ff-only &&
    python3 -m unittest discover -s study-note/tts -p "test_*.py" -q &&
    python3 study-note/tts/quality_aoede_7x984_preflight.py

예상 결과: PREFLIGHT PASSED, Requests: 7 | Characters: 984 | UTF-8 bytes: 1612, DRY RUN - NO API CALLS.
기존 run_approved_quality_aoede_7.py 와 run_approved_stage3_aoede.py 는 다시 실행하지 말 것.
새로운 984자 범위에 대한 명시적 유료 가능 합성 승인 후, 별도 새 출력 디렉터리/원장/실행 잠금/ZIP 전용 실행기 작성 및 사전 테스트.
GCS 업로드, Cloud Run 재배포, GitHub main, Sheets/Apps Script 변경은 금지. 과거 MP3/ZIP/개인 JSON 보존.
