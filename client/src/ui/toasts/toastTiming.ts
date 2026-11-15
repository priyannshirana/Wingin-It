import type { Gender, Toast } from "../../net/protocol";
import type { StringKey } from "../../i18n/strings";

/** §F15: at most 3 toasts on screen. */
export const TOAST_VISIBLE = 3;

/** §F15: toasts hide after 2.5 s; the gold crossover pop after 2 s. */
export function toastLifeMs(kind: Toast["kind"]): number {
  return kind === "crossover" ? 2000 : 2500;
}

/** The exit fade at the end of a toast's life. */
export const TOAST_FADE_MS = 200;

/**
 * Whose gender a toast's Hindi wording follows (§F7.2): the `toast.partner_*` lines are about
 * the partner; every other toast is ungendered.
 */
export function toastGender(key: StringKey, partner: Gender | undefined): Gender | undefined {
  return key === "toast.partner_back" || key === "toast.partner_gone" ? partner : undefined;
}
