import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { openDatabase, truncateIp } from '../src/db-node.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/node-app.js';
import { createCipher, resolveKey, generateKey } from '../src/crypto.js';
import { createBackup, restoreBackup, listBackups, pruneBackups } from '../src/backup.js';
import { signSessionToken } from '../src/shopify.js';

const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const SHOP = 'boutique-exemple.myshopify.com';
const quiet = { info() {}, warn() {}, error() {} };
const key = resolveKey({ key: generateKey() });
const tmp = () => mkdtempSync(join(tmpdir(), 'hoshi-'));
const rawFiles = (path) => [path, `${path}-wal`].filter(existsSync).map((p) => readFileSync(p).toString('latin1')).join('');

test('clé : formats acceptés, longueur vérifiée, dérivation stable', () => {
  assert.equal(resolveKey({ key: 'a'.repeat(64) }).length, 32);
  assert.throws(() => resolveKey({ key: 'trop-court' }), /32 octets/);
  assert.deepEqual(resolveKey({ fallbackSecret: 's' }), resolveKey({ fallbackSecret: 's' }));
  assert.throws(() => resolveKey({}), /DATA_ENCRYPTION_KEY/);
  const c = createCipher(key);
  assert.equal(c.decryptText(c.encrypt('é€')), 'é€');
  assert.equal(c.decryptText('ancien texte en clair'), 'ancien texte en clair', 'compatibilité avec les anciennes lignes');
  const other = createCipher(resolveKey({ key: generateKey() }));
  assert.throws(() => other.decryptText(c.encrypt('x')), 'mauvaise clé : déchiffrement refusé');
});

test('au repos : aucune donnée personnelle en clair dans le fichier de la base', async () => {
  const path = join(tmp(), 'factures.sqlite');
  assert.throws(() => openDatabase(path), /Clé de chiffrement manquante/);
  const store = openDatabase(path, { key });
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet });
  store.saveToken(SHOP, 'shpat_secret_token_123', 'read_orders');
  await service.createInvoice(SHOP, ORDER);
  store.addPendingOrder(SHOP, { ...ORDER, id: 77, email: 'attente@example.com' });

  const raw = rawFiles(path);
  for (const secret of ['marie.dupont@example.com', 'Marie Dupont', 'Dupont', 'shpat_secret_token_123', 'attente@example.com', '12 rue des Lilas', '%PDF']) {
    assert.ok(!raw.includes(secret), `trouvé en clair dans la base : ${secret}`);
  }
  // …mais tout se relit normalement avec la clé.
  const [inv] = store.listInvoices(SHOP);
  assert.equal(inv.customer_email, 'marie.dupont@example.com');
  assert.equal(store.getInvoice(SHOP, inv.id).pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(store.getShop(SHOP).access_token, 'shpat_secret_token_123');
  assert.equal(store.getPendingPayloads(SHOP, 10)[0].email, 'attente@example.com');
});

test('sauvegarde chiffrée : restaurable, intègre, illisible sans la clé, purgée après N jours', async () => {
  const dir = tmp();
  const store = openDatabase(join(dir, 'base.sqlite'), { key });
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet });
  await service.createInvoice(SHOP, ORDER);
  const file = createBackup(store.sql.raw, { dir: join(dir, 'backups'), key });
  assert.match(file, /factures-\d{8}-\d{6}\.sqlite\.gz\.enc$/);
  const bytes = readFileSync(file).toString('latin1');
  assert.ok(!bytes.includes('SQLite format') && !bytes.includes('marie'), 'sauvegarde chiffrée');

  const restored = join(dir, 'restauree.sqlite');
  assert.deepEqual(restoreBackup(file, restored, { key }), { invoices: 1 });
  const again = openDatabase(restored, { key });
  assert.equal(again.listInvoices(SHOP)[0].customer_name, 'Marie Dupont', 'données relues après restauration');
  assert.throws(() => restoreBackup(file, join(dir, 'x.sqlite'), { key: resolveKey({ key: generateKey() }) }), 'mauvaise clé');

  const old = new Date(Date.now() - 40 * 864e5);
  utimesSync(file, old, old);
  assert.equal(pruneBackups(join(dir, 'backups'), 30).length, 1);
  assert.equal(listBackups(join(dir, 'backups')).length, 0);
  assert.equal(readdirSync(join(dir, 'backups')).filter((n) => n.startsWith('.tmp')).length, 0, 'pas de fichier temporaire');
});

test('journal des accès : admin, lien public (IP tronquée), RGPD ; purge à 12 mois', async () => {
  assert.equal(truncateIp('203.0.113.42'), '203.0.113.0');
  assert.equal(truncateIp('::ffff:203.0.113.42'), '203.0.113.0');
  assert.equal(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3::');

  const config = { apiKey: 'k', apiSecret: 's', apiVersion: '2026-10', appUrl: 'https://x' };
  const store = openDatabase(':memory:');
  const service = new InvoiceService({ store, transport: null, mailFrom: null, logger: quiet });
  const server = await new Promise((r) => { const s = createApp({ config, store, service, logger: quiet }).listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const now = Math.floor(Date.now() / 1000);
  const headers = { Authorization: `Bearer ${signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: 'k', sub: '4242', exp: now + 60, nbf: now - 1 }, 's')}` };
  try {
    const { invoice } = await service.createInvoice(SHOP, ORDER);
    await fetch(`${base}/api/invoices`, { headers });
    await fetch(`${base}/api/invoices/${invoice.id}/pdf`, { headers });
    await fetch(`${base}/f/${ORDER.token}`, { headers: { 'X-Forwarded-For': '198.51.100.77' } });
    const body = JSON.stringify({ orders_to_redact: [123] });
    await fetch(`${base}/webhooks`, { method: 'POST', headers: { 'X-Shopify-Topic': 'customers/redact', 'X-Shopify-Shop-Domain': SHOP, 'X-Shopify-Hmac-Sha256': createHmac('sha256', 's').update(body).digest('base64') }, body });

    const { entries } = await (await fetch(`${base}/api/access-log`, { headers })).json();
    const summary = entries.map((e) => [e.actor, e.action, e.target, e.ip]).reverse();
    assert.deepEqual(summary.map((e) => e.slice(0, 3)), [
      ['user:4242', 'invoice.list', null],
      ['user:4242', 'invoice.download', invoice.number],
      ['customer', 'invoice.public_download', invoice.number],
      ['shopify', 'customer.redact', '1'],
    ]);
    assert.equal(summary[2][3], '198.51.100.0', 'IP du client tronquée');

    store.sql.run("UPDATE access_log SET at = '2020-01-01T00:00:00.000Z' WHERE action = 'invoice.list'");
    assert.equal(store.purgeAccessLog(365), 1);
  } finally {
    server.close();
  }
});
