"""World model helpers: the §A11 start-world table and world/lamp effect application."""

from __future__ import annotations

from app.content import WorldValue
from app.protocol import FireState, LampColor, LampState, Pilot, Side, World

# §A12: shorthand keys that address nested World fields.
WORLD_SHORTHANDS: dict[str, tuple[str, str]] = {
    "fire_level": ("fire", "level"),
    "fire_side": ("fire", "side"),
    "seat_back": ("pilot", "seat_back"),
    "pilot_awake": ("pilot", "awake"),
    "pilot_slumped": ("pilot", "slumped"),
}
_NESTED = {"pilot", "fire"}
WORLD_KEYS: frozenset[str] = frozenset(
    {k for k in World.model_fields if k not in _NESTED} | set(WORLD_SHORTHANDS)
)


def lobby_world() -> World:
    """World before the prologue (§A11, LOBBY column)."""
    return World(
        light_rig="night_calm",
        alarm=False,
        warning_beep=False,
        pilot=Pilot(slumped=False, seat_back=False, awake=True),
        ap_screen=False,
        fire=FireState(side=None, level="none"),
        propeller_stopped=None,
        fire_bell=False,
        fuel_hiss=False,
        engine_hum="normal",
        weather="clouds_night",
        fog=0.004,
        turbulence=0,
        static_level=0,
        landing_lights=False,
        runway="hidden",
        overhead_all_green=False,
    )


def phase_start_world(n: int, fire_side: Side | None, damaged_side: Side | None) -> World:
    """World when PLAYING(n) starts (§A11 table)."""
    w = lobby_world()
    if n == 1:
        w.light_rig = "night_alarm"
        w.alarm = True
        w.pilot = Pilot(slumped=True, seat_back=False, awake=False)
        return w
    if n == 2:
        w.light_rig = "fire"
        w.pilot = Pilot(slumped=True, seat_back=True, awake=False)
        w.ap_screen = True
        w.fire = FireState(side=fire_side, level="full")
        w.fire_bell = True
        w.fuel_hiss = True
        w.fog = 0.006
        w.static_level = 0.02
        w.overhead_all_green = True
        return w
    if n == 3:
        w.light_rig = "storm"
        w.pilot = Pilot(slumped=True, seat_back=True, awake=False)
        w.ap_screen = True
        w.fire = FireState(side=damaged_side, level="wisp")
        w.propeller_stopped = damaged_side
        w.engine_hum = "one_engine"
        w.weather = "storm"
        w.fog = 0.035
        w.turbulence = 0.15
        w.static_level = 0.04
        w.overhead_all_green = True
        return w
    raise ValueError(f"no phase {n}")


def landing_world(damaged_side: Side | None) -> World:
    """World after the `landing` cinematic (§A11, last column)."""
    w = lobby_world()
    w.light_rig = "dawn"
    w.pilot = Pilot(slumped=False, seat_back=True, awake=True)
    w.ap_screen = True
    w.fire = FireState(side=damaged_side, level="wisp")
    w.propeller_stopped = damaged_side
    w.engine_hum = "off"
    w.weather = "clear_dawn"
    w.landing_lights = True
    w.runway = "stopped"
    w.overhead_all_green = True
    return w


def parse_world_value(raw: str) -> WorldValue:
    """Effect value: `true/false`, `null`, decimals, else a string (§A12)."""
    if raw == "true":
        return True
    if raw == "false":
        return False
    if raw == "null":
        return None
    try:
        return float(raw)
    except ValueError:
        return raw


def apply_world(world: World, key: str, value: WorldValue) -> World:
    """Return a validated copy of `world` with one key changed; bad key/value raises."""
    if key not in WORLD_KEYS:
        raise ValueError(f"unknown world key {key!r}")
    data = world.model_dump()
    if key in WORLD_SHORTHANDS:
        outer, inner = WORLD_SHORTHANDS[key]
        data[outer][inner] = value
    else:
        data[key] = value
    return World.model_validate(data)


def lamp_state(
    color: LampColor | None, *, blinking: bool = False, attention: bool = False
) -> LampState:
    """A lamp object state."""
    return LampState(kind="lamp", color=color, blinking=blinking, attention=attention)


def lamp_value(raw: str) -> LampColor | None:
    """Parse a `lamp:` effect color (`off` = dark)."""
    if raw == "off":
        return None
    if raw not in _LAMP_COLORS:
        raise ValueError(f"bad lamp color {raw!r}")
    return _LAMP_COLORS[raw]


_LAMP_COLORS: dict[str, LampColor] = {
    "red": "red",
    "green": "green",
    "blue": "blue",
    "yellow": "yellow",
}
