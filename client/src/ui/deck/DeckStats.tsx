import { useT } from "../../i18n/useT";
import type { Stats } from "../../net/protocol";
import { formatClock } from "./format";

interface Props {
  stats: Stats;
}

/** The stats row (§F17): fuel left per phase, wrong actions, lifelines mine / partner, time. */
export function DeckStats({ stats }: Props) {
  const t = useT();
  const items: { id: string; label: string; value: string }[] = [
    ...stats.phases.map((p) => ({
      id: `fuel-${p.phase}`,
      label: t("deck.stat_fuel", { n: p.phase }),
      value: t("hud.seconds", { n: Math.max(0, Math.round(p.fuel_left_s)) }),
    })),
    { id: "wrong", label: t("deck.stat_wrong"), value: String(stats.wrong_actions_total) },
    {
      id: "lifelines",
      label: t("deck.stat_lifelines"),
      value: `${stats.lifelines_used.mine} / ${stats.lifelines_used.partner}`,
    },
    { id: "time", label: t("deck.stat_time"), value: formatClock(stats.total_time_s) },
  ];
  return (
    <section data-testid="deck-stats" className="flex min-w-0 flex-col gap-1.5">
      <h2 className="font-display text-[15px] font-extrabold text-cream/60">{t("deck.stats")}</h2>
      <dl className="flex flex-wrap gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            data-testid={`deck-stat-${it.id}`}
            className="flex flex-col rounded-xl bg-white/[0.07] px-3.5 py-1.5 ring-1 ring-white/10"
          >
            <dt className="font-display text-[14px] leading-tight font-semibold text-cream/65">
              {it.label}
            </dt>
            <dd className="font-display text-[22px] leading-tight font-extrabold text-cream tabular-nums">
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
