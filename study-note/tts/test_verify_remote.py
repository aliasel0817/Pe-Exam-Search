"""Offline HTTP checks for deployed Cloud Run gateway: all external calls are mocked."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parent/"cloud-gateway"/"verify_remote.sh"


class CloudRunRemoteTests(unittest.TestCase):
    def mock(self, unauthorized_status="401", cors_status="204", body="expected"):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            gcloud=root/"gcloud"
            gcloud.write_text(
                "#!/bin/sh\n"
                'echo "$*" >> "$MOCK_COMMANDS"\n'
                'if [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "describe" ]; then\n'
                '  echo "https://gateway-example-hash-uc.a.run.app"\n'
                'else\n'
                '  exit 91\n'
                'fi\n',encoding="utf-8")
            gcloud.chmod(0o755)
            curl=root/"curl"
            curl.write_text(
                "#!/usr/bin/env python3\n"
                "import os,sys\n"
                "from pathlib import Path\n"
                "a=sys.argv[1:]\n"
                "out=Path(a[a.index('--output')+1])\n"
                "method=a[a.index('--request')+1]\n"
                "with open(os.environ['MOCK_COMMANDS'],'a') as log: log.write('curl '+method+' '+a[-1]+'\\n')\n"
                "if method=='GET':\n"
                "  headers=Path(a[a.index('--dump-header')+1])\n"
                "  headers.write_text('HTTP/2 401\\r\\nAccess-Control-Allow-Origin: https://aliasel0817.github.io\\r\\n')\n"
                "  if os.environ['MOCK_BODY']=='expected':\n"
                "    out.write_text('{\"error\":\"Google login required\"}')\n"
                "  else:\n"
                "    out.write_text('<html>Cloud Run 404</html>')\n"
                "  sys.stdout.write(os.environ['MOCK_UNAUTH_STATUS'])\n"
                "elif method=='OPTIONS':\n"
                "  out.write_text('')\n"
                "  sys.stdout.write(os.environ['MOCK_CORS_STATUS'])\n"
                "else:\n"
                "  sys.exit(92)\n",encoding="utf-8")
            curl.chmod(0o755)
            log=root/"calls.txt"
            env={**os.environ,"PATH":str(root)+os.pathsep+os.environ.get("PATH",""),
                 "MOCK_COMMANDS":str(log),"MOCK_UNAUTH_STATUS":unauthorized_status,
                 "MOCK_CORS_STATUS":cors_status,"MOCK_BODY":body}
            run=subprocess.run(["bash",str(SCRIPT)],env=env,
                               capture_output=True,text=True,timeout=12)
            return run,log.read_text(encoding="utf-8") if log.exists() else ""

    def test_private_manifest_and_browser_cors_succeed_without_login(self):
        result,log=self.mock()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("UNAUTH_MANIFEST_HTTP=401",result.stdout)
        self.assertIn("APP_AUTH_GATE=OK",result.stdout)
        self.assertIn("GITHUB_PAGES_CORS=OK",result.stdout)
        self.assertIn("CORS_PREFLIGHT_HTTP=204",result.stdout)
        self.assertIn("SECURITY CHECK COMPLETE",result.stdout)
        self.assertIn("run services describe study-tts-audio-gateway",log)
        self.assertIn("curl GET",log)
        self.assertIn("curl OPTIONS",log)
        for mutation in ("run deploy","storage cp","services enable","iam policy"):
            self.assertNotIn(mutation,log)

    def test_frontend_404_fails_closed_before_preflight(self):
        result,log=self.mock(unauthorized_status="404")
        self.assertNotEqual(result.returncode,0)
        self.assertIn("UNAUTH_MANIFEST_HTTP=404",result.stdout)
        self.assertNotIn("curl OPTIONS",log)

    def test_different_unauthorized_body_cannot_pass(self):
        result,log=self.mock(body="html")
        self.assertNotEqual(result.returncode,0)
        self.assertIn("did not originate",result.stderr)
        self.assertNotIn("curl OPTIONS",log)

    def test_wrong_preflight_http_code_fails_closed(self):
        result,log=self.mock(cors_status="403")
        self.assertNotEqual(result.returncode,0)
        self.assertIn("CORS_PREFLIGHT_HTTP=403",result.stdout)

    def test_script_is_read_only(self):
        source=SCRIPT.read_text(encoding="utf-8")
        for forbidden in ("gcloud run deploy","gcloud run services update",
                          "gcloud storage cp","gcloud iam service-accounts create",
                          "gcloud projects add-iam-policy-binding",
                          "gcloud services enable"):
            self.assertNotIn(forbidden,source)


if __name__=="__main__":
    unittest.main()
