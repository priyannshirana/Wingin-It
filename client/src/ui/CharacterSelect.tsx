import { useState } from "react";
import { useT } from "../i18n/useT";
import type { Gender, Lang, Role } from "../net/protocol";
import type { JoinParams } from "../net/socket";
import { useStore } from "../state/store";
import { AvatarPreview } from "./avatars/AvatarPreview";
import { FlyerPortrait } from "./avatars/FlyerPortrait";
import { TowerPortrait } from "./avatars/TowerPortrait";
import { ToyButton } from "./ToyButton";

export interface CharacterChoice {
  role: Role | null;
  gender: Gender | null;
  lang: Lang | null;
  name: string;
}

interface Props {
  /** `join`: the pre-join screen. `edit`: inline in the lobby; every change sends update_player. */
  mode: "join" | "edit";
  initial: CharacterChoice;
  /** Roles held by someone else (disabled with `lobby.taken`). */
  takenRoles: readonly Role[];
  onJoin?: (params: JoinParams) => void;
  onUpdate?: (patch: Partial<Omit<JoinParams, "name">> & { name?: string }) => void;
  onClose?: () => void;
}

const NAME_MAX = 16;

// Character select (§F8.2): role cards with a gender toggle, the language toggle, a name, and a
// live preview. Gender is never pre-selected for real players (only `?gender=` / split view).
export function CharacterSelect({ mode, initial, takenRoles, onJoin, onUpdate, onClose }: Props) {
  const t = useT();
  const setUiLang = useStore((s) => s.setUiLang);
  const [choice, setChoice] = useState<CharacterChoice>(initial);
  const trimmed = choice.name.trim();
  const complete =
    choice.role !== null &&
    choice.gender !== null &&
    choice.lang !== null &&
    trimmed.length >= 1 &&
    trimmed.length <= NAME_MAX &&
    !takenRoles.includes(choice.role);

  function change(patch: Partial<CharacterChoice>) {
    setChoice((c) => ({ ...c, ...patch }));
    if (patch.lang) setUiLang(patch.lang);
    if (mode !== "edit" || !onUpdate) return;
    const { role, gender, lang } = patch;
    if (role) onUpdate({ role });
    if (gender) onUpdate({ gender });
    if (lang) onUpdate({ lang });
  }

  function submit() {
    if (mode === "edit") {
      if (trimmed && trimmed !== initial.name.trim()) onUpdate?.({ name: trimmed });
      onClose?.();
      return;
    }
    if (!complete || !choice.role || !choice.gender || !choice.lang) return;
    onJoin?.({ name: trimmed, role: choice.role, lang: choice.lang, gender: choice.gender });
  }

  const caption =
    choice.role === "flyer"
      ? t("char.flyer_caption")
      : choice.role === "tower"
        ? t("char.tower_caption", undefined, choice.gender ?? "male")
        : null;

  return (
    <main
      data-screen="character-select"
      className="flex h-full items-center justify-center gap-16 bg-linear-to-b from-night to-night-hi px-12"
    >
      <section className="flex w-[40%] flex-col items-center gap-6">
        <AvatarPreview role={choice.role} gender={choice.gender} />
        {caption && (
          <p className="max-w-sm text-center font-display text-xl text-cream/85">{caption}</p>
        )}
      </section>

      <form
        className="flex w-[45%] max-w-xl flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h1 className="font-display text-5xl font-extrabold text-cream">{t("char.title")}</h1>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-display text-lg text-cream/70">{t("lobby.role")}</legend>
          <div className="grid grid-cols-2 gap-4">
            {(["flyer", "tower"] as const).map((role) => (
              <RoleCard
                key={role}
                role={role}
                selected={choice.role === role}
                taken={takenRoles.includes(role)}
                gender={choice.role === role ? choice.gender : null}
                onSelect={() => change({ role })}
                onGender={(gender) => change({ gender })}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="flex items-center gap-4">
          <legend className="sr-only">{t("lobby.language")}</legend>
          <span className="font-display text-lg text-cream/70" aria-hidden="true">
            {t("lobby.language")}
          </span>
          <div className="flex rounded-full bg-white/10 p-1">
            {(["en", "hi"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                data-testid={`lang-${lang}`}
                aria-pressed={choice.lang === lang}
                onClick={() => change({ lang })}
                className={`rounded-full px-5 py-2 font-display text-lg ${choice.lang === lang ? "bg-cream text-night" : "text-cream/80 hover:text-cream"}`}
              >
                {t(lang === "en" ? "lobby.lang_en" : "lobby.lang_hi")}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-2">
          <span className="font-display text-lg text-cream/70">{t("lobby.name")}</span>
          <input
            data-testid="name"
            value={choice.name}
            maxLength={NAME_MAX}
            onChange={(e) => setChoice((c) => ({ ...c, name: e.target.value }))}
            className="rounded-2xl bg-white/90 px-4 py-3 font-display text-2xl text-night focus:outline-4 focus:outline-teal"
          />
        </label>

        <div className="flex items-center gap-4">
          {mode === "join" ? (
            <ToyButton variant="primary" type="submit" data-testid="join" disabled={!complete}>
              {t("lobby.join")}
            </ToyButton>
          ) : (
            <ToyButton variant="primary" type="submit" data-testid="done">
              {t("home.back")}
            </ToyButton>
          )}
          {mode === "join" && !complete && (
            <span className="font-display text-cream/60">{t("char.pick_all")}</span>
          )}
        </div>
      </form>
    </main>
  );
}

interface RoleCardProps {
  role: Role;
  selected: boolean;
  taken: boolean;
  gender: Gender | null;
  onSelect: () => void;
  onGender: (gender: Gender) => void;
}

function RoleCard({ role, selected, taken, gender, onSelect, onGender }: RoleCardProps) {
  const t = useT();
  const Portrait = role === "flyer" ? FlyerPortrait : TowerPortrait;
  return (
    <div
      className={`flex flex-col gap-3 rounded-3xl p-4 ring-4 transition ${selected ? "bg-night-hi ring-teal" : "bg-white/5 ring-transparent"} ${taken ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        data-testid={`role-${role}`}
        aria-pressed={selected}
        disabled={taken}
        onClick={onSelect}
        className="flex flex-col items-start gap-1 text-left disabled:cursor-not-allowed"
      >
        <span className="font-display text-2xl font-extrabold text-cream">
          {t(role === "flyer" ? "lobby.flyer" : "lobby.tower")}
        </span>
        <span className="font-display text-cream/70">
          {taken ? t("lobby.taken") : t(role === "flyer" ? "lobby.flyer_desc" : "lobby.tower_desc")}
        </span>
      </button>
      {selected && !taken && (
        <div className="flex gap-2" role="group" aria-label={t("char.gender")}>
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              data-testid={`gender-${g}`}
              aria-pressed={gender === g}
              onClick={() => onGender(g)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-2xl p-2 ring-2 ${gender === g ? "bg-teal/20 ring-teal" : "bg-white/5 ring-white/10 hover:ring-white/30"}`}
            >
              <Portrait gender={g} size={56} />
              <span className="font-display text-sm text-cream">
                {t(g === "male" ? "char.male" : "char.female")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
