import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import type { StringKey } from "../i18n/strings";
import { modesQuery, MODES, type ModeFlags } from "./modeFlags";
import { ToyButton } from "./ToyButton";

const COMBOS = [
  { key: "demo_voice", flags: { demo: true, mock: false, voice: true } },
  { key: "demo_mock", flags: { demo: true, mock: true, voice: false } },
] as const;

interface Props {
  onClose: () => void;
  onCreate: (flags: ModeFlags) => void;
  busy?: boolean;
}

/** Landing-page panel explaining the public URL modes; builds a link and creates a room. */
export function GameModes({ onClose, onCreate, busy = false }: Props) {
  const t = useT();
  const [flags, setFlags] = useState<ModeFlags>({ demo: false, mock: false, voice: false });
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const blocked = (m: (typeof MODES)[number]) =>
    (m === "voice" && flags.mock) || (m === "mock" && flags.voice);
  const url = `${window.location.origin}/${modesQuery(flags)}`;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = panelRef.current?.querySelectorAll<HTMLElement>("button, input");
        const first = f?.[0];
        const last = f?.[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  function copy() {
    void navigator.clipboard?.writeText(url).then(() => setCopied(true));
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-night/85 p-6 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modes-title"
        className="animate-pop flex w-full max-w-xl flex-col gap-4 rounded-3xl bg-night-hi p-7 shadow-xl ring-2 ring-white/10"
      >
        <h2 id="modes-title" className="font-display text-3xl font-extrabold text-cream">
          {t("modes.title")}
        </h2>
        <p className="font-display text-base text-cream/70">{t("modes.intro")}</p>
        <ul className="flex flex-col gap-2">
          {MODES.map((m, i) => (
            <li key={m}>
              <label
                className={`flex items-start gap-3 rounded-2xl bg-white/5 p-3 font-display text-cream has-[:checked]:bg-teal/20 ${blocked(m) ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  autoFocus={i === 0}
                  checked={flags[m]}
                  disabled={blocked(m)}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setFlags({
                      ...flags,
                      [m]: on,
                      ...(m === "mock" && on ? { voice: false } : {}),
                    });
                    setCopied(false);
                  }}
                  className="mt-1 size-5 shrink-0 accent-teal"
                />
                <span>
                  <code className="mr-2 rounded bg-black/30 px-2 py-0.5 text-sm text-lamp-yellow">
                    ?{m}=1
                  </code>
                  {t(`modes.${m}` as StringKey)}
                  {blocked(m) && (
                    <small className="block text-sm text-cream/60">
                      {t(m === "mock" ? "modes.na_voice" : "modes.na_typing")}
                    </small>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <h3 className="font-display text-lg font-extrabold text-cream">{t("modes.combine")}</h3>
        <ul className="flex flex-col gap-2">
          {COMBOS.map((c) => (
            <li
              key={c.key}
              data-testid={`combo-${c.key}`}
              className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 font-display text-cream"
            >
              <span className="flex-1">
                <code className="mr-2 rounded bg-black/30 px-2 py-0.5 text-sm text-lamp-yellow">
                  {modesQuery(c.flags)}
                </code>
                {t(`modes.${c.key}` as StringKey)}
              </span>
              <ToyButton variant="secondary" disabled={busy} onClick={() => onCreate(c.flags)}>
                {t("modes.try")}
              </ToyButton>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <code
            data-testid="modes-url"
            aria-label={t("modes.link")}
            className="min-w-0 flex-1 truncate rounded-xl bg-black/30 px-3 py-2 text-sm text-cream"
          >
            {url}
          </code>
          <ToyButton variant="secondary" onClick={copy}>
            {copied ? t("modes.copied") : t("modes.copy")}
          </ToyButton>
        </div>
        <div className="flex justify-between gap-3">
          <ToyButton variant="ghost" onClick={onClose}>
            {t("modes.close")}
          </ToyButton>
          <ToyButton variant="primary" disabled={busy} onClick={() => onCreate(flags)}>
            {t("modes.create")}
          </ToyButton>
        </div>
      </div>
    </div>
  );
}
