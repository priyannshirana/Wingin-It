import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useT } from "../i18n/useT";
import { createRoom, getHealth, getRoom, normalizeCode } from "../net/api";
import type { Lang } from "../net/protocol";
import { useStore } from "../state/store";
import { HowToPlay } from "./HowToPlay";
import { ToyButton } from "./ToyButton";

/** Query params passed through to the room (seed, demo, mock, bots…). */
function passThrough(params: URLSearchParams): string {
  const q = params.toString();
  return q ? `?${q}` : "";
}

function readCreateOptions(params: URLSearchParams) {
  const seed = Number(params.get("seed"));
  return {
    ...(params.get("demo") === "1" ? { demo: true } : {}),
    ...(params.get("mock") === "1" ? { mock: true } : {}),
    ...(params.has("seed") && Number.isInteger(seed) ? { seed } : {}),
  };
}

function isNotFoundState(state: unknown): boolean {
  return typeof state === "object" && state !== null && "notFound" in state;
}

// The home page (§F8.1): logo, Start / Join / How to play, the UI-language switch.
// M3a adds the attract-loop canvas behind it; M3c the volume control.
export function Home() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const uiLang = useStore((s) => s.uiLang);
  const setUiLang = useStore((s) => s.setUiLang);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [notFound, setNotFound] = useState(() => isNotFoundState(location.state));
  const [busy, setBusy] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [demoServer, setDemoServer] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void getHealth().then((h) => {
      if (alive && h) setDemoServer(h.demo_mode);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function start() {
    setBusy(true);
    try {
      const newCode = await createRoom(readCreateOptions(params));
      void navigate(`/r/${newCode}${passThrough(params)}`);
    } catch (err) {
      console.warn("[wingin] could not create a room", err);
      setBusy(false);
    }
  }

  async function join() {
    if (code.length !== 4) return;
    setBusy(true);
    try {
      const info = await getRoom(code);
      if (!info.exists) {
        setNotFound(true);
        setBusy(false);
        return;
      }
      void navigate(`/r/${code}${passThrough(params)}`);
    } catch (err) {
      console.warn("[wingin] could not look up the room", err);
      setNotFound(true);
      setBusy(false);
    }
  }

  // ↑ / ↓ move between the menu buttons (Enter activates the focused one natively).
  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(menuRef.current?.querySelectorAll("button") ?? []);
    if (buttons.length === 0) return;
    e.preventDefault();
    const i = buttons.findIndex((b) => b === document.activeElement);
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  }

  const menu = [
    { key: "start", label: t("home.start"), variant: "primary" as const, onClick: start },
    {
      key: "join",
      label: t("home.join"),
      variant: "secondary" as const,
      onClick: () => setJoining(true),
    },
    {
      key: "how",
      label: t("home.how"),
      variant: "ghost" as const,
      onClick: () => setHowOpen(true),
    },
  ];

  return (
    <main
      data-screen="home"
      className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden bg-linear-to-b from-night to-night-hi"
    >
      <div className="absolute top-5 right-5 flex items-center gap-3">
        {demoServer && <DemoBadge label={t("lobby.demo_badge")} />}
        <LangSwitch value={uiLang} onChange={setUiLang} />
      </div>

      <h1 className="animate-float font-display text-[120px] leading-none font-extrabold text-cream text-shadow-extrude">
        {t("app.logo")}
      </h1>
      <p lang={uiLang} className="font-display text-2xl text-cream/80">
        {t("app.tagline")}
      </p>

      <div
        ref={menuRef}
        onKeyDown={onMenuKey}
        className="mt-10 flex w-80 flex-col items-stretch gap-4"
      >
        {menu.map((item, i) => (
          <div key={item.key} className="animate-pop" style={{ animationDelay: `${i * 60}ms` }}>
            <ToyButton
              variant={item.variant}
              className="w-full text-2xl"
              disabled={busy}
              autoFocus={i === 0}
              onClick={() => void item.onClick()}
            >
              {item.label}
            </ToyButton>
          </div>
        ))}
        {joining && (
          <form
            className="animate-slide-up flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <input
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(normalizeCode(e.target.value));
                setNotFound(false);
              }}
              placeholder={t("landing.code_placeholder")}
              aria-label={t("landing.join")}
              maxLength={8}
              className="w-0 flex-1 rounded-2xl bg-white/90 px-4 py-3 text-center font-display text-3xl font-extrabold tracking-[0.3em] text-night uppercase placeholder:text-night/30 focus:outline-4 focus:outline-teal"
            />
            <ToyButton variant="primary" type="submit" disabled={busy || code.length !== 4}>
              {t("lobby.join")}
            </ToyButton>
          </form>
        )}
        {notFound && (
          <p role="alert" className="text-center font-display text-lg text-lamp-red">
            {t("landing.not_found")}
          </p>
        )}
      </div>

      {howOpen && <HowToPlay onClose={() => setHowOpen(false)} />}
    </main>
  );
}

function LangSwitch({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  const t = useT();
  return (
    <div className="flex overflow-hidden rounded-full bg-white/10 p-1 font-display text-sm">
      {(["en", "hi"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={value === lang}
          onClick={() => onChange(lang)}
          className={`rounded-full px-3 py-1 ${value === lang ? "bg-cream text-night" : "text-cream/80 hover:text-cream"}`}
        >
          {t(lang === "en" ? "lobby.lang_en" : "lobby.lang_hi")}
        </button>
      ))}
    </div>
  );
}

function DemoBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-lamp-red px-2 py-0.5 font-display text-sm font-extrabold tracking-widest text-white">
      {label}
    </span>
  );
}
