"""Cloud Run pilot approval tests; ALL deployments are mocked (never Google Cloud)."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent
SCRIPT=ROOT/"cloud-gateway"/"deploy_pilot.sh"

class CloudRunPilotTests(unittest.TestCase):
    def command(self,*args,existing=False,wrong_project=False):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)
            gcloud=base/"gcloud"
            gcloud.write_text(r'''#!/bin/sh
echo "$*" >> "$MOCK_GCLOUD_LOG"
if [ "$1" = "auth" ] && [ "$2" = "list" ]; then
  echo "study.owner@example.com"
elif [ "$1" = "config" ] && [ "$2" = "get-value" ]; then
  if [ "$MOCK_WRONG_PROJECT" = "1" ]; then echo wrong-project; else echo study-note-tts; fi
elif [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "list" ]; then
  if [ "$MOCK_EXISTING" = "1" ]; then echo study-tts-audio-gateway; fi
elif [ "$1" = "run" ] && [ "$2" = "deploy" ]; then
  echo "MOCK DEPLOY ONLY"
else
  echo "Unexpected gcloud call" >&2
  exit 98
fi
''',encoding="utf-8")
            gcloud.chmod(0o755)
            git=base/"git"
            git.write_text(
                "#!/bin/sh\n"
                'if [ "$1" = "-C" ] && [ "$3" = "branch" ] && [ "$4" = "--show-current" ]; then\n'
                '  echo "feature/ai-natural-tts-20261009"\n'
                'else\n'
                '  echo "Unexpected git command" >&2\n'
                '  exit 97\n'
                'fi\n',encoding="utf-8")
            git.chmod(0o755)
            log=base/"calls.txt"
            env={**os.environ,"PATH":str(base)+os.pathsep+os.environ.get("PATH",""),
                 "MOCK_GCLOUD_LOG":str(log),
                 "MOCK_EXISTING":"1" if existing else "0",
                 "MOCK_WRONG_PROJECT":"1" if wrong_project else "0"}
            result=subprocess.run(["bash",str(SCRIPT),*args],env=env,
                                  capture_output=True,text=True,timeout=15)
            commands=log.read_text(encoding="utf-8") if log.exists() else ""
            return result,commands

    def test_default_dry_run_never_calls_google_cloud(self):
        result,commands=self.command()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("DRY RUN",result.stdout)
        self.assertIn("No build, no deploy",result.stdout)
        self.assertEqual(commands,"")

    def test_invalid_arguments_do_not_trigger_gcloud(self):
        for args in [("--execute",),("--dry-run","--execute"),
                     ("--accept-possible-charges",)]:
            with self.subTest(args=args):
                result,commands=self.command(*args)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual(commands,"")

    def test_one_approved_gateway_deploy_calls_only_expected_gcloud_methods(self):
        result,commands=self.command("--execute","--accept-possible-charges")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("MOCK DEPLOY ONLY",result.stdout)
        self.assertEqual(commands.count("run deploy study-tts-audio-gateway "),1)
        for part in (
            "--project=study-note-tts",
            "--region=us-central1",
            "--source=",
            "--build-service-account=projects/study-note-tts/serviceAccounts/study-tts-build@study-note-tts.iam.gserviceaccount.com",
            "--service-account=study-tts-audio-reader@study-note-tts.iam.gserviceaccount.com",
            "--min-instances=0",
            "--max-instances=1",
            "--concurrency=4",
            "--no-cpu-boost",
            "--cpu-throttling",
            "ALLOWED_GOOGLE_EMAILS=study.owner@example.com",
        ):
            self.assertIn(part,commands)
        for forbidden in ("services enable","storage cp","storage buckets create",
                          "text-to-speech","tts synthesize","iam service-accounts create"):
            self.assertNotIn(forbidden,commands)

    def test_existing_service_fails_before_deploy(self):
        result,commands=self.command("--execute","--accept-possible-charges",existing=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("Existing Cloud Run service found",result.stderr)
        self.assertNotIn("run deploy",commands)

    def test_wrong_active_project_fails_before_deploy(self):
        result,commands=self.command("--execute","--accept-possible-charges",wrong_project=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("must be study-note-tts",result.stderr)
        self.assertNotIn("run deploy",commands)

    def test_budget_locks_synthesis_and_gcs_stay_off(self):
        import json
        cfg=json.loads((ROOT/"cloud-project.json").read_text(encoding="utf-8"))
        self.assertTrue(cfg["cloudRunDeploymentUserApproved"])
        self.assertTrue(cfg["cloudProvisioningApproved"])
        self.assertFalse(cfg["cloudRunDeploymentUserConfirmed"])
        self.assertFalse(cfg["ttsGenerationApproved"])
        self.assertFalse(cfg["gcsUploadApproved"])
        self.assertEqual(cfg["cloudRunDeploymentApprovalScope"],
                         "one-service-study-tts-audio-gateway-us-central1")

    def test_strict_runtime_limits_and_browser_auth_are_explicit(self):
        source=SCRIPT.read_text(encoding="utf-8")
        for expected in (
            "--min-instances=0","--max-instances=1","--no-cpu-boost",
            "--cpu-throttling","--cpu=1","--memory=512Mi","--concurrency=4",
            "--service-account=","--build-service-account=",
            "study-tts-build@study-note-tts.iam.gserviceaccount.com",
            "--allow-unauthenticated","--set-env-vars=","--source=","--region=",
            "cloudRunDeploymentUserApproved","cloudProvisioningApproved",
            "cloudRunDeploymentApprovalScope","cloudProvisioningApprovedScope",
            "ttsGenerationApproved","gcsUploadApproved",
            "dedicatedBuildServiceAccountCreatedUserConfirmed",
            "dedicatedBuildRoleGrantedUserConfirmed"):
            self.assertIn(expected,source)

if __name__=="__main__":
    unittest.main()
