import { describe, expect, it } from "vitest";
import { CINEMATIC_IDS, cinematicDurationMs } from "../src/content/cinematics";
import { buildFlyerTimeline } from "../src/cinematics/timelines";
import { silentCtx, type TimelineCtx } from "../src/cinematics/timelineKit";
import { buildTowerTimeline } from "../src/cinematics/towerTimelines";
import type { CinematicId } from "../src/net/protocol";

const stub = (params: TimelineCtx["params"] = {}): TimelineCtx => silentCtx(params);

const builders = { flyer: buildFlyerTimeline, tower: buildTowerTimeline };

describe("timelines (§F14, §F22)", () => {
  for (const [role, build] of Object.entries(builders)) {
    it(`${role}: every timeline lasts exactly its cinematics.json duration`, () => {
      for (const id of CINEMATIC_IDS) {
        const ms = cinematicDurationMs(id);
        const tl = build(
          id,
          stub({ fire_side: "left", stopped_side: "left", damaged_side: "left" }),
          ms,
        );
        expect(tl.duration(), id).toBeCloseTo(ms / 1000, 1);
        expect(Math.abs(tl.duration() - ms / 1000), id).toBeLessThanOrEqual(0.05);
        expect(tl.paused(), id).toBe(true);
        tl.kill();
      }
    });

    it(`${role}: demo and retry variants match too`, () => {
      const variants: [CinematicId, { demo?: boolean; retry?: boolean }][] = [
        ["prologue", { demo: true }],
        ["ending", { demo: true }],
        ["p1_intro", { retry: true }],
        ["p2_intro", { retry: true }],
        ["p3_intro", { retry: true }],
      ];
      for (const [id, v] of variants) {
        const ms = cinematicDurationMs(id, v);
        const tl = build(id, stub({ retry: v.retry === true, fire_side: "right" }), ms);
        expect(
          Math.abs(tl.duration() - ms / 1000),
          `${id} ${JSON.stringify(v)}`,
        ).toBeLessThanOrEqual(0.05);
        tl.kill();
      }
    });
  }

  it("skip = progress(1) clears the title card like playing through", () => {
    let card: unknown = "unset";
    const ctx: TimelineCtx = { ...silentCtx(), titleCard: (c) => (card = c) };
    const tl = buildFlyerTimeline("p2_intro", ctx, 9000);
    tl.seek(7, false);
    expect(card).toEqual({ kind: "phase", phase: 2 });
    tl.progress(1, false);
    expect(card).toBeNull();
    tl.kill();
  });
});
