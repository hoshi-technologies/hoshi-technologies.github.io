// Génère un exemple de facture : `npm run preview` → ./apercu-facture.pdf
import { readFileSync, writeFileSync } from 'node:fs';
import { buildInvoice } from '../src/invoice.js';
import { renderInvoicePdf } from '../src/pdf.js';
import { DEFAULT_SETTINGS } from '../src/settings.js';

const order = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const settings = {
  ...DEFAULT_SETTINGS,
  companyName: 'Atelier Exemple',
  legalForm: 'SAS au capital de 5 000 €',
  address: '8 place Bellecour\n69002 Lyon\nFrance',
  siret: '123 456 789 00012',
  rcs: 'RCS Lyon 123 456 789',
  vatNumber: 'FR12 123456789',
  email: 'contact@atelier-exemple.fr',
  website: 'atelier-exemple.fr',
};
const pdf = await renderInvoicePdf(buildInvoice(order), {
  number: 'F-2026-00042',
  issuedAt: '2026-10-28T14:13:00+01:00',
  settings,
  shopName: 'atelier-exemple',
});
const out = process.argv[2] || 'apercu-facture.pdf';
writeFileSync(out, pdf);
console.log(`Aperçu écrit dans ${out}`);
