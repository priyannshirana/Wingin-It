import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Gender, Lang, Toast } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { Toasts } from "../src/ui/Toasts";
import { flyerPlayer, player, roomState, welcome } from "./fixtures/messages";

const toast = (key: Toast["key"], kind: Toast["kind"] = "info", params = {}): Toast => ({
  type: "toast",
  kind,
  key,
  params,
});

function joinAsFlyer(lang: Lang, partnerGender: Gender) {
  const s = useStore.getState();
  s.receive(welcome());
  s.receive({
    type: "joined",
    player_id: "p-flyer",
    token: "t",
    role: "flyer",
    lang,
    gender: "male",
    name: "Me",
  });
  s.receive(
    roomState({
      status: "PLAYING",
      players: [
        player({ gender: partnerGender, lang: lang === "en" ? "hi" : "en" }),
        flyerPlayer({ lang, gender: "male" }),
      ],
    }),
  );
}

const texts = () => screen.queryAllByTestId("toast").map((t) => t.textContent);

beforeEach(() => {
  useStore.getState().reset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toasts (§F15)", () => {
  it("stacks at most 3, newest last", () => {
    act(() => joinAsFlyer("en", "male"));
    render(<Toasts />);
    act(() => {
      const r = useStore.getState().receive;
      r(toast("toast.info", "info", { text: "one" }));
      r(toast("toast.info", "info", { text: "two" }));
      r(toast("toast.info", "info", { text: "three" }));
      r(toast("toast.info", "info", { text: "four" }));
    });
    expect(texts()).toEqual(["two", "three", "four"]);
  });

  it("hides after 2.5 s; the crossover pop after 2 s", () => {
    act(() => joinAsFlyer("en", "male"));
    render(<Toasts />);
    act(() => {
      useStore.getState().receive(toast("toast.crossover", "crossover", { word: "laal" }));
      useStore.getState().receive(toast("toast.didnt_catch", "warning"));
    });
    expect(texts()).toEqual(["CROSSOVER! +5s", "Didn't catch that, try again"]);
    expect(screen.getAllByTestId("toast")[0]?.dataset.kind).toBe("crossover");
    act(() => {
      vi.advanceTimersByTime(2050);
    });
    expect(texts()).toEqual(["Didn't catch that, try again"]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(texts()).toEqual([]);
    expect(useStore.getState().toasts).toEqual([]);
  });

  it("is in the viewer's language, whatever the role (Hindi Flyer)", () => {
    act(() => joinAsFlyer("hi", "male"));
    render(<Toasts />);
    act(() => useStore.getState().receive(toast("toast.crossover", "crossover")));
    expect(texts()).toEqual(["क्रॉसओवर! +5 सेकंड"]);
  });

  it("partner toasts follow the partner's gender in Hindi, even after they left", () => {
    act(() => joinAsFlyer("hi", "female"));
    render(<Toasts />);
    act(() => useStore.getState().receive(toast("toast.partner_back")));
    expect(texts()).toEqual(["साथी वापस आ गई!"]);
    // The partner leaves the room before partner_gone arrives: keep the gender we knew.
    act(() => {
      useStore
        .getState()
        .receive(
          roomState({ status: "PLAYING", players: [flyerPlayer({ lang: "hi", gender: "male" })] }),
        );
      useStore.getState().receive(toast("toast.partner_gone"));
    });
    expect(texts()).toContain("साथी खेल छोड़ गई।");
  });

  it("maps server error codes to localized toasts (§F7.3)", () => {
    act(() => joinAsFlyer("en", "male"));
    render(<Toasts />);
    act(() => useStore.getState().receive({ type: "error", code: "channel_busy", message: "x" }));
    expect(texts()).toEqual(["Wait — your partner is talking"]);
  });
});
