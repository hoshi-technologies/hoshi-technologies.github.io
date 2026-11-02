// Stockage SQLite (module node:sqlite intégré à Node 22, aucune dépendance native).
// Les PDF sont conservés tels qu'émis : une facture ne doit plus changer après émission.
// Les données personnelles (PDF, nom et e-mail du client, commandes en attente, jeton d'accès
// Shopify) sont chiffrées au repos en AES-256-GCM (voir crypto.js).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEFAULT_SETTINGS } from './settings.js';
import { createCipher } from './crypto.js';

/**
 * @param path  fichier SQLite, ou ':memory:'
 * @param key   clé de chiffrement de 32 octets (Buffer) ; obligatoire pour un fichier,
 *              aléatoire pour une base en mémoire (tests, démo)
 */
export function openDatabase(path, { key } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  if (!key && path !== ':memory:') throw new Error('Clé de chiffrement manquante pour la base de données.');
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS shops (
      shop TEXT PRIMARY KEY,
      access_token TEXT,
      scope TEXT,
      settings TEXT NOT NULL DEFAULT '{}',
      next_number INTEGER NOT NULL DEFAULT 1,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      uninstalled_at TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      subscription_id TEXT,
      quota_notified_month TEXT
    );
    -- Commandes reçues alors que le quota mensuel était atteint : facturables plus tard.
    CREATE TABLE IF NOT EXISTS pending_orders (
      shop TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_name TEXT,
      payload TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (shop, order_id)
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_name TEXT,
      order_token TEXT,
      number TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      customer_email TEXT,
      customer_name TEXT,
      customer_first_name TEXT,
      total_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'fr',
      facturx INTEGER NOT NULL DEFAULT 0,
      pdf BLOB NOT NULL,
      email_status TEXT NOT NULL DEFAULT 'pending',
      email_error TEXT,
      email_sent_at TEXT,
      UNIQUE (shop, order_id),
      UNIQUE (shop, number)
    );
    CREATE INDEX IF NOT EXISTS invoices_token ON invoices (order_token);
    CREATE INDEX IF NOT EXISTS invoices_shop ON invoices (shop, id DESC);
    -- Journal des accès aux données personnelles (conservé 12 mois).
    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      shop TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS access_log_shop ON access_log (shop, id DESC);
  `);
  return new Store(db, createCipher(key ?? randomBytes(32)));
}

/** Adresse IP tronquée (dernier octet / derniers groupes masqués) : suffisante, moins identifiante. */
export function truncateIp(ip) {
  if (!ip) return null;
  const v4 = /(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
  if (v4) return `${v4[1]}.0`;
  return ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}::` : null;
}

export class Store {
  constructor(db, cipher) {
    this.db = db;
    this.cipher = cipher;
  }

  /** Déchiffre les colonnes personnelles d'une ligne de facture. */
  readInvoice(row) {
    if (!row) return row;
    const c = this.cipher;
    const out = {
      ...row,
      customer_email: c.decryptText(row.customer_email),
      customer_name: c.decryptText(row.customer_name),
      customer_first_name: c.decryptText(row.customer_first_name),
    };
    if ('pdf' in row) out.pdf = c.decryptBytes(row.pdf);
    return out;
  }

  getShop(shop) {
    const row = this.db.prepare('SELECT * FROM shops WHERE shop = ?').get(shop);
    if (!row) return null;
    return {
      ...row,
      access_token: this.cipher.decryptText(row.access_token),
      settings: { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings) },
    };
  }

  ensureShop(shop) {
    this.db.prepare('INSERT OR IGNORE INTO shops (shop) VALUES (?)').run(shop);
    return this.getShop(shop);
  }

  saveToken(shop, accessToken, scope) {
    this.ensureShop(shop);
    this.db
      .prepare('UPDATE shops SET access_token = ?, scope = ?, uninstalled_at = NULL WHERE shop = ?')
      .run(this.cipher.encrypt(accessToken), scope, shop);
  }

  saveSettings(shop, settings) {
    this.ensureShop(shop);
    this.db.prepare('UPDATE shops SET settings = ? WHERE shop = ?').run(JSON.stringify(settings), shop);
  }

  /** Le compteur ne peut qu'avancer : la numérotation doit rester continue et chronologique. */
  setNextNumber(shop, next) {
    const current = this.ensureShop(shop);
    if (!Number.isInteger(next) || next < current.next_number) {
      throw new Error(`Le prochain numéro ne peut pas être inférieur à ${current.next_number}.`);
    }
    this.db.prepare('UPDATE shops SET next_number = ? WHERE shop = ?').run(next, shop);
  }

  markUninstalled(shop) {
    // Shopify annule lui-même l'abonnement à la désinstallation.
    this.db
      .prepare(
        "UPDATE shops SET access_token = NULL, plan = 'free', subscription_id = NULL, uninstalled_at = datetime('now') WHERE shop = ?",
      )
      .run(shop);
  }

  setPlan(shop, plan, subscriptionId = null) {
    this.ensureShop(shop);
    this.db.prepare('UPDATE shops SET plan = ?, subscription_id = ? WHERE shop = ?').run(plan, subscriptionId, shop);
  }

  /** Marque le quota du mois comme signalé ; renvoie false s'il l'était déjà. */
  markQuotaNotified(shop, month) {
    const { changes } = this.db
      .prepare('UPDATE shops SET quota_notified_month = ? WHERE shop = ? AND quota_notified_month IS NOT ?')
      .run(month, shop, month);
    return changes > 0;
  }

  countInvoicesSince(shop, sinceIso) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE shop = ? AND issued_at >= ?').get(shop, sinceIso).n;
  }

  addPendingOrder(shop, order) {
    this.db
      .prepare('INSERT OR IGNORE INTO pending_orders (shop, order_id, order_name, payload) VALUES (?, ?, ?, ?)')
      .run(shop, String(order.id), order.name ?? null, this.cipher.encrypt(JSON.stringify(order)));
  }

  listPendingOrders(shop) {
    return this.db
      .prepare('SELECT order_id, order_name, received_at FROM pending_orders WHERE shop = ? ORDER BY received_at, order_id')
      .all(shop);
  }

  getPendingPayloads(shop, limit) {
    return this.db
      .prepare('SELECT payload FROM pending_orders WHERE shop = ? ORDER BY received_at, order_id LIMIT ?')
      .all(shop, limit)
      .map((row) => JSON.parse(this.cipher.decryptText(row.payload)));
  }

  deletePendingOrder(shop, orderId) {
    this.db.prepare('DELETE FROM pending_orders WHERE shop = ? AND order_id = ?').run(shop, String(orderId));
  }

  findInvoiceByOrder(shop, orderId) {
    return this.readInvoice(this.db.prepare('SELECT * FROM invoices WHERE shop = ? AND order_id = ?').get(shop, String(orderId)));
  }

  findInvoiceByToken(token) {
    return this.readInvoice(this.db.prepare('SELECT * FROM invoices WHERE order_token = ?').get(token));
  }

  getInvoice(shop, id) {
    return this.readInvoice(this.db.prepare('SELECT * FROM invoices WHERE shop = ? AND id = ?').get(shop, id));
  }

  listInvoices(shop, limit = 50) {
    return this.db
      .prepare(
        `SELECT id, order_id, order_name, number, issued_at, customer_email, customer_name,
                total_cents, currency, language, facturx, email_status, email_error, email_sent_at
           FROM invoices WHERE shop = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(shop, limit)
      .map((row) => this.readInvoice(row));
  }

  /**
   * Enregistre la facture portant le numéro `seq` et avance le compteur, dans une seule
   * transaction : si l'enregistrement échoue, le numéro n'est pas consommé (pas de trou).
   * L'appelant sérialise les créations (voir InvoiceService) ; la vérification du compteur
   * protège en plus contre toute course.
   */
  insertInvoice(shop, seq, record) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const { next_number: current } = this.ensureShop(shop);
      if (current !== seq) throw new Error(`Compteur de factures modifié (${current} au lieu de ${seq}).`);
      this.db.prepare('UPDATE shops SET next_number = ? WHERE shop = ?').run(seq + 1, shop);
      const { lastInsertRowid } = this.db
        .prepare(
          `INSERT INTO invoices (shop, order_id, order_name, order_token, number, issued_at,
                                 customer_email, customer_name, customer_first_name, total_cents, currency,
                                 language, facturx, pdf)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          shop,
          String(record.orderId),
          record.orderName,
          record.orderToken,
          record.number,
          record.issuedAt,
          this.cipher.encrypt(record.customerEmail),
          this.cipher.encrypt(record.customerName),
          this.cipher.encrypt(record.customerFirstName),
          record.totalCents,
          record.currency,
          record.language,
          record.facturx ? 1 : 0,
          this.cipher.encrypt(record.pdf),
        );
      this.db.exec('COMMIT');
      return this.getInvoice(shop, Number(lastInsertRowid));
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  setEmailStatus(id, status, error = null) {
    this.db
      .prepare(
        `UPDATE invoices SET email_status = ?, email_error = ?,
                email_sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE email_sent_at END
          WHERE id = ?`,
      )
      .run(status, error, status, id);
  }

  /** RGPD (customers/redact) : supprime les factures des commandes concernées. */
  deleteInvoicesForOrders(shop, orderIds) {
    const stmt = this.db.prepare('DELETE FROM invoices WHERE shop = ? AND order_id = ?');
    for (const id of orderIds) {
      stmt.run(shop, String(id));
      this.deletePendingOrder(shop, id);
    }
  }

  /** RGPD (shop/redact) : supprime toutes les données de la boutique. */
  deleteShop(shop) {
    this.db.prepare('DELETE FROM invoices WHERE shop = ?').run(shop);
    this.db.prepare('DELETE FROM pending_orders WHERE shop = ?').run(shop);
    this.db.prepare('DELETE FROM access_log WHERE shop = ?').run(shop);
    this.db.prepare('DELETE FROM shops WHERE shop = ?').run(shop);
  }

  // ---------- Journal des accès aux données personnelles ----------

  /** actor : "user:<id Shopify>", "customer" (lien public) ou "shopify" (webhooks RGPD). */
  logAccess(shop, { actor, action, target = null, ip = null }) {
    this.db
      .prepare('INSERT INTO access_log (shop, actor, action, target, ip) VALUES (?, ?, ?, ?, ?)')
      .run(shop, actor, action, target === null ? null : String(target), truncateIp(ip));
  }

  listAccessLog(shop, limit = 100) {
    return this.db
      .prepare('SELECT at, actor, action, target, ip FROM access_log WHERE shop = ? ORDER BY id DESC LIMIT ?')
      .all(shop, limit);
  }

  /** Purge des entrées plus anciennes que `days` jours (12 mois par défaut). */
  purgeAccessLog(days = 365) {
    const cutoff = new Date(Date.now() - days * 864e5).toISOString();
    return Number(this.db.prepare('DELETE FROM access_log WHERE at < ?').run(cutoff).changes);
  }
}
