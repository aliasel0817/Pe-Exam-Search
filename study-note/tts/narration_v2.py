#!/usr/bin/env python3
"""DRAFT read-only Aoede speech script v2: explicit item pauses and glosses.

DO NOT pass these scripts to a paid synthesis/upload command until auditory QA,
usage/cost approval, and a separate versioned immutable MP3 publisher exist.

Unlike legacy.for_speech, this module NEVER removes English(Korean) pairs.
Original Sheets values and their SHA-256 remain unchanged. Only the *spoken
copy* receives numbering, clarification glosses, and pause markup.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import generate_mp3 as legacy

VOICE = "ko-KR-Chirp3-HD-Aoede"
SHORT = "[pause short]"
LONG = "[pause long]"
# Explicit provisional translations: names only, NEVER translate descriptions.
# They require listening/editorial approval before paid synthesis.
GLOSSARY_DRAFT = {
    "Training/Requirements": "교육·요구사항 정의",
    "Threat Modeling": "위협 모델링",
    "Secure Design/Coding": "보안 설계·안전 코딩",
    "Security Review": "보안 검토",
    "Incident Response": "사고 대응",
    "Fuzzing": "퍼징",
}
ORDINALS = (
    "첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째",
    "일곱째", "여덟째", "아홉째", "열째", "열한째", "열두째",
)
PARENS = {"(": ")", "[": "]", "{": "}"}
CLOSERS = set(PARENS.values())
EXISTING_NUMBER = re.compile(r"^\s*(?:[0-9]{1,3}[.)]|[가-하][.)]|[①-㊿])\s*")
ENGLISH_START = re.compile(r"^[A-Za-z][A-Za-z0-9 /+._-]*$")
LINE_ITEM = re.compile(r"(?m)^\s*(?:[0-9]{1,3}[.)]|[가-하][.)]|[①-㊿])\s+")


def split_items(original: str) -> list[str]:
    """Split only outer, spaced bullets or existing numbered newlines.

    Internal mid-dots in Korean terms, explanations and bilingual parentheses
    are not top-level separators. Malformed brackets fail CLOSED to one item.
    """
    s = str(original).strip()
    if not s:
        return []
    stack: list[str] = []
    segments: list[str] = []
    anchor = 0
    for i, ch in enumerate(s):
        if ch in PARENS:
            stack.append(PARENS[ch])
        elif ch in CLOSERS:
            if not stack or stack.pop() != ch:
                return [s]
        if not stack and ch == "·" and i > 0 and i < len(s) - 1:
            if s[i - 1].isspace() and s[i + 1].isspace():
                segments.append(s[anchor:i].strip())
                anchor = i + 1
        elif not stack and ch == "\n" and LINE_ITEM.match(s, i + 1):
            segments.append(s[anchor:i].strip())
            anchor = i + 1
    if stack:
        return [s]
    segments.append(s[anchor:].strip())
    if len(segments) < 2 or any(not item for item in segments):
        return [s]
    return segments


def outer_bracket_group(text: str) -> tuple[str, str] | None:
    """Return label/explanation only for an entire final top-level (...) group."""
    if not text.endswith(")"):
        return None
    levels: list[str] = []
    opening = -1
    closing_groups: list[tuple[int, int]] = []
    for i, ch in enumerate(text):
        if ch in PARENS:
            if not levels and ch == "(":
                opening = i
            levels.append(PARENS[ch])
        elif ch in CLOSERS:
            if not levels or levels.pop() != ch:
                return None
            if not levels and opening >= 0:
                closing_groups.append((opening, i))
                opening = -1
    if levels or not closing_groups:
        return None
    a, b = closing_groups[-1]
    label, body = text[:a].strip(), text[a + 1:b]
    if not label or not body or b != len(text) - 1:
        return None
    return label, body


def _is_gloss(body: str, known_gloss: str | None) -> bool:
    simplified = re.sub(r"\s+", "", body)
    if known_gloss and simplified == re.sub(r"\s+", "", known_gloss):
        return True
    # "SQL(Structured Query Language, 구조화질의언어)" is an explanation
    # of the acronym itself, not a second technical-element description.
    if re.match(r"^[A-Za-z0-9+_.\-/ ]+,\s*[가-힣0-9 ·\-/]+$", body):
        return True
    # Short Korean-only translations, e.g. "Value(가치)".
    if re.fullmatch(r"[가-힣 ]{1,7}", body):
        return True
    return False



def split_compound_component_chain(text: str) -> list[str]:
    """Split only A(...)/B(...), not Secure Design/Coding or URL/math slashes."""
    stack: list[str] = []
    splits: list[int] = []
    for i, ch in enumerate(text):
        if ch in PARENS:
            stack.append(PARENS[ch])
        elif ch in CLOSERS:
            if not stack or stack.pop() != ch:
                return [text]
        elif ch == "/" and not stack and i and i < len(text) - 2:
            if text[i - 1] == ")" and re.match(r"[A-Za-z][A-Za-z0-9_-]*\(", text[i + 1:]):
                splits.append(i)
    if stack or not splits:
        return [text]
    segments: list[str] = []
    prev = 0
    for pos in splits:
        segments.append(text[prev:pos].strip())
        prev = pos + 1
    segments.append(text[prev:].strip())
    if any(not outer_bracket_group(item) for item in segments):
        return [text]
    return segments


def spoken_component_item(raw: str) -> str:
    """Preserve every descriptive word; add only an approved label gloss/pause."""
    text = raw.strip()
    chain = split_compound_component_chain(text)
    if len(chain) > 1:
        return (", " + SHORT + " ").join(spoken_component_item(part) for part in chain)
    parsed = outer_bracket_group(text)
    if not parsed:
        return text
    name, explanation = parsed
    # Embedded parentheticals in a complex name are not rewritten; separately
    # split slash chains above, preserving every acronym and its original order.
    if "(" in name or ")" in name or "[" in name or "]" in name:
        return text
    term = name.strip().rstrip(":：").strip()
    existing_gloss = GLOSSARY_DRAFT.get(term)
    if _is_gloss(explanation, existing_gloss):
        return text
    display_name = term
    if existing_gloss and ENGLISH_START.fullmatch(term):
        display_name = f"{term}({existing_gloss})"
    elif name != term:
        display_name = name.rstrip()
    # Outer description parentheses are punctuation only: all lexical content
    # is copied verbatim and in original order.
    return f"{display_name}, {SHORT} {explanation}"


def _existing_number_or_ordinal(item: str, index: int, multi: bool) -> str:
    if not multi:
        return item
    if EXISTING_NUMBER.match(item):
        return item
    word = ORDINALS[index] if index < len(ORDINALS) else f"{index + 1}번째"
    return f"{word}, {item}"


def _spoken_punctuation(text: str) -> str:
    # A close-spaced mid-dot is NOT a top-level list boundary. Small comma only.
    # Do not change spelling, parentheses, any English token, or Korean wording.
    return re.sub(r"\s*·\s*", ", ", text).replace(";", ". ")


def _pronunciations(text: str, dictionary: dict[str, str]) -> str:
    result = text
    for phrase, spoken in sorted(dictionary.items(), key=lambda pair: -len(pair[0])):
        result = re.sub(
            r"(?<![A-Za-z0-9])" + re.escape(phrase) + r"(?![A-Za-z0-9])",
            lambda _match: spoken, result, flags=re.IGNORECASE)
    return result


def speech_items(label: str, field: str, original: str,
                 dictionary: dict[str, str] | None = None) -> list[str]:
    """Return item-wise, lossless speech scripts; never synthesize audio here."""
    dictionary = dictionary or {}
    source = str(original).strip()
    if not source:
        raise ValueError("Empty original voice field.")
    pieces = split_items(source)
    if not pieces:
        raise ValueError("Empty split result.")
    # A top-level type caption such as "구성요소:" must be read once.
    caption = ""
    if field == "components":
        head = re.match(r"^([^(){}\[\]\n:：]{2,24}[:：])\s*(.+)$", pieces[0], re.DOTALL)
        if head:
            caption = head.group(1)
            pieces[0] = head.group(2)
    multi = len(pieces) > 1
    output: list[str] = []
    for index, item in enumerate(pieces):
        raw_item = item
        if field == "components" and not EXISTING_NUMBER.match(raw_item):
            raw_item = spoken_component_item(raw_item)
        raw_item = _existing_number_or_ordinal(raw_item, index, multi)
        if index == 0:
            section = label + legacy._agree_particle("는", label) + ", " + SHORT
            if caption:
                section += " " + caption + ", " + SHORT
            raw_item = section + " " + raw_item
        raw_item = _pronunciations(_spoken_punctuation(raw_item), dictionary)
        if multi and index < len(pieces) - 1:
            raw_item = raw_item.rstrip() + ". " + LONG
        output.append(raw_item)
    return output



def synthesis_input_v2(text: str) -> dict[str, str]:
    """Both Chirp3-HD pause tags MUST use input.markup, never input.text.

    The pinned legacy generator only checks [pause short]; this independent
    wrapper is mandatory for any future V2 publisher using [pause long].
    """
    if re.search(r"\[pause(?: short| long)?\]", text):
        return {"markup": text}
    return {"text": text}


def planned_parts(original: str, field: str, label: str,
                  dictionary: dict[str, str] | None = None) -> dict:
    """V2 hashes use *same original* source hash but distinct speech hash/path.

    This is a DRAFT plan only. No existing production MP3 is reused or changed.
    """
    items = speech_items(label, field, original, dictionary)
    chunks: list[str] = []
    pause_after_parts: list[int] = []
    for index, item in enumerate(items):
        item_chunks = legacy.split_speech(item)
        if not item_chunks:
            raise ValueError("A narration item has no audio parts.")
        chunks.extend(item_chunks)
        # Between whole list items only, NEVER between arbitrary 220-char splits.
        # Zero-based part positions are validated by the v2 player when published.
        if index < len(items) - 1:
            pause_after_parts.append(len(chunks) - 1)
    if len(set(pause_after_parts)) != len(pause_after_parts) or (
            pause_after_parts and pause_after_parts[-1] >= len(chunks) - 1):
        raise ValueError("Invalid inter-item pause positions.")
    if any(len(c) > legacy.MAX_SPEECH_CHARS
           or legacy.utf8_len(c) > legacy.MAX_REQUEST_BYTES for c in chunks):
        raise ValueError("Voice V2 split exceeds legacy budget.")
    if not all("[pause" not in part or
               re.search(r"\[pause(?: short| long)?\]", part)
               for part in chunks):
        raise ValueError("Unexpected broken pause marker.")
    source_sha = legacy.digest(original.strip())
    speech_sha = legacy.digest("\n".join(chunks))
    return {
        "originalSha256": source_sha,
        "speechSha256": speech_sha,
        "items": len(items),
        "chunks": chunks,
        "segments": len(chunks),
        "sourceChars": len(original.strip()),
        "pauseAfterParts": pause_after_parts,
        "interItemGapMs": 400,  # proposal; client handles delay after marked MP3 parts
        "inputChars": sum(len(c) for c in chunks),
        "inputBytes": sum(legacy.utf8_len(c) for c in chunks),
        # Do not persist any v2 manifest until a dedicated audited publisher
        # guarantees never overwriting the 105 old MP3s and 78 index entries.
        "previewOnly": True,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only v2 Aoede narration preview; NO CLOUD.")
    parser.add_argument("--input", required=True, type=Path, help="Private topics JSON, read only")
    parser.add_argument("--topic-id", required=True, help="Exact Txxxx topic to preview")
    parser.add_argument("--field", choices=("background", "necessity", "features", "components"),
                        default="components")
    parser.add_argument("--dictionary", type=Path, default=Path(__file__).with_name(
                        "pronunciations.ko-candidates.json"))
    parser.add_argument("--show-private-script", action="store_true",
                        help="Print user private voice text to local console only; NEVER commit it")
    options = parser.parse_args(argv)
    try:
        topics = legacy.get_topics(options.input)
        match = [t for t in topics if t["topicId"] == options.topic_id]
        if len(match) != 1:
            raise ValueError("Exactly one eligible topicId required.")
        prop = {"background": "background", "necessity": "necessity",
                "features": "features", "components": "technicalComponents"}[options.field]
        field = next(f for f in legacy.FIELDS if f[0] == options.field)
        dictionary = legacy.load_dictionary(options.dictionary)
        original = str(match[0][prop])
        old = legacy.split_speech(legacy.for_speech(field[2],options.field,original,dictionary))
        v2 = planned_parts(original,options.field,field[2],dictionary)
        print("AOEDE V2 READ-ONLY PREFLIGHT PASS; NO MP3 / NO GCS / NO CLOUD REQUESTS")
        print(json.dumps({
            "topicId": options.topic_id, "field": options.field,
            "sourceSha256Unchanged": legacy.digest(original.strip()) == v2["originalSha256"],
            "old": {"segments":len(old), "speechSha256":legacy.digest("\n".join(old))},
            "v2": {k:v for k,v in v2.items() if k != "chunks"},
        }, ensure_ascii=True, indent=2))
        if options.show_private_script:
            print(json.dumps({"v2Chunks":v2["chunks"]}, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print("STOP V2 PREVIEW: "+str(exc),file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
