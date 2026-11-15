import { useCallback } from "react";
import type { Gender } from "../net/protocol";
import { selectLang } from "../state/selectors";
import { useStore } from "../state/store";
import { translate, type StringKey, type StringParams } from "./strings";

export type TFunction = (key: StringKey, params?: StringParams, gender?: Gender) => string;

/** `t(key, params, gender)` in the viewer's language. */
export function useT(): TFunction {
  const lang = useStore(selectLang);
  return useCallback(
    (key: StringKey, params?: StringParams, gender?: Gender) =>
      translate(lang, key, params, gender),
    [lang],
  );
}
