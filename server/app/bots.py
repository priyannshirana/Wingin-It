"""Auto Tower / Auto Flyer (§B16.1)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.protocol import Gender, Lang, Role

if TYPE_CHECKING:
    from app.rooms import Room
    from app.speech.base import Utterance


def on_phase_start(room: Room, n: int) -> None:
    """Demo auto-phases turn both bots on (§A17)."""
    del room, n


def on_phase_end(room: Room, n: int) -> None:
    """Demo auto-phases turn the bots back off at the outro (§A17)."""
    del room, n


def on_action_active(room: Room) -> None:
    """An action became active: bots plan their lines and clicks."""
    del room


def on_utterance(room: Room, utt: Utterance) -> None:
    """Bots read matched concepts directly (§B13.2)."""
    del room, utt


def set_bots(room: Room, *, flyer: object = None, tower: object = None) -> None:
    """Dev `bots {flyer?, tower?}`: toggle bots; an empty role in LOBBY gets a virtual player."""
    from app.rooms import broadcast_room_state, maybe_start, new_player

    pairs: tuple[tuple[Role, object], ...] = (("flyer", flyer), ("tower", tower))
    for role, value in pairs:
        if value is None:
            continue
        on = bool(value)
        room.bots[role] = on
        held = room.players.get(role)
        if on and held is None and room.status == "LOBBY":
            human = next((p for p in room.players.values() if p.human), None)
            lang: Lang = "hi" if human is None or human.lang == "en" else "en"
            name = "Auto Tower" if role == "tower" else "Auto Flyer"
            gender: Gender = "male" if role == "tower" else "female"
            room.players[role] = new_player(name, role, lang, gender, bot=True)
        elif not on and held is not None and held.is_bot and room.status == "LOBBY":
            del room.players[role]
    broadcast_room_state(room)
    maybe_start(room)
