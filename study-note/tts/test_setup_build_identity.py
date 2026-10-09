"""Offline tests: dedicated Cloud Build account creation and IAM propagation handling."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent / "cloud-gateway" / "setup_build_identity.sh"
EMAIL = "study-tts-build@study-note-tts.iam.gserviceaccount.com"


class BuilderIdentityTests(unittest.TestCase):
    def run_cmd(self, *args, already=False, account_only=False,
                wrong_project=False, transient_failures=0, permanent_error=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mock = r'''#!/bin/sh
echo "$*" >> "$MOCK_CALLS"
if [ "$1" = "projects" ] && [ "$2" = "describe" ]; then
  if [ "$MOCK_WRONG_PROJECT" = "1" ]; then echo 123456789000; else echo 558407087449; fi
elif [ "$1" = "iam" ] && [ "$2" = "service-accounts" ] && [ "$3" = "list" ]; then
  if [ -f "$MOCK_ACCOUNT" ]; then echo "@@EMAIL@@"; fi
elif [ "$1" = "iam" ] && [ "$2" = "service-accounts" ] && [ "$3" = "create" ]; then
  touch "$MOCK_ACCOUNT"
elif [ "$1" = "projects" ] && [ "$2" = "get-iam-policy" ]; then
  if [ -f "$MOCK_ROLE" ]; then
    echo '{"bindings":[{"role":"roles/run.builder","members":["serviceAccount:@@EMAIL@@"]}]}'
  else
    echo '{"bindings":[]}'
  fi
elif [ "$1" = "projects" ] && [ "$2" = "add-iam-policy-binding" ]; then
  if [ "$MOCK_PERMANENT_ERROR" = "1" ]; then
    echo "ERROR: (gcloud.projects.add-iam-policy-binding) PERMISSION_DENIED: IAM policy modification denied" >&2
    exit 1
  fi
  count=0
  if [ -f "$MOCK_ATTEMPTS" ]; then count=$(cat "$MOCK_ATTEMPTS"); fi
  if [ "$count" -lt "$MOCK_TRANSIENT_FAILURES" ]; then
    echo $((count+1)) > "$MOCK_ATTEMPTS"
    echo "ERROR: (gcloud.projects.add-iam-policy-binding) INVALID_ARGUMENT: Service account @@EMAIL@@ does not exist." >&2
    exit 1
  fi
  touch "$MOCK_ROLE"
else
  echo "Unexpected gcloud command" >&2
  exit 91
fi
'''
            cli = root / "gcloud"
            cli.write_text(mock.replace("@@EMAIL@@", EMAIL), encoding="utf-8")
            cli.chmod(0o755)
            # No real waiting in mocked test; verify the retry timings as commands.
            fake_sleep = root / "sleep"
            fake_sleep.write_text(
                '#!/bin/sh\necho "sleep $*" >> "$MOCK_CALLS"\n',
                encoding="utf-8")
            fake_sleep.chmod(0o755)
            account = root / "account"
            role = root / "role"
            if already or account_only:
                account.touch()
            if already:
                role.touch()
            calls = root / "calls.txt"
            env = {**os.environ,
                   "PATH": str(root) + os.pathsep + os.environ.get("PATH", ""),
                   "MOCK_CALLS": str(calls),
                   "MOCK_ACCOUNT": str(account),
                   "MOCK_ROLE": str(role),
                   "MOCK_ATTEMPTS": str(root / "attempts"),
                   "MOCK_WRONG_PROJECT": "1" if wrong_project else "0",
                   "MOCK_TRANSIENT_FAILURES": str(transient_failures),
                   "MOCK_PERMANENT_ERROR": "1" if permanent_error else "0"}
            result = subprocess.run(
                ["bash", str(SCRIPT), *args], env=env,
                capture_output=True, text=True, timeout=12)
            return result, calls.read_text(encoding="utf-8") if calls.exists() else ""

    def test_default_is_dry_run_without_gcloud(self):
        result, calls = self.run_cmd()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ZERO GOOGLE API CALLS", result.stdout)
        self.assertEqual(calls, "")

    def test_invalid_arguments_rejected_before_cloud(self):
        for args in [("--execute",), ("--dry-run", "--execute"),
                     ("--approve-project-builder-role",)]:
            with self.subTest(args=args):
                result, calls = self.run_cmd(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(calls, "")

    def test_execute_targets_dedicated_sa_only(self):
        result, calls = self.run_cmd("--execute", "--approve-project-builder-role")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("DEDICATED BUILD ACCOUNT READY", result.stdout)
        self.assertIn("projects describe study-note-tts", calls)
        self.assertIn("iam service-accounts create study-tts-build", calls)
        self.assertIn("projects add-iam-policy-binding study-note-tts", calls)
        self.assertIn("--member=serviceAccount:" + EMAIL, calls)
        self.assertIn("--role=roles/run.builder", calls)
        self.assertNotIn("compute@developer.gserviceaccount.com", calls)
        self.assertNotIn("run deploy", calls)

    def test_existing_account_and_role_are_not_repeated(self):
        result, calls = self.run_cmd(
            "--execute", "--approve-project-builder-role", already=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("service-accounts create", calls)
        self.assertNotIn("add-iam-policy-binding", calls)

    def test_existing_account_recovers_after_transient_iam_propagation(self):
        result, calls = self.run_cmd(
            "--execute", "--approve-project-builder-role",
            account_only=True, transient_failures=2)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("bounded retry", result.stdout)
        self.assertIn("DEDICATED BUILD ACCOUNT READY", result.stdout)
        self.assertEqual(calls.count("projects add-iam-policy-binding"), 3)
        self.assertIn("sleep 10", calls)
        self.assertIn("sleep 20", calls)
        self.assertNotIn("service-accounts create", calls)

    def test_account_created_then_binding_retry_does_not_recreate(self):
        result, calls = self.run_cmd(
            "--execute", "--approve-project-builder-role",
            transient_failures=1)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls.count("service-accounts create"), 1)
        self.assertEqual(calls.count("projects add-iam-policy-binding"), 2)

    def test_permanent_iam_permission_error_does_not_retry(self):
        result, calls = self.run_cmd(
            "--execute", "--approve-project-builder-role",
            account_only=True, permanent_error=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PERMISSION_DENIED", result.stderr)
        self.assertEqual(calls.count("projects add-iam-policy-binding"), 1)
        self.assertNotIn("sleep ", calls)
        self.assertNotIn("run deploy", calls)

    def test_transient_error_has_finite_limit(self):
        result, calls = self.run_cmd(
            "--execute", "--approve-project-builder-role",
            account_only=True, transient_failures=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("propagation timeout", result.stderr)
        self.assertEqual(calls.count("projects add-iam-policy-binding"), 5)
        for time in (10, 20, 40, 60):
            self.assertIn("sleep " + str(time), calls)

    def test_wrong_project_aborts_before_any_iam_mutation(self):
        result, calls = self.run_cmd(
            "--execute", "--approve-project-builder-role", wrong_project=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("project number mismatch", result.stderr)
        self.assertNotIn("service-accounts create", calls)
        self.assertNotIn("add-iam-policy-binding", calls)


if __name__ == "__main__":
    unittest.main()
