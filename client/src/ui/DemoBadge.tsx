/**
 * Shared DEMO badge (§F19). Renders the label in a red pill; callers position it.
 * Used by Home.tsx (inline in the top-right header row) and PresenterKeys.tsx (fixed overlay).
 */
export function DemoBadge({ label }: { label: string }) {
  return (
    <span
      data-testid="demo-badge-pill"
      className="rounded-md bg-lamp-red px-2 py-0.5 font-display text-sm font-extrabold tracking-widest text-white"
    >
      {label}
    </span>
  );
}
