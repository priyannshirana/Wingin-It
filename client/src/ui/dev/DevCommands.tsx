import { useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DevState } from "../../net/protocol";
import { send } from "../../net/socket";
import { useStore } from "../../state/store";
import type { DevCommand } from "../hotkeys";
import { DEV_LABELS as L } from "./labels";

const dev = (command: DevCommand) => send({ type: "dev", ...command });

/** §F18.4 buttons for every dev command (the hotkey is shown on the button). */
export function DevCommands({ state }: { state: DevState | null }) {
  const sendDevanagari = useStore((s) => s.settings.sendDevanagari);
  const setSettings = useStore((s) => s.setSettings);
  const bots = useStore(useShallow((s) => s.dev?.bots ?? { flyer: false, tower: false }));
  const [seed, setSeed] = useState("");
  const varNames = state
    ? [...new Set([...Object.keys(state.vars), ...Object.keys(state.forced)])]
    : [];
  const [forceVar, setForceVar] = useState("");
  const [forceValue, setForceValue] = useState("");
  const chosenVar = forceVar || varNames[0] || "";
  const seedNumber = Number(seed);
  const seedValid = seed.trim() !== "" && Number.isInteger(seedNumber);

  return (
    <section data-testid="dev-commands">
      <h3 className="mb-1.5 text-[11px] tracking-widest text-teal uppercase">{L.commands}</h3>
      <div className="flex flex-wrap gap-1.5">
        <Btn hotkey="N" onClick={() => dev({ cmd: "complete_action" })}>
          {L.complete}
        </Btn>
        <Btn hotkey="F" onClick={() => dev({ cmd: "fail_action" })}>
          {L.fail}
        </Btn>
        {([1, 2, 3] as const).map((phase) => (
          <Btn
            key={phase}
            hotkey={String(phase)}
            onClick={() => dev({ cmd: "goto_phase", args: { phase } })}
          >
            {L.goto} {phase}
          </Btn>
        ))}
        <Btn hotkey="K" onClick={() => dev({ cmd: "skip_cinematic" })}>
          {L.skip}
        </Btn>
        <Btn onClick={() => dev({ cmd: "add_fuel", args: { seconds: 60 } })}>{L.addFuel}</Btn>
        <Btn
          pressed={bots.tower}
          onClick={() => dev({ cmd: "bots", args: { tower: !bots.tower } })}
        >
          {L.botsTower}: {bots.tower ? L.on : L.off}
        </Btn>
        <Btn
          pressed={bots.flyer}
          onClick={() => dev({ cmd: "bots", args: { flyer: !bots.flyer } })}
        >
          {L.botsFlyer}: {bots.flyer ? L.on : L.off}
        </Btn>
      </div>

      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (seedValid) dev({ cmd: "set_seed", args: { seed: seedNumber } });
        }}
      >
        <input
          aria-label={L.seed}
          inputMode="numeric"
          placeholder={state ? String(state.seed) : L.seed}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          className="w-24 rounded border border-white/15 bg-black/40 px-2 py-1 text-white"
        />
        <Btn type="submit" disabled={!seedValid}>
          {L.setSeed}
        </Btn>
      </form>

      <form
        className="mt-1.5 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosenVar && forceValue.trim()) {
            dev({ cmd: "force", args: { var: chosenVar, value: forceValue.trim() } });
          }
        }}
      >
        <select
          aria-label={L.vars}
          value={chosenVar}
          onChange={(e) => setForceVar(e.target.value)}
          className="max-w-36 rounded border border-white/15 bg-black/40 px-1 py-1 text-white"
        >
          {varNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={L.forceValue}
          placeholder={L.forceValue}
          value={forceValue}
          onChange={(e) => setForceValue(e.target.value)}
          className="w-24 rounded border border-white/15 bg-black/40 px-2 py-1 text-white"
        />
        <Btn type="submit" disabled={!chosenVar || !forceValue.trim()}>
          {L.force}
        </Btn>
      </form>

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-white/85">
        <input
          type="checkbox"
          checked={sendDevanagari}
          onChange={(e) => setSettings({ sendDevanagari: e.target.checked })}
        />
        {L.sendDevanagari}
      </label>
    </section>
  );
}

function Btn({
  children,
  onClick,
  hotkey,
  pressed,
  type = "button",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  hotkey?: string;
  pressed?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed ? "border-teal bg-teal/20 text-white" : "border-white/15 bg-white/5 text-white/90"
      } hover:bg-white/10`}
    >
      {children}
      {hotkey && (
        <kbd className="rounded border border-white/25 px-1 text-[10px] leading-4 text-white/60">
          {hotkey}
        </kbd>
      )}
    </button>
  );
}
