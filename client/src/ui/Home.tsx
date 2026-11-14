import { browserLang, translate } from "../i18n/strings";

// M0 stub of the home page (§F8.1): the logo and tagline over the night sky. M1 adds the menu,
// M3 the attract-loop canvas behind it.
export function Home() {
  const lang = browserLang();
  return (
    <main
      data-screen="home"
      className="flex h-full flex-col items-center justify-center gap-6 bg-linear-to-b from-night to-night-hi"
    >
      <h1 className="animate-float font-display text-[120px] leading-none font-extrabold text-cream text-shadow-extrude">
        {translate(lang, "app.logo")}
      </h1>
      <p lang={lang} className="font-display text-2xl text-cream/80">
        {translate(lang, "app.tagline")}
      </p>
    </main>
  );
}
