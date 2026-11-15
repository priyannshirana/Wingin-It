const INK = "#1F1F1F";

/** The "do" pictogram for say-only actions (§F12.3 item 4): a pointing hand. Original art. */
export function PointingHand({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-32 -32 64 64"
      aria-hidden="true"
      data-testid="pointing-hand"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path
        d="M-22 -4 L6 -4 C 12 -4 12 4 6 4 L 2 4 C 7 4 7 11 2 11 L 0 11 C 4 11 4 18 -1 18 L -14 18 C -20 18 -24 12 -24 6 L -24 -1 Z"
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth="3.5"
      />
      <path
        d="M-4 -4 L-4 -8 C -4 -12 2 -12 2 -8 L 2 -4"
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth="3.5"
      />
      <path
        d="M6 -4 L26 -4 C 30 -4 30 4 26 4 L 6 4"
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth="3.5"
      />
    </svg>
  );
}
