/** Speaker glyph with sound waves, or a cross when muted. */
export function SpeakerIcon({ muted, size = 22 }: { muted: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" strokeLinejoin="round" />
      {muted ? (
        <path
          d="M16 9.5l5 5m0-5l-5 5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M15.5 9a4 4 0 0 1 0 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M18 6.5a7.5 7.5 0 0 1 0 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
