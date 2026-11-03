/**
 * Dictionnaires de toutes les langues (côté serveur uniquement : le navigateur ne reçoit
 * que la langue utile). Les clés manquantes d'une langue reprennent l'anglais.
 */
import type { Locale } from "./config";
import { DEFAULT_LOCALE, matchAcceptLanguage, matchLocale } from "./config";
import type { Messages, TFunction } from "./translate";
import { createTranslator, mergeMessages } from "./translate";

import en from "./locales/en.json";
import ar from "./locales/ar.json";
import bg from "./locales/bg.json";
import cs from "./locales/cs.json";
import da from "./locales/da.json";
import de from "./locales/de.json";
import el from "./locales/el.json";
import es from "./locales/es.json";
import fi from "./locales/fi.json";
import fr from "./locales/fr.json";
import he from "./locales/he.json";
import hi from "./locales/hi.json";
import hr from "./locales/hr.json";
import hu from "./locales/hu.json";
import id from "./locales/id.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import lt from "./locales/lt.json";
import ms from "./locales/ms.json";
import nb from "./locales/nb.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import pt_BR from "./locales/pt-BR.json";
import pt_PT from "./locales/pt-PT.json";
import ro from "./locales/ro.json";
import ru from "./locales/ru.json";
import sk from "./locales/sk.json";
import sl from "./locales/sl.json";
import sv from "./locales/sv.json";
import th from "./locales/th.json";
import tr from "./locales/tr.json";
import ur from "./locales/ur.json";
import vi from "./locales/vi.json";
import zh_CN from "./locales/zh-CN.json";
import zh_TW from "./locales/zh-TW.json";

const DICTIONARIES: Record<Locale, Messages> = {
  "en": en,
  "ar": ar,
  "bg": bg,
  "cs": cs,
  "da": da,
  "de": de,
  "el": el,
  "es": es,
  "fi": fi,
  "fr": fr,
  "he": he,
  "hi": hi,
  "hr": hr,
  "hu": hu,
  "id": id,
  "it": it,
  "ja": ja,
  "ko": ko,
  "lt": lt,
  "ms": ms,
  "nb": nb,
  "nl": nl,
  "pl": pl,
  "pt-BR": pt_BR,
  "pt-PT": pt_PT,
  "ro": ro,
  "ru": ru,
  "sk": sk,
  "sl": sl,
  "sv": sv,
  "th": th,
  "tr": tr,
  "ur": ur,
  "vi": vi,
  "zh-CN": zh_CN,
  "zh-TW": zh_TW,
};

const merged = new Map<string, Messages>();

/** Dictionnaire complet d'une langue (complété par l'anglais). */
export function getMessages(locale: string): Messages {
  const code = matchLocale(locale) ?? DEFAULT_LOCALE;
  let messages = merged.get(code);
  if (!messages) {
    messages = code === DEFAULT_LOCALE ? DICTIONARIES.en : mergeMessages(DICTIONARIES.en, DICTIONARIES[code]);
    merged.set(code, messages);
  }
  return messages;
}

/** Sous-ensemble du dictionnaire (ex. seulement l'admin, ou seulement le widget). */
export function pickMessages(locale: string, sections: string[]): Messages {
  const all = getMessages(locale);
  return Object.fromEntries(sections.filter((s) => s in all).map((s) => [s, all[s]]));
}

export function getT(locale: string): TFunction {
  const code = matchLocale(locale) ?? DEFAULT_LOCALE;
  return createTranslator(getMessages(code), code);
}

/**
 * Langue de l'administrateur : Shopify ajoute « ?locale= » au chargement de l'app ;
 * à défaut on utilise la langue du navigateur.
 */
export function localeFromRequest(request: Request): Locale {
  const url = new URL(request.url);
  return (
    matchLocale(url.searchParams.get("locale")) ??
    matchAcceptLanguage(request.headers.get("accept-language")) ??
    DEFAULT_LOCALE
  );
}

/** Langue des pages publiques : « ?lang= », sinon la langue du navigateur. */
export function publicLocale(request: Request): Locale {
  const url = new URL(request.url);
  return (
    matchLocale(url.searchParams.get("lang")) ??
    matchAcceptLanguage(request.headers.get("accept-language")) ??
    DEFAULT_LOCALE
  );
}
