import { useEffect } from "react";
import { TRANSLATION_REVEAL_MS } from "../../config";
import { useT } from "../../i18n/useT";
import { selectLang } from "../../state/selectors";
import { useStore } from "../../state/store";

/**
 * What sits under a subtitle once a lifeline touched it (§F13): the "decoding…" spinner, the
 * revealed translation for TRANSLATION_REVEAL_MS, then the free client-side "show" link.
 */
export function LifelineNote({ id, stale }: { id: string; stale: boolean }) {
  const t = useT();
  const lang = useStore(selectLang);
  const tr = useStore((s) => s.translations[id]);
  const openedAt = tr && !tr.pending ? tr.openedAt : 0;

  useEffect(() => {
    if (openedAt === 0) return;
    const left = Math.max(0, openedAt + TRANSLATION_REVEAL_MS - Date.now());
    const handle = setTimeout(() => useStore.getState().collapseTranslation(id), left);
    return () => clearTimeout(handle);
  }, [id, openedAt]);

  if (!tr) return null;
  if (tr.pending) {
    if (stale) return null;
    return (
      <p
        data-testid="lifeline-decoding"
        className="mt-1 flex items-center gap-2 font-display text-[0.7em] text-cream/80"
        role="status"
      >
        <span
          aria-hidden="true"
          className="inline-block size-[1em] animate-spin rounded-full border-2 border-cream/25 border-t-cream"
        />
        {t("lifeline.decoding")}
      </p>
    );
  }
  if (openedAt !== 0) {
    return (
      <p
        data-testid="translation"
        lang={lang}
        className="mt-1.5 animate-slide-up rounded-xl bg-night/80 px-2.5 py-1 font-display text-[0.8em] leading-snug text-cream"
      >
        {tr.text}
      </p>
    );
  }
  return (
    <button
      type="button"
      data-testid="lifeline-show"
      className="pointer-events-auto mt-0.5 cursor-pointer font-display text-[0.65em] text-gloss/90 underline decoration-dotted underline-offset-2 hover:text-gloss"
      onClick={() => useStore.getState().reopenTranslation(id)}
    >
      {t("lifeline.show")}
    </button>
  );
}
