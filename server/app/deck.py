"""Word deck payload, stats, clips and the mission report (§B15.1–§B15.3)."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import TYPE_CHECKING, Any, Literal, Protocol

from app import audio
from app.constants import BEDROCK_MAX_TOKENS, BEDROCK_TIMEOUT_S, FUEL_LITRES_PER_S
from app.logging_setup import log_event
from app.protocol import (
    DeckMsg,
    DeckReport,
    DeckWord,
    LifelinesUsed,
    PhaseStatsOut,
    Stats,
)
from app.rooms import Player, Room, send

log = logging.getLogger("wingin.deck")

if TYPE_CHECKING:
    from app.game import Game

PHASE_NO: dict[int, Literal[1, 2, 3]] = {1: 1, 2: 2, 3: 3}

TEMPLATES = {
    "en": "{flyer} and {tower} landed with {fuel_l} litres ({fuel_s} s) of fuel to spare. "
    "You learned {n} words, including {w1} and {w2}.",
    "hi": "{flyer} और {tower} ने {fuel_l} लीटर ({fuel_s} सेकंड) ईंधन बचाकर विमान उतार लिया। "
    "आपने {n} शब्द सीखे, जैसे {w1} और {w2}।",
}
TEMPLATES_SHORT = {
    "en": "{flyer} and {tower} landed with {fuel_l} litres ({fuel_s} s) of fuel to spare. "
    "You learned {n} words.",
    "hi": "{flyer} और {tower} ने {fuel_l} लीटर ({fuel_s} सेकंड) ईंधन बचाकर विमान उतार लिया। "
    "आपने {n} शब्द सीखे।",
}
FUEL_PHRASE = {
    "en": "{fuel_l} litres ({fuel_s} s) of fuel",
    "hi": "{fuel_l} लीटर ({fuel_s} सेकंड) ईंधन",
}


def _game(room: Room) -> Game:
    g = room.game
    if g is None:
        raise RuntimeError("no game")
    return g


def fuel_amounts(room: Room) -> tuple[int, int]:
    """Final fuel as whole (litres, seconds) for the report (§B15.3)."""
    g = _game(room)
    fuel_s = g.phase_stats[3].fuel_left_s if 3 in g.phase_stats else 0.0
    return round(fuel_s * FUEL_LITRES_PER_S), round(fuel_s)


def build_words(room: Room, p: Player, q: Player) -> list[DeckWord]:
    """20 concepts, learned first by understood+spoken, then lexicon order (§B15.1)."""
    lexicon = room.svc.lexicon
    words: list[tuple[int, int, DeckWord]] = []
    partner_utts = [u for u in room.utterances if u.speaker_id == q.id]
    for order, cid in enumerate(lexicon.order):
        c = lexicon.concept(cid)
        understood = p.stats.understood[cid]
        spoken = p.stats.spoken[cid]
        learned = understood >= 1 or spoken >= 1
        dw = DeckWord(
            concept=cid,
            word=c.hi.display_roman if q.lang == "hi" else c.en.display,
            meaning=c.hi.display_deva if p.lang == "hi" else c.en.display,
            meaning_script="deva" if p.lang == "hi" else "latin",
            understood=understood,
            spoken=spoken,
            learned=learned,
            clip_url=audio.make_clip(room.clips, partner_utts, cid),
        )
        score = understood + spoken if learned else -1
        words.append((-score, order, dw))
    words.sort(key=lambda t: (t[0], t[1]))
    return [w for _, _, w in words]


def build_stats(room: Room, p: Player, q: Player) -> Stats:
    """Per-phase and total stats for one player (§B15.1)."""
    g = _game(room)
    phases = []
    for n in sorted(g.phase_stats):
        ps = g.phase_stats[n]
        phases.append(
            PhaseStatsOut(
                phase=PHASE_NO[n],
                fuel_left_s=round(ps.fuel_left_s, 1),
                wrong_actions=ps.wrong,
                lifelines_used=ps.lifelines_used[p.id],
                attempts=g.attempts.get(n, 1),
                time_s=round(ps.time_s, 1),
            )
        )
    final = g.phase_stats[3].fuel_left_s if 3 in g.phase_stats else 0.0
    return Stats(
        phases=phases,
        wrong_actions_total=sum(ps.wrong for ps in g.phase_stats.values()),
        lifelines_used=LifelinesUsed(
            mine=sum(ps.lifelines_used[p.id] for ps in g.phase_stats.values()),
            partner=sum(ps.lifelines_used[q.id] for ps in g.phase_stats.values()),
        ),
        total_time_s=g.total_time_s,
        fuel_left_final_s=round(final, 1),
    )


def template_report(room: Room, p: Player, words: list[DeckWord]) -> str:
    """Fallback mission report in the player's language (§B15.3)."""
    flyer = room.players.get("flyer")
    tower = room.players.get("tower")
    learned = [w.word for w in words if w.learned]
    fuel_l, fuel_s = fuel_amounts(room)
    fields = {
        "flyer": flyer.name if flyer else "",
        "tower": tower.name if tower else "",
        "fuel_l": fuel_l,
        "fuel_s": fuel_s,
        "n": len(learned),
    }
    if len(learned) >= 2:
        return TEMPLATES[p.lang].format(**fields, w1=learned[0], w2=learned[1])
    return TEMPLATES_SHORT[p.lang].format(**fields)


PROMPT = (
    "Write an upbeat mission report for a co-op game where two people who don't share a "
    "language landed a plane. It is read by one player, the reader (reader_name, the "
    '{reader_role}); address the reader as "{you}" in the second person. Language: '
    "{language}. Plain text only: no Markdown, no heading or title, no bullet points, no "
    "emoji. Exactly 2 or 3 short sentences, each under 20 words. Use ONLY the facts below "
    "and never invent numbers, words or events. Mention both names and the fuel left, "
    "written exactly as: {fuel_phrase}. {words_rule} Use the players' genders for pronouns "
    "and, in Hindi, for verb agreement. Facts: {facts}"
)
WORDS_RULE = (
    "learned_words are the words the READER learned (not the partner): credit them to the "
    "reader only, mention one or two of them spelled exactly as given, and no other words.",
    "learned_words is empty, so do not mention any specific words.",
)
YOU = {"en": "you", "hi": "आप / आपने"}
LANGUAGE_NAME = {"hi": "Hindi (Devanagari script)", "en": "English"}


class ReportError(Exception):
    """The model call failed; the template is used instead."""


class Reporter(Protocol):
    """Writes one mission report from a prompt (§B15.3)."""

    async def report(self, prompt: str) -> str: ...


_HEADING = re.compile(r"^\s*#.*(?:\n|$)")
_SENTENCE_END = re.compile(r"[.!?।](?=\s|$)")


def clean_report(text: str, truncated: bool) -> str:
    """Strip Markdown; if cut at max_tokens keep whole sentences; "" = template (§B15.3)."""
    while _HEADING.match(text):
        text = _HEADING.sub("", text, count=1)
    text = " ".join(text.replace("#", "").replace("*", "").split())
    if truncated:
        ends = list(_SENTENCE_END.finditer(text))
        text = text[: ends[-1].end()] if ends else ""
    return text


class BedrockReporter:
    """Bedrock Converse, maxTokens 400, temperature 0.7, 5 s timeout (§B15.3)."""

    def __init__(self, region: str, model_id: str, client: Any = None) -> None:
        self.region = region
        self.model_id = model_id
        # Any: a boto3 `bedrock-runtime` client (created lazily off the event loop).
        self._client: Any = client

    def _call(self, prompt: str) -> str:
        if self._client is None:
            import boto3

            self._client = boto3.client("bedrock-runtime", region_name=self.region)
        resp = self._client.converse(
            modelId=self.model_id,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": BEDROCK_MAX_TOKENS, "temperature": 0.7},
        )
        text = str(resp["output"]["message"]["content"][0]["text"])
        truncated = resp.get("stopReason") == "max_tokens"
        if truncated:
            log_event(log, "report_truncated", level=logging.WARNING)
        return clean_report(text, truncated)

    async def report(self, prompt: str) -> str:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            return await asyncio.wait_for(asyncio.to_thread(self._call, prompt), BEDROCK_TIMEOUT_S)
        except (BotoCoreError, ClientError, KeyError, IndexError, TypeError) as exc:
            raise ReportError(repr(exc)) from exc


def report_prompt(room: Room, p: Player, words: list[DeckWord]) -> str:
    """The §B15.3 prompt with the facts JSON."""
    g = _game(room)
    flyer = room.players.get("flyer")
    tower = room.players.get("tower")
    fuel_l, fuel_s = fuel_amounts(room)
    learned = [w.word for w in words if w.learned][:3]
    facts = {
        "flyer": flyer.name if flyer else "",
        "flyer_gender": flyer.gender if flyer else "",
        "tower": tower.name if tower else "",
        "tower_gender": tower.gender if tower else "",
        "reader_name": p.name,
        "reader_role": p.role,
        "reader_gender": p.gender,
        "fuel_left_l": fuel_l,
        "fuel_left_s": fuel_s,
        "total_time_s": round(g.total_time_s),
        "wrong_actions": sum(ps.wrong for ps in g.phase_stats.values()),
        "learned_words": learned,
    }
    return PROMPT.format(
        reader_role=p.role,
        you=YOU[p.lang],
        language=LANGUAGE_NAME[p.lang],
        fuel_phrase=FUEL_PHRASE[p.lang].format(fuel_l=fuel_l, fuel_s=fuel_s),
        words_rule=WORDS_RULE[0] if learned else WORDS_RULE[1],
        facts=json.dumps(facts, ensure_ascii=False),
    )


def uses_bedrock(room: Room) -> bool:
    """Bedrock when a model id is set and the room isn't mock (§B15.3)."""
    s = room.svc.settings
    return bool(s.bedrock_model_id) and room.svc.reporter is not None and not room.mock_speech


def prepare(room: Room) -> None:
    """Build every player's deck at ENDING start; start Bedrock calls now (§B15.1)."""
    g = _game(room)
    bedrock = uses_bedrock(room)
    for p in room.players.values():
        q = room.partner(p)
        if p.is_bot or q is None:
            continue
        words = build_words(room, p, q)
        template = template_report(room, p, words)
        g.reports[p.id] = None if bedrock else template
        g.decks[p.id] = DeckMsg(
            type="deck",
            partner_name=q.name,
            partner_lang=q.lang,
            partner_gender=q.gender,
            learned_count=sum(1 for w in words if w.learned),
            words=words,
            report=None if bedrock else template,
            report_pending=bedrock,
            stats=build_stats(room, p, q),
        )
        if bedrock:
            room.spawn(_fetch_report(room, p, report_prompt(room, p, words), template))
    log_event(log, "deck", room=room.code, game=g.id, bedrock=bedrock)


async def _fetch_report(room: Room, p: Player, prompt: str, template: str) -> None:
    g = room.game
    reporter = room.svc.reporter
    text = template
    if reporter is not None:
        try:
            text = await reporter.report(prompt) or template
        except (ReportError, TimeoutError) as exc:
            log_event(log, "report_fallback", level=logging.WARNING, err=repr(exc))
    async with room.lock:
        if room.game is not g or g is None or p.id not in g.decks:
            return
        g.reports[p.id] = text
        g.decks[p.id] = g.decks[p.id].model_copy(update={"report": text, "report_pending": False})
        if room.status == "DECK":
            send(p, DeckReport(type="deck_report", report=text))
        room.after_handle()


def send_deck(room: Room, p: Player) -> None:
    """One player's deck (entering DECK, or rejoin)."""
    g = room.game
    if g is None:
        return
    msg = g.decks.get(p.id)
    if msg is not None:
        send(p, msg)


def send_decks(room: Room) -> None:
    """Each player's own deck."""
    for p in room.players.values():
        send_deck(room, p)
