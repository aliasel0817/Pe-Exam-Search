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
            "requiredApisUserConfirmed": False,
            "plannedServiceAccountEmail": "study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com",
            "plannedReaderBucketName": "study-note-tts-audio-558407087449",
            "plannedReaderBucketRole": "roles/storage.objectViewer",
            "plannedBucketName": "study-note-tts-audio-558407087449",
            "cloudProvisioningApproved": False,
            "ttsGenerationApproved": False,
            "gcsUploadApproved": False,
        }
        self.runtime = {"schemaVersion": 1, "mode": "disabled"}

    def test_current_stage_indicates_api_activation_pending(self):
        problems, result = ready.inspect(self.project, self.runtime)
        self.assertFalse(result)
        self.assertTrue(any("필수 API 활성화" in item for item in problems))
        status = ready.report(self.project, self.runtime)
        self.assertIn("결제 계정 연결(사용자 확인): 확인", status)
        self.assertIn("예산 알림(사용자 확인): 확인", status)
        self.assertIn("비공개 버킷 생성(사용자 확인): 확인", status)
        self.assertIn("브라우저 CORS 설정(사용자 확인): 확인", status)
        self.assertIn("전용 서비스 계정 생성(사용자 확인): 확인", status)
        self.assertIn("MP3 버킷 읽기 권한(사용자 확인): 확인", status)
        self.assertIn("다운로드 링크 서명 권한(사용자 확인): 확인", status)
        self.assertIn("필수 API 활성화(사용자 확인): 미확인", status)
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
