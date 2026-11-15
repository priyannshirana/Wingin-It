import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCinematicRunner } from "../src/cinematics/runner";
import { buildTowerTimeline } from "../src/cinematics/towerTimelines";
import type { Lang } from "../src/net/protocol";
import { resetClock } from "../src/net/clock";
import { useStore, type CueName } from "../src/state/store";
import { TitleCard } from "../src/ui/TitleCard";
import { CONFETTI_COUNT } from "../src/ui/tower/Confetti";
import { TowerCueLayer } from "../src/ui/tower/TowerCueLayer";
import { cinematic, gameState } from "./fixtures/messages";

function join(lang: Lang) {
  useStore.getState().receive({
    type: "joined",
    player_id: "p-tower",
    token: "tok",
    role: "tower",
    lang,
    gender: "female",
    name: "Tara",
  });
}

/**
 * A minimal Tower screen shaped like TowerScreen/Radar: the root, a radar SVG with its blip
 * (glow, r=6 core, an icon group), runway and glide path, the subtitle column and lifelines.
 * `bare` drops every target, to check the cue layer copes with missing elements.
 */
function FakeTower({ runner = false, bare = false }: { runner?: boolean; bare?: boolean }) {
  return (
    <main data-screen="tower" data-testid="tower-root">
      {runner && <Runner />}
      {!bare && (
        <svg data-testid="radar" viewBox="0 0 280 280">
          <rect x="211" y="56" width="8" height="28" fill="#F2E8D5" />
          <line x1="70" y1="210" x2="215" y2="70" strokeDasharray="5 5" />
          <g data-testid="blip">
            <circle r="16" />
            <circle r="6" />
            <g data-testid="real-icon" />
          </g>
        </svg>
      )}
      {!bare && <div data-testid="subtitles" />}
      {!bare && (
        <div data-testid="lifelines">
          <span data-testid="lifeline-dot" />
          <span data-testid="lifeline-dot" />
          <span data-testid="lifeline-dot" />
        </div>
      )}
      <TitleCard />
      <TowerCueLayer />
    </main>
  );
}

function Runner() {
  useCinematicRunner(buildTowerTimeline);
  return null;
}

const cue = (name: CueName, on: boolean) => act(() => useStore.getState().setCue(name, on));

beforeEach(() => {
  resetClock();
  useStore.getState().reset();
  join("en");
});

afterEach(() => {
  cleanup();
});

describe("Tower cue layer (§F14.4, §F12.6)", () => {
  it("renders nothing visible while no cue is on", () => {
    render(<FakeTower />);
    expect(screen.queryByTestId("tower-stamp")).toBeNull();
    expect(screen.queryByTestId("tower-banner")).toBeNull();
    expect(screen.queryByTestId("confetti")).toBeNull();
    expect(screen.queryByTestId("radar-crash")).toBeNull();
  });

  it("the MAYDAY stamp renders from its cue and leaves when the cue ends", () => {
    render(<FakeTower />);
    cue("mayday_stamp", true);
    const stamp = screen.getByTestId("tower-stamp");
    expect(stamp.dataset.kind).toBe("mayday");
    expect(stamp.textContent).toBe("MAYDAY");
    cue("mayday_stamp", false);
    expect(screen.queryByTestId("tower-stamp")).toBeNull();
  });

  it("the LANDED stamp and the AUTOPILOT banner use the viewer's language", () => {
    useStore.getState().reset();
    join("hi");
    render(<FakeTower />);
    cue("landed_stamp", true);
    cue("autopilot_banner", true);
    expect(screen.getByTestId("tower-stamp").textContent).toBe("लैंड हो गया");
    expect(screen.getByTestId("tower-banner").textContent).toContain("ऑटोपायलट चालू");
  });

  it("an English Tower gets the English stamp and banner", () => {
    render(<FakeTower />);
    cue("landed_stamp", true);
    cue("autopilot_banner", true);
    expect(screen.getByTestId("tower-stamp").textContent).toBe("LANDED");
    expect(screen.getByTestId("tower-banner").textContent).toContain("AUTOPILOT ENGAGED");
  });

  it("confetti is 60 DOM particles", () => {
    render(<FakeTower />);
    cue("confetti", true);
    expect(screen.getAllByTestId("confetti-piece")).toHaveLength(CONFETTI_COUNT);
    expect(CONFETTI_COUNT).toBe(60);
  });

  it("the dawn warmth and the cream fade are always mounted and follow their cues", () => {
    render(<FakeTower />);
    expect(screen.getByTestId("dawn-warm").dataset.on).toBeUndefined();
    cue("dawn_warm", true);
    cue("fade_cream", true);
    expect(screen.getByTestId("dawn-warm").dataset.on).toBe("true");
    expect(screen.getByTestId("fade-cream").dataset.on).toBe("true");
    // landing → ending: the cue blinks off and on; the same element keeps its opacity
    const wash = screen.getByTestId("dawn-warm");
    cue("dawn_warm", false);
    cue("dawn_warm", true);
    expect(screen.getByTestId("dawn-warm")).toBe(wash);
  });

  it("the crash spiral starts at the blip, hides the real blip, then POOF", () => {
    render(<FakeTower />);
    const radar = screen.getByTestId("radar");
    const blip = screen.getByTestId("blip");
    cue("blip_spiral", true);
    expect(radar.querySelector('[data-testid="radar-spiral"]')).not.toBeNull();
    expect(blip.style.opacity).toBe("0");
    cue("poof", true);
    expect(radar.querySelector('[data-testid="radar-spiral"]')).toBeNull();
    expect(radar.querySelector('[data-testid="radar-poof"]')).not.toBeNull();
    cue("blip_spiral", false);
    cue("poof", false);
    expect(radar.querySelector('[data-testid="radar-crash"]')).toBeNull();
    expect(blip.style.opacity).toBe("");
  });

  it("the screen shake moves the whole Tower root and restores it after", async () => {
    render(<FakeTower />);
    const root = screen.getByTestId("tower-root");
    cue("screen_shake", true);
    await waitFor(() => expect(root.style.transform).not.toBe(""));
    cue("screen_shake", false);
    expect(root.style.transform).toBe("");
  });

  it("a late landing (rejoin at 6.3 s) seeks to the stamp + confetti; skip keeps the end state", () => {
    render(<FakeTower runner />);
    act(() => {
      useStore
        .getState()
        .receive(cinematic({ id: "landing", start_at_ms: Date.now() - 6300, duration_ms: 7000 }));
    });
    expect(screen.getByTestId("tower-stamp").dataset.kind).toBe("landed");
    expect(screen.getAllByTestId("confetti-piece")).toHaveLength(60);
    expect(screen.getByTestId("dawn-warm").dataset.on).toBe("true");
    act(() => {
      useStore.getState().receive({ type: "cinematic_skip", id: "landing" });
    });
    // The landing's end state (what ENDING starts from): stamp and warmth held, confetti done.
    expect(screen.getByTestId("tower-stamp").dataset.kind).toBe("landed");
    expect(screen.queryByTestId("confetti")).toBeNull();
    expect(screen.getByTestId("dawn-warm").dataset.on).toBe("true");
    // The next cinematic replaces it: the runner clears the held cues.
    act(() => {
      useStore
        .getState()
        .receive(cinematic({ id: "ending", start_at_ms: Date.now() + 300, duration_ms: 6000 }));
    });
    expect(screen.queryByTestId("tower-stamp")).toBeNull();
  });
});

describe("Radar overlays (§F14.4), portaled into Radar.tsx's SVG", () => {
  const inRadar = (id: string) =>
    screen.getByTestId("radar").querySelector(`[data-testid="${id}"]`);
  const inBlip = (id: string) => screen.getByTestId("blip").querySelector(`[data-testid="${id}"]`);

  it("radar_boot draws the boot rings and cover inside the radar", () => {
    render(<FakeTower />);
    cue("radar_boot", true);
    const boot = inRadar("radar-boot");
    expect(boot).not.toBeNull();
    expect(boot?.querySelectorAll("[data-ring]")).toHaveLength(3);
    cue("radar_boot", false);
    expect(inRadar("radar-boot")).toBeNull();
  });

  it("fire_icon pops a flame + label inside the blip and hides Radar's own icon meanwhile", () => {
    render(<FakeTower />);
    cue("fire_icon", true);
    const fx = inBlip("radar-fire-fx");
    expect(fx).not.toBeNull();
    expect(fx?.textContent).toContain("ENGINE FIRE");
    expect(fx?.querySelector("style")?.textContent).toContain(":not([data-fx])");
    cue("fire_icon", false);
    expect(inBlip("radar-fire-fx")).toBeNull();
  });

  it("smoke_icon morphs to the smoke puffs (and wins over a held fire_icon)", () => {
    render(<FakeTower />);
    cue("fire_icon", true);
    cue("smoke_icon", true);
    expect(inBlip("radar-fire-fx")).toBeNull();
    expect(inBlip("radar-smoke-fx")?.querySelectorAll("[data-puff]")).toHaveLength(3);
  });

  it("storm_in drifts blobs in, and steps aside once game_state has the storm", () => {
    render(<FakeTower />);
    cue("storm_in", true);
    expect(inRadar("radar-storm")?.querySelectorAll("[data-blob]")).toHaveLength(4);
    act(() => {
      useStore.getState().receive(
        gameState({
          radar: {
            blip: "amber",
            icon: null,
            storm: true,
            runway: false,
            glide_path: false,
            progress: 0.6,
            landed: false,
          },
        }),
      );
    });
    expect(inRadar("radar-storm")).toBeNull();
  });

  it("glide_draw draws the runway and the dashed path from the blip", () => {
    render(<FakeTower />);
    cue("glide_draw", true);
    const glide = inRadar("radar-glide");
    expect(glide?.querySelector("[data-runway]")).not.toBeNull();
    expect(glide?.querySelector("[data-path]")?.getAttribute("stroke-dasharray")).toBe("5 5");
  });

  it("runway_pulse brightens the runway with two pulse rings", () => {
    render(<FakeTower />);
    cue("runway_pulse", true);
    expect(inRadar("radar-runway-pulse")?.querySelectorAll("[data-ring]")).toHaveLength(2);
    cue("runway_pulse", false);
    expect(inRadar("radar-runway-pulse")).toBeNull();
  });

  it("blip_touchdown bounces the real blip circles and restores them after", async () => {
    render(<FakeTower />);
    const core = screen.getByTestId("blip").querySelector('circle[r="6"]');
    if (!(core instanceof SVGElement)) throw new Error("no core");
    cue("blip_touchdown", true);
    expect(inBlip("blip-bounce")).not.toBeNull();
    await waitFor(() =>
      expect(core.getAttribute("transform") ?? core.getAttribute("style")).toBeTruthy(),
    );
    cue("blip_touchdown", false);
    expect(inBlip("blip-bounce")).toBeNull();
    expect(core.getAttribute("transform") || null).toBeNull();
    expect(core.getAttribute("style") || null).toBeNull();
  });
});

describe("DomPulses (§F14.4 glitch, dots pop, radar flicker)", () => {
  const PULSES: [CueName, string][] = [
    ["subtitle_glitch", "subtitles"],
    ["lifeline_dots_pop", "lifeline-dot"],
    ["radar_flicker", "radar"],
  ];

  for (const [name, target] of PULSES) {
    it(`${name}: animates its target, then restores the inline style exactly`, async () => {
      render(<FakeTower />);
      const el = screen.getAllByTestId(target)[0];
      if (!el) throw new Error("no target");
      const before = el.getAttribute("style");
      cue(name, true);
      await waitFor(() => expect(el.getAttribute("style")).not.toBe(before));
      cue(name, false);
      expect(el.getAttribute("style") || null).toBe(before);
    });
  }

  it("missing targets are safe (no radar, subtitles or lifelines on screen)", () => {
    render(<FakeTower bare />);
    expect(() => {
      for (const n of [
        "subtitle_glitch",
        "lifeline_dots_pop",
        "radar_flicker",
        "radar_boot",
        "storm_in",
        "glide_draw",
        "runway_pulse",
        "fire_icon",
        "blip_touchdown",
        "blip_spiral",
        "screen_shake",
      ] as const) {
        cue(n, true);
        cue(n, false);
      }
    }).not.toThrow();
  });

  it("survives the StrictMode double mount and still restores the styles", async () => {
    render(
      <StrictMode>
        <FakeTower />
      </StrictMode>,
    );
    const subs = screen.getByTestId("subtitles");
    const radar = screen.getByTestId("radar");
    cue("subtitle_glitch", true);
    cue("radar_flicker", true);
    await waitFor(() => expect(subs.getAttribute("style")).not.toBeNull());
    cue("subtitle_glitch", false);
    cue("radar_flicker", false);
    expect(subs.getAttribute("style") || null).toBeNull();
    expect(radar.getAttribute("style") || null).toBeNull();
  });
});

describe("TitleCard (§F14.1)", () => {
  it("shows the phase title, the signal line and the bars in the viewer's language", () => {
    render(<FakeTower />);
    act(() => useStore.getState().setTitleCard({ kind: "phase", phase: 2 }));
    const card = screen.getByTestId("title-card");
    expect(card.textContent).toContain("PHASE 2 — Engine Fire");
    expect(card.textContent).toContain("SIGNAL: WEAK");
    const bars = screen.getByTestId("title-bars");
    expect(bars.children).toHaveLength(3); // ▮▮ + one dim slot
    expect(bars.querySelectorAll("[data-filled]")).toHaveLength(2);
  });

  it("a Hindi viewer reads it in Hindi", () => {
    useStore.getState().reset();
    join("hi");
    render(<FakeTower />);
    act(() => useStore.getState().setTitleCard({ kind: "phase", phase: 3 }));
    const card = screen.getByTestId("title-card");
    expect(card.textContent).toContain("चरण 3 — तूफ़ान में लैंडिंग");
    expect(card.textContent).toContain("सिग्नल: गायब");
  });

  it("fades out (0.4 s) after the card is cleared, then unmounts", async () => {
    render(<FakeTower />);
    act(() => useStore.getState().setTitleCard({ kind: "phase", phase: 1 }));
    act(() => useStore.getState().setTitleCard(null));
    expect(screen.getByTestId("title-card").dataset.leaving).toBe("true");
    await waitFor(() => expect(screen.queryByTestId("title-card")).toBeNull(), {
      timeout: 2000,
    });
  });

  it("a new card replaces a leaving one at once", () => {
    render(<FakeTower />);
    act(() => useStore.getState().setTitleCard({ kind: "phase", phase: 1 }));
    act(() => useStore.getState().setTitleCard(null));
    act(() => useStore.getState().setTitleCard({ kind: "text", key: "crash.title" }));
    const card = screen.getByTestId("title-card");
    expect(card.dataset.leaving).toBeUndefined();
    expect(card.textContent).toContain("OUT OF FUEL");
  });
});
