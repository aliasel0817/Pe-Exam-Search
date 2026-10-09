"""Offline tests for dedicated Cloud Build identity IAM setup with fake gcloud."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parent/"cloud-gateway"/"setup_build_identity.sh"
EMAIL="study-tts-build@study-note-tts.iam.gserviceaccount.com"

class BuilderIdentityTests(unittest.TestCase):
    def run_cmd(self,*args,already=False,wrong_project=False):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)
            cli=path/"gcloud"
            cli.write_text(
                "#!/bin/sh\n"
                'echo "$*" >> "$MOCK_CALLS"\n'
                'if [ "$1" = "projects" ] && [ "$2" = "describe" ]; then\n'
                '  if [ "$MOCK_WRONG_PROJECT" = "1" ]; then echo 123456789000; else echo 558407087449; fi\n'
                'elif [ "$1" = "iam" ] && [ "$2" = "service-accounts" ] && [ "$3" = "list" ]; then\n'
                '  if [ -f "$MOCK_ACCOUNT" ]; then echo "'+EMAIL+'"; fi\n'
                'elif [ "$1" = "iam" ] && [ "$2" = "service-accounts" ] && [ "$3" = "create" ]; then\n'
                '  touch "$MOCK_ACCOUNT"\n'
                'elif [ "$1" = "projects" ] && [ "$2" = "get-iam-policy" ]; then\n'
                '  if [ -f "$MOCK_ROLE" ]; then echo \'{"bindings":[{"role":"roles/run.builder","members":["serviceAccount:'+EMAIL+'"]}]}\' ; else echo \'{"bindings":[]}\' ; fi\n'
                'elif [ "$1" = "projects" ] && [ "$2" = "add-iam-policy-binding" ]; then\n'
                '  touch "$MOCK_ROLE"\n'
                'else\n'
                '  echo "Unexpected gcloud command" >&2\n'
                '  exit 91\n'
                'fi\n',
                encoding="utf-8")
            cli.chmod(0o755)
            account=path/"account"
            role=path/"role"
            if already:
                account.touch();role.touch()
            log=path/"calls.txt"
            env={**os.environ,"PATH":str(path)+os.pathsep+os.environ.get("PATH",""),
                 "MOCK_CALLS":str(log),"MOCK_ACCOUNT":str(account),"MOCK_ROLE":str(role),
                 "MOCK_WRONG_PROJECT":"1" if wrong_project else "0"}
            result=subprocess.run(["bash",str(SCRIPT),*args],env=env,
                                  capture_output=True,text=True,timeout=12)
            return result,log.read_text(encoding="utf-8") if log.exists() else ""

    def test_default_is_dry_run_without_gcloud(self):
        proc,calls=self.run_cmd()
        self.assertEqual(proc.returncode,0,proc.stderr)
        self.assertIn("ZERO GOOGLE API CALLS",proc.stdout)
        self.assertEqual(calls,"")

    def test_invalid_arguments_rejected_before_cloud(self):
        for args in [("--execute",),("--dry-run","--execute"),("--approve-project-builder-role",)]:
            with self.subTest(args=args):
                proc,calls=self.run_cmd(*args)
                self.assertNotEqual(proc.returncode,0)
                self.assertEqual(calls,"")

    def test_execute_targets_dedicated_sa_only(self):
        proc,calls=self.run_cmd("--execute","--approve-project-builder-role")
        self.assertEqual(proc.returncode,0,proc.stderr)
        self.assertIn("DEDICATED BUILD ACCOUNT READY",proc.stdout)
        self.assertIn("projects describe study-note-tts",calls)
        self.assertIn("iam service-accounts create study-tts-build",calls)
        self.assertIn("projects add-iam-policy-binding study-note-tts",calls)
        self.assertIn("--member=serviceAccount:"+EMAIL,calls)
        self.assertIn("--role=roles/run.builder",calls)
        self.assertNotIn("compute@developer.gserviceaccount.com",calls)
        self.assertNotIn("run deploy",calls)

    def test_existing_account_and_role_are_not_repeated(self):
        proc,calls=self.run_cmd("--execute","--approve-project-builder-role",already=True)
        self.assertEqual(proc.returncode,0,proc.stderr)
        self.assertNotIn("service-accounts create",calls)
        self.assertNotIn("add-iam-policy-binding",calls)

    def test_wrong_project_aborts_before_any_iam_mutation(self):
        proc,calls=self.run_cmd("--execute","--approve-project-builder-role",wrong_project=True)
        self.assertNotEqual(proc.returncode,0)
        self.assertIn("project number mismatch",proc.stderr)
        self.assertNotIn("service-accounts create",calls)
        self.assertNotIn("add-iam-policy-binding",calls)

if __name__=="__main__":
    unittest.main()
