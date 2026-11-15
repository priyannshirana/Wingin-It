import { useEffect, type ReactNode } from "react";
import { useT } from "../i18n/useT";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { TowerPortrait } from "./avatars/TowerPortrait";
import { ToyButton } from "./ToyButton";

interface Props {
  onClose: () => void;
}

/** The 3-card "How to play" overlay (§F8.1). */
export function HowToPlay({ onClose }: Props) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-night/85 p-8 backdrop-blur-sm"
    >
      <p className="max-w-3xl text-center font-display text-xl text-cream/85">
        {t("home.blurb_1")} {t("home.blurb_2")} {t("home.blurb_3")}
      </p>
      <div className="grid max-w-5xl grid-cols-3 gap-6">
        <Card index={0} text={t("home.how_1")}>
          <div className="flex items-end justify-center -space-x-4">
            <FlyerPortrait gender="female" size={84} />
            <TowerPortrait gender="male" size={84} className="-scale-x-100" />
          </div>
        </Card>
        <Card index={1} text={t("home.how_2")}>
          <svg viewBox="0 0 100 70" className="h-20" aria-hidden="true">
            <rect x="18" y="20" width="64" height="44" rx="10" fill="#2B2F3A" />
            <rect x="60" y="2" width="5" height="22" rx="2" fill="#3D4352" />
            <circle cx="38" cy="42" r="12" fill="#3D4352" />
            <rect x="56" y="32" width="18" height="6" rx="3" fill="#2EC4B6" />
            <rect x="56" y="44" width="18" height="6" rx="3" fill="#E5484D" />
          </svg>
        </Card>
        <Card index={2} text={t("home.how_3")}>
          <svg viewBox="0 0 120 70" className="h-20" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <g key={i} transform={`translate(0 ${i * 24})`}>
                <rect x="6" y="4" width="44" height="16" rx="7" fill="#2B2F3A" />
                <rect x="10" y="17" width="36" height="2" fill="#fff" opacity="0.7" />
                <g stroke="#E9D98B" strokeWidth="2.5" fill="none" opacity={1 - i * 0.45}>
                  <path d="M60 4 h-4 v16 h4" />
                  <path d="M100 4 h4 v16 h-4" />
                  <rect x="64" y="10" width={30 - i * 14} height="4" rx="2" fill="#E9D98B" />
                </g>
              </g>
            ))}
          </svg>
        </Card>
      </div>
      <ToyButton variant="primary" onClick={onClose} autoFocus>
        {t("home.back")}
      </ToyButton>
    </div>
  );
}

function Card({ index, text, children }: { index: number; text: string; children: ReactNode }) {
  return (
    <div
      className="animate-pop flex flex-col items-center gap-4 rounded-3xl bg-night-hi/80 p-6 text-center shadow-xl ring-2 ring-white/10"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex h-24 items-center">{children}</div>
      <p className="font-display text-xl text-cream">{text}</p>
    </div>
  );
}
