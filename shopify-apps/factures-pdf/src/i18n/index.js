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
import faqFr from './faq/fr.js';
import faqEn from './faq/en.js';
import faqDe from './faq/de.js';
import faqEs from './faq/es.js';
import faqIt from './faq/it.js';
import faqNl from './faq/nl.js';
import faqPtBR from './faq/pt-BR.js';
import guideFr from './guide/fr.js';
import guideEn from './guide/en.js';
import guideDe from './guide/de.js';
import guideEs from './guide/es.js';
import guideIt from './guide/it.js';
import guideNl from './guide/nl.js';
import guidePtBR from './guide/pt-BR.js';

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

// ---------- FAQ ----------
export const FAQS = { fr: faqFr, en: faqEn, de: faqDe, es: faqEs, it: faqIt, nl: faqNl, 'pt-BR': faqPtBR };

/** FAQ d'une langue, avec prix, limites et adresse du support à jour. */
export function faqFor(code, vars) {
  const sections = FAQS[code] ?? FAQS[DEFAULT_LANGUAGE];
  return sections.map((section) => ({
    title: section.title,
    items: section.items.map(([q, a]) => ({ q: format(q, vars), a: format(a, vars) })),
  }));
}

// ---------- Guide utilisateur ----------
export const GUIDES = { fr: guideFr, en: guideEn, de: guideDe, es: guideEs, it: guideIt, nl: guideNl, 'pt-BR': guidePtBR };

/** Guide d'une langue, avec prix et quotas à jour. */
export function guideFor(code, vars) {
  const chapters = GUIDES[code] ?? GUIDES[DEFAULT_LANGUAGE];
  const f = (text) => format(text, vars);
  return chapters.map((c) => ({ id: c.id, title: f(c.title), intro: f(c.intro), steps: c.steps.map(f), tips: c.tips.map(f) }));
}
