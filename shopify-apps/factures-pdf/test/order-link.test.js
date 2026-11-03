import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openDatabase } from '../src/db-node.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/node-app.js';
import { signSessionToken } from '../src/shopify.js';
import { nodeSql } from '../src/sql.js';
import { createStore } from '../src/db.js';
import { resolveKey, generateKey } from '../src/crypto.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../src/settings.js';

const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const SHOP = 'boutique-exemple.myshopify.com';
const quiet = { info() {}, warn() {}, error() {} };
const config = { apiKey: 'k', apiSecret: 's', apiVersion: '2026-10', appUrl: 'https://factures.example' };
const settle = () => new Promise((r) => setTimeout(r, 30));

async function setup({ refuse = false } = {}) {
  const store = openDatabase(':memory:');
  const sets = [];
  const fakeShopify = async (url, options) => {
    if (url.endsWith('/admin/oauth/access_token')) return Response.json({ access_token: 'shpat_x', scope: 'write_orders' });
    const { query, variables } = JSON.parse(options.body);
    if (query.includes('metafieldsSet')) {
      if (refuse) return Response.json({ data: { metafieldsSet: { metafields: [], userErrors: [{ field: ['metafields'], message: 'Access denied' }] } } });
      sets.push(...variables.metafields);
      return Response.json({ data: { metafieldsSet: { metafields: variables.metafields.map((_, i) => ({ id: `gid://shopify/Metafield/${i}` })), userErrors: [] } } });
    }
    return Response.json({ data: { shop: { name: 'A', billingAddress: {} }, currentAppInstallation: { activeSubscriptions: [] } } });
  };
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet, defer: (p) => p });
  const server = await new Promise((r) => { const s = createApp({ config, store, service, logger: quiet, fetchImpl: fakeShopify }).listen(0, () => r(s)); });
  const now = Math.floor(Date.now() / 1000);
  const headers = { Authorization: `Bearer ${signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: 'k', exp: now + 60, nbf: now - 1 }, 's')}` };
  const session = () => fetch(`http://127.0.0.1:${server.address().port}/api/session`, { method: 'POST', headers });
  return { store, service, sets, session, close: () => server.close() };
}

test('lien de la facture enregistré sur la commande Shopify dès sa création', async () => {
  const ctx = await setup();
  try {
    await ctx.session(); // jeton d'accès
    await ctx.service.createInvoice(SHOP, ORDER);
    await settle();
    assert.deepEqual(ctx.sets, [
      { ownerId: `gid://shopify/Order/${ORDER.id}`, namespace: '$app', key: 'invoice_url', type: 'url', value: `https://factures.example/f/${ORDER.token}.pdf` },
    ]);
    assert.equal(ctx.store.listUnpublishedLinks(SHOP).length, 0);
  } finally {
    ctx.close();
  }
});

test('liens en attente (droit pas encore accordé) : enregistrés à l’ouverture suivante de l’admin', async () => {
  const refused = await setup({ refuse: true });
  try {
    await refused.session();
    await refused.service.createInvoice(SHOP, ORDER);
    await refused.service.createInvoice(SHOP, { ...ORDER, id: 999, name: '#999', order_status_url: 'https://x/1/orders/autrejeton0000000000/authenticate' });
    await settle();
    assert.equal(refused.store.listUnpublishedLinks(SHOP).length, 2, 'refus : rien de marqué comme publié');
  } finally {
    refused.close();
  }
  // Shopify accepte désormais : rattrapage à l'ouverture de l'admin.
  const ctx = await setup();
  try {
    await ctx.session();
    await ctx.service.createInvoice(SHOP, ORDER);
    await settle();
    ctx.store.sql.run('UPDATE invoices SET link_published = 0');
    ctx.sets.length = 0;
    await ctx.session();
    assert.deepEqual(ctx.sets.map((m) => m.value), [`https://factures.example/f/${ORDER.token}.pdf`]);
    assert.equal(ctx.store.listUnpublishedLinks(SHOP).length, 0);
  } finally {
    ctx.close();
  }
});

test('remise de la facture : trois modes, seul « email » envoie un e-mail', () => {
  assert.deepEqual(['email', 'page', 'link'].map((d) => sanitizeSettings({ delivery: d }).autoSend), [true, false, false]);
  assert.equal(sanitizeSettings({ delivery: 'nimporte' }).delivery, 'email');
  // Anciens réglages (sans « delivery ») : déduits de autoSend.
  assert.equal(sanitizeSettings({ autoSend: false }).delivery, 'link');
  assert.equal(sanitizeSettings({ autoSend: false }, { ...DEFAULT_SETTINGS, delivery: 'page', autoSend: false }).delivery, 'page');
  const store = openDatabase(':memory:');
  store.ensureShop(SHOP);
  store.sql.run('UPDATE shops SET settings = ? WHERE shop = ?', JSON.stringify({ autoSend: false }), SHOP);
  assert.equal(store.getShop(SHOP).settings.delivery, 'link', 'boutique existante sans « delivery »');
});

test('base existante : colonnes ajoutées sans perte', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, shop TEXT NOT NULL, order_id TEXT NOT NULL,
    order_name TEXT, order_token TEXT, number TEXT NOT NULL, issued_at TEXT NOT NULL, customer_email TEXT,
    customer_name TEXT, customer_first_name TEXT, total_cents INTEGER NOT NULL, currency TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'fr', facturx INTEGER NOT NULL DEFAULT 0, pdf BLOB NOT NULL,
    email_status TEXT NOT NULL DEFAULT 'pending', email_error TEXT, email_sent_at TEXT,
    UNIQUE (shop, order_id), UNIQUE (shop, number));
    INSERT INTO invoices (shop, order_id, order_token, number, issued_at, total_cents, currency, pdf) VALUES ('s', '1', 'tok', 'F-1', 'x', 1, 'EUR', x'00');`);
  const key = resolveKey({ key: generateKey() });
  const store = createStore(nodeSql(db), key);
  assert.deepEqual(store.listUnpublishedLinks('s').map((i) => i.order_token), ['tok'], 'ancienne facture à publier');
  createStore(nodeSql(db), key); // second démarrage : rien à refaire
});
