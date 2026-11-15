// Test-only harness (served by the Vite dev server at /tests/harness/manual.html, never part of
// the app's routes or the production build): the real TowerScreen with the store fed from the
// typed Part A fixtures, so e2e/manual-fit.spec.ts can measure and screenshot the open manual.
//
//   ?card=P1_A1|P1_A7|P2_B2|P3_C2|P3_C3|P3_C6|LONGEST  &lang=hi|en  &last_wrong=1  &quick=1
//   &used=1  &stamp=N|last
//   &turn=<CARD>  &cue=manual_open|manual_close|dots_green  &cover=1
import { createRoot } from "react-dom/client";
import "../../src/fonts.css";
import "../../src/index.css";
import type { Lang, ManualCard } from "../../src/net/protocol";
import { useStore } from "../../src/state/store";
import { TowerScreen } from "../../src/ui/TowerScreen";
import { cardP1A1 } from "../fixtures/cards";
import { MANUAL_FIXTURES } from "../fixtures/manualCards";
import { gameState, kw, plain, player, roomState } from "../fixtures/messages";

const q = new URLSearchParams(location.search);
const lang: Lang = q.get("lang") === "en" ? "en" : "hi";
const id = q.get("card") ?? "P1_A1";
const make = Object.entries(MANUAL_FIXTURES).find(([k]) => k === id)?.[1] ?? cardP1A1;
let card: ManualCard = make(lang);
if (q.get("last_wrong") === "1") {
  card = {
    ...card,
    last_wrong: {
      label: [plain(lang === "en" ? "green button" : "हरा बटन")],
      count: 2,
    },
  };
}
if (q.get("quick") === "1") {
  const line = (text: string) => ({ label: text, text });
  card = {
    ...card,
    quick_say: {
      ask: card.find_out || card.known_from ? line("ask") : null,
      say: card.rows[0]?.when === null ? line("say") : null,
      branches: card.rows.flatMap((r) =>
        r.when ? [{ value: r.when.value, line: line("b") }] : [],
      ),
    },
  };
}

const s = useStore.getState();
s.receive({
  type: "joined",
  player_id: "p-tower",
  token: "t",
  role: "tower",
  lang,
  gender: "female",
  name: "Tower",
});
s.receive(
  roomState({
    status: "PLAYING",
    players: [
      player({ id: "p-tower", role: "tower", lang, gender: "female", name: "Tower" }),
      player({
        id: "p-flyer",
        role: "flyer",
        lang: lang === "en" ? "hi" : "en",
        gender: "male",
        name: "Flyer",
      }),
    ],
  }),
);
s.receive(
  gameState({
    phase: card.phase,
    signal_level: card.phase,
    action_id: card.action_id,
    action_index: card.index,
    total_actions: card.total,
  }),
);
s.receive({ type: "manual_card", card });
const stamp = q.get("stamp");
if (stamp !== null) {
  s.receive({
    type: "action_result",
    action_id: card.action_id,
    success: true,
    reason: null,
    fuel_delta: 0,
    completed_steps: 1,
    total_steps: 1,
    row_index: stamp === "last" ? card.rows.length - 1 : Number(stamp),
  });
}
if (q.get("used") === "1") {
  s.receive({
    type: "action_result",
    action_id: card.action_id,
    success: false,
    reason: "wrong_object",
    fuel_delta: -10,
    completed_steps: 0,
    total_steps: 1,
    used: {
      object_id: "OH_BTN_GREEN",
      label: [
        kw(lang === "en" ? "green" : "हरा", "GREEN", null),
        plain(lang === "en" ? " button" : " बटन"),
      ],
      verb: "press",
      count: 2,
    },
  });
}

// Motion checks: `turn=<CARD>` swaps to another step after 800 ms (page turn); `cue=<name>`
// sets a Tower cue after 800 ms; `cover=1` shows the closed manual (card null).
const turnTo = Object.entries(MANUAL_FIXTURES).find(([k]) => k === q.get("turn"))?.[1];
const cue = q.get("cue");
if (q.get("cover") === "1") s.receive({ type: "manual_card", card: null });
setTimeout(() => {
  if (turnTo) s.receive({ type: "manual_card", card: turnTo(lang) });
  if (cue === "manual_open" || cue === "manual_close" || cue === "dots_green") s.setCue(cue, true);
}, 800);

const root = document.getElementById("root");
if (root) {
  root.style.height = "100vh";
  createRoot(root).render(<TowerScreen />);
}
