#!/usr/bin/env python3
"""Read-only Study Note AI TTS/cloud setup status in plain Korean.

Never imports the Cloud SDK, makes network requests, calls GCS, or changes settings.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent


def inspect(project: dict, runtime: dict) -> tuple[list[str], bool]:
    problems = []
    if project.get("schemaVersion") != 1 or project.get("projectId") != "study-note-tts":
        problems.append("프로젝트 ID가 예상한 study-note-tts와 일치하지 않습니다.")
    if str(project.get("projectNumber", "")) != "558407087449":
        problems.append("프로젝트 번호가 확인된 번호와 일치하지 않습니다.")
    if project.get("billingLinkedUserConfirmed") is not True:
        problems.append("Google Cloud 결제 계정 연결 여부를 아직 확인하지 않았습니다.")
    if project.get("budgetAlertsUserConfirmed") is not True:
        problems.append("월 예산 알림 설정을 아직 사용자께 확인받지 않았습니다.")
    if project.get("bucketCreatedUserConfirmed") is not True:
        problems.append("비공개 Google Cloud Storage 버킷 생성은 아직 확인되지 않았습니다.")
    if project.get("gcsCorsUserConfirmed") is not True:
        problems.append("비공개 버킷의 웹 브라우저 음성 다운로드(CORS) 설정을 아직 확인하지 않았습니다.")
    if project.get("plannedServiceAccountEmail") != "study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com":
        problems.append("전용 서비스 계정 이메일이 계획과 일치하지 않습니다.")
    if (project.get("plannedReaderBucketRole") != "roles/storage.objectViewer"
            or project.get("plannedReaderBucketName") != "study-note-tts-audio-558407087449"
            or project.get("bucketName") != project.get("plannedReaderBucketName")):
        problems.append("계획된 읽기 권한이 정확한 MP3 버킷의 objectViewer 권한인지 확인할 수 없습니다.")
    if project.get("serviceAccountCreatedUserConfirmed") is not True:
        problems.append("비공개 MP3 다운로드용 전용 서비스 계정 생성은 아직 확인되지 않았습니다.")
    if project.get("bucketReaderIamUserConfirmed") is not True:
        problems.append("MP3 버킷 한정 읽기 권한 부여가 아직 확인되지 않았습니다.")
    if (project.get("plannedSigningRole") != "roles/iam.serviceAccountTokenCreator"
            or project.get("plannedSigningPrincipal") !=
                    "serviceAccount:study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com"
            or project.get("plannedSigningScope") !=
                    "study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com"):
        problems.append("임시 MP3 링크 서명 권한 설정의 계정 또는 범위가 예상과 다릅니다.")
    if project.get("signBlobRoleUserConfirmed") is not True:
        problems.append("임시 다운로드 링크를 위한 서비스 계정 자체 서명 권한이 아직 확인되지 않았습니다.")
    if project.get("plannedEnabledApis") != [
            "iamcredentials.googleapis.com", "texttospeech.googleapis.com", "run.googleapis.com"]:
        problems.append("준비할 Google Cloud API 목록이 예상과 일치하지 않습니다.")
    if project.get("requiredApisUserConfirmed") is not True:
        problems.append("Google Cloud 필수 API 활성화 완료가 아직 확인되지 않았습니다.")
    if project.get("gcsCorsEffectiveVerified") is not True:
        problems.append("MP3 버킷의 실제 CORS 설정을 아직 확인하지 않았습니다.")
    if project.get("oauthWebClientIdCandidate") != "1054197140509-60r8da165v63qghfn6558o5d48crl02g.apps.googleusercontent.com":
        problems.append("기존 학습노트 Google 웹 클라이언트 ID를 확인할 수 없습니다.")
    if project.get("oauthReusedClientVerified") is not True:
        problems.append("기존 Google 웹 클라이언트로 TTS 로그인 시험을 아직 수행하지 않았습니다.")
    if project.get("plannedBuildApis") != ["cloudbuild.googleapis.com", "artifactregistry.googleapis.com"]:
        problems.append("Cloud Run 빌드 준비 API 목록이 예상과 일치하지 않습니다.")
    if project.get("buildApisUserConfirmed") is not True:
        problems.append("Cloud Run 빌드용 Cloud Build/Artifact Registry API 준비가 아직 확인되지 않았습니다.")
    if project.get("cloudRunServicesCheckedUserConfirmed") is not True:
        problems.append("Cloud Run 서비스 목록의 현재 상태가 확인되지 않았습니다.")
    if project.get("cloudBuildIdentityCheckedUserConfirmed") is not True:
        problems.append("Cloud Run 기본 빌드 계정 사전 점검이 아직 완료되지 않았습니다.")
    if project.get("dedicatedBuildServiceAccountEmail") != "study-tts-build@study-note-tts.iam.gserviceaccount.com" or project.get("dedicatedBuildRolePlanned") != "roles/run.builder":
        problems.append("Cloud Run 전용 빌드 계정 또는 Builder 역할 계획이 예상과 다릅니다.")
    if project.get("dedicatedBuildServiceAccountCreatedUserConfirmed") is not True:
        problems.append("TTS 전용 Cloud Build 서비스 계정 생성은 아직 확인되지 않았습니다.")
    if project.get("dedicatedBuildRoleGrantedUserConfirmed") is not True:
        problems.append("TTS 전용 빌드 계정의 프로젝트 Cloud Run Builder 권한이 아직 확인되지 않았습니다.")
    if project.get("cloudRunDeploymentUserApproved") is not True:
        problems.append("사용자가 Cloud Run 테스트 서버 배포 가능 요금을 별도 승인하지 않았습니다.")
    if project.get("cloudRunDeploymentUserConfirmed") is not True:
        problems.append("Cloud Run 테스트 서버의 실제 배포가 아직 확인되지 않았습니다.")
    if runtime.get("schemaVersion") != 1:
        problems.append("TTS 웹 설정 형식이 유효하지 않습니다.")
    if runtime.get("mode") == "disabled":
        problems.append("비공개 MP3 게이트웨이 연결을 활성화하지 않았습니다(안전한 기본값).")
    elif runtime.get("mode") != "gcs-private":
        problems.append("허용되지 않은 음성 저장 모드입니다.")
    if project.get("ttsGenerationApproved") is not True:
        problems.append("실제 AI 음성 생성은 별도 승인 전까지 잠겨 있습니다.")
    if project.get("gcsUploadApproved") is not True:
        problems.append("실제 MP3 클라우드 업로드는 별도 승인 전까지 잠겨 있습니다.")
    if project.get("cloudProvisioningApproved") is not True:
        problems.append("Cloud Run 및 추가 클라우드 서비스 배포는 아직 별도 승인 전입니다.")
    ready = (
        not problems
        and runtime.get("mode") == "gcs-private"
        and bool(runtime.get("gatewayUrl"))
        and bool(runtime.get("oauthClientId"))
    )
    return problems, ready


def report(project: dict, runtime: dict) -> str:
    issues, ready = inspect(project, runtime)
    lines = [
        "학습노트 AI TTS / Google Cloud 준비 상태",
        "프로젝트: " + str(project.get("projectId", "(미확인)")),
        "프로젝트 번호: " + str(project.get("projectNumber", "(미확인)")),
        "결제 계정 연결(사용자 확인): "
        + ("확인" if project.get("billingLinkedUserConfirmed") is True else "미확인"),
        "예산 알림(사용자 확인): "
        + ("확인" if project.get("budgetAlertsUserConfirmed") is True else "미확인"),
        "추천 버킷 이름: " + str(project.get("plannedBucketName", "(미정)")),
        "비공개 버킷 생성(사용자 확인): "
        + ("확인" if project.get("bucketCreatedUserConfirmed") is True else "미확인"),
        "실제 버킷 이름: " + str(project.get("bucketName", "(미확인)")),
        "브라우저 CORS 설정(사용자 확인): "
        + ("확인" if project.get("gcsCorsUserConfirmed") is True else "미확인"),
        "전용 서비스 계정 생성(사용자 확인): "
        + ("확인" if project.get("serviceAccountCreatedUserConfirmed") is True else "미확인"),
        "MP3 버킷 읽기 권한(사용자 확인): "
        + ("확인" if project.get("bucketReaderIamUserConfirmed") is True else "미확인"),
        "다운로드 링크 서명 권한(사용자 확인): "
        + ("확인" if project.get("signBlobRoleUserConfirmed") is True else "미확인"),
        "필수 API 활성화(사용자 확인): "
        + ("확인" if project.get("requiredApisUserConfirmed") is True else "미확인"),
        "기존 Google 로그인 재사용(실제 검증): "
        + ("확인" if project.get("oauthReusedClientVerified") is True else "미검증"),
        "Cloud Run 빌드 API 활성화(사용자 확인): "
        + ("확인" if project.get("buildApisUserConfirmed") is True else "미확인"),
        "Cloud Run 서비스 목록 조회: "
        + ("완료" if project.get("cloudRunServicesCheckedUserConfirmed") is True else "미실시"),
        "Cloud Build 기본 계정 사전 점검: "
        + ("완료" if project.get("cloudBuildIdentityCheckedUserConfirmed") is True else "미실시"),
        "전용 TTS 빌드 계정 생성: "
        + ("완료" if project.get("dedicatedBuildServiceAccountCreatedUserConfirmed") is True else "미실시"),
        "전용 TTS Builder 권한: "
        + ("확인" if project.get("dedicatedBuildRoleGrantedUserConfirmed") is True else "미확인"),
        "Cloud Run 배포 비용 사전 동의: "
        + ("동의" if project.get("cloudRunDeploymentUserApproved") is True else "미동의"),
        "서버 연결 상태: " + str(runtime.get("mode", "(미설정)")),
        "외부 API 호출: 이 점검 프로그램에서는 없음",
        "점검 결과: " + ("배포 준비 상태 점검 통과" if ready else "실제 음성 API/업로드 미실행"),
    ]
    if issues:
        lines += ["남은 단계:"] + ["- " + line for line in issues]
    return "\n".join(lines)


def main() -> int:
    try:
        project = json.loads((ROOT / "cloud-project.json").read_text(encoding="utf-8"))
        runtime = json.loads((ROOT / "cloud-config.json").read_text(encoding="utf-8"))
        print(report(project, runtime))
        return 0
    except (OSError, ValueError, TypeError) as err:
        print("안전 점검 실패: 설정을 읽을 수 없습니다 (" + type(err).__name__ + ")", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
