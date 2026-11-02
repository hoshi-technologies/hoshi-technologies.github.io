import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { DICTIONARIES, LANGUAGES, matchLanguage, invoiceLanguage } from '../src/i18n/index.js';
import { buildInvoice } from '../src/invoice.js';
import { buildFacturxXml, facturxIssues } from '../src/facturx.js';
import { InvoiceService } from '../src/service.js';
import { buildInvoiceEmail } from '../src/mailer.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings.js';

const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const SELLER = { ...DEFAULT_SETTINGS, companyName: 'Atelier', address: '8 place Bellecour\n69002 Lyon', siret: '12345678900012', vatNumber: 'FR12 123456789' };

function keysOf(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

/** Contenu du fichier factur-x.xml embarqué dans un PDF pdfkit (flux FlateDecode). */
function embeddedXml(pdf) {
  const text = pdf.toString('latin1');
  const index = text.indexOf('/Type /EmbeddedFile');
  const start = text.indexOf('stream', index) + 'stream'.length;
  const body = pdf.subarray(start + (text[start] === '\r' ? 2 : 1), text.indexOf('endstream', start));
  try {
    return inflateSync(body).toString('utf8');
  } catch {
    return body.toString('utf8');
  }
}

test('chaque langue a exactement les mêmes clés que le français', () => {
  const reference = keysOf(DICTIONARIES.fr).sort();
  for (const { code } of LANGUAGES) {
    assert.deepEqual(keysOf(DICTIONARIES[code]).sort(), reference, `clés différentes en ${code}`);
  }
  assert.equal(LANGUAGES.length, 7);
});

test('langue de la facture : client, repli et choix forcé', () => {
  assert.equal(matchLanguage('en-US'), 'en');
  assert.equal(matchLanguage('pt-PT'), 'pt-BR');
  assert.equal(matchLanguage('ja'), null);
  const settings = sanitizeSettings({ fallbackLanguage: 'de' });
  assert.equal(invoiceLanguage(settings, 'es-ES'), 'es');
  assert.equal(invoiceLanguage(settings, 'ja-JP'), 'de', 'langue non prise en charge : repli');
  assert.equal(invoiceLanguage({ ...settings, invoiceLanguage: 'it' }, 'es'), 'it');
});

test('e-mail traduit, avec texte par défaut et variables françaises historiques', () => {
  const invoice = { language: 'de', number: 'F-1', order_name: '#1', customer_first_name: '', customer_name: '', customer_email: 'k@x.de', pdf: Buffer.from('%PDF') };
  const mail = buildInvoiceEmail({ invoice, settings: SELLER, shopName: 'x', from: 'f@x.fr' });
  assert.equal(mail.subject, 'Ihre Rechnung F-1 – Bestellung #1');
  assert.match(mail.text, /^Hallo,/);
  assert.equal(mail.attachments[0].filename, 'Rechnung-F-1.pdf');
  const custom = buildInvoiceEmail({ invoice: { ...invoice, customer_first_name: 'Jo' }, settings: { ...SELLER, emailSubject: '{{prenom}} / {{numero_facture}}' }, shopName: 'x', from: 'f@x.fr' });
  assert.equal(custom.subject, 'Jo / F-1');
});

test('TVA par taux : base × taux arrondi (EN 16931 BR-CO-17), TTC client inchangé', () => {
  const item = (price, qty, tax, disc = '0.00') => ({ title: 'A', quantity: qty, price, discount_allocations: [{ amount: disc }], tax_lines: [{ rate: 0.2, price: tax }] });
  // Shopify arrondit par ligne : 3 × 1,66 = 4,98 alors que 24,95 HT × 20 % = 4,99.
  const inv = buildInvoice({ id: 1, currency: 'EUR', taxes_included: true, total_price: '29.94', line_items: [item('9.98', 1, '1.66'), item('9.98', 1, '1.66'), item('9.98', 1, '1.66')] });
  assert.equal(inv.totalTtcCents, 2994);
  for (const v of inv.vat) assert.equal(v.taxCents, Math.round(v.baseCents * v.rate));
  assert.equal(inv.lines.reduce((s, l) => s + l.totalHtCents, 0), inv.totalHtCents);
  for (const l of inv.lines) assert.equal(l.unitHtCents * l.quantity - l.discountHtCents, l.totalHtCents);
});

test('Factur-X : informations manquantes signalées', () => {
  assert.deepEqual(facturxIssues(DEFAULT_SETTINGS), ['companyName', 'address', 'vatNumber', 'email']);
  assert.deepEqual(facturxIssues({ ...SELLER, vatNumber: '', vatExempt: true }), []);
  assert.deepEqual(facturxIssues({ ...SELLER, vatNumber: '', siret: '', vatExempt: true }), ['siret', 'email']);
  assert.deepEqual(facturxIssues({ ...SELLER, email: 'a@b.fr', siret: '', vatExempt: false }), []);
  assert.deepEqual(facturxIssues(SELLER), []);
});

test('Factur-X : XML EN 16931 cohérent avec la facture', () => {
  const invoice = buildInvoice(ORDER);
  const xml = buildFacturxXml(invoice, { number: 'F-2026-00001', issuedAt: '2026-11-01T10:00:00Z', settings: { ...SELLER, companyName: 'A & B' }, shopName: 'x' });
  assert.match(xml, /<ram:ID>urn:cen.eu:en16931:2017<\/ram:ID>/);
  assert.match(xml, /<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>B2<\/ram:ID>/, 'biens, déjà payée');
  assert.match(xml, /<ram:Name>A &amp; B<\/ram:Name>/, 'caractères spéciaux échappés');
  assert.match(xml, /<ram:ID schemeID="0002">123456789<\/ram:ID>/, 'SIREN du vendeur');
  assert.match(xml, /<ram:ID schemeID="VA">FR12123456789<\/ram:ID>/);
  assert.match(xml, /<ram:GrandTotalAmount>75.50<\/ram:GrandTotalAmount>/);
  assert.match(xml, /<ram:TaxBasisTotalAmount>64.91<\/ram:TaxBasisTotalAmount>/);
  assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">10.59<\/ram:TaxTotalAmount>/);
  assert.match(xml, /<ram:DuePayableAmount>0.00<\/ram:DuePayableAmount>/);
  assert.equal((xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g) || []).length, 3);
  assert.match(xml, /<ram:RateApplicablePercent>5.5<\/ram:RateApplicablePercent>/);
  // Somme des lignes = total HT (BR-CO-10).
  const lineTotals = [...xml.matchAll(/<ram:LineTotalAmount>([\d.]+)<\/ram:LineTotalAmount>/g)].map((m) => Number(m[1]));
  assert.equal(Math.round(lineTotals.slice(0, -1).reduce((a, b) => a + b, 0) * 100), invoice.totalHtCents);

  const micro = buildFacturxXml(invoice, { number: 'F-1', issuedAt: '2026-11-01T10:00:00Z', settings: { ...SELLER, vatNumber: '', vatExempt: true }, shopName: 'x' });
  assert.match(micro, /<ram:CategoryCode>E<\/ram:CategoryCode><ram:ExemptionReasonCode>VATEX-FR-FRANCHISE<\/ram:ExemptionReasonCode>/);
  assert.match(micro, /<ram:ID schemeID="FC">12345678900012<\/ram:ID>/);
});

test('PDF/A-3 avec factur-x.xml embarqué, dans la langue demandée', async () => {
  const service = new InvoiceService({ store: null, transport: null, mailFrom: null });
  const invoice = buildInvoice(ORDER);
  const meta = { number: 'F-2026-00001', issuedAt: '2026-11-01T10:00:00Z', shopName: 'x', lang: 'it' };
  const { pdf, facturx } = await service.renderPdf(invoice, { ...meta, settings: SELLER });
  assert.equal(facturx, true);
  const text = pdf.toString('latin1');
  assert.match(text, /^%PDF-1\.7/);
  assert.match(text, /<pdfaid:part>3<\/pdfaid:part>/);
  assert.match(text, /<fx:ConformanceLevel>EN 16931<\/fx:ConformanceLevel>/);
  assert.match(text, /\/AFRelationship \/Alternative/);
  assert.match(text, /Fattura F-2026-00001/, 'titre traduit');
  assert.match(embeddedXml(pdf), /<rsm:CrossIndustryInvoice/);

  const off = await service.renderPdf(invoice, { ...meta, settings: { ...SELLER, facturx: false } });
  assert.equal(off.facturx, false);
  assert.doesNotMatch(off.pdf.toString('latin1'), /factur-x\.xml/);
  const incomplete = await service.renderPdf(invoice, { ...meta, settings: { ...SELLER, vatNumber: '' } });
  assert.equal(incomplete.facturx, false, 'informations légales incomplètes : PDF simple');
});

test('FAQ : même structure dans les 7 langues, variables remplies', async () => {
  const { FAQS, faqFor } = await import('../src/i18n/index.js');
  const shape = (faq) => faq.map((s) => s.items.length);
  for (const { code } of LANGUAGES) {
    assert.deepEqual(shape(FAQS[code]), shape(FAQS.fr), `FAQ différente en ${code}`);
    for (const section of faqFor(code, { freeLimit: 10, essentielPrice: '7,90 $', essentielLimit: 200, illimitePrice: '12,90 $', trialDays: 7, support: 's@x.fr' })) {
      for (const { q, a } of section.items) assert.doesNotMatch(q + a, /\{\w+\}/, `variable non remplie en ${code} : ${q}`);
    }
  }
  assert.ok(FAQS.fr.flatMap((s) => s.items).length >= 20);
});

test('guide utilisateur : mêmes chapitres, étapes et conseils dans les 7 langues', async () => {
  const { GUIDES, guideFor } = await import('../src/i18n/index.js');
  const shape = (g) => g.map((c) => `${c.id}:${c.steps.length}:${c.tips.length}`);
  for (const { code } of LANGUAGES) {
    assert.deepEqual(shape(GUIDES[code]), shape(GUIDES.fr), `guide différent en ${code}`);
    for (const c of guideFor(code, { freeLimit: 10, essentielPrice: '7,90 $', essentielLimit: 200, illimitePrice: '12,90 $', trialDays: 7 })) {
      // Les {{variables}} d'e-mail sont du contenu ; seules les {variables} simples doivent être remplies.
      assert.doesNotMatch([c.title, c.intro, ...c.steps, ...c.tips].join(' ').replace(/\{\{\w+\}\}/g, ''), /\{\w+\}/, `${code} / ${c.id}`);
    }
  }
  assert.equal(GUIDES.fr.length, 10);
});
