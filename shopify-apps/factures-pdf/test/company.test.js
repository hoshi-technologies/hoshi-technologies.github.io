import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frenchVatNumber, lookupFrenchCompany } from '../src/company-lookup.js';
import { openDatabase } from '../src/db-node.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/node-app.js';
import { signSessionToken } from '../src/shopify.js';

const SHOP = 'boutique-exemple.myshopify.com';
const config = { apiKey: 'cle-api', apiSecret: 'secret-api', apiVersion: '2026-10', appUrl: 'https://f.exemple.fr' };
const quiet = { info() {}, warn() {}, error() {} };

// Réponse au format de l'API « Recherche d'entreprises » (recherche-entreprises.api.gouv.fr).
const SIRENE = {
  results: [
    {
      siren: '404833048',
      nom_complet: 'ATELIER EXEMPLE (AE)',
      nom_raison_sociale: 'ATELIER EXEMPLE',
      nature_juridique: '5710',
      etat_administratif: 'A',
      siege: { siret: '40483304800022', adresse: '8 PLACE BELLECOUR 69002 LYON', code_postal: '69002', libelle_commune: 'LYON' },
    },
    { siren: '552032534', nom_complet: 'ANCIENNE SOCIETE', nature_juridique: '1000', etat_administratif: 'C', siege: { numero_voie: '3', type_voie: 'RUE', libelle_voie: 'DES LILAS', code_postal: '75011', libelle_commune: 'PARIS' } },
  ],
};

test('n° de TVA français calculé depuis le SIREN', () => {
  assert.equal(frenchVatNumber('404 833 048'), 'FR83404833048');
  assert.equal(frenchVatNumber('123'), '');
});

test('recherche SIRENE : raison sociale, siège, SIRET, forme juridique, TVA', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return Response.json(SIRENE); };
  const [a, b] = await lookupFrenchCompany('404 833 048 00022', fetchImpl);
  assert.match(urls[0], /q=40483304800022&/, 'SIRET nettoyé');
  assert.deepEqual(a, { name: 'ATELIER EXEMPLE', siren: '404833048', siret: '404 833 048 00022', legalForm: 'SAS', address: '8 PLACE BELLECOUR\n69002 LYON', countryCode: 'FR', vatNumber: 'FR83404833048', active: true });
  assert.equal(b.address, '3 RUE DES LILAS\n75011 PARIS');
  assert.equal(b.legalForm, 'Entrepreneur individuel');
  assert.equal(b.active, false);
  assert.deepEqual(await lookupFrenchCompany('ab', fetchImpl), [], 'requête trop courte : pas d’appel');
  await assert.rejects(lookupFrenchCompany('atelier', async () => new Response('', { status: 429 })), /indisponible \(429\)/);
});

test('API : infos de Shopify (entité légale prioritaire) et recherche SIRENE', async () => {
  const fake = async (url, options) => {
    if (url.startsWith('https://recherche-entreprises.api.gouv.fr/')) return Response.json(SIRENE);
    if (url.endsWith('/admin/oauth/access_token')) return Response.json({ access_token: 'shpat_x', scope: 'read_orders' });
    const { query } = JSON.parse(options.body);
    if (query.includes('businessEntity')) {
      return Response.json({ data: { businessEntity: { companyName: 'Atelier Exemple SAS', address: { address1: '8 place Bellecour', address2: null, zip: '69002', city: 'Lyon', countryCode: 'FR' } } } });
    }
    if (query.includes('currentAppInstallation')) return Response.json({ data: { currentAppInstallation: { activeSubscriptions: [] } } });
    return Response.json({ data: { shop: { name: 'Ma boutique', email: 'a@b.fr', contactEmail: 'contact@atelier.fr', url: 'https://atelier.fr', ianaTimezone: 'Europe/Paris', billingAddress: { address1: 'Autre adresse', zip: '75001', city: 'Paris', countryCodeV2: 'FR', phone: '+33 1 23 45 67 89' } } } });
  };
  const store = openDatabase(':memory:');
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet, fetchImpl: fake });
  const server = await new Promise((r) => { const s = createApp({ config, store, service, logger: quiet, fetchImpl: fake }).listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const now = Math.floor(Date.now() / 1000);
  const headers = { Authorization: `Bearer ${signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: config.apiKey, exp: now + 60, nbf: now - 1 }, config.apiSecret)}` };
  try {
    await fetch(`${base}/api/session`, { method: 'POST', headers });
    const saved = store.getShop(SHOP).settings;
    assert.equal(saved.companyName, 'Atelier Exemple SAS', 'raison sociale de l’entité légale');
    assert.equal(saved.address, '8 place Bellecour\n69002 Lyon', 'adresse légale plutôt que celle de la boutique');
    assert.equal(saved.phone, '+33 1 23 45 67 89');
    assert.equal(saved.timezone, 'Europe/Paris');

    const { company } = await (await fetch(`${base}/api/company/shopify`, { headers })).json();
    assert.equal(company.email, 'contact@atelier.fr');
    const { results } = await (await fetch(`${base}/api/company/lookup?q=atelier%20lyon`, { headers })).json();
    assert.equal(results[0].vatNumber, 'FR83404833048');
    assert.equal((await fetch(`${base}/api/company/lookup?q=x`)).status, 401, 'réservé à l’admin');
  } finally {
    server.close();
  }
});
