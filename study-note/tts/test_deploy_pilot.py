"""Offline tests for cost-guarded Cloud Run pilot deployments."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent / "cloud-gateway" / "deploy_pilot.sh"

class CloudRunPilotTests(unittest.TestCase):
    def command(self, *args):
        with tempfile.TemporaryDirectory() as tmp:
            cli=Path(tmp)/"gcloud"
            cli.write_text("#!/bin/sh\n"
                'echo "UNEXPECTED GCLOUD CALL" >> "$GCLOUD_TEST_LOG"\n'
                "exit 99\n",encoding="utf-8")
            cli.chmod(0o755)
            log=Path(tmp)/"calls.txt"
            env={**os.environ,"PATH":tmp+os.pathsep+os.environ.get("PATH",""),
                 "GCLOUD_TEST_LOG":str(log)}
            result=subprocess.run(["bash",str(SCRIPT),*args],env=env,
                                  capture_output=True,text=True,timeout=10)
            return result,log.exists()

    def test_defaults_to_no_network_or_cloud_cost(self):
        result,called=self.command()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(called)
        self.assertIn("DRY RUN",result.stdout)
        self.assertIn("No build, no deploy",result.stdout)

    def test_execute_approved_flag_alone_cannot_bypass_owner_lock(self):
        result,called=self.command("--execute","--accept-possible-charges")
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(called)
        self.assertIn("DEPLOYMENT BLOCKED",result.stderr+result.stdout)

    def test_invalid_arguments_are_fail_closed(self):
        for args in [("--execute",),("--dry-run","--execute"),
                     ("--accept-possible-charges",)]:
            with self.subTest(args=args):
                result,called=self.command(*args)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse(called)

    def test_strict_runtime_and_authentication_limits(self):
        source=SCRIPT.read_text(encoding="utf-8")
        for expected in (
            "--min-instances=0","--max-instances=1","--no-cpu-boost",
            "--cpu=1","--memory=512Mi","--concurrency=4",
            "--service-account=","--build-service-account=",
            "study-tts-build@study-note-tts.iam.gserviceaccount.com",
            "--allow-unauthenticated",
            "--set-env-vars=","--source=","--region=",
            "cloudRunDeploymentUserApproved","cloudProvisioningApproved",
            "ttsGenerationApproved","gcsUploadApproved",
            "dedicatedBuildServiceAccountCreatedUserConfirmed",
            "dedicatedBuildRoleGrantedUserConfirmed"):
            self.assertIn(expected,source)

if __name__=="__main__":
    unittest.main()
