import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { send } from "../net/socket";
import { isTypingTarget } from "./isTypingTarget";

const SAY_MAX = 300;

// The typed "radio" for mock rooms (§F18.2): Enter / Send → say_text; ↑ recalls the last line;
// Enter focuses the box when nothing else is focused. Works during cinematics.
export function MockTalkBox() {
  const t = useT();
  const [text, setText] = useState("");
  const last = useRef("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || isTypingTarget(e.target)) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const line = text.trim().slice(0, SAY_MAX);
    if (!line) return;
    send({ type: "say_text", text: line });
    last.current = line;
    setText("");
  }

  return (
    <form
      data-testid="mock-talk"
      className="pointer-events-auto flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={input}
        value={text}
        maxLength={SAY_MAX}
        placeholder={t("mock.placeholder")}
        aria-label={t("mock.placeholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && last.current) {
            e.preventDefault();
            setText(last.current);
          }
        }}
        className="min-w-0 flex-1 rounded-xl bg-white/90 px-3 py-2 font-display text-lg text-night placeholder:text-night/40 focus:outline-3 focus:outline-teal"
      />
      <button
        type="submit"
        className="rounded-xl bg-teal px-4 font-display text-lg font-extrabold text-night disabled:opacity-40"
        disabled={!text.trim()}
      >
        {t("mock.send")}
      </button>
    </form>
  );
}
