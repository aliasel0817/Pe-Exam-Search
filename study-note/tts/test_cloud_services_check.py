"""Regression tests for read-only gcloud API verification in Cloud Shell."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().with_name("verify_cloud_services.sh")
APIS = [
    "iamcredentials.googleapis.com", "texttospeech.googleapis.com",
    "run.googleapis.com", "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
]


def run_check(enabled: list[str]):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        fake = root / "gcloud"
        lines = "\n".join("echo " + entry for entry in enabled)
        fake.write_text(
            "#!/bin/sh\n"
            'printf "%s\\n" "$*" >> "$MOCK_GCLOUD_LOG"\n'
            'if [ "$1" = "services" ] && [ "$2" = "list" ]; then\n'
            + lines + "\n"
            'elif [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "list" ]; then\n'
            '  echo "Listed 0 items."\n'
            'else\n'
            '  echo "Unexpected or unsafe gcloud command" >&2\n'
            '  exit 90\n'
            'fi\n', encoding="utf-8")
        fake.chmod(0o755)
        log = root / "commands.txt"
        env = {**os.environ, "PATH": str(root) + os.pathsep + os.environ.get("PATH", ""),
               "MOCK_GCLOUD_LOG": str(log)}
        process = subprocess.run(["bash", str(SCRIPT)], env=env,
                                 text=True, capture_output=True, timeout=12)
        return process, log.read_text(encoding="utf-8")


class GcloudReadOnlyTests(unittest.TestCase):
    def test_gcloud_command_syntax_is_validated_by_safe_mock(self):
        result, commands = run_check(APIS)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count("OK: "), 5)
        self.assertIn("CHECK COMPLETE", result.stdout)
        self.assertIn("services list --enabled", commands)
        self.assertIn("run services list", commands)
        self.assertNotIn("services describe", commands)
        self.assertNotIn("services enable", commands)
        self.assertNotIn(" run deploy ", commands)

    def test_missing_api_stops_before_cloud_run(self):
        result, commands = run_check(APIS[:-1])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("NOT ENABLED: artifactregistry.googleapis.com", result.stderr)
        self.assertNotIn("run services list", commands)


if __name__ == "__main__":
    unittest.main()
