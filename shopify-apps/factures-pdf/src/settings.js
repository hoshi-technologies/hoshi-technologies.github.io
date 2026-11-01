// Réglages par boutique, modifiables depuis l'administration de l'appli.

export const DEFAULT_SETTINGS = {
  // Déclencheur : "paid" = à la commande payée (recommandé), "create" = dès la création.
  trigger: 'paid',
  autoSend: true,
  // Copie cachée au marchand : il garde ainsi ses propres archives (conservation 10 ans).
  bccMerchant: true,
  numberPrefix: 'F-',

  companyName: '',
  legalForm: '', // ex. « SAS au capital de 10 000 € »
  address: '', // plusieurs lignes
  siret: '',
  rcs: '', // ex. « RCS Paris 123 456 789 »
  vatNumber: '', // ex. FR12 123456789
  vatExempt: false, // micro-entreprise : « TVA non applicable, art. 293 B du CGI »
  email: '',
  phone: '',
  website: '',
  logoUrl: '',
  accentColor: '#1f2937',
  legalNotice:
    'En cas de retard de paiement (clients professionnels) : pénalités au taux ' +
    "de trois fois le taux d'intérêt légal et indemnité forfaitaire pour frais de recouvrement de 40 €. " +
    "Pas d'escompte pour paiement anticipé.",
  footerNote: 'Merci pour votre commande !',

  emailSubject: 'Votre facture {{numero_facture}} – commande {{commande}}',
  emailBody:
    'Bonjour {{prenom}},\n\nMerci pour votre commande {{commande}} chez {{boutique}}.\n' +
    'Vous trouverez votre facture {{numero_facture}} en pièce jointe.\n\nÀ bientôt,\n{{boutique}}',
};

const STRING_FIELDS = Object.entries(DEFAULT_SETTINGS)
  .filter(([, v]) => typeof v === 'string')
  .map(([k]) => k);
const BOOLEAN_FIELDS = ['autoSend', 'bccMerchant', 'vatExempt'];

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
  return out;
}

/** Remplace les {{variables}} d'un modèle d'e-mail. */
export function fillTemplate(template, vars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => vars[name] ?? '');
}
