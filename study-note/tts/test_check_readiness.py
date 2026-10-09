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
            "bucketCreatedUserConfirmed": False,
            "plannedBucketName": "study-note-tts-audio-558407087449",
            "cloudProvisioningApproved": False,
            "ttsGenerationApproved": False,
            "gcsUploadApproved": False,
        }
        self.runtime = {"schemaVersion": 1, "mode": "disabled"}

    def test_current_stage_indicates_bucket_not_confirmed(self):
        problems, result = ready.inspect(self.project, self.runtime)
        self.assertFalse(result)
        self.assertTrue(any("버킷 생성" in item for item in problems))
        status = ready.report(self.project, self.runtime)
        self.assertIn("결제 계정 연결(사용자 확인): 확인", status)
        self.assertIn("예산 알림(사용자 확인): 확인", status)
        self.assertIn("비공개 버킷 생성(사용자 확인): 미확인", status)
        self.assertIn("외부 API 호출: 이 점검 프로그램에서는 없음", status)

    def test_wrong_project_always_rejected(self):
        wrong = {**self.project, "projectId": "wrong-project"}
        problems, result = ready.inspect(wrong, self.runtime)
        self.assertFalse(result)
        self.assertTrue(any("프로젝트 ID" in issue for issue in problems))

    def test_all_approvals_required(self):
        project = {**self.project,
            "budgetAlertsUserConfirmed": True,
            "cloudProvisioningApproved": True,
            "bucketCreatedUserConfirmed": True,
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
