"""Shared fixtures (§B18)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.content import Content, load_content
from app.language.lexicon import Lexicon

CONTENT_DIR = Path(__file__).resolve().parents[2] / "content"


@pytest.fixture(scope="session")
def content() -> Content:
    return load_content(CONTENT_DIR)


@pytest.fixture(scope="session")
def lexicon(content: Content) -> Lexicon:
    return Lexicon(content.lexicon)
