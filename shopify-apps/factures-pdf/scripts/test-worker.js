// Test de bout en bout du Worker Cloudflare en local : `npm run test:worker`
// (lance `wrangler dev`, envoie une commande signée, vérifie factures, liens, Factur-X, chiffrement).

import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { signSessionToken } from '../src/shopify.js';

const PORT = 8791;
const SECRET = 'secret-de-test';
const API_KEY = '29382e5537f3d51df592997c1947800a';
const SHOP = 'boutique-test.myshopify.com';
const base = `http://127.0.0.1:${PORT}`;
const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const STATE = '.wrangler/state-test';

const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) process.exitCode = 1;
};

rmSync(STATE, { recursive: true, force: true });
const dev = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', STATE, '--var', `SHOPIFY_API_SECRET:${SECRET}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
  detached: process.platform !== 'win32', // pour arrêter wrangler et ses processus enfants
});
let logs = '';
dev.stdout.on('data', (d) => (logs += d));
dev.stderr.on('data', (d) => (logs += d));

try {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await fetch(`${base}/health`).then((r) => r.ok, () => false)) break;
  }
  const now = Math.floor(Date.now() / 1000);
  const auth = { Authorization: `Bearer ${signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '7', exp: now + 300, nbf: now - 5 }, SECRET)}`, 'Content-Type': 'application/json' };
  const webhook = (topic, payload) => {
    const body = JSON.stringify(payload);
    return fetch(`${base}/webhooks`, { method: 'POST', body, headers: { 'X-Shopify-Topic': topic, 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Hmac-Sha256': createHmac('sha256', SECRET).update(body).digest('base64') } });
  };

  const admin = await (await fetch(`${base}/?shop=${SHOP}&locale=de`)).text();
  check(admin.includes('"appName":"Hoshi Factures"') && admin.includes('lang="de"'), 'page d’administration (allemand)');
  check((await (await fetch(`${base}/guide?lang=es`)).text()).includes('Guía de uso'), 'guide public');
  check((await fetch(`${base}/api/invoices`)).status === 401, 'API refusée sans jeton');
  check((await webhook('orders/paid', ORDER)).status === 200, 'webhook orders/paid accepté');
  check((await fetch(`${base}/webhooks`, { method: 'POST', body: '{}', headers: { 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Hmac-Sha256': 'faux' } })).status === 401, 'webhook à signature invalide refusé');

  let { invoices } = await (await fetch(`${base}/api/invoices`, { headers: auth })).json();
  check(invoices.length === 1 && invoices[0].total_cents === 7550 && invoices[0].customer_name === 'Marie Dupont', 'facture créée et relue (75,50 €, Marie Dupont)');
  const pdf = Buffer.from(await (await fetch(`${base}/api/invoices/${invoices[0].id}/pdf`, { headers: auth })).arrayBuffer());
  check(pdf.subarray(0, 5).toString() === '%PDF-', 'PDF téléchargé depuis l’admin');
  const pub = await fetch(`${base}/f/${ORDER.token}`);
  check(pub.status === 200 && pub.headers.get('content-type') === 'application/pdf', 'lien public de la facture (annuaire)');
  check((await fetch(`${base}/f/inconnu0000000000000`)).status === 404, 'lien inconnu : page « pas encore disponible »');

  // Entreprise complète → facture Factur-X.
  await fetch(`${base}/api/settings`, { method: 'PUT', headers: auth, body: JSON.stringify({ settings: { companyName: 'Atelier', address: '8 place Bellecour\n69002 Lyon', siret: '40483304800022', vatNumber: 'FR83404833048' } }) });
  await webhook('orders/paid', { ...ORDER, id: 2, name: '#1043', token: 'b'.repeat(32), order_status_url: null });
  ({ invoices } = await (await fetch(`${base}/api/invoices`, { headers: auth })).json());
  check(invoices[0].facturx === 1 && invoices[0].number.endsWith('00002'), 'deuxième facture : numéro suivant, Factur-X');
  const fx = Buffer.from(await (await fetch(`${base}/api/invoices/${invoices[0].id}/pdf`, { headers: auth })).arrayBuffer()).toString('latin1');
  if (process.env.SAVE_PDF) (await import('node:fs')).writeFileSync(process.env.SAVE_PDF, Buffer.from(fx, 'latin1'));
  check(fx.includes('/AFRelationship /Alternative') && fx.includes('<pdfaid:part>3</pdfaid:part>'), 'PDF/A-3 avec factur-x.xml');
  const log = await (await fetch(`${base}/api/access-log`, { headers: auth })).json();
  check(log.entries.some((e) => e.action === 'invoice.public_download'), 'journal des accès');
  const preview = await fetch(`${base}/api/preview`, { method: 'POST', headers: auth, body: '{}' });
  check(preview.headers.get('content-type') === 'application/pdf', 'aperçu PDF');

  // Chiffrement au repos : aucune donnée personnelle en clair dans les fichiers du stockage.
  const files = [];
  const walk = (dir) => existsSync(dir) && readdirSync(dir).forEach((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : files.push(join(dir, n))));
  walk(STATE);
  const raw = files.map((f) => readFileSync(f).toString('latin1')).join('');
  check(files.length > 0 && !raw.includes('marie.dupont@example.com') && !raw.includes('Marie Dupont'), 'stockage Cloudflare : données personnelles chiffrées');
} finally {
  if (process.exitCode) console.log(logs.split('\n').filter((l) => /error|✘/i.test(l)).slice(0, 20).join('\n'));
  try {
    if (process.platform === 'win32') dev.kill();
    else process.kill(-dev.pid);
  } catch {}
  process.exit(process.exitCode ?? 0);
}
