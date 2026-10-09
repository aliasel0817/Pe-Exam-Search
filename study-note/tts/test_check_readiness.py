"""Cloud readiness tests: offline only, no Google Cloud access."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

MODULE = Path(__file__).resolve().with_name("check_readiness.py")
spec = importlib.util.spec_from_file_location("tts_check_readiness", MODULE)
ready = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ready)


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.project = {
            "schemaVersion": 1,
            "projectId": "study-note-tts",
            "projectNumber": "558407087449",
            "billingLinkedUserConfirmed": True,
            "budgetAlertsUserConfirmed": True,
            "bucketCreatedUserConfirmed": True,
            "bucketName": "study-note-tts-audio-558407087449",
            "gcsCorsUserConfirmed": True,
            "serviceAccountCreatedUserConfirmed": True,
            "bucketReaderIamUserConfirmed": True,
            "plannedSigningRole": "roles/iam.serviceAccountTokenCreator",
            "plannedSigningPrincipal": "serviceAccount:study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com",
            "plannedSigningScope": "study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com",
            "signBlobRoleUserConfirmed": True,
            "plannedEnabledApis": ["iamcredentials.googleapis.com", "texttospeech.googleapis.com", "run.googleapis.com"],
            "requiredApisUserConfirmed": True,
            "gcsCorsEffectiveVerified": True,
            "oauthWebClientIdCandidate": "1054197140509-60r8da165v63qghfn6558o5d48crl02g.apps.googleusercontent.com",
            "oauthReusedClientVerified": False,
            "plannedBuildApis": ["cloudbuild.googleapis.com", "artifactregistry.googleapis.com"],
            "buildApisUserConfirmed": True,
            "cloudRunServicesCheckedUserConfirmed": True,
            "cloudBuildIdentityCheckedUserConfirmed": True,
            "dedicatedBuildServiceAccountEmail": "study-tts-build@study-note-tts.iam.gserviceaccount.com",
            "dedicatedBuildRolePlanned": "roles/run.builder",
            "dedicatedBuildServiceAccountCreatedUserConfirmed": True,
            "dedicatedBuildRoleGrantedUserConfirmed": True,
            "cloudRunDeploymentUserApproved": True,
            "cloudRunDeploymentUserConfirmed": True,
            "cloudRunRemoteUnauthManifestVerified": False,
            "cloudRunRemoteCorsPreflightVerified": False,
            "plannedServiceAccountEmail": "study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com",
            "plannedReaderBucketName": "study-note-tts-audio-558407087449",
            "plannedReaderBucketRole": "roles/storage.objectViewer",
            "plannedBucketName": "study-note-tts-audio-558407087449",
            "cloudProvisioningApproved": True,
            "ttsGenerationApproved": False,
            "gcsUploadApproved": False,
        }
        self.runtime = {"schemaVersion": 1, "mode": "disabled"}

    def test_current_stage_indicates_google_id_token_login_pending(self):
        problems, result = ready.inspect(self.project, self.runtime)
        self.assertFalse(result)
        self.assertTrue(any("TTS 로그인 시험" in item for item in problems))
        status = ready.report(self.project, self.runtime)
        self.assertIn("결제 계정 연결(사용자 확인): 확인", status)
        self.assertIn("예산 알림(사용자 확인): 확인", status)
        self.assertIn("비공개 버킷 생성(사용자 확인): 확인", status)
        self.assertIn("브라우저 CORS 설정(사용자 확인): 확인", status)
        self.assertIn("전용 서비스 계정 생성(사용자 확인): 확인", status)
        self.assertIn("MP3 버킷 읽기 권한(사용자 확인): 확인", status)
        self.assertIn("다운로드 링크 서명 권한(사용자 확인): 확인", status)
        self.assertIn("필수 API 활성화(사용자 확인): 확인", status)
        self.assertIn("기존 Google 로그인 재사용(실제 검증): 미검증", status)
        self.assertIn("외부 API 호출: 이 점검 프로그램에서는 없음", status)

    def test_wrong_project_always_rejected(self):
        wrong = {**self.project, "projectId": "wrong-project"}
        problems, result = ready.inspect(wrong, self.runtime)
        self.assertFalse(result)
        self.assertTrue(any("프로젝트 ID" in issue for issue in problems))

    def test_rejects_project_level_or_wrong_bucket_read_permissions(self):
        for incorrect in (
            {"plannedReaderBucketRole": "roles/storage.admin"},
            {"plannedReaderBucketName": "different-bucket"},
            {"plannedServiceAccountEmail": "other@study-note-tts.iam.gserviceaccount.com"},
        ):
            with self.subTest(incorrect=incorrect):
                problems, is_ready = ready.inspect({**self.project, **incorrect}, self.runtime)
                self.assertFalse(is_ready)
                self.assertTrue(any("계정 이메일" in item or "읽기 권한" in item for item in problems))

    def test_rejects_broad_signed_url_roles_or_wrong_signing_principal(self):
        for incorrect in (
            {"plannedSigningRole": "roles/owner"},
            {"plannedSigningPrincipal": "serviceAccount:someone-else@study-note-tts.iam.gserviceaccount.com"},
            {"plannedSigningScope": "projects/study-note-tts"},
        ):
            with self.subTest(incorrect=incorrect):
                problems, ready_flag = ready.inspect({**self.project, **incorrect}, self.runtime)
                self.assertFalse(ready_flag)
                self.assertTrue(any("서명 권한 설정" in issue for issue in problems))

    def test_rejects_unapproved_api_list(self):
        changed={**self.project,"plannedEnabledApis":["compute.googleapis.com"]}
        issues,ready_flag=ready.inspect(changed,self.runtime)
        self.assertFalse(ready_flag)
        self.assertTrue(any("API 목록" in item for item in issues))

    def test_rejects_wrong_existing_oauth_audience(self):
        bad = {**self.project, "oauthWebClientIdCandidate": "other-client.apps.googleusercontent.com"}
        issues, is_ready = ready.inspect(bad, self.runtime)
        self.assertFalse(is_ready)
        self.assertTrue(any("클라이언트 ID" in item for item in issues))

    def test_rejects_wrong_build_api_list(self):
        project = {**self.project, "plannedBuildApis": ["compute.googleapis.com"]}
        problems, ready_flag = ready.inspect(project, self.runtime)
        self.assertFalse(ready_flag)
        self.assertTrue(any("빌드 준비 API" in item for item in problems))

    def test_default_build_account_preflight_is_recorded_and_required(self):
        issues, ready_flag = ready.inspect(self.project, self.runtime)
        self.assertFalse(ready_flag)
        self.assertFalse(any("기본 빌드 계정 사전 점검" in item for item in issues))
        missing = {**self.project, "cloudBuildIdentityCheckedUserConfirmed": False}
        issues, ready_flag = ready.inspect(missing, self.runtime)
        self.assertFalse(ready_flag)
        self.assertTrue(any("기본 빌드 계정 사전 점검" in item for item in issues))

    def test_dedicated_builder_required_before_cloud_run(self):
        problems, prepared = ready.inspect(self.project, self.runtime)
        self.assertFalse(prepared)
        self.assertFalse(any("전용 Cloud Build 서비스 계정 생성" in text for text in problems))
        self.assertFalse(any("전용 빌드 계정의 프로젝트" in text for text in problems))
        no_builder_role = {**self.project, "dedicatedBuildRoleGrantedUserConfirmed": False}
        issues, prepared = ready.inspect(no_builder_role, self.runtime)
        self.assertFalse(prepared)
        self.assertTrue(any("전용 빌드 계정의 프로젝트" in text for text in issues))
        missing_creation = {**self.project, "dedicatedBuildServiceAccountCreatedUserConfirmed": False}
        issues, prepared = ready.inspect(missing_creation, self.runtime)
        self.assertFalse(prepared)
        self.assertTrue(any("전용 Cloud Build 서비스 계정 생성" in text for text in issues))

    def test_wrong_dedicated_builder_or_role_rejected(self):
        for bad in (
            {"dedicatedBuildServiceAccountEmail": "558407087449-compute@developer.gserviceaccount.com"},
            {"dedicatedBuildRolePlanned": "roles/owner"},
        ):
            with self.subTest(bad=bad):
                problems, prepared = ready.inspect({**self.project, **bad}, self.runtime)
                self.assertFalse(prepared)
                self.assertTrue(any("빌드 계정 또는 Builder 역할 계획" in text for text in problems))

    def test_pilot_approval_keeps_audio_synthesis_and_upload_locked(self):
        self.assertTrue(self.project["cloudRunDeploymentUserApproved"])
        self.assertTrue(self.project["cloudProvisioningApproved"])
        self.assertFalse(self.project["ttsGenerationApproved"])
        self.assertFalse(self.project["gcsUploadApproved"])
        self.assertFalse(self.project["cloudRunDeploymentUserConfirmed"])

    def test_deployed_gateway_requires_live_unauthenticated_and_cors_checks(self):
        issues, is_ready = ready.inspect(self.project, self.runtime)
        self.assertFalse(is_ready)
        self.assertTrue(any("로그인 없는 MP3 목록" in x for x in issues))
        self.assertTrue(any("브라우저 CORS" in x for x in issues))

    def test_cloud_run_requires_separate_owner_approval(self):
        data = {**self.project, "cloudRunDeploymentUserApproved": False}
        issues, is_ready = ready.inspect(data, self.runtime)
        self.assertFalse(is_ready)
        self.assertTrue(any("별도 승인" in x for x in issues))

    def test_all_approvals_required(self):
        project = {**self.project,
            "budgetAlertsUserConfirmed": True,
            "cloudProvisioningApproved": True,
            "bucketCreatedUserConfirmed": True,
            "gcsCorsUserConfirmed": True,
            "serviceAccountCreatedUserConfirmed": True,
            "bucketReaderIamUserConfirmed": True,
            "signBlobRoleUserConfirmed": True,
            "requiredApisUserConfirmed": True,
            "oauthReusedClientVerified": True,
            "buildApisUserConfirmed": True,
            "cloudRunDeploymentUserApproved": True,
            "cloudBuildIdentityCheckedUserConfirmed": True,
            "dedicatedBuildServiceAccountCreatedUserConfirmed": True,
            "dedicatedBuildRoleGrantedUserConfirmed": True,
            "cloudRunDeploymentUserConfirmed": True,
            "cloudRunRemoteUnauthManifestVerified": True,
            "cloudRunRemoteCorsPreflightVerified": True,
            "ttsGenerationApproved": True,
            "gcsUploadApproved": True,
        }
        runtime = {"schemaVersion": 1, "mode": "gcs-private",
                   "gatewayUrl": "https://example.a.run.app",
                   "oauthClientId": "fake.apps.googleusercontent.com"}
        self.assertTrue(ready.inspect(project, runtime)[1])

    def test_executable_has_no_cloud_request(self):
        process = subprocess.run([sys.executable, str(MODULE)],
            capture_output=True, text=True, timeout=10)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("study-note-tts", process.stdout)
        self.assertIn("예산 알림", process.stdout)
        self.assertIn("미실행", process.stdout)


if __name__ == "__main__":
    unittest.main()
