import type { Role } from "../net/protocol";

/**
 * Maps World / game_state to loops (§F16.4). FINAL SIGNATURE — M3c implements it. The Flyer
 * derives alarm, warning_beep, fire_bell, fuel_hiss, engine_hum, rain, static and snore from
 * `World`; the Tower runs only static (by signal level), low_fuel, one-shots and stamps.
 */
export function useWorldAudio(role: Role): void {
  void role;
}
