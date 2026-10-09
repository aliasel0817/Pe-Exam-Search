"""Voice comparison dry-run: 3 voices x 3 fields, no Google TTS/GCS calls."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent
INPUT=ROOT/"voice-pilot.sample.json"
SYNTH=ROOT/"generate_mp3.py"
DICT=ROOT/"pronunciations.example.json"
spec=importlib.util.spec_from_file_location("voice_pilot_tts_generator",SYNTH)
tts=importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts)


class VoicePilotTests(unittest.TestCase):
    def test_illustrative_input_is_not_a_real_master_topic(self):
        topics=tts.get_topics(INPUT)
        self.assertEqual(len(topics),1)
        self.assertEqual(topics[0]["topicId"],"T99991")
        self.assertEqual(topics[0]["studyTarget"],"Y")
        self.assertTrue(all(topics[0].get(prop) for _,prop,_ in tts.FIELDS))

    def test_three_recommended_korean_voices_with_three_identical_segments(self):
        text_sizes=[]
        for voice in sorted(tts.VOICES):
            with self.subTest(voice=voice):
                with tempfile.TemporaryDirectory() as temp:
                    planned=tts.plan(
                        tts.get_topics(INPUT),voice,{"topic","concept","keywords"},
                        tts.load_dictionary(DICT),Path(temp),
                        {"schemaVersion":1,"entries":{}},1)
                    self.assertEqual([t["label"] for t in planned],
                                     ["토픽명","개념","키워드"])
                    self.assertEqual(sum(len(t["chunks"]) for t in planned),3)
                    self.assertTrue(all(tts.utf8_len(chunk)<=tts.MAX_REQUEST_BYTES
                                        for entry in planned for chunk in entry["chunks"]))
                    bytes_used=sum(tts.utf8_len(chunk) for p in planned for chunk in p["chunks"])
                    self.assertLess(bytes_used,tts.HARD_MONTHLY_LIMIT)
                    text_sizes.append(bytes_used)
        self.assertEqual(len(set(text_sizes)),1)
        self.assertLess(sum(text_sizes),tts.HARD_MONTHLY_LIMIT)

    def test_generator_dry_run_all_voices_without_creating_mp3(self):
        for voice in sorted(tts.VOICES):
            with self.subTest(voice=voice),tempfile.TemporaryDirectory() as temp:
                audio=Path(temp)/"audio"
                args=[sys.executable,str(SYNTH),"--input",str(INPUT),
                      "--out",str(audio),"--voice",voice,
                      "--pronunciations",str(DICT),
                      "--fields","topic,concept,keywords",
                      "--max-topics","1","--max-new-requests","3"]
                outcome=subprocess.run(args,stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE,text=True,timeout=12)
                self.assertEqual(outcome.returncode,0,outcome.stderr)
                self.assertIn("DRY RUN - NO API CALLS",outcome.stdout)
                self.assertIn("requests: 3",outcome.stdout)
                self.assertFalse(audio.exists())

    def test_generate_does_not_bypass_explicit_audio_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/"audio"
            args=[sys.executable,str(SYNTH),"--input",str(INPUT),
                  "--out",str(out),"--voice","ko-KR-Chirp3-HD-Aoede",
                  "--fields","topic,concept,keywords","--max-topics","1",
                  "--max-new-requests","3","--project","study-note-tts",
                  "--execute","--accept-possible-charges"]
            result=subprocess.run(args,capture_output=True,text=True,timeout=15)
            self.assertEqual(result.returncode,2)
            self.assertIn("not yet approved",result.stderr)
            self.assertFalse(out.exists())


if __name__=="__main__":
    unittest.main()
