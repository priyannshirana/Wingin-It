import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useT } from "../i18n/useT";
import type { PlayerPublic, Role } from "../net/protocol";
import { send } from "../net/socket";
import { otherRole, selectMock } from "../state/selectors";
import { useStore } from "../state/store";
import { CharacterSelect } from "./CharacterSelect";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { MicCheck } from "./MicCheck";
import { TowerPortrait } from "./avatars/TowerPortrait";
import { ToyButton } from "./ToyButton";

// The room lobby (§F8.3): code + share link + QR, both character cards, Ready, edit character,
// the block reason and the setup tip. M4 adds the mic check in real mode.
export function Lobby() {
  const t = useT();
  const room = useStore((s) => s.room);
  const me = useStore(useShallow((s) => s.me));
  const mock = useStore(selectMock);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!room || !me) return null;
  const mine = room.players.find((p) => p.id === me.id);
  const partner = room.players.find((p) => p.role === otherRole(me.role));
  const link = `${location.origin}/r/${room.code}`;

  if (editing) {
    return (
      <CharacterSelect
        mode="edit"
        initial={{ role: me.role, gender: me.gender, lang: me.lang, name: me.name }}
        takenRoles={partner ? [partner.role] : []}
        onUpdate={(patch) => send({ type: "update_player", ...patch })}
        onClose={() => setEditing(false)}
      />
    );
  }

  const block =
    room.block_reason === "missing_player"
      ? t("lobby.block_missing")
      : room.block_reason === "same_language"
        ? t("lobby.block_same_language")
        : room.block_reason === "not_ready"
          ? t("lobby.block_not_ready")
          : null;

  const order: Role[] = ["flyer", "tower"];
  return (
    <main
      data-screen="lobby"
      className="flex h-full flex-col items-center justify-center gap-8 bg-linear-to-b from-night to-night-hi p-8"
    >
      <header className="flex items-center gap-10">
        <div className="flex flex-col items-center">
          <span className="font-display text-lg text-cream/70">{t("lobby.room_code")}</span>
          <span
            data-testid="room-code"
            className="font-display text-[72px] leading-none font-extrabold tracking-[0.25em] text-cream"
          >
            {room.code}
          </span>
          <div className="mt-3 flex items-center gap-2 rounded-full bg-white/10 py-1 pr-1 pl-4">
            <span className="font-display text-cream/60">{t("lobby.share")}</span>
            <span className="font-mono text-sm text-cream">{link}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopied(true));
              }}
              className="rounded-full bg-teal px-3 py-1 font-display text-sm font-extrabold text-night"
            >
              {copied ? t("lobby.copied") : t("lobby.copy")}
            </button>
          </div>
        </div>
        <div className="rounded-2xl bg-cream p-3">
          <QRCodeSVG value={link} size={160} bgColor="#F2E8D5" fgColor="#0B1026" />
        </div>
      </header>

      <section className="flex gap-8">
        {order.map((role) => {
          const p = room.players.find((pl) => pl.role === role);
          return p ? (
            <PlayerCard key={role} player={p} mine={p.id === me.id} />
          ) : (
            <EmptySlot key={role} />
          );
        })}
      </section>

      <div className="flex items-center gap-4">
        <ToyButton
          variant={mine?.ready ? "secondary" : "primary"}
          data-testid="ready"
          onClick={() => send({ type: "ready", ready: !mine?.ready })}
          className="text-2xl"
        >
          {mine?.ready ? t("lobby.unready") : t("lobby.ready")}
        </ToyButton>
        <ToyButton variant="ghost" onClick={() => setEditing(true)} disabled={mine?.ready}>
          {t("char.title")}
        </ToyButton>
      </div>
      {block && <p className="font-display text-lg text-lamp-yellow">{block}</p>}

      <div className="flex max-w-2xl flex-col items-center gap-2 rounded-2xl bg-white/5 px-6 py-4 text-center">
        <p className="font-display text-xl text-cream">{t("lobby.tip")}</p>
        {mock ? <p className="font-display text-cream/60">{t("lobby.mock_note")}</p> : <MicCheck />}
      </div>
    </main>
  );
}

function PlayerCard({ player, mine }: { player: PlayerPublic; mine: boolean }) {
  const t = useT();
  const Portrait = player.role === "flyer" ? FlyerPortrait : TowerPortrait;
  return (
    <div
      data-testid={`player-${player.role}`}
      className={`relative flex w-64 flex-col items-center gap-2 rounded-3xl bg-night-hi p-5 ring-4 ${mine ? "ring-teal" : "ring-white/10"}`}
    >
      <span
        className={`absolute top-4 right-4 size-3 rounded-full ${player.connected ? "bg-lamp-green" : "bg-lamp-grey"}`}
      />
      <Portrait gender={player.gender} size={120} state={player.ready ? "happy" : "idle"} />
      <span className="font-display text-2xl font-extrabold text-cream">{player.name}</span>
      <span className="font-display text-cream/70">
        {t(player.role === "flyer" ? "lobby.flyer" : "lobby.tower")} ·{" "}
        {t(player.lang === "en" ? "lobby.lang_en" : "lobby.lang_hi")}
      </span>
      <span
        className={`rounded-full px-3 py-0.5 font-display text-sm font-extrabold ${player.ready ? "bg-lamp-green text-night" : "bg-white/10 text-cream/60"}`}
      >
        {player.ready ? `✓ ${t("lobby.ready")}` : t("lobby.unready")}
      </span>
    </div>
  );
}

function EmptySlot() {
  const t = useT();
  return (
    <div className="flex w-64 flex-col items-center justify-center gap-3 rounded-3xl border-4 border-dashed border-cream/25 p-5">
      <div className="size-[120px] rounded-full border-4 border-dashed border-cream/25" />
      <span className="text-center font-display text-cream/60">{t("lobby.waiting_partner")}</span>
    </div>
  );
}
