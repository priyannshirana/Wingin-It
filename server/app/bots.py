"""Auto Tower / Auto Flyer (§B16.1).

Bots are virtual drivers that call the same handlers as real messages (`handle_say_text`,
`handle_interact`). Every bot timer is generation-guarded by `room.schedule` and re-checks
at fire time that the same action is still active and the bot is still on.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from app.constants import BOT_DELAY_MS, BOT_REPLY_DELAY_MS, BOT_STEP_GAP_MS
from app.language.normalize import norm_line
from app.protocol import ALL_ROLES, Gender, InteractMsg, Lang, Role, SayTextMsg

if TYPE_CHECKING:
    from app.actions import ActionRun
    from app.content import Line
    from app.rooms import Player, Room
    from app.speech.base import Utterance

VERB_CONCEPTS = frozenset({"PRESS", "PULL", "ON", "OFF", "DOWN"})


def bot_active(room: Room, role: Role) -> bool:
    """A bot drives `role` right now (toggle on, PLAYING only)."""
    return room.status == "PLAYING" and room.bots.get(role, False)


def _player(room: Room, role: Role) -> Player | None:
    return room.players.get(role)


def _line_text(line: Line, lang: Lang) -> str:
    return line.hi_roman if lang == "hi" else line.en


def _instruction(run: ActionRun) -> Line | None:
    a = run.action
    if a.branches is not None and run.branch_index is not None:
        return a.branches[run.branch_index].say
    return a.say


def _guarded(room: Room, run: ActionRun, role: Role, fn: Callable[[], None]) -> Callable[[], None]:
    def fire() -> None:
        g = room.game
        if g is None or g.run is not run or not run.active or not bot_active(room, role):
            return
        fn()

    return fire


def _say(room: Room, role: Role, text: str) -> None:
    from app import game

    p = _player(room, role)
    if p is not None:
        game.handle_say_text(room, p, SayTextMsg(type="say_text", text=text))


# --------------------------------------------------------------------------- Auto Tower


def _plan_tower(room: Room, run: ActionRun) -> None:
    tower = _player(room, "tower")
    if tower is None:
        return
    lang = tower.lang
    instruction = _instruction(run)

    def say_instruction() -> None:
        if instruction is not None:
            _say(room, "tower", _line_text(instruction, lang))

    ask = run.action.ask
    if ask is None:
        room.schedule(BOT_DELAY_MS / 2, _guarded(room, run, "tower", say_instruction))
        return

    def say_ask() -> None:
        _say(room, "tower", _line_text(ask, lang))
        room.schedule(BOT_DELAY_MS, _guarded(room, run, "tower", say_instruction))

    room.schedule(BOT_DELAY_MS / 2, _guarded(room, run, "tower", say_ask))


# --------------------------------------------------------------------------- Auto Flyer


def _reply(room: Room, run: ActionRun) -> None:
    from app import game

    flyer = _player(room, "flyer")
    if flyer is None:
        return
    answer = game.answer_line(room, run, flyer.lang)
    if answer is not None:
        _say(room, "flyer", answer.text)


def _act(room: Room, run: ActionRun) -> None:
    """Perform the correct remaining steps in order, 300 ms apart (within the debounce)."""
    from app import game

    clicks: list[tuple[str, str]] = []
    for i, s in enumerate(run.steps):
        if not run.done[i]:
            clicks += [(s.object, s.verb)] * s.count
    for k, (obj, verb) in enumerate(clicks):

        def click(obj: str = obj, verb: str = verb) -> None:
            flyer = _player(room, "flyer")
            if flyer is not None:
                msg = InteractMsg.model_validate(
                    {"type": "interact", "object_id": obj, "verb": verb}
                )
                game.handle_interact(room, flyer, msg)

        room.schedule(k * BOT_STEP_GAP_MS, _guarded(room, run, "flyer", click))


def _is_ask(run: ActionRun, utt: Utterance) -> bool:
    ask = run.action.ask
    if ask is None:
        return False
    forms = {norm_line(ask.hi), norm_line(ask.hi_roman), norm_line(ask.en)}
    return norm_line(utt.transcript) in forms


def on_utterance(room: Room, utt: Utterance) -> None:
    """The Auto Flyer reads the Tower's matched concepts directly (§B13.2, §B16.1)."""
    g = room.game
    run = g.run if g else None
    if run is None or not run.active or utt.speaker_role != "tower":
        return
    if not bot_active(room, "flyer"):
        return
    concepts = {c for m in [*utt.matches, *utt.listener_matches] for c in m.concepts}
    if _is_ask(run, utt) or (run.action.observe is not None and not concepts & VERB_CONCEPTS):
        if not run.bot_replied:
            run.bot_replied = True
            room.schedule(
                BOT_REPLY_DELAY_MS, _guarded(room, run, "flyer", lambda: _reply(room, run))
            )
        return
    if concepts & VERB_CONCEPTS and not run.bot_acting:
        run.bot_acting = True
        room.schedule(BOT_DELAY_MS, _guarded(room, run, "flyer", lambda: _act(room, run)))


# ------------------------------------------------------------------------------- hooks


def on_action_active(room: Room) -> None:
    """An action became active: the Auto Tower plans its lines (§B16.1)."""
    g = room.game
    run = g.run if g else None
    if run is None or not run.active:
        return
    run.bot_replied = False
    run.bot_acting = False
    if bot_active(room, "tower"):
        _plan_tower(room, run)


def on_phase_start(room: Room, n: int) -> None:
    """Demo auto-phases turn both bots on for that phase only (§A17)."""
    g = room.game
    if g is None or not room.demo or n not in room.svc.content.demo.auto_phases:
        return
    if g.auto_bots_prev is None:
        g.auto_bots_prev = dict(room.bots)
    room.bots = dict.fromkeys(ALL_ROLES, True)


def on_phase_end(room: Room, n: int) -> None:
    """…and back off at the phase's outro (§A17)."""
    del n
    restore_auto_bots(room)


def restore_auto_bots(room: Room) -> None:
    """Restore saved bot toggles if auto-phase bots were active (§A17)."""
    g = room.game
    if g is None or g.auto_bots_prev is None:
        return
    room.bots = g.auto_bots_prev
    g.auto_bots_prev = None


def set_bots(room: Room, *, flyer: object = None, tower: object = None) -> None:
    """Dev `bots {flyer?, tower?}`: toggle bots; an empty role in LOBBY gets a virtual player."""
    from app.rooms import broadcast_room_state, maybe_start, new_player

    newly_on: list[Role] = []
    pairs: tuple[tuple[Role, object], ...] = (("flyer", flyer), ("tower", tower))
    for role, value in pairs:
        if value is None:
            continue
        on = bool(value)
        was_on = room.bots.get(role, False)
        room.bots[role] = on
        held = room.players.get(role)
        if on and held is None and room.status == "LOBBY":
            other = room.players.get("tower" if role == "flyer" else "flyer")
            lang: Lang
            if other is not None:
                lang = "hi" if other.lang == "en" else "en"
            else:
                lang = "en" if role == "flyer" else "hi"
            name = "Auto Tower" if role == "tower" else "Auto Flyer"
            gender: Gender = "male" if role == "tower" else "female"
            room.players[role] = new_player(name, role, lang, gender, bot=True)
        elif not on and held is not None and held.is_bot and room.status == "LOBBY":
            del room.players[role]
        if on and not was_on:
            newly_on.append(role)
    broadcast_room_state(room)
    if room.status == "LOBBY":
        maybe_start(room)
    elif newly_on:
        # Only plan bot actions for roles that just went from off to on.
        # Don't reset run flags for roles already on.
        g = room.game
        run = g.run if g else None
        if run is not None and run.active and "tower" in newly_on and not run.bot_acting:
            _plan_tower(room, run)
            # For flyer, on_action_active only resets flags and plans tower.
            # The flyer bot reacts to utterances, not activation.
