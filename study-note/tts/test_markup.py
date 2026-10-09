"""Static HTML integration tests. No network or cloud API calls."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parent
MAIN = BASE.parent / "study-note.html"
PREVIEW = BASE / "preview.html"
ORDER = [
    "ttsField-concept", "ttsField-background", "ttsField-necessity",
    "ttsField-features", "ttsField-components", "ttsField-keywords"
]
IDS = ["ttsToggleBtn", "ttsSettingsBtn", "ttsSettingsPanel",
       "ttsStatus", "ttsSelectAll", "ttsSelectNone", "ttsExportBtn"] + ORDER


class TagParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        record = dict(attrs)
        if "id" in record:
            self.ids.append(record["id"])
        if tag == "script" and record.get("src"):
            self.scripts.append(record["src"])


class TtsMarkupTests(unittest.TestCase):
    def check_document(self, filename, expected_script):
        content = filename.read_text(encoding="utf-8")
        parser = TagParser()
        parser.feed(content)
        for ident in IDS:
            self.assertEqual(parser.ids.count(ident), 1,
                             str(filename) + " expected single element: " + ident)
        self.assertEqual([x for x in parser.ids if x in ORDER], ORDER)
        self.assertIn(expected_script, parser.scripts)
        self.assertNotIn("SpeechSynthesisUtterance", content)
        return content

    def test_main_page(self):
        src = self.check_document(MAIN, "./tts/natural-tts.js")
        self.assertIn("window.peStudyNoteTtsBridge", src)
        self.assertIn("window.peStudyNoteTTS?.onTopicChanged(topicId);", src)

    def test_standalone_preview(self):
        src = self.check_document(PREVIEW, "./natural-tts.js")
        self.assertIn('type="file"', src)
        self.assertIn("window.peStudyNoteTtsBridge", src)
        self.assertNotIn("script.google.com", src)


if __name__ == "__main__":
    unittest.main()
