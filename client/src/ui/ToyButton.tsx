import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal text-night shadow-[0_6px_0_#1a7f76] active:shadow-[0_2px_0_#1a7f76]",
  secondary: "bg-cream text-night shadow-[0_6px_0_#b9ab90] active:shadow-[0_2px_0_#b9ab90]",
  ghost: "bg-white/10 text-cream shadow-[0_4px_0_rgb(0_0_0/0.35)] active:shadow-none",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Chunky toy button: lifts 3 px on hover, presses down on click (§F8.1). */
export function ToyButton({ variant = "secondary", className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-2xl px-6 py-3 font-display text-xl font-extrabold transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-moon ${VARIANTS[variant]} ${className}`}
    />
  );
}
