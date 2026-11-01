// Contenu du guide et de la FAQ pour une langue, avec les prix et quotas réels des formules.
// Utilisé par l'appli (onglet Aide, /guide, /faq) et par la génération du site statique.

import { dictionary, faqFor, guideFor } from './i18n/index.js';
import { PLANS, BILLING_CURRENCY } from './plans.js';

export function docVars(lang, supportEmail = '') {
  const usd = (n) => new Intl.NumberFormat(dictionary(lang).intl, { style: 'currency', currency: BILLING_CURRENCY }).format(n);
  return {
    freeLimit: PLANS.free.monthlyLimit,
    essentielPrice: usd(PLANS.essentiel.price),
    essentielLimit: PLANS.essentiel.monthlyLimit,
    illimitePrice: usd(PLANS.illimite.price),
    trialDays: PLANS.essentiel.trialDays,
    ...(supportEmail ? { support: supportEmail } : {}),
  };
}

export const guideContent = (lang, supportEmail) => guideFor(lang, docVars(lang, supportEmail));

/** FAQ ; sans adresse de support, la question « Comment contacter le support ? » est retirée. */
export function faqContent(lang, supportEmail) {
  const sections = faqFor(lang, docVars(lang, supportEmail));
  if (supportEmail) return sections;
  return sections.map((sec) => ({ ...sec, items: sec.items.filter((item) => !item.a.includes('{support}')) }));
}
