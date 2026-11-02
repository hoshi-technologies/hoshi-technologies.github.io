import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../src/db-node.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/node-app.js';
import { signSessionToken } from '../src/shopify.js';

const SHOP = 'boutique-exemple.myshopify.com';
const config = { apiKey: 'k', apiSecret: 's', apiVersion: '2026-10', appUrl: 'https://x' };
const quiet = { info() {}, warn() {}, error() {} };

// Shopify simulé : jetons à durée limitée, refus des jetons permanents (HTTP 403) et des jetons expirés (401).
function fakeShopify() {
  const calls = [];
  let n = 0;
  const valid = new Set();
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/admin/oauth/access_token')) {
      const form = init.headers['Content-Type'].includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
      calls.push(form.grant_type === 'refresh_token' ? `refresh:${form.refresh_token}` : `exchange:expiring=${form.expiring}`);
      if (form.grant_type === 'refresh_token' && form.refresh_token === 'shprt_revoque') return new Response('{}', { status: 401 });
      n += 1;
      valid.add(`shpat_${n}`);
      return Response.json({ access_token: `shpat_${n}`, scope: 'read_orders,read_customers', expires_in: 3600, refresh_token: `shprt_${n}`, refresh_token_expires_in: 7776000 });
    }
    const token = init.headers['X-Shopify-Access-Token'];
    calls.push(`graphql:${token}`);
    if (token === 'shpat_permanent') return new Response('{"errors":"Non-expiring access tokens are no longer accepted"}', { status: 403 });
    if (!valid.has(token)) return new Response('{"errors":"Invalid API key or access token"}', { status: 401 });
    return Response.json({ data: { shop: { name: 'Atelier', billingAddress: {} }, currentAppInstallation: { activeSubscriptions: [] } } });
  };
  return { calls, fetchImpl, revoke: (t) => valid.delete(t) };
}

async function setup() {
  const store = openDatabase(':memory:');
  const shopify = fakeShopify();
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet });
  const server = await new Promise((r) => { const s = createApp({ config, store, service, logger: quiet, fetchImpl: shopify.fetchImpl }).listen(0, () => r(s)); });
  const now = Math.floor(Date.now() / 1000);
  const auth = { Authorization: `Bearer ${signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: 'k', exp: now + 60, nbf: now - 1 }, 's')}` };
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = () => fetch(`${base}/api/session`, { method: 'POST', headers: auth }).then((r) => r.json());
  const billing = () => fetch(`${base}/api/billing`, { headers: auth }).then((r) => r.json());
  return { store, shopify, session, billing, close: () => server.close() };
}

test('jetons : échange à durée limitée, renouvellement avant expiration et après refus', async () => {
  const ctx = await setup();
  try {
    await ctx.session();
    assert.equal(ctx.shopify.calls[0], 'exchange:expiring=1', 'jeton à durée limitée demandé');
    const row = ctx.store.getShop(SHOP);
    assert.equal(row.access_token, 'shpat_1');
    assert.equal(row.refresh_token, 'shprt_1');
    assert.ok(row.token_expires_at > Date.now() + 3500e3);

    // Bientôt expiré : renouvelé avant l'appel, et le nouveau couple est enregistré.
    ctx.store.sql.run('UPDATE shops SET token_expires_at = ? WHERE shop = ?', Date.now() + 60e3, SHOP);
    ctx.shopify.calls.length = 0;
    await ctx.session();
    assert.deepEqual(ctx.shopify.calls, ['refresh:shprt_1', 'graphql:shpat_2']);
    assert.equal(ctx.store.getShop(SHOP).refresh_token, 'shprt_2');

    // Refusé par Shopify avant l'heure (401) : un renouvellement, une nouvelle tentative.
    ctx.shopify.revoke('shpat_2');
    ctx.shopify.calls.length = 0;
    await ctx.session();
    assert.deepEqual(ctx.shopify.calls, ['graphql:shpat_2', 'refresh:shprt_2', 'graphql:shpat_3']);

    // Jeton de renouvellement révoqué : jetons oubliés, nouvel échange à l'ouverture suivante de l'admin.
    ctx.store.saveToken(SHOP, 'shpat_mort', null, { refreshToken: 'shprt_revoque', expiresIn: 1 });
    await ctx.session();
    assert.equal(ctx.store.getShop(SHOP).access_token, null);
    ctx.shopify.calls.length = 0;
    await ctx.session();
    assert.equal(ctx.shopify.calls[0], 'exchange:expiring=1');
    assert.ok(ctx.store.getShop(SHOP).refresh_token);
  } finally {
    ctx.close();
  }
});

test('jetons : un ancien jeton permanent est remplacé à l’ouverture de l’admin', async () => {
  const ctx = await setup();
  try {
    ctx.store.saveToken(SHOP, 'shpat_permanent', 'read_orders');
    ctx.store.saveSettings(SHOP, { ...ctx.store.getShop(SHOP).settings, companyName: 'Déjà saisi' });
    await ctx.session();
    assert.deepEqual(ctx.shopify.calls, ['exchange:expiring=1', 'graphql:shpat_1'], 'plus aucun appel avec le jeton permanent');
    assert.equal(ctx.store.getShop(SHOP).settings.companyName, 'Déjà saisi', 'réglages conservés');
  } finally {
    ctx.close();
  }
});
