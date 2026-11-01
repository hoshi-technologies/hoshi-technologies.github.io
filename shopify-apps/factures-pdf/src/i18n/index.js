// Traductions : facture PDF, e-mails, page publique et interface d'administration.
// Langues : les principaux marchés Shopify en alphabet latin. Le japonais et le chinois
// demanderaient d'embarquer une police CJK (plus de 10 Mo) dans chaque PDF.

import fr from './fr.js';
import en from './en.js';
import de from './de.js';
import es from './es.js';
import it from './it.js';
import nl from './nl.js';
import ptBR from './pt-BR.js';

export const DICTIONARIES = { fr, en, de, es, it, nl, 'pt-BR': ptBR };
export const LANGUAGES = Object.entries(DICTIONARIES).map(([code, d]) => ({ code, name: d.name }));
export const DEFAULT_LANGUAGE = 'fr';

/** « en-US », « pt-PT », « de » … → code pris en charge, ou null. */
export function matchLanguage(locale) {
  if (!locale) return null;
  const value = String(locale).replace('_', '-');
  const exact = Object.keys(DICTIONARIES).find((code) => code.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const base = value.split('-')[0].toLowerCase();
  if (base === 'pt') return 'pt-BR';
  return DICTIONARIES[base] ? base : null;
}

export const resolveLanguage = (locale, fallback = DEFAULT_LANGUAGE) =>
  matchLanguage(locale) ?? matchLanguage(fallback) ?? DEFAULT_LANGUAGE;

export const dictionary = (code) => DICTIONARIES[code] ?? DICTIONARIES[DEFAULT_LANGUAGE];

/** Remplace les {variables} d'un libellé. */
export const format = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/** Langue d'une facture selon les réglages (« auto » = langue du client). */
export function invoiceLanguage(settings, customerLocale) {
  if (settings.invoiceLanguage && settings.invoiceLanguage !== 'auto') return resolveLanguage(settings.invoiceLanguage);
  return resolveLanguage(customerLocale, settings.fallbackLanguage);
}
