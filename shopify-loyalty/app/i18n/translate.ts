/**
 * Moteur de traduction minimal, partagé client/serveur.
 *  - clés imbriquées « section.cle »
 *  - variables « {name} »
 *  - pluriels : « cle_one », « cle_few », « cle_many », « cle_other »… choisis
 *    avec Intl.PluralRules quand le paramètre « count » est fourni.
 */
export type Messages = { [key: string]: string | Messages };
export type Params = Record<string, string | number | null | undefined>;
export type TFunction = (key: string, params?: Params) => string;

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function createTranslator(messages: Messages, locale: string): TFunction {
  let plural: Intl.PluralRules | null = null;
  return (key, params) => {
    let text: string | undefined;
    if (params && typeof params.count === "number") {
      plural ??= new Intl.PluralRules(locale);
      const category = plural.select(params.count);
      text = lookup(messages, `${key}_${category}`) ?? lookup(messages, `${key}_other`);
    }
    text ??= lookup(messages, key);
    if (text === undefined) return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      if (value === undefined || value === null) return match;
      return typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : String(value);
    });
  };
}

/** Fusion profonde : les clés manquantes d'une langue reprennent l'anglais. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? mergeMessages(b, v) : v;
  }
  return out;
}

/** Formats dépendant de la langue (nombres, montants, dates). */
export function createFormatters(locale: string, currency = "USD") {
  const number = new Intl.NumberFormat(locale);
  let money: Intl.NumberFormat;
  try {
    money = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
  } catch {
    money = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" });
  }
  return {
    number: (n: number) => number.format(n),
    money: (n: number) => money.format(n),
    date: (d: string | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(d)),
    dateTime: (d: string | Date) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d)),
  };
}
