import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openDatabase } from '../src/db-node.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/node-app.js';
import { signSessionToken, verifyCustomerToken } from '../src/shopify.js';
import { nodeSql } from '../src/sql.js';
import { createStore } from '../src/db.js';
import { resolveKey, generateKey } from '../src/crypto.js';

const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const SHOP = 'boutique-exemple.myshopify.com';
const quiet = { info() {}, warn() {}, error() {} };
const config = { apiKey: 'k', apiSecret: 's', apiVersion: '2026-10', appUrl: 'https://factures.example' };
const now = () => Math.floor(Date.now() / 1000);
// Jeton tel que fourni par shopify.sessionToken.get() dans l'espace client.
const customerToken = (claims = {}) =>
  signSessionToken({ dest: SHOP, aud: 'k', exp: now() + 60, nbf: now() - 1, iat: now(), jti: 'n', sub: 'gid://shopify/Customer/7001', ...claims }, 's');

test('jeton client : boutique et client extraits, jetons invalides refusés', () => {
  assert.deepEqual(
    (({ shop, customerId }) => ({ shop, customerId }))(verifyCustomerToken(customerToken(), config)),
    { shop: SHOP, customerId: '7001' },
  );
  assert.equal(verifyCustomerToken(customerToken({ sub: undefined }), config).customerId, null, 'client non connecté');
  assert.throws(() => verifyCustomerToken(customerToken({ aud: 'autre' }), config), /autre appli/);
  assert.throws(() => verifyCustomerToken(customerToken({ exp: now() - 120 }), config), /expiré/);
  assert.throws(() => verifyCustomerToken(customerToken({ dest: 'evil.example.com' }), config), /Boutique/);
  assert.throws(() => verifyCustomerToken(customerToken().slice(0, -2) + 'xx', config), /Signature/);
});

test('espace client : lien de la facture pour le seul client de la commande', async () => {
  const store = openDatabase(':memory:');
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet });
  // Facture plus ancienne, émise avant l'enregistrement du client : vérifiée auprès de Shopify.
  const legacyOrder = { ...ORDER, id: 999, name: '#999', order_status_url: 'https://x/1/orders/legacytoken0000000000/authenticate' };
  const shopifyCalls = [];
  const fetchImpl = async (url, init) => {
    shopifyCalls.push(JSON.parse(init.body).variables);
    return new Response(JSON.stringify({ data: { order: { customer: { id: 'gid://shopify/Customer/7001' } } } }));
  };
  const server = await new Promise((r) => { const s = createApp({ config, store, service, fetchImpl, logger: quiet }).listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ask = (order, token = customerToken()) =>
    fetch(`${base}/customer-api/invoice?order=${encodeURIComponent(order)}`, { headers: { Authorization: `Bearer ${token}` } });
  try {
    const gid = `gid://shopify/Order/${ORDER.id}`;
    // Avant la facture : pas de bouton.
    assert.deepEqual(await (await ask(gid)).json(), { ready: false });

    const { invoice } = await service.createInvoice(SHOP, ORDER);
    assert.equal(store.findInvoiceSummaryByOrder(SHOP, ORDER.id).customer_id, '7001');

    const ok = await ask(gid);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await ok.json(), { ready: true, number: invoice.number, url: `https://factures.example/f/${ORDER.token}.pdf` });

    // Un autre client, un client non connecté, un jeton absent : rien n'est révélé.
    assert.deepEqual(await (await ask(gid, customerToken({ sub: 'gid://shopify/Customer/8888' }))).json(), { ready: false });
    assert.deepEqual(await (await ask(gid, customerToken({ sub: undefined }))).json(), { ready: false });
    assert.equal((await fetch(`${base}/customer-api/invoice?order=${gid}`)).status, 401);
    assert.equal((await ask('pas-un-id')).status, 400);
    // Une autre boutique ne voit pas les factures de celle-ci.
    assert.deepEqual(await (await ask(gid, customerToken({ dest: 'autre.myshopify.com' }))).json(), { ready: false });

    // Préflight CORS.
    const pre = await fetch(`${base}/customer-api/invoice`, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);

    // Facture ancienne (sans client enregistré) : propriétaire vérifié via l'API Admin.
    store.saveToken(SHOP, 'shpat_x', 'read_orders,read_customers');
    await service.createInvoice(SHOP, legacyOrder);
    store.sql.run('UPDATE invoices SET customer_id = NULL WHERE order_id = ?', '999');
    const legacy = await (await ask('gid://shopify/Order/999')).json();
    assert.equal(legacy.ready, true);
    assert.equal(legacy.url, 'https://factures.example/f/legacytoken0000000000.pdf');
    assert.deepEqual(shopifyCalls, [{ id: 'gid://shopify/Order/999' }]);
    assert.deepEqual(await (await ask('gid://shopify/Order/999', customerToken({ sub: 'gid://shopify/Customer/1' }))).json(), { ready: false });

    const actions = store.listAccessLog(SHOP, 10);
    assert.ok(JSON.stringify(actions).includes('invoice.account_link'), 'accès journalisé');
  } finally {
    server.close();
  }
});

test('base existante : colonne customer_id ajoutée sans perte', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, shop TEXT NOT NULL, order_id TEXT NOT NULL,
    order_name TEXT, order_token TEXT, number TEXT NOT NULL, issued_at TEXT NOT NULL, customer_email TEXT,
    customer_name TEXT, customer_first_name TEXT, total_cents INTEGER NOT NULL, currency TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'fr', facturx INTEGER NOT NULL DEFAULT 0, pdf BLOB NOT NULL,
    email_status TEXT NOT NULL DEFAULT 'pending', email_error TEXT, email_sent_at TEXT,
    UNIQUE (shop, order_id), UNIQUE (shop, number));
    INSERT INTO invoices (shop, order_id, number, issued_at, total_cents, currency, pdf) VALUES ('s', '1', 'F-1', 'x', 1, 'EUR', x'00');`);
  const key = resolveKey({ key: generateKey() });
  const store = createStore(nodeSql(db), key);
  assert.equal(store.findInvoiceSummaryByOrder('s', '1').customer_id, null);
  createStore(nodeSql(db), key); // second démarrage : rien à refaire
});
