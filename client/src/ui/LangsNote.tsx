import { useT } from "../i18n/useT";

const EN = "\u0001";
const HI = "\u0002";

/** The muted "English and Hindi" note, with both language names highlighted. */
export function LangsNote({ className = "" }: { className?: string }) {
  const t = useT();
  const parts = t("home.langs_note", { en: EN, hi: HI }).split(new RegExp(`(${EN}|${HI})`));
  return (
    <p className={`font-display text-sm text-cream/55 ${className}`}>
      {parts.map((part, i) =>
        part === EN || part === HI ? (
          <span
            key={i}
            data-testid="lang-pill"
            className="mx-0.5 rounded-full bg-teal/20 px-2 py-0.5 font-extrabold text-teal"
          >
            {t(part === EN ? "home.lang_en" : "home.lang_hi")}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}
