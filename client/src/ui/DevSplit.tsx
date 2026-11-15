import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { Gender, Lang } from "../net/protocol";
import { normalizeCode, randomCode } from "../net/api";

type Side = "tower" | "flyer";

function roomUrl(
  room: string,
  side: Side,
  opts: { lang: Lang; gender: Gender; seed: string; demo: boolean; extra?: string },
): string {
  const q = new URLSearchParams({
    role: side,
    lang: opts.lang,
    gender: opts.gender,
    name: side === "tower" ? "Tower" : "Flyer",
    auto: "1",
  });
  if (side === "tower" && opts.seed) q.set("seed", opts.seed);
  if (opts.demo) q.set("demo", "1");
  if (opts.extra) q.set("bots", opts.extra);
  return `/r/${room}?${q.toString()}`;
}

// Dev split view (§F18.1): Tower left, Flyer right, plus a toolbar. Dev-only text, no i18n.
export function DevSplit() {
  const [params, setParams] = useSearchParams();
  const room = normalizeCode(params.get("room") ?? "") || "TEST";
  const [seed, setSeed] = useState(params.get("seed") ?? "42");
  const demo = params.get("demo") === "1";
  const bots = params.get("bots") ?? "";
  const [swapped, setSwapped] = useState(false);
  const [genders, setGenders] = useState<Record<Side, Gender>>({ tower: "male", flyer: "female" });
  const [botState, setBotState] = useState({
    flyer: bots === "flyer" || bots === "both",
    tower: bots === "tower" || bots === "both",
  });
  const [deva, setDeva] = useState(false);
  const [nonce, setNonce] = useState(0);
  const tower = useRef<HTMLIFrameElement>(null);
  const flyer = useRef<HTMLIFrameElement>(null);

  const lang = (side: Side): Lang => ((side === "tower") !== swapped ? "hi" : "en");
  const post = (msg: object, both = true) => {
    tower.current?.contentWindow?.postMessage(msg, location.origin);
    if (both) flyer.current?.contentWindow?.postMessage(msg, location.origin);
  };
  const reload = () => setNonce((n) => n + 1);

  const src = (side: Side) =>
    roomUrl(room, side, {
      lang: lang(side),
      gender: genders[side],
      seed,
      demo,
      extra: side === "tower" ? bots : undefined,
    });

  return (
    <main
      data-screen="dev-split"
      className="flex h-full flex-col bg-black font-mono text-xs text-cream"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-1.5">
        <strong className="text-teal">room {room}</strong>
        <label className="flex items-center gap-1">
          seed
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))}
            className="w-16 rounded bg-white/10 px-1"
          />
        </label>
        <button
          type="button"
          className="rounded bg-white/10 px-2 py-0.5"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("room", randomCode());
            next.set("seed", seed);
            setParams(next);
          }}
        >
          new room
        </button>
        <button
          type="button"
          className="rounded bg-white/10 px-2 py-0.5"
          onClick={() => {
            setSwapped((s) => !s);
            reload();
          }}
        >
          swap languages
        </button>
        {(["tower", "flyer"] as const).map((side) => (
          <button
            key={side}
            type="button"
            className="rounded bg-white/10 px-2 py-0.5"
            onClick={() => {
              setGenders((g) => ({ ...g, [side]: g[side] === "male" ? "female" : "male" }));
              reload();
            }}
          >
            {side} {genders[side]}
          </button>
        ))}
        {(["tower", "flyer"] as const).map((side) => (
          <label key={`bot-${side}`} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={botState[side]}
              onChange={(e) => {
                const next = { ...botState, [side]: e.target.checked };
                setBotState(next);
                post({ wingin: "bots", flyer: next.flyer, tower: next.tower }, false);
              }}
            />
            bot {side}
          </label>
        ))}
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={deva}
            onChange={(e) => {
              setDeva(e.target.checked);
              post({ wingin: "sendDevanagari", value: e.target.checked });
            }}
          />
          send Devanagari quick-say
        </label>
      </div>
      <div className="flex min-h-0 flex-1">
        <iframe
          key={`t-${nonce}-${room}`}
          ref={tower}
          title="tower"
          src={src("tower")}
          allow="microphone; autoplay"
          className="h-full w-1/2 border-r border-white/10"
        />
        <iframe
          key={`f-${nonce}-${room}`}
          ref={flyer}
          title="flyer"
          src={src("flyer")}
          allow="microphone; autoplay"
          className="h-full w-1/2"
        />
      </div>
    </main>
  );
}
