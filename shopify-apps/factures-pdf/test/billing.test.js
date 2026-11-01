import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { openDatabase } from '../src/db.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/server.js';
import { signSessionToken } from '../src/shopify.js';
import { sanitizeSettings } from '../src/settings.js';
import { monthStart, planFromSubscriptionName, PLANS } from '../src/plans.js';

const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const SHOP = 'boutique-exemple.myshopify.com';
const config = { apiKey: 'cle-api', apiSecret: 'secret-api', apiVersion: '2026-10', appUrl: 'https://factures.exemple.fr', billingTest: true };
const quiet = { info() {}, warn() {}, error() {} };
const order = (n) => ({ ...ORDER, id: 1000 + n, name: `#${1000 + n}`, token: `tok${String(n).padStart(29, '0')}`, order_status_url: null });
const settle = () => new Promise((r) => setTimeout(r, 30));

async function setup() {
  const store = openDatabase(':memory:');
  const sent = [];
  const graphqlCalls = [];
  let activeSubscriptions = [];
  const fakeShopify = async (url, options) => {
    if (url.endsWith('/admin/oauth/access_token')) return Response.json({ access_token: 'shpat_x', scope: 'read_orders' });
    const { query, variables } = JSON.parse(options.body);
    graphqlCalls.push({ query, variables });
    if (query.includes('appSubscriptionCreate')) {
      return Response.json({ data: { appSubscriptionCreate: { confirmationUrl: `https://${SHOP}/admin/charges/confirm`, appSubscription: { id: 'gid://shopify/AppSubscription/1', status: 'PENDING' }, userErrors: [] } } });
    }
    if (query.includes('appSubscriptionCancel')) {
      return Response.json({ data: { appSubscriptionCancel: { appSubscription: { id: variables.id, status: 'CANCELLED' }, userErrors: [] } } });
    }
    if (query.includes('currentAppInstallation')) {
      return Response.json({ data: { currentAppInstallation: { activeSubscriptions } } });
    }
    return Response.json({ data: { shop: { name: 'Atelier', email: 'a@b.fr', billingAddress: {} } } });
  };
  const transport = { sendMail: async (m) => { sent.push(m); } };
  const service = new InvoiceService({ store, transport, mailFrom: 'factures@exemple.fr', logger: quiet, fetchImpl: fakeShopify });
  const app = createApp({ config, store, service, logger: quiet, fetchImpl: fakeShopify });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const now = Math.floor(Date.now() / 1000);
  const token = signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: config.apiKey, exp: now + 60, nbf: now - 1 }, config.apiSecret);
  const call = async (path, method = 'GET', body) => {
    const res = await fetch(`${base}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const webhook = (topic, payload) => {
    const body = JSON.stringify(payload);
    return fetch(`${base}/webhooks`, {
      method: 'POST',
      headers: { 'X-Shopify-Topic': topic, 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Hmac-Sha256': createHmac('sha256', config.apiSecret).update(body).digest('base64') },
      body,
    });
  };
  return { store, service, sent, graphqlCalls, call, webhook, setActive: (s) => { activeSubscriptions = s; }, close: () => server.close() };
}

test('formules : noms d’abonnement reconnus, début de mois', () => {
  assert.equal(planFromSubscriptionName('Hoshi Factures – Essentiel').key, 'essentiel');
  assert.equal(planFromSubscriptionName('Hoshi Factures – Gratuit'), null);
  assert.equal(planFromSubscriptionName('autre'), null);
  assert.equal(monthStart(new Date('2026-11-17T10:00:00Z')), '2026-11-01T00:00:00.000Z');
});

test('formule gratuite : 10 factures par mois, puis commandes en attente et marchand prévenu une fois', async () => {
  const ctx = await setup();
  try {
    ctx.store.saveSettings(SHOP, sanitizeSettings({ email: 'marchand@atelier.fr' }));
    for (let i = 1; i <= 12; i++) assert.equal((await ctx.webhook('orders/paid', order(i))).status, 200);
    await settle();

    assert.equal(ctx.store.listInvoices(SHOP).length, 10);
    assert.deepEqual(ctx.store.listPendingOrders(SHOP).map((p) => p.order_name), ['#1011', '#1012']);
    const quotaMails = ctx.sent.filter((m) => m.to === 'marchand@atelier.fr');
    assert.equal(quotaMails.length, 1, 'un seul e-mail de quota par mois');
    assert.match(quotaMails[0].subject, /Limite de 10 factures/);

    const { body } = await ctx.call('/billing');
    assert.deepEqual([body.current, body.used, body.limit, body.remaining, body.pending], ['free', 10, 10, 0, 2]);

    // Générer les commandes en attente est impossible tant que le quota est atteint.
    assert.equal((await ctx.call('/pending/generate', 'POST')).body.created, 0);
  } finally {
    ctx.close();
  }
});

test('abonnement : création, validation par webhook, factures en attente générées, résiliation', async () => {
  const ctx = await setup();
  try {
    await ctx.call('/session', 'POST'); // obtient le jeton d'accès
    for (let i = 1; i <= 11; i++) await ctx.webhook('orders/paid', order(i));
    await settle();
    assert.equal(ctx.store.listPendingOrders(SHOP).length, 1);

    let res = await ctx.call('/billing/subscribe', 'POST', { plan: 'essentiel' });
    assert.equal(res.status, 200);
    assert.equal(res.body.confirmationUrl, `https://${SHOP}/admin/charges/confirm`);
    const create = ctx.graphqlCalls.find((c) => c.query.includes('appSubscriptionCreate')).variables;
    assert.equal(create.name, 'Hoshi Factures – Essentiel');
    assert.equal(create.test, true);
    assert.equal(create.trialDays, 7);
    assert.equal(create.returnUrl, `https://${SHOP}/admin/apps/cle-api`);
    assert.deepEqual(create.lineItems[0].plan.appRecurringPricingDetails, { price: { amount: PLANS.essentiel.price, currencyCode: 'USD' }, interval: 'EVERY_30_DAYS' });
    assert.equal((await ctx.call('/billing/subscribe', 'POST', { plan: 'free' })).status, 400);

    // Le marchand accepte : Shopify envoie app_subscriptions/update.
    await ctx.webhook('app_subscriptions/update', { app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/1', name: 'Hoshi Factures – Essentiel', status: 'ACTIVE' } });
    res = await ctx.call('/billing');
    assert.deepEqual([res.body.current, res.body.limit, res.body.remaining, res.body.pending], ['essentiel', 200, 190, 1]);

    res = await ctx.call('/pending/generate', 'POST');
    assert.deepEqual(res.body, { created: 1, pending: 0 });
    assert.equal(ctx.store.listInvoices(SHOP)[0].order_name, '#1011');
    assert.equal(ctx.store.listInvoices(SHOP)[0].number.slice(-5), '00011', 'numérotation continue');

    // Ancien abonnement annulé (changement de formule) : sans effet sur l'abonnement actif.
    await ctx.webhook('app_subscriptions/update', { app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/0', name: 'Hoshi Factures – Illimité', status: 'CANCELLED' } });
    assert.equal(ctx.store.getShop(SHOP).plan, 'essentiel');

    res = await ctx.call('/billing/cancel', 'POST');
    assert.equal(res.body.current, 'free');
    assert.equal(ctx.graphqlCalls.at(-1).variables.id, 'gid://shopify/AppSubscription/1');
  } finally {
    ctx.close();
  }
});

test('la formule est resynchronisée avec Shopify à l’ouverture de l’appli', async () => {
  const ctx = await setup();
  try {
    ctx.setActive([{ id: 'gid://shopify/AppSubscription/9', name: 'Hoshi Factures – Illimité', status: 'ACTIVE', test: true }]);
    await ctx.call('/session', 'POST');
    let { body } = await ctx.call('/billing');
    assert.equal(body.current, 'illimite');
    assert.equal(body.remaining, null);

    ctx.setActive([]);
    await ctx.call('/session', 'POST');
    ({ body } = await ctx.call('/billing'));
    assert.equal(body.current, 'free');

    await ctx.webhook('app/uninstalled', {});
    assert.equal(ctx.store.getShop(SHOP).plan, 'free');
  } finally {
    ctx.close();
  }
});
