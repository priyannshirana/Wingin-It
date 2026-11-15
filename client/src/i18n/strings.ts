// Every user-facing string, in English and Hindi (§F7.1 chrome, §F7.2 toasts, §F7.3 error map).
// Hindi values may be gendered (`{m, f}`): `translate` picks the form by the gender of the person
// the string is about (yourself for `ptt.transmitting`, the speaker for `ptt.busy_*`, your
// partner for `toast.partner_*`, the selected character for `char.tower_caption`).
// The table body is transcribed verbatim from docs/FRONTEND_SPEC.md §F7.
import type { ErrorCode, Gender, Lang, ToastKey } from "../net/protocol";

export interface Gendered {
  m: string;
  f: string;
}

export interface StringEntry {
  en: string;
  hi: string | Gendered;
}

export const STRINGS = {
  // SPEC-ASSUMPTION: the logo is a brand mark, identical in both languages — §F8.1 gives the
  // text "WINGIN' IT!" but §F7 has no key for it, and every UI string must come from this file.
  "app.logo": { en: "WINGIN' IT!", hi: "WINGIN' IT!" },
  "app.tagline": {
    en: "A translator designed to make itself unnecessary.",
    hi: "एक अनुवादक, जो खुद को गैरज़रूरी बनाने के लिए बना है।",
  },
  "landing.create": { en: "Create room", hi: "रूम बनाओ" },
  "landing.join": { en: "Join with code", hi: "कोड से जुड़ो" },
  "landing.code_placeholder": { en: "ABCD", hi: "ABCD" },
  "landing.not_found": { en: "Room not found", hi: "रूम नहीं मिला" },
  "home.start": { en: "Start a game", hi: "खेल शुरू करो" },
  "home.join": { en: "Join a game", hi: "खेल से जुड़ो" },
  "home.how": { en: "How to play", hi: "कैसे खेलें" },
  "home.how_1": {
    en: "One of you flies. One of you has the manual.",
    hi: "एक उड़ाएगा, एक के पास मैनुअल है।",
  },
  "home.how_2": {
    en: "Talk over the radio in your own language.",
    hi: "रेडियो पर अपनी भाषा में बात करो।",
  },
  "home.how_3": {
    en: "The translator fades. Learn each other's words and land the plane!",
    hi: "अनुवाद धीरे-धीरे गायब होगा। एक-दूसरे के शब्द सीखो और विमान उतारो!",
  },
  "home.back": { en: "Back", hi: "वापस" },
  "char.title": { en: "Choose your character", hi: "अपना किरदार चुनो" },
  "char.gender": { en: "Character", hi: "किरदार" },
  "char.male": { en: "Male", hi: "पुरुष" },
  "char.female": { en: "Female", hi: "महिला" },
  "char.flyer_caption": {
    en: "The passenger who has to fly the plane",
    hi: "वह यात्री जिसे विमान उड़ाना है",
  },
  // gendered by: the selected character
  "char.tower_caption": {
    en: "The air-traffic controller with the manual",
    hi: { m: "मैनुअल वाला एयर-ट्रैफ़िक कंट्रोलर", f: "मैनुअल वाली एयर-ट्रैफ़िक कंट्रोलर" },
  },
  "char.pick_all": {
    en: "Pick a role, a character and a language",
    hi: "भूमिका, किरदार और भाषा चुनो",
  },
  "lobby.room_code": { en: "Room code", hi: "रूम कोड" },
  "lobby.share": { en: "Share this link", hi: "यह लिंक भेजो" },
  "lobby.copy": { en: "Copy", hi: "कॉपी करो" },
  "lobby.copied": { en: "Copied!", hi: "कॉपी हो गया!" },
  "lobby.name": { en: "Your name", hi: "आपका नाम" },
  "lobby.role": { en: "Your role", hi: "आपकी भूमिका" },
  "lobby.flyer": { en: "Flyer", hi: "फ़्लायर" },
  "lobby.flyer_desc": { en: "You're in the cockpit", hi: "आप कॉकपिट में हैं" },
  "lobby.tower": { en: "Tower", hi: "टावर" },
  "lobby.tower_desc": { en: "You have the manual", hi: "आपके पास मैनुअल है" },
  "lobby.taken": { en: "Taken", hi: "पहले से लिया गया" },
  "lobby.language": { en: "Your language", hi: "आपकी भाषा" },
  "lobby.lang_en": { en: "English", hi: "English" },
  "lobby.lang_hi": { en: "हिन्दी", hi: "हिन्दी" },
  "lobby.join": { en: "Join", hi: "जुड़ो" },
  "lobby.ready": { en: "Ready", hi: "तैयार" },
  "lobby.unready": { en: "Not ready", hi: "तैयार नहीं" },
  "lobby.waiting_partner": { en: "Waiting for your partner…", hi: "साथी का इंतज़ार…" },
  "lobby.block_missing": {
    en: "Waiting for the other role to join",
    hi: "दूसरी भूमिका के जुड़ने का इंतज़ार",
  },
  "lobby.block_same_language": {
    en: "You both picked the same language. Pick different languages to start.",
    hi: "दोनों ने एक ही भाषा चुनी है। शुरू करने के लिए अलग-अलग भाषा चुनो।",
  },
  "lobby.block_not_ready": {
    en: "Waiting for both players to press Ready",
    hi: "दोनों खिलाड़ियों के तैयार होने का इंतज़ार",
  },
  "lobby.tip": {
    en: "Sit back to back. No peeking at each other's screens.",
    hi: "पीठ से पीठ लगाकर बैठो। एक-दूसरे की स्क्रीन मत देखना।",
  },
  "lobby.mic_allow": { en: "Allow microphone", hi: "माइक्रोफ़ोन चालू करने दो" },
  "lobby.mic_test": { en: "Say something to test your mic", hi: "माइक जाँचने के लिए कुछ बोलो" },
  "lobby.mic_denied": {
    en: "Microphone blocked. Allow it in the address bar, then reload.",
    hi: "माइक्रोफ़ोन बंद है। एड्रेस बार में अनुमति दो, फिर पेज रीलोड करो।",
  },
  "lobby.mic_ok": { en: "Mic works!", hi: "माइक चल रहा है!" },
  "lobby.mock_note": {
    en: "Typing mode: no microphone needed.",
    hi: "टाइपिंग मोड: माइक्रोफ़ोन की ज़रूरत नहीं।",
  },
  "lobby.demo_badge": { en: "DEMO", hi: "डेमो" },
  "phase.1": { en: "Pilot Down", hi: "पायलट बेहोश" },
  "phase.2": { en: "Engine Fire", hi: "इंजन में आग" },
  "phase.3": { en: "Storm Landing", hi: "तूफ़ान में लैंडिंग" },
  "title.phase": { en: "PHASE {n} — {name}", hi: "चरण {n} — {name}" },
  "signal.label": { en: "SIGNAL", hi: "सिग्नल" },
  "signal.1": { en: "STRONG", hi: "तेज़" },
  "signal.2": { en: "WEAK", hi: "कमज़ोर" },
  "signal.3": { en: "LOST", hi: "गायब" },
  "title.signal": { en: "SIGNAL: {level}", hi: "सिग्नल: {level}" },
  "hud.fuel": { en: "FUEL", hi: "ईंधन" },
  "hud.seconds": { en: "{n}s", hi: "{n} सेकंड" },
  "ptt.idle": { en: "Hold SPACE to talk", hi: "बोलने के लिए SPACE दबाकर रखो" },
  // gendered by: self
  "ptt.transmitting": { en: "Transmitting…", hi: { m: "बोल रहे हो…", f: "बोल रही हो…" } },
  // gendered by: Flyer
  "ptt.busy_flyer": { en: "Flyer is talking", hi: { m: "फ़्लायर बोल रहा है", f: "फ़्लायर बोल रही है" } },
  // gendered by: Tower
  "ptt.busy_tower": { en: "Tower is talking", hi: { m: "टावर बोल रहा है", f: "टावर बोल रही है" } },
  "ptt.button": { en: "Hold to talk", hi: "दबाकर बोलो" },
  "mock.placeholder": { en: "Type what you'd say, press Enter", hi: "जो बोलना है लिखो, Enter दबाओ" },
  "mock.send": { en: "Send", hi: "भेजो" },
  "sub.tag_flyer": { en: "FLYER", hi: "फ़्लायर" },
  "sub.tag_tower": { en: "TOWER", hi: "टावर" },
  "sub.you": { en: "You:", hi: "आप:" },
  "lifeline.hint": { en: "Tap a subtitle to decode it", hi: "अनुवाद देखने के लिए सबटाइटल पर टैप करो" },
  "lifeline.show": { en: "show", hi: "दिखाओ" },
  "lifeline.decoding": { en: "Decoding…", hi: "अनुवाद हो रहा है…" },
  "cin.skip": { en: "Skip", hi: "छोड़ो" },
  "cin.skip_waiting": { en: "Waiting for your partner to skip", hi: "साथी के छोड़ने का इंतज़ार" },
  "crash.title": { en: "OUT OF FUEL", hi: "ईंधन ख़त्म" },
  "crash.retry": { en: "Retry", hi: "फिर से कोशिश करो" },
  "crash.waiting": { en: "Waiting for your partner…", hi: "साथी का इंतज़ार…" },
  "end.landed": { en: "YOU LANDED!", hi: "लैंडिंग सफल!" },
  "end.fuel_left": { en: "Fuel left: {n}s", hi: "बचा ईंधन: {n} सेकंड" },
  "end.total_time": { en: "Total time: {t}", hi: "कुल समय: {t}" },
  "tower.flyer_used": { en: "Flyer used: {control}", hi: "फ़्लायर ने छुआ: {control}" },
  "tower.autopilot": { en: "AUTOPILOT ENGAGED", hi: "ऑटोपायलट चालू" },
  "tower.mayday": { en: "MAYDAY", hi: "MAYDAY" },
  "tower.engine_fire": { en: "ENGINE FIRE", hi: "इंजन में आग" },
  "tower.landed": { en: "LANDED", hi: "लैंड हो गया" },
  "manual.cover_title": { en: "FLIGHT MANUAL", hi: "उड़ान मैनुअल" },
  "manual.step": { en: "Step {i} / {n}", hi: "कदम {i} / {n}" },
  "manual.find_out": { en: "Find out", hi: "पता करो" },
  "manual.rule": { en: "Rule", hi: "नियम" },
  "manual.col_if": { en: "If it is", hi: "अगर यह है" },
  "manual.col_do": { en: "Have the Flyer do", hi: "फ़्लायर से करवाओ" },
  "manual.col_control": { en: "Control", hi: "कंट्रोल" },
  "manual.do_only": { en: "Have them do", hi: "करवाओ" },
  "manual.last_try": { en: "Last try:", hi: "पिछली बार:" },
  "manual.emergency": { en: "EMERGENCY", hi: "आपातकाल" },
  "manual.order_then": { en: "in this order", hi: "इसी क्रम में" },
  "manual.order_any": { en: "any order", hi: "कोई भी क्रम" },
  "manual.then_grid": { en: "then follow the grid", hi: "फिर तालिका देखो" },
  "manual.instruction_do": { en: "Have the Flyer do this:", hi: "फ़्लायर से यह करवाओ:" },
  "deck.header": { en: "Your partner taught you {n} words", hi: "आपके साथी ने आपको {n} शब्द सिखाए" },
  "deck.still_learning": { en: "Still learning", hi: "अभी सीख रहे हैं" },
  "deck.understood": { en: "✓ Understood ×{n}", hi: "✓ समझा ×{n}" },
  "deck.said_it": { en: "★ You said it", hi: "★ आपने बोला" },
  "deck.report_loading": {
    en: "Writing your mission report…",
    hi: "आपकी मिशन रिपोर्ट लिखी जा रही है…",
  },
  "deck.stats": { en: "Mission stats", hi: "मिशन के आँकड़े" },
  "deck.stat_fuel": { en: "Fuel left, phase {n}", hi: "बचा ईंधन, चरण {n}" },
  "deck.stat_wrong": { en: "Wrong actions", hi: "गलत कदम" },
  "deck.stat_lifelines": { en: "Lifelines used", hi: "इस्तेमाल हुई लाइफ़लाइन" },
  "deck.stat_time": { en: "Total time", hi: "कुल समय" },
  "deck.play_again": { en: "Play again", hi: "फिर से खेलो" },
  "deck.swap_roles": { en: "Swap roles", hi: "भूमिका बदलो" },
  "deck.waiting_vote": { en: "Waiting for your partner…", hi: "साथी का इंतज़ार…" },
  "settings.volume": { en: "Volume", hi: "आवाज़" },
  "settings.mute": { en: "Mute", hi: "आवाज़ बंद" },
  "settings.sensitivity": { en: "Mouse sensitivity", hi: "माउस की संवेदनशीलता" },
  "look.hint_enter": { en: "Click to look around", hi: "चारों ओर देखने के लिए क्लिक करो" },
  "look.hint_look": {
    en: "Move the mouse to look · Click to use the controls",
    hi: "देखने के लिए माउस घुमाओ · कंट्रोल चलाने के लिए क्लिक करो",
  },
  "look.hint_interact": {
    en: "Click empty space to look around again",
    hi: "फिर से देखने के लिए खाली जगह पर क्लिक करो",
  },
  "overlay.paused": {
    en: "Your partner disconnected. Waiting up to 60 s…",
    hi: "साथी का कनेक्शन टूट गया। 60 सेकंड तक इंतज़ार…",
  },
  "overlay.reconnecting": { en: "Reconnecting…", hi: "दोबारा जुड़ रहे हैं…" },
  "overlay.enable_sound": { en: "Click to enable sound", hi: "आवाज़ के लिए क्लिक करो" },
  "overlay.unsupported": {
    en: "This browser can't run Wingin' it! Please use the latest Chrome.",
    hi: "यह ब्राउज़र Wingin' it! नहीं चला सकता। कृपया नया Chrome इस्तेमाल करो।",
  },
  "toast.crossover": { en: "CROSSOVER! +5s", hi: "क्रॉसओवर! +5 सेकंड" },
  "toast.partner_left": {
    en: "Partner disconnected. Waiting…",
    hi: "साथी का कनेक्शन टूट गया। इंतज़ार…",
  },
  // gendered by: partner
  "toast.partner_back": {
    en: "Partner is back!",
    hi: { m: "साथी वापस आ गया!", f: "साथी वापस आ गई!" },
  },
  // gendered by: partner
  "toast.partner_gone": {
    en: "Partner left the game.",
    hi: { m: "साथी खेल छोड़ गया।", f: "साथी खेल छोड़ गई।" },
  },
  "toast.didnt_catch": { en: "Didn't catch that, try again", hi: "समझ नहीं आया, फिर से बोलो" },
  "toast.channel_busy": { en: "Wait — your partner is talking", hi: "रुको — साथी बोल रहा है" },
  "toast.translation_failed": {
    en: "Couldn't decode that one. Lifeline not used.",
    hi: "इसका अनुवाद नहीं हो पाया। लाइफ़लाइन बची है।",
  },
  "toast.no_lifelines": { en: "No lifelines left", hi: "कोई लाइफ़लाइन नहीं बची" },
  "toast.info": { en: "{text}", hi: "{text}" },
} satisfies Record<string, StringEntry>;

export type StringKey = keyof typeof STRINGS;

export type StringParams = Record<string, string | number>;

/** Keys whose Hindi value depends on a person's gender (§F7 "(m / f)"). */
export const GENDERED_KEYS: readonly StringKey[] = [
  "char.tower_caption",
  "ptt.transmitting",
  "ptt.busy_flyer",
  "ptt.busy_tower",
  "toast.partner_back",
  "toast.partner_gone",
];

/** Looks up `key` in `lang`, picks the gendered Hindi form and fills `{name}` placeholders. */
export function translate(
  lang: Lang,
  key: StringKey,
  params?: StringParams,
  gender?: Gender,
): string {
  const entry: StringEntry = STRINGS[key];
  const value = lang === "en" ? entry.en : entry.hi;
  const text = typeof value === "string" ? value : gender === "female" ? value.f : value.m;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const param = params[name];
    return param === undefined ? match : String(param);
  });
}

/** The UI language before a player picks one: `hi*` browsers get Hindi, everyone else English. */
export function browserLang(): Lang {
  return navigator.language.toLowerCase().startsWith("hi") ? "hi" : "en";
}

/** Every `ToastKey` (§A8) is a string key. */
export const TOAST_KEYS: Readonly<Record<ToastKey, StringKey>> = {
  "toast.crossover": "toast.crossover",
  "toast.partner_left": "toast.partner_left",
  "toast.partner_back": "toast.partner_back",
  "toast.partner_gone": "toast.partner_gone",
  "toast.didnt_catch": "toast.didnt_catch",
  "toast.channel_busy": "toast.channel_busy",
  "toast.translation_failed": "toast.translation_failed",
  "toast.no_lifelines": "toast.no_lifelines",
  "toast.info": "toast.info",
};

/**
 * §F7.3 error code → UI reaction. `toast` shows that key; `not_found` navigates home with
 * `landing.not_found`; `role_taken` marks the role card taken; `silent` does nothing;
 * `console` logs (plus a `toast.info` in Dev Mode).
 */
export type ErrorReaction =
  | { kind: "toast"; key: StringKey }
  | { kind: "not_found" }
  | { kind: "role_taken" }
  | { kind: "silent" }
  | { kind: "console" };

export const ERROR_REACTIONS: Readonly<Record<ErrorCode, ErrorReaction>> = {
  channel_busy: { kind: "toast", key: "toast.channel_busy" },
  no_lifelines: { kind: "toast", key: "toast.no_lifelines" },
  translation_failed: { kind: "toast", key: "toast.translation_failed" },
  transcribe_failed: { kind: "toast", key: "toast.didnt_catch" },
  room_not_found: { kind: "not_found" },
  role_taken: { kind: "role_taken" },
  lifeline_not_available: { kind: "silent" },
  rate_limited: { kind: "console" },
  not_allowed_now: { kind: "console" },
  bad_message: { kind: "console" },
  internal: { kind: "console" },
  // SPEC-ASSUMPTION: §F7.3 doesn't list these; they can only come from a client bug or a
  // misconfigured server, so they are logged like the other "console only" codes.
  room_full: { kind: "console" },
  not_joined: { kind: "console" },
  not_your_role: { kind: "console" },
  mock_only: { kind: "console" },
  dev_disabled: { kind: "console" },
  demo_only: { kind: "console" },
};
