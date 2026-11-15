import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newPose, planePose } from "../src/ui/tower/windowShots";
import type { WindowShot } from "../src/cinematics/towerWindowClock";

// §F12.7 privacy: the Tower window never receives or reads the fire side.
const read = (p: string) => readFileSync(`${process.cwd()}/src/${p}`, "utf8");

describe("Tower window privacy (§F12.7, §A10)", () => {
  it("no window file reads a fire side, damaged side, the world or flyer data", () => {
    for (const f of [
      "ui/tower/TowerWindow.tsx",
      "ui/tower/TowerWindowHost.tsx",
      "ui/tower/windowShots.ts",
      "cinematics/tower/window.ts",
      "cinematics/towerWindowClock.ts",
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(
        /fire_side|damaged_side|fire\.side|flyer\.world|flyer_view|FIRE\b|WingFire/,
      );
    }
  });

  it("the canvas takes the shot name and nothing else, and loads lazily", () => {
    expect(read("ui/tower/TowerWindow.tsx")).toMatch(
      /TowerWindow\(\{ shot \}: \{ shot: WindowShot \}\)/,
    );
    const host = read("ui/tower/TowerWindowHost.tsx");
    expect(host).toMatch(/lazy\(\(\) =>\s*import\("\.\/TowerWindow"\)/);
    expect(host).not.toMatch(/^import .*from "\.\/TowerWindow"/m);
    expect(read("ui/TowerScreen.tsx")).not.toMatch(/from "\.\/tower\/TowerWindow"/);
  });

  it("the plane pose is one symmetric pose: a single roll and prop speed for both engines", () => {
    const shots: WindowShot[] = ["takeoff", "landing", "crash"];
    for (const shot of shots) {
      for (let u = 0; u <= 1.0001; u += 0.05) {
        const pose = planePose(shot, u, newPose());
        expect(Object.keys(pose).sort()).toEqual(["pitch", "props", "roll", "vis", "x", "y", "z"]);
        for (const v of Object.values(pose)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
