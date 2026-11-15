// Server clock estimate (§A5, §F5.2): keep the offset from the lowest-RTT pong.
import type { Pong } from "./protocol";

let offset = 0;
let bestRtt = Infinity;

export function onPong(p: Pong, now: number = Date.now()): void {
  const rtt = now - p.client_ms;
  if (rtt < 0) return; // a pong from before a clock jump; ignore it
  if (rtt < bestRtt) {
    bestRtt = rtt;
    offset = p.server_ms + rtt / 2 - now;
  }
}

/** Server time in ms. Use this for anything synchronized, never raw `Date.now()`. */
export const serverNow = (): number => Date.now() + offset;

export function clockOffset(): number {
  return offset;
}

/** Seeds the offset from `welcome.server_ms` until the first pong arrives. */
export function seedFromWelcome(serverMs: number, now: number = Date.now()): void {
  if (bestRtt === Infinity) offset = serverMs - now;
}

/** Test helper: forget all samples. */
export function resetClock(): void {
  offset = 0;
  bestRtt = Infinity;
}
