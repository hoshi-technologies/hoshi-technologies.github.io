// Formules d'abonnement. Les prix sont facturés par Shopify, en USD (devise des applis
// sur l'App Store), sur la facture Shopify du marchand.
//
// Repères concurrence (fin 2026, fiches App Store) :
//   Sufio 7 $/15 factures · 19 $/50 · 49 $/5 000   ZenFisc 9,99 $/50
//   MiniFacture gratuit 10/mois · 14 $/200          Facturio gratuit 10/mois · 14,90 $ illimité
//   FF Factures France gratuit 20/mois · 19 $ illimité   Order Printer Pro gratuit 50/mois · 10 $/500

export const PLANS = {
  free: { key: 'free', name: 'Gratuit', price: 0, monthlyLimit: 10 },
  essentiel: { key: 'essentiel', name: 'Essentiel', price: 7.9, monthlyLimit: 200, trialDays: 7 },
  illimite: { key: 'illimite', name: 'Illimité', price: 12.9, monthlyLimit: null, trialDays: 7 },
};

export const BILLING_CURRENCY = 'USD';

/** Nom de l'abonnement côté Shopify (visible sur la facture du marchand). */
export const subscriptionName = (plan) => `Factures PDF – ${plan.name}`;

export function planFromSubscriptionName(name) {
  return Object.values(PLANS).find((p) => p.price > 0 && subscriptionName(p) === name) ?? null;
}

export const getPlan = (key) => PLANS[key] ?? PLANS.free;

/** Début du mois civil en cours (UTC), au format ISO, pour le décompte du quota. */
export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export const monthKey = (now = new Date()) => monthStart(now).slice(0, 7);
