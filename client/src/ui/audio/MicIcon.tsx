/** A chunky toy microphone glyph (no external assets). */
export function MicIcon({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <rect x="8" y="2.5" width="8" height="12.5" rx="4" fill="currentColor" />
      <path
        d="M5 11.5a7 7 0 0 0 14 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M12 18.5v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
