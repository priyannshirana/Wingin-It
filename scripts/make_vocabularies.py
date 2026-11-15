"""Create the Amazon Transcribe custom vocabularies `wingin-hi` and `wingin-en` (§B19.4).

`wingin-hi` (hi-IN): every Devanagari variant + the shared words' Devanagari spellings.
`wingin-en` (en-US): every English variant. On rejection, print a warning and continue.

Usage: AWS_REGION=us-east-1 python scripts/make_vocabularies.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DIGITS = re.compile(r"^[0-9०-९]+$")


def phrase(word: str) -> str | None:
    """Transcribe phrases: no digits-only entries, words joined with hyphens."""
    w = word.strip()
    if not w or DIGITS.match(w):
        return None
    return "-".join(w.split())


def vocab_lists(lexicon: dict[str, Any]) -> dict[str, list[str]]:
    """{"wingin-hi": [...], "wingin-en": [...]}, deduplicated, in lexicon order."""
    hi: list[str] = []
    en: list[str] = []
    for c in lexicon["concepts"]:
        hi += [p for v in c["hi"]["variants"] if (p := phrase(v["deva"]))]
        en += [p for v in c["en"]["variants"] if (p := phrase(v))]
    for sw in lexicon["shared_words"]:
        hi += [p for d in sw["deva"] if (p := phrase(d))]
    return {"wingin-hi": list(dict.fromkeys(hi)), "wingin-en": list(dict.fromkeys(en))}


def main() -> int:
    lexicon = json.loads(
        (ROOT / "content" / "lexicon.json").read_text(encoding="utf-8")
    )
    lists = vocab_lists(lexicon)
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("transcribe", region_name=region)
    codes = {"wingin-hi": "hi-IN", "wingin-en": "en-US"}
    for name, phrases in lists.items():
        print(f"{name} ({codes[name]}): {len(phrases)} phrases")
        try:
            client.create_vocabulary(
                VocabularyName=name, LanguageCode=codes[name], Phrases=phrases
            )
            print(f"  created {name}")
        except client.exceptions.ConflictException:
            try:
                client.update_vocabulary(
                    VocabularyName=name, LanguageCode=codes[name], Phrases=phrases
                )
                print(f"  updated {name}")
            except (BotoCoreError, ClientError) as exc:
                print(f"  WARNING: {name} rejected: {exc}")
        except (BotoCoreError, ClientError) as exc:
            print(f"  WARNING: {name} rejected: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
