// Stockage SQLite (module node:sqlite intégré à Node 22, aucune dépendance native).
// Les PDF sont conservés tels qu'émis : une facture ne doit plus changer après émission.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SETTINGS } from './settings.js';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
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
      uninstalled_at TEXT
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
      pdf BLOB NOT NULL,
      email_status TEXT NOT NULL DEFAULT 'pending',
      email_error TEXT,
      email_sent_at TEXT,
      UNIQUE (shop, order_id),
      UNIQUE (shop, number)
    );
    CREATE INDEX IF NOT EXISTS invoices_token ON invoices (order_token);
    CREATE INDEX IF NOT EXISTS invoices_shop ON invoices (shop, id DESC);
  `);
  return new Store(db);
}

export class Store {
  constructor(db) {
    this.db = db;
  }

  getShop(shop) {
    const row = this.db.prepare('SELECT * FROM shops WHERE shop = ?').get(shop);
    if (!row) return null;
    return { ...row, settings: { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings) } };
  }

  ensureShop(shop) {
    this.db.prepare('INSERT OR IGNORE INTO shops (shop) VALUES (?)').run(shop);
    return this.getShop(shop);
  }

  saveToken(shop, accessToken, scope) {
    this.ensureShop(shop);
    this.db
      .prepare('UPDATE shops SET access_token = ?, scope = ?, uninstalled_at = NULL WHERE shop = ?')
      .run(accessToken, scope, shop);
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
    this.db
      .prepare("UPDATE shops SET access_token = NULL, uninstalled_at = datetime('now') WHERE shop = ?")
      .run(shop);
  }

  findInvoiceByOrder(shop, orderId) {
    return this.db.prepare('SELECT * FROM invoices WHERE shop = ? AND order_id = ?').get(shop, String(orderId));
  }

  findInvoiceByToken(token) {
    return this.db.prepare('SELECT * FROM invoices WHERE order_token = ?').get(token);
  }

  getInvoice(shop, id) {
    return this.db.prepare('SELECT * FROM invoices WHERE shop = ? AND id = ?').get(shop, id);
  }

  listInvoices(shop, limit = 50) {
    return this.db
      .prepare(
        `SELECT id, order_id, order_name, number, issued_at, customer_email, customer_name,
                total_cents, currency, email_status, email_error, email_sent_at
           FROM invoices WHERE shop = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(shop, limit);
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
                                 customer_email, customer_name, customer_first_name, total_cents, currency, pdf)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          shop,
          String(record.orderId),
          record.orderName,
          record.orderToken,
          record.number,
          record.issuedAt,
          record.customerEmail,
          record.customerName,
          record.customerFirstName,
          record.totalCents,
          record.currency,
          record.pdf,
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
    for (const id of orderIds) stmt.run(shop, String(id));
  }

  /** RGPD (shop/redact) : supprime toutes les données de la boutique. */
  deleteShop(shop) {
    this.db.prepare('DELETE FROM invoices WHERE shop = ?').run(shop);
    this.db.prepare('DELETE FROM shops WHERE shop = ?').run(shop);
  }
}
