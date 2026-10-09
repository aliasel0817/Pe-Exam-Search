"""Offline Cloud Build source deploy IAM preflight. No actual API calls."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parent/"cloud-gateway"/"preflight_build.sh"
EMAIL="558407087449-compute@developer.gserviceaccount.com"

class BuildPreflightTests(unittest.TestCase):
    def mock(self, has_role=True):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            cli=root/"gcloud"
            cli.write_text(
                "#!/bin/sh\n"
                'echo "$*" >> "$CALLS_LOG"\n'
                'if [ "$1" = "builds" ] && [ "$2" = "get-default-service-account" ]; then\n'
                '  echo "projects/558407087449/serviceAccounts/' + EMAIL + '"\n'
                'elif [ "$1" = "projects" ] && [ "$2" = "get-iam-policy" ]; then\n'
                '  cat "$POLICY_FILE"\n'
                'else\n'
                '  echo "Rejected unexpected command" >&2\n'
                '  exit 99\n'
                'fi\n',encoding="utf-8")
            cli.chmod(0o755)
            policy=root/"policy.json"
            entries='[{"role":"roles/run.builder","members":["serviceAccount:'+EMAIL+'"]}]' if has_role else "[]"
            policy.write_text('{"bindings":'+entries+'}',encoding="utf-8")
            log=root/"calls.txt"
            env={**os.environ,"PATH":str(root)+os.pathsep+os.environ.get("PATH",""),
                 "CALLS_LOG":str(log),"POLICY_FILE":str(policy)}
            result=subprocess.run(["bash",str(SCRIPT)],env=env,
                                  capture_output=True,text=True,timeout=10)
            return result,log.read_text(encoding="utf-8") if log.exists() else ""

    def test_build_identity_and_direct_role_found(self):
        out,commands=self.mock(True)
        self.assertEqual(out.returncode,0,out.stderr)
        self.assertIn("RUN_BUILDER_DIRECT_ROLE: PRESENT",out.stdout)
        self.assertIn("PREDEPLOY CHECK COMPLETE",out.stdout)
        self.assertIn("builds get-default-service-account",commands)
        self.assertIn("projects get-iam-policy",commands)
        self.assertNotIn("add-iam-policy-binding",commands)
        self.assertNotIn("run deploy",commands)

    def test_missing_role_is_reported_without_modification(self):
        out,commands=self.mock(False)
        self.assertEqual(out.returncode,0,out.stderr)
        self.assertIn("RUN_BUILDER_DIRECT_ROLE: NOT_FOUND",out.stdout)
        self.assertNotIn("add-iam-policy-binding",commands)

    def test_source_has_no_mutating_gcloud_actions(self):
        source=SCRIPT.read_text(encoding="utf-8")
        for item in ("gcloud run deploy", "gcloud services enable",
                     "gcloud projects add-iam-policy-binding",
                     "gcloud storage", "gcloud builds submit"):
            self.assertNotIn(item,source)

if __name__=="__main__":
    unittest.main()
