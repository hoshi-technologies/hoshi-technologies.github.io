import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../src/db.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/server.js';
import { createTransport } from '../src/mailer.js';
import { buildInvoice, formatInvoiceNumber } from '../src/invoice.js';
import { signSessionToken, verifySessionToken, verifyWebhook } from '../src/shopify.js';
import { sanitizeSettings } from '../src/settings.js';

const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const SHOP = 'boutique-exemple.myshopify.com';
const config = { apiKey: 'cle-api', apiSecret: 'secret-api', apiVersion: '2026-10', appUrl: 'https://factures.exemple.fr' };
const quiet = { info() {}, warn() {}, error() {} };

function sessionToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signSessionToken(
    { iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: config.apiKey, sub: '1', exp: now + 60, nbf: now - 1, iat: now, ...overrides },
    config.apiSecret,
  );
}

async function setup(fetchImpl) {
  const store = openDatabase(':memory:');
  const sent = [];
  const json = createTransport('json');
  const transport = { sendMail: async (m) => { sent.push({ ...m, attachments: m.attachments.map((a) => ({ ...a })) }); return json.sendMail(m); } };
  const service = new InvoiceService({ store, transport, mailFrom: 'factures@exemple.fr', logger: quiet, fetchImpl });
  const app = createApp({ config, store, service, logger: quiet, fetchImpl });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, service, sent, base, close: () => server.close() };
}

function webhook(base, topic, payload, secret = config.apiSecret) {
  const body = JSON.stringify(payload);
  return fetch(`${base}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': SHOP,
      'X-Shopify-Hmac-Sha256': createHmac('sha256', secret).update(body).digest('base64'),
    },
    body,
  });
}

const settle = () => new Promise((r) => setTimeout(r, 50));

test('calcul HT / TVA / TTC à partir d’une commande TTC', () => {
  const inv = buildInvoice(ORDER);
  assert.equal(inv.lines.length, 3, 'article à quantité 0 exclu, livraison incluse');
  assert.equal(inv.totalTtcCents, 7550);
  assert.equal(inv.totalTaxCents, 1059);
  assert.equal(inv.totalHtCents, 6491);
  assert.equal(inv.mismatchCents, 0);
  assert.deepEqual(inv.vat.map((v) => [v.rate, v.baseCents, v.taxCents]), [[0.055, 1649, 91], [0.2, 4842, 968]]);
  for (const l of inv.lines) assert.equal(l.unitHtCents * l.quantity - l.discountHtCents, l.totalHtCents);
  assert.equal(inv.orderToken, 'b1946ac92492d2347c6235b4d2611184');
});

test('commande en prix HT (taxes non incluses)', () => {
  const inv = buildInvoice({
    id: 1, name: '#1', currency: 'EUR', taxes_included: false, total_price: '120.00',
    line_items: [{ title: 'Service', quantity: 1, price: '100.00', discount_allocations: [], tax_lines: [{ rate: 0.2, price: '20.00' }] }],
  });
  assert.equal(inv.totalHtCents, 10000);
  assert.equal(inv.totalTtcCents, 12000);
  assert.equal(inv.mismatchCents, 0);
});

test('numéro de facture', () => {
  assert.equal(formatInvoiceNumber('F-', 42, new Date('2026-03-01')), 'F-2026-00042');
});

test('réglages : champs inconnus ignorés, valeurs dangereuses neutralisées', () => {
  const s = sanitizeSettings({ companyName: ' ACME ', logoUrl: 'javascript:alert(1)', accentColor: 'red', trigger: 'x', hack: 1, autoSend: 'oui' });
  assert.equal(s.companyName, 'ACME');
  assert.equal(s.logoUrl, '');
  assert.equal(s.accentColor, '#1f2937');
  assert.equal(s.trigger, 'paid');
  assert.equal(s.autoSend, true);
  assert.equal('hack' in s, false);
});

test('jeton de session : valide, expiré, mauvaise signature, mauvaise appli', () => {
  assert.equal(verifySessionToken(sessionToken(), config).shop, SHOP);
  assert.throws(() => verifySessionToken(sessionToken({ exp: 1 }), config), /expiré/);
  assert.throws(() => verifySessionToken(sessionToken({ aud: 'autre' }), config), /autre appli/);
  assert.throws(() => verifySessionToken(sessionToken().slice(0, -2) + 'xx', config), /Signature/);
  assert.equal(verifyWebhook(Buffer.from('{}'), 'faux', config.apiSecret), false);
});

test('webhook orders/paid : facture créée une seule fois, PDF valide, e-mail avec pièce jointe', async () => {
  const ctx = await setup();
  try {
    ctx.store.saveSettings(SHOP, sanitizeSettings({ companyName: 'Atelier Exemple', email: 'contact@atelier.fr' }));

    assert.equal((await webhook(ctx.base, 'orders/create', ORDER)).status, 200);
    assert.equal(ctx.store.listInvoices(SHOP).length, 0, 'déclencheur par défaut : paiement');

    assert.equal((await webhook(ctx.base, 'orders/paid', ORDER)).status, 200);
    assert.equal((await webhook(ctx.base, 'orders/paid', ORDER)).status, 200, 'webhook rejoué');
    await settle();

    const list = ctx.store.listInvoices(SHOP);
    assert.equal(list.length, 1);
    const inv = list[0];
    assert.match(inv.number, /^F-\d{4}-00001$/);
    assert.equal(inv.total_cents, 7550);
    assert.equal(inv.email_status, 'sent');

    assert.equal(ctx.sent.length, 1);
    const mail = ctx.sent[0];
    assert.equal(mail.to, 'marie.dupont@example.com');
    assert.equal(mail.bcc, 'contact@atelier.fr');
    assert.match(mail.subject, /Votre facture F-\d{4}-00001 – commande #1042/);
    assert.match(mail.text, /^Bonjour Marie,/);
    assert.equal(mail.attachments[0].contentType, 'application/pdf');
    assert.equal(mail.attachments[0].content.subarray(0, 5).toString(), '%PDF-');

    // Lien public par jeton de commande.
    const res = await fetch(`${ctx.base}/f/${ORDER.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal((await fetch(`${ctx.base}/f/inconnu0000000000000`)).status, 404);

    // Deuxième commande : numéro suivant.
    await webhook(ctx.base, 'orders/paid', { ...ORDER, id: 999, token: 'c'.repeat(32), order_status_url: null });
    await settle();
    assert.deepEqual(ctx.store.listInvoices(SHOP).map((i) => i.number.slice(-5)), ['00002', '00001']);
  } finally {
    ctx.close();
  }
});

test('webhook à signature invalide refusé', async () => {
  const ctx = await setup();
  try {
    assert.equal((await webhook(ctx.base, 'orders/paid', ORDER, 'mauvais')).status, 401);
    assert.equal(ctx.store.listInvoices(SHOP).length, 0);
  } finally {
    ctx.close();
  }
});

test('API admin : authentification, réglages, numérotation croissante, RGPD', async () => {
  const shopifyCalls = [];
  const fakeShopify = async (url, options) => {
    shopifyCalls.push(url);
    if (url.endsWith('/admin/oauth/access_token')) {
      const body = JSON.parse(options.body);
      assert.equal(body.grant_type, 'urn:ietf:params:oauth:grant-type:token-exchange');
      return Response.json({ access_token: 'shpat_test', scope: 'read_orders' });
    }
    return Response.json({ data: { shop: { name: 'Atelier', email: 'a@b.fr', contactEmail: 'contact@atelier.fr', url: 'https://atelier.fr', billingAddress: { address1: '1 rue A', zip: '75001', city: 'Paris', country: 'France' } } } });
  };
  const ctx = await setup(fakeShopify);
  const auth = { Authorization: `Bearer ${sessionToken()}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${ctx.base}/api/settings`)).status, 401);

    const session = await (await fetch(`${ctx.base}/api/session`, { method: 'POST', headers: auth })).json();
    assert.equal(session.shop, SHOP);
    assert.equal(ctx.store.getShop(SHOP).access_token, 'shpat_test');

    const { settings, nextNumber } = await (await fetch(`${ctx.base}/api/settings`, { headers: auth })).json();
    assert.equal(settings.companyName, 'Atelier');
    assert.equal(settings.address, '1 rue A\n75001 Paris\nFrance');
    assert.equal(nextNumber, 1);

    let res = await fetch(`${ctx.base}/api/settings`, { method: 'PUT', headers: auth, body: JSON.stringify({ settings: { siret: '123' }, nextNumber: 100 }) });
    assert.equal((await res.json()).nextNumber, 100);
    res = await fetch(`${ctx.base}/api/settings`, { method: 'PUT', headers: auth, body: JSON.stringify({ settings: {}, nextNumber: 5 }) });
    assert.equal(res.status, 400, 'le compteur ne recule pas');

    res = await fetch(`${ctx.base}/api/preview`, { method: 'POST', headers: auth, body: JSON.stringify({ settings: { vatExempt: true } }) });
    assert.equal(res.headers.get('content-type'), 'application/pdf');

    await webhook(ctx.base, 'orders/paid', ORDER);
    await settle();
    const { invoices } = await (await fetch(`${ctx.base}/api/invoices`, { headers: auth })).json();
    assert.equal(invoices[0].number.slice(-5), '00100');
    res = await fetch(`${ctx.base}/api/invoices/${invoices[0].id}/pdf`, { headers: auth });
    assert.equal(res.status, 200);

    await webhook(ctx.base, 'customers/redact', { orders_to_redact: [ORDER.id] });
    assert.equal(ctx.store.listInvoices(SHOP).length, 0);
    await webhook(ctx.base, 'shop/redact', { shop_domain: SHOP });
    assert.equal(ctx.store.getShop(SHOP), null);
  } finally {
    ctx.close();
  }
});

test('le PDF contient les mentions attendues', async (t) => {
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); } catch { return t.skip('pdftotext absent'); }
  const dir = mkdtempSync(join(tmpdir(), 'facture-'));
  const file = join(dir, 'f.pdf');
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/preview.js', file]);
  const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
  for (const expected of ['FACTURE', 'F-2026-00042', 'SIRET : 123 456 789 00012', 'N° TVA : FR12 123456789', 'Marie Dupont', 'Bougie parfumée « Forêt » – Grand modèle', '5,5 %', '75,50 €', 'Total TTC', 'Livraison – Colissimo']) {
    assert.ok(text.includes(expected), `absent du PDF : ${expected}`);
  }
});

test('page d’admin servie dans la langue de l’administrateur Shopify', async () => {
  const ctx = await setup();
  try {
    const de = await (await fetch(`${ctx.base}/?shop=${SHOP}&locale=de`)).text();
    assert.match(de, /<html lang="de">/);
    assert.match(de, /"appName":"PDF-Rechnungen"/);
    const pt = await (await fetch(`${ctx.base}/?locale=pt-PT`)).text();
    assert.match(pt, /"lang":"pt-BR"/);
    const unknown = await (await fetch(`${ctx.base}/?locale=ja`)).text();
    assert.match(unknown, /"lang":"en"/);
    const notReady = await (await fetch(`${ctx.base}/f/inconnu0000000000000`, { headers: { 'Accept-Language': 'es-ES,es;q=0.9' } })).text();
    assert.match(notReady, /Su factura aún no está disponible/);
  } finally {
    ctx.close();
  }
});

test('FAQ publique : langue, prix réels, question support masquée sans adresse', async () => {
  const ctx = await setup();
  try {
    const de = await (await fetch(`${ctx.base}/faq?lang=de`)).text();
    assert.match(de, /<html lang="de">/);
    assert.match(de, /Häufige Fragen/);
    assert.match(de, /Essential \(7,90\s\$ pro Monat\)/);
    assert.doesNotMatch(de, /Wie erreiche ich den Support/, 'pas de SUPPORT_EMAIL : question retirée');
    const auto = await (await fetch(`${ctx.base}/faq`, { headers: { 'Accept-Language': 'it-IT,it;q=0.9' } })).text();
    assert.match(auto, /Domande frequenti/);
  } finally {
    ctx.close();
  }
});
