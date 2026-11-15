/**
 * Shot progress for the Tower window (§F12.7): 0..1 over the window's open time. Tower
 * timelines tween it (so any seek or skip lands on the right frame); the window canvas reads it
 * each frame. Plain numbers only, so the 2D Tower bundle never pulls three.js through this file.
 */
export const windowClock = { u: 0 };

export type WindowShot = "takeoff" | "landing" | "crash";
