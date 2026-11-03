/**
 * Langues proposées par l'administration Shopify (et donc par l'application).
 * Ce fichier est partagé client/serveur : il ne contient aucune traduction.
 */
export const LOCALES = [
  { code: "en", name: "English" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "bg", name: "Български" },
  { code: "cs", name: "Čeština" },
  { code: "da", name: "Dansk" },
  { code: "de", name: "Deutsch" },
  { code: "el", name: "Ελληνικά" },
  { code: "es", name: "Español" },
  { code: "fi", name: "Suomi" },
  { code: "fr", name: "Français" },
  { code: "he", name: "עברית", dir: "rtl" },
  { code: "hi", name: "हिन्दी" },
  { code: "hr", name: "Hrvatski" },
  { code: "hu", name: "Magyar" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "lt", name: "Lietuvių" },
  { code: "ms", name: "Bahasa Melayu" },
  { code: "nb", name: "Norsk (bokmål)" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "pt-BR", name: "Português (Brasil)" },
  { code: "pt-PT", name: "Português (Portugal)" },
  { code: "ro", name: "Română" },
  { code: "ru", name: "Русский" },
  { code: "sk", name: "Slovenčina" },
  { code: "sl", name: "Slovenščina" },
  { code: "sv", name: "Svenska" },
  { code: "th", name: "ไทย" },
  { code: "tr", name: "Türkçe" },
  { code: "ur", name: "اردو", dir: "rtl" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
const CODES = new Set<string>(LOCALES.map((l) => l.code));

export function isRtl(locale: string) {
  return LOCALES.some((l) => l.code === locale && "dir" in l && l.dir === "rtl");
}

/**
 * Trouve la langue prise en charge la plus proche : « fr-CA » → « fr »,
 * « pt » → « pt-BR », « zh-HK » → « zh-TW », « no » → « nb »…
 */
export function matchLocale(input?: string | null): Locale | null {
  if (!input) return null;
  const raw = input.trim().replace("_", "-");
  if (!raw) return null;
  const [lang, region] = raw.split("-");
  const language = lang.toLowerCase();
  const full = region ? `${language}-${region.toUpperCase()}` : language;
  if (CODES.has(full)) return full as Locale;

  if (language === "zh") {
    const r = (region || "").toUpperCase();
    return r === "TW" || r === "HK" || r === "MO" || r === "HANT" ? "zh-TW" : "zh-CN";
  }
  if (language === "pt") return region?.toUpperCase() === "PT" ? "pt-PT" : "pt-BR";
  if (language === "no" || language === "nn") return "nb";
  if (language === "iw") return "he";
  if (language === "in") return "id";
  if (CODES.has(language)) return language as Locale;
  return null;
}

/** Langue préférée d'après l'en-tête Accept-Language. */
export function matchAcceptLanguage(header?: string | null): Locale | null {
  if (!header) return null;
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag, q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of candidates) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return null;
}
