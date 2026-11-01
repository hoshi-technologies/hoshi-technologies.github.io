// Génère un exemple de facture Factur-X : `npm run preview -- [fichier.pdf] [langue]`
import { readFileSync, writeFileSync } from 'node:fs';
import { buildInvoice } from '../src/invoice.js';
import { InvoiceService } from '../src/service.js';
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
const [out = 'apercu-facture.pdf', lang = 'fr'] = process.argv.slice(2);
const service = new InvoiceService({ store: null, transport: null, mailFrom: null });
const { pdf, facturx } = await service.renderPdf(buildInvoice(order), {
  number: 'F-2026-00042',
  issuedAt: '2026-10-28T14:13:00+01:00',
  settings,
  shopName: 'atelier-exemple',
  lang,
});
writeFileSync(out, pdf);
console.log(`Aperçu écrit dans ${out} (${lang}${facturx ? ', Factur-X' : ''})`);
