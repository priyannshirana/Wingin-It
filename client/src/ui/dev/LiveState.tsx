import type { ReactNode } from "react";
import type { DevState } from "../../net/protocol";
import { DEV_LABELS as L } from "./labels";

/** §F18.4 live state: room, status, phase, action, seed, vars, forced, expected, pending, fuel, bots. */
export function LiveState({ dev }: { dev: DevState }) {
  return (
    <section data-testid="dev-live">
      <h3 className="mb-1 text-[11px] tracking-widest text-teal uppercase">{L.live}</h3>
      <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5">
        <Row k={L.room}>{dev.room}</Row>
        <Row k={L.status}>{dev.status}</Row>
        <Row k={L.phase}>{dev.phase}</Row>
        <Row k={L.action}>{dev.action_id ?? L.none}</Row>
        <Row k={L.seed}>{dev.seed}</Row>
        <Row k={L.fuel}>{dev.fuel_s.toFixed(1)} s</Row>
        <Row k={L.vars}>
          <KeyValues values={dev.vars} />
        </Row>
        <Row k={L.forced}>
          <KeyValues values={dev.forced} />
        </Row>
        <Row k={L.expected}>
          {dev.expected.length === 0 ? (
            L.none
          ) : (
            <ol className="space-y-0.5">
              {dev.expected.map((step, i) => (
                <li
                  key={i}
                  data-done={step.done ? "true" : "false"}
                  className={step.done ? "text-[#7CE0A3]" : "text-white/85"}
                >
                  {step.done ? "✓" : "○"} {step.object} {step.verb}
                  {step.value !== undefined && ` → ${step.value}`}
                  {step.count !== undefined && ` ×${step.count}`}
                </li>
              ))}
              {dev.unordered && <li className="text-white/50">({L.unordered})</li>}
            </ol>
          )}
        </Row>
        <Row k={L.pending}>
          {dev.pending ? `${dev.pending.object} ×${dev.pending.count}` : L.none}
        </Row>
        <Row k={L.bots}>
          T:{dev.bots.tower ? L.on : L.off} · F:{dev.bots.flyer ? L.on : L.off}
        </Row>
      </dl>
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-white/45">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function KeyValues({ values }: { values: Record<string, string> }) {
  const entries = Object.entries(values);
  if (entries.length === 0) return <>{L.none}</>;
  return (
    <span className="flex flex-wrap gap-x-3">
      {entries.map(([k, v]) => (
        <span key={k}>
          <span className="text-white/55">{k}=</span>
          <span className="text-[#FFD479]">{v}</span>
        </span>
      ))}
    </span>
  );
}
