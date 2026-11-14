"""Dev + presenter commands and `dev_state` (§B16.3, §B16.4, §A13)."""

from __future__ import annotations

import logging
from typing import Any

from app import game
from app.constants import DEV_STATE_MIN_INTERVAL_MS
from app.logging_setup import log_event
from app.protocol import (
    ConceptCounters,
    DevBots,
    DevExpected,
    DevExposure,
    DevLastUtterance,
    DevMatch,
    DevMsg,
    DevPending,
    DevState,
    ErrorMsg,
    PresenterMsg,
    Segment,
)
from app.rng import Roller
from app.rooms import Player, Room, broadcast_all, send
from app.world import apply_world, lamp_state

log = logging.getLogger("wingin.dev")


def _err(p: Player, code: str, message: str) -> None:
    send(p, ErrorMsg.model_validate({"type": "error", "code": code, "message": message}))


def _int_arg(args: dict[str, Any], name: str, default: int | None = None) -> int | None:
    # Any: dev args are free-form JSON.
    v = args.get(name, default)
    if v is None:
        return None
    if isinstance(v, bool) or not isinstance(v, int | float | str):
        raise ValueError(f"{name} must be a number")
    return int(v)


def handle_dev(room: Room, p: Player, msg: DevMsg) -> None:
    """Dev commands; `dev_disabled` unless DEV_MODE=1 (§B16.3)."""
    if not room.svc.settings.dev_mode:
        _err(p, "dev_disabled", "dev mode is off")
        return
    args = msg.args or {}
    log_event(log, "dev", room=room.code, cmd=msg.cmd, role=p.role)
    try:
        match msg.cmd:
            case "complete_action":
                if not game.complete_current_action(room):
                    _err(p, "not_allowed_now", "no active action")
            case "fail_action":
                if not game.fail_current_action(room):
                    _err(p, "not_allowed_now", "no active action")
            case "goto_phase":
                n = _int_arg(args, "phase")
                if n not in (1, 2, 3):
                    _err(p, "bad_message", "phase must be 1, 2 or 3")
                elif room.game is None:
                    _err(p, "not_allowed_now", "no game")
                else:
                    goto_phase(room, n)
            case "set_seed":
                seed = _int_arg(args, "seed")
                if seed is None:
                    _err(p, "bad_message", "seed required")
                else:
                    set_seed(room, seed)
            case "add_fuel":
                secs = _int_arg(args, "seconds", 60) or 0
                g = room.game
                if g is None:
                    _err(p, "not_allowed_now", "no game")
                else:
                    g.fuel.add(float(secs))
                    game.broadcast_game_state(room)
            case "force":
                var, value = args.get("var"), args.get("value")
                if not isinstance(var, str) or not isinstance(value, str):
                    _err(p, "bad_message", "force needs var and value")
                elif room.game is None:
                    room.pending_force[var] = value
                else:
                    room.game.rng.forced[var] = value
            case "skip_cinematic":
                g = room.game
                if g is None or g.cinematic is None:
                    _err(p, "not_allowed_now", "no cinematic")
                else:
                    game.skip_now(room, g.cinematic)
            case "bots":
                from app import bots

                bots.set_bots(room, flyer=args.get("flyer"), tower=args.get("tower"))
    except ValueError as e:
        _err(p, "bad_message", str(e))


def handle_presenter(room: Room, p: Player, msg: PresenterMsg) -> None:
    """Presenter keys, demo rooms only: N = next_action, P = next_phase (§B16.4)."""
    if not room.demo:
        _err(p, "demo_only", "presenter keys are for demo rooms")
        return
    log_event(log, "presenter", room=room.code, cmd=msg.cmd, role=p.role)
    if msg.cmd == "next_action":
        if not game.complete_current_action(room):
            _err(p, "not_allowed_now", "no active action")
        return
    next_phase(room, p)


def next_phase(room: Room, p: Player) -> None:
    """Complete the current phase now (→ its outro)."""
    g = room.game
    if g is None:
        _err(p, "not_allowed_now", "no game")
        return
    if room.status in ("PLAYING", "PHASE_INTRO") and g.phase >= 1:
        room.bump()
        g.cinematic = None
        game.enter_phase_outro(room, g.phase)
    elif g.cinematic is not None and g.cinematic.skippable:
        game.skip_now(room, g.cinematic)
    else:
        _err(p, "not_allowed_now", "nothing to advance")


def goto_phase(room: Room, n: int) -> None:
    """Jump to PHASE_INTRO(n) with earlier phases' end states applied (§B16.3)."""
    g = room.game
    if g is None:
        return
    content = room.svc.content
    room.bump()
    g.cinematic = None
    g.run = None
    g.fuel.stop()
    for k in range(1, n):
        if k == 2 and "FIRE_SIDE" not in g.phase_vars:
            pv = content.phase_var_by_name["FIRE_SIDE"]
            g.phase_vars["FIRE_SIDE"] = g.rng.roll("FIRE_SIDE", pv.options).value
            g.vars["FIRE_SIDE"] = g.phase_vars["FIRE_SIDE"]
        _complete_phase_objects(room, k)
        game.apply_outro_end_state(room, k)
    if n >= 2:
        g.world = apply_world(g.world, "overhead_all_green", True)
    game.enter_phase_intro(room, n)


def _complete_phase_objects(room: Room, k: int) -> None:
    """Objects as if phase k were completed (first branch, or the FIRE_SIDE branch)."""
    from app.actions import target_state
    from app.content import expand

    g = room.game
    if g is None:
        return
    content = room.svc.content
    tv = game.template_vars(g)
    for a in content.phases[k].actions:
        if a.branches is not None:
            value = g.phase_vars.get(a.var or "")
            branch = next((b for b in a.branches if b.when == value), a.branches[0])
            steps = branch.expect
        else:
            steps = a.expect or []
        for s in steps:
            oid = expand(s.object, tv)
            ptype = content.objects_by_id[oid].control.type
            g.objects[oid] = target_state(s, ptype)
    for c in content.station_for_phase(k).controls:
        if c.type == "Lamp":
            g.objects[c.id] = lamp_state(None)


def set_seed(room: Room, seed: int) -> None:
    """LOBBY: seed for the next game. In game: restart the current phase with a new Roller."""
    room.seed_override = seed
    g = room.game
    if g is None or room.status in ("LOBBY", "DECK"):
        return
    g.seed = seed
    forced = dict(g.rng.forced)
    g.rng = Roller(seed)
    g.rng.forced.update(forced)
    if g.phase >= 1:
        room.bump()
        g.cinematic = None
        g.run = None
        game.enter_phase_intro(room, g.phase)


# ---------------------------------------------------------------------- dev_state (§A13)


def dev_state_msg(room: Room) -> DevState:
    """The privacy-breaking debug snapshot (DEV_MODE only)."""
    g = room.game
    run = g.run if g else None
    expected: list[DevExpected] = []
    pending: DevPending | None = None
    if run is not None:
        for i, s in enumerate(run.steps):
            fields: dict[str, Any] = {"object": s.object, "verb": s.verb, "done": run.done[i]}
            if s.value is not None:
                fields["value"] = s.value
            if s.count != 1 or s.verb == "press" or s.verb == "move_down":
                fields["count"] = s.count
            expected.append(DevExpected.model_validate(fields))
        if run.pending is not None:
            pending = DevPending(object=run.pending.object_id, count=run.pending.count)
    exposure: dict[str, DevExposure] = {}
    lexicon = room.svc.lexicon
    for pl in room.players.values():
        exposure[pl.id] = DevExposure(
            name=pl.name,
            role=pl.role,
            concepts={
                cid: ConceptCounters(
                    heard=pl.stats.heard[cid],
                    glossed=pl.stats.glossed[cid],
                    understood=pl.stats.understood[cid],
                    spoken=pl.stats.spoken[cid],
                )
                for cid in lexicon.order
            },
        )
    last = room.last_utterance
    last_out: DevLastUtterance | None = None
    if last is not None:
        matches = [
            DevMatch(start=m.start, end=m.end, concepts=m.concepts, side=m.side)
            for m in [*last.matches, *last.listener_matches]
        ]
        segs: list[Segment] = list(last.segments_for_listener)
        last_out = DevLastUtterance(
            id=last.id,
            speaker_role=last.speaker_role,
            transcript=last.transcript,
            matches=sorted(matches, key=lambda m: m.start),
            segments=segs,
            latency_ms=last.latency_ms,
        )
    return DevState(
        type="dev_state",
        room=room.code,
        status=room.status,
        phase=g.phase if g else 0,
        action_id=run.action.id if run else None,
        seed=g.seed if g else (room.seed_override or 0),
        vars=dict(g.vars) if g else {},
        forced=dict(g.rng.forced) if g else dict(room.pending_force),
        expected=expected,
        unordered=run.unordered if run else False,
        pending=pending,
        fuel_s=round(max(0.0, g.fuel.value()), 1) if g else 0.0,
        bots=DevBots(flyer=bool(room.bots.get("flyer")), tower=bool(room.bots.get("tower"))),
        exposure=exposure,
        last_utterance=last_out,
        latencies_ms=list(room.latencies_ms),
    )


def send_dev_state(room: Room) -> None:
    """dev_state to both roles; never sent unless DEV_MODE=1."""
    if not room.svc.settings.dev_mode:
        return
    room.dev_last_ms = room.clock.monotonic() * 1000
    broadcast_all(room, dev_state_msg(room))


def maybe_send_dev_state(room: Room) -> None:
    """Throttle dev_state to 4/s with a trailing send (§B16.3)."""
    if not room.svc.settings.dev_mode or not any(p.conn is not None for p in room.players.values()):
        return
    now = room.clock.monotonic() * 1000
    elapsed = now - room.dev_last_ms
    if elapsed >= DEV_STATE_MIN_INTERVAL_MS:
        room.dev_trailing_gen = None
        send_dev_state(room)
        return
    if room.dev_trailing_gen == room.gen:
        return
    room.dev_trailing_gen = room.gen

    def trailing() -> None:
        room.dev_trailing_gen = None
        send_dev_state(room)

    room.schedule(DEV_STATE_MIN_INTERVAL_MS - elapsed, trailing, notify=False)
