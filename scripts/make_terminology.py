"""Import the Amazon Translate custom terminology `wingin-terms` from the lexicon (§B19.4).

Usage: AWS_REGION=us-east-1 python scripts/make_terminology.py
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
TERMINOLOGY_NAME = "wingin-terms"


def terminology_csv(lexicon: dict[str, Any]) -> str:
    """CSV with header `en,hi`, one row per concept (en.display, hi.display_deva)."""
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["en", "hi"])
    for c in lexicon["concepts"]:
        w.writerow([c["en"]["display"], c["hi"]["display_deva"]])
    return buf.getvalue()


def main() -> int:
    lexicon = json.loads(
        (ROOT / "content" / "lexicon.json").read_text(encoding="utf-8")
    )
    data = terminology_csv(lexicon)
    print(data, end="")
    import boto3

    region = os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("translate", region_name=region)
    client.import_terminology(
        Name=TERMINOLOGY_NAME,
        MergeStrategy="OVERWRITE",
        TerminologyData={"File": data.encode("utf-8"), "Format": "CSV"},
    )
    print(f"imported terminology {TERMINOLOGY_NAME} in {region}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
