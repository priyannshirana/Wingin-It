import type { DevState, Role } from "../../net/protocol";
import { CONCEPTS } from "./concepts";
import { DEV_LABELS as L } from "./labels";

const COLUMNS = ["heard", "glossed", "understood", "spoken"] as const;
const COLUMN_HEAD = { heard: "H", glossed: "G", understood: "U", spoken: "S" } as const;
const ROLE_ORDER: Record<Role, number> = { flyer: 0, tower: 1 };
const ZERO = { heard: 0, glossed: 0, understood: 0, spoken: 0 };

/** §F18.4 exposure: concept × heard / glossed / understood / spoken, per player (20 rows). */
export function ExposureTable({
  exposure,
  myId,
}: {
  exposure: DevState["exposure"];
  myId: string | null;
}) {
  const players = Object.entries(exposure).sort(
    ([, a], [, b]) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
  );
  return (
    <section data-testid="dev-exposure">
      <h3 className="mb-1 text-[11px] tracking-widest text-teal uppercase">{L.exposure}</h3>
      <table className="w-full border-collapse text-right tabular-nums">
        <thead>
          <tr>
            <th />
            {players.map(([id, p]) => (
              <th
                key={id}
                colSpan={COLUMNS.length}
                className="border-l border-white/10 px-1 text-center font-normal text-white/80"
              >
                {p.name} · {p.role}
                {id === myId && <span className="text-teal"> ({L.me})</span>}
              </th>
            ))}
          </tr>
          <tr className="text-white/45">
            <th />
            {players.map(([id]) =>
              COLUMNS.map((c, ci) => (
                <th
                  key={`${id}-${c}`}
                  className={`w-7 px-1 font-normal ${ci === 0 ? "border-l border-white/10" : ""}`}
                >
                  {COLUMN_HEAD[c]}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {CONCEPTS.map((concept, row) => (
            <tr
              key={concept}
              data-testid="exposure-row"
              className={row === 15 ? "border-t border-white/15" : row % 2 ? "bg-white/[0.03]" : ""}
            >
              <th className="pr-2 text-left font-normal text-white/70">{concept}</th>
              {players.map(([id, p]) => {
                const counts = p.concepts[concept] ?? ZERO;
                return COLUMNS.map((c, ci) => (
                  <td
                    key={`${id}-${c}`}
                    className={`px-1 ${ci === 0 ? "border-l border-white/10" : ""} ${
                      counts[c] === 0 ? "text-white/20" : "text-white"
                    }`}
                  >
                    {counts[c]}
                  </td>
                ));
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-white/40">{L.exposureLegend}</p>
    </section>
  );
}
