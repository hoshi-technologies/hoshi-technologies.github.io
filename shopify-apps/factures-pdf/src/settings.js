// Réglages par boutique, modifiables depuis l'administration de l'appli.

import { LANGUAGES, matchLanguage } from './i18n/index.js';

export const DEFAULT_SETTINGS = {
  // Déclencheur : "paid" = à la commande payée (recommandé), "create" = dès la création.
  trigger: 'paid',
  autoSend: true,
  // Copie cachée au marchand : il garde ainsi ses propres archives (conservation 10 ans).
  bccMerchant: true,
  numberPrefix: 'F-',
  // Langue des factures et e-mails : "auto" = langue du client, sinon un code (fr, en…).
  invoiceLanguage: 'auto',
  fallbackLanguage: 'fr',
  // Factur-X (PDF/A-3 + XML EN 16931), produit dès que les informations légales sont complètes.
  facturx: true,

  companyName: '',
  legalForm: '', // ex. « SAS au capital de 10 000 € »
  address: '', // plusieurs lignes, code postal et ville sur la même ligne
  countryCode: 'FR', // ISO 3166-1 alpha-2
  supplyType: 'goods', // goods | services | mixed (cadre de facturation Factur-X)
  siret: '',
  rcs: '', // ex. « RCS Paris 123 456 789 »
  vatNumber: '', // ex. FR12 123456789
  vatExempt: false, // micro-entreprise : « TVA non applicable, art. 293 B du CGI »
  email: '',
  phone: '',
  website: '',
  timezone: '', // fuseau de la boutique (renseigné à l'installation)
  logoUrl: '',
  accentColor: '#1f2937',
  // Textes personnalisés ; vides = texte par défaut traduit dans la langue de la facture.
  legalNotice: '',
  footerNote: '',
  emailSubject: '',
  emailBody: '',
};

const STRING_FIELDS = Object.entries(DEFAULT_SETTINGS)
  .filter(([, v]) => typeof v === 'string')
  .map(([k]) => k);
const BOOLEAN_FIELDS = ['autoSend', 'bccMerchant', 'vatExempt', 'facturx'];
const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Ne garde que les champs connus, avec le bon type et une longueur raisonnable. */
export function sanitizeSettings(input, current = DEFAULT_SETTINGS) {
  const out = { ...DEFAULT_SETTINGS, ...current };
  for (const key of STRING_FIELDS) {
    if (typeof input[key] === 'string') out[key] = input[key].slice(0, 2000).trim();
  }
  for (const key of BOOLEAN_FIELDS) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  if (!['paid', 'create'].includes(out.trigger)) out.trigger = 'paid';
  if (!/^#[0-9a-f]{6}$/i.test(out.accentColor)) out.accentColor = DEFAULT_SETTINGS.accentColor;
  if (out.logoUrl && !/^https:\/\//.test(out.logoUrl)) out.logoUrl = '';
  out.numberPrefix = out.numberPrefix.replace(/[^A-Za-z0-9_\-/]/g, '').slice(0, 12);
  if (out.invoiceLanguage !== 'auto') out.invoiceLanguage = matchLanguage(out.invoiceLanguage) ?? 'auto';
  if (!LANGUAGE_CODES.includes(out.fallbackLanguage)) out.fallbackLanguage = matchLanguage(out.fallbackLanguage) ?? 'fr';
  if (!['goods', 'services', 'mixed'].includes(out.supplyType)) out.supplyType = 'goods';
  out.countryCode = out.countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(out.countryCode)) out.countryCode = DEFAULT_SETTINGS.countryCode;
  if (out.timezone && !validTimezone(out.timezone)) out.timezone = '';
  return out;
}

// Les anciens noms français restent acceptés dans les modèles d'e-mail.
const ALIASES = { prenom: 'first_name', nom: 'name', numero_facture: 'invoice_number', commande: 'order', boutique: 'shop' };

/** Remplace les {{variables}} d'un modèle d'e-mail. */
export function fillTemplate(template, vars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => vars[ALIASES[name] ?? name] ?? '');
}
