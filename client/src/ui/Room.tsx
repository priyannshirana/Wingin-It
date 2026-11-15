import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { DEV } from "../config";
import { normalizeCode } from "../net/api";
import type { Gender, Lang, Role } from "../net/protocol";
import { connect, leaveRoom, send, storedJoin, type JoinParams } from "../net/socket";
import { useStore } from "../state/store";
import { CharacterSelect, type CharacterChoice } from "./CharacterSelect";
import { DevPanel } from "./DevPanel";
import { Lobby } from "./Lobby";
import { Overlays } from "./Overlays";
import { PresenterKeys } from "./PresenterKeys";
import { Toasts } from "./Toasts";
import { TowerScreen } from "./TowerScreen";
import { WordDeck } from "./WordDeck";

// The Flyer screen pulls in three.js; the Tower never loads it (§F1.2).
const FlyerScreen = lazy(() => import("./FlyerScreen").then((m) => ({ default: m.FlyerScreen })));

const asRole = (v: string | null): Role | null => (v === "flyer" || v === "tower" ? v : null);
const asLang = (v: string | null): Lang | null => (v === "en" || v === "hi" ? v : null);
const asGender = (v: string | null): Gender | null => (v === "male" || v === "female" ? v : null);

/** Auto-join (`auto=1`) and the post-join dev commands run once per room per tab. */
const autoJoined = new Set<string>();
const afterJoinDone = new Set<string>();
let lastCode: string | null = null;

// `/r/:code` (§F4): character select → lobby → Flyer or Tower screen → word deck.
export function Room() {
  const params = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const code = normalizeCode(params.code ?? "");
  const me = useStore(useShallow((s) => s.me));
  const status = useStore((s) => s.status);
  const fatal = useStore((s) => s.fatal);
  const welcome = useStore((s) => s.welcome);
  const players = useStore((s) => s.room?.players);
  const rejected = useStore((s) => s.rejectedRoles);
  const storeCode = useStore((s) => s.room?.code ?? s.welcome?.room_code ?? null);

  const prefill: CharacterChoice = {
    role: asRole(query.get("role")),
    lang: asLang(query.get("lang")),
    gender: asGender(query.get("gender")),
    name: (query.get("name") ?? "").slice(0, 16),
  };
  const auto = query.get("auto") === "1";

  // Connect (idempotent singleton) and, for split view / refresh, join without the form.
  useEffect(() => {
    if (code.length !== 4) return;
    // A different room than last time: forget the old room's one-shot guards too.
    if (lastCode !== code) {
      autoJoined.clear();
      afterJoinDone.clear();
      lastCode = code;
    }
    const socket = connect(code);
    if (autoJoined.has(code)) return;
    const role = prefill.role;
    let join: JoinParams | null;
    if (auto && role && prefill.lang && prefill.name.trim()) {
      join = {
        role,
        lang: prefill.lang,
        name: prefill.name.trim(),
        // §F4: auto=1 without gender defaults to male for the Tower, female for the Flyer.
        gender: prefill.gender ?? (role === "tower" ? "male" : "female"),
      };
    } else {
      join = storedJoin(code);
    }
    if (join) {
      autoJoined.add(code);
      socket.join(join);
    }
    // The socket outlives this component on purpose (StrictMode remounts, screen swaps).
  }, [code, auto, prefill.role, prefill.lang, prefill.name, prefill.gender]);

  // After an auto join: ready up, seed and bots (Dev, §F4).
  useEffect(() => {
    if (!me || !auto || afterJoinDone.has(code)) return;
    afterJoinDone.add(code);
    if (status === "LOBBY") send({ type: "ready", ready: true });
    const seed = Number(query.get("seed"));
    if (query.has("seed") && Number.isInteger(seed) && welcome?.dev_mode) {
      send({ type: "dev", cmd: "set_seed", args: { seed } });
    }
    const bots = query.get("bots");
    if (bots && welcome?.dev_mode) {
      send({
        type: "dev",
        cmd: "bots",
        args: {
          flyer: bots === "flyer" || bots === "both",
          tower: bots === "tower" || bots === "both",
        },
      });
    }
  }, [me, auto, code, status, query, welcome?.dev_mode]);

  useEffect(() => {
    // Read the live value: a stale `fatal` from a previous room must never bounce this one.
    if (code.length !== 4 || useStore.getState().fatal === "not_found") {
      leaveRoom(); // closes the socket and clears `fatal` before going home
      void navigate("/", { replace: true, state: { notFound: true } });
    }
  }, [code, fatal, navigate]);

  useDevBridge();

  // Until connect() has switched rooms, the store may still hold another room's state.
  if (storeCode !== null && storeCode !== code) return null;

  if (!me) {
    const taken = [...(players ?? []).map((p) => p.role), ...rejected];
    return (
      <>
        <CharacterSelect
          mode="join"
          initial={prefill}
          takenRoles={taken}
          onJoin={(p) => connect(code).join(p)}
        />
        <Toasts />
        <Overlays />
      </>
    );
  }

  let screen;
  if (status === "LOBBY") screen = <Lobby />;
  else if (status === "DECK") screen = <WordDeck />;
  else if (me.role === "flyer") screen = <FlyerScreen />;
  else screen = <TowerScreen />;

  return (
    <>
      <Suspense fallback={null}>{screen}</Suspense>
      <Toasts />
      <Overlays />
      <PresenterKeys />
      {DEV && <DevPanel />}
    </>
  );
}

/** Dev split view posts toolbar commands into each iframe (§F18.1). */
function useDevBridge() {
  const setSettings = useStore((s) => s.setSettings);
  useEffect(() => {
    if (!DEV) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      const data: unknown = e.data;
      if (typeof data !== "object" || data === null || !("wingin" in data)) return;
      const m: Record<string, unknown> = { ...data };
      if (m.wingin === "sendDevanagari" && typeof m.value === "boolean") {
        setSettings({ sendDevanagari: m.value });
      } else if (
        m.wingin === "bots" &&
        typeof m.flyer === "boolean" &&
        typeof m.tower === "boolean"
      ) {
        send({ type: "dev", cmd: "bots", args: { flyer: m.flyer, tower: m.tower } });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setSettings]);
}
