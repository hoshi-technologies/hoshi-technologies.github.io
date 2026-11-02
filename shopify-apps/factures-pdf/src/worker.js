// Point d'entrée Cloudflare Workers.
//
// - Chaque boutique a son propre Durable Object « ShopStore » : base SQLite isolée, traitement
//   d'une requête à la fois (numérotation des factures sans trou ni doublon).
// - Le Durable Object « Directory » (unique) retrouve la boutique d'un lien public /f/<jeton>.
// - Les pages sans données (admin, guide, FAQ) sont servies directement par le Worker.

import { DurableObject } from 'cloudflare:workers';
import { createApp } from './server.js';
import { createStore } from './db.js';
import { durableObjectSql } from './sql.js';
import { InvoiceService } from './service.js';
import { loadConfig } from './config.js';
import { resolveKey } from './crypto.js';
import { useFonts } from './pdf.js';
import { createBrevoTransport } from './mailer.js';
import { verifySessionToken, isValidShop } from './shopify.js';
import adminHtml from '../public/admin.html';
import sampleOrder from './sample-order.json';
import regular from '../assets/fonts/LiberationSans-Regular.ttf';
import bold from '../assets/fonts/LiberationSans-Bold.ttf';
import italic from '../assets/fonts/LiberationSans-Italic.ttf';

useFonts({ regular, bold, italic });
const ASSETS = { adminHtml, sampleOrder };
const directory = (env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
const shopObject = (env, shop) => env.SHOPS.get(env.SHOPS.idFromName(shop));

/** Données d'une boutique : stockage, factures et API, dans un Durable Object par boutique. */
export class ShopStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const config = loadConfig(env);
    const store = createStore(durableObjectSql(ctx.storage), resolveKey({ key: config.dataEncryptionKey, fallbackSecret: config.apiSecret }));
    const service = new InvoiceService({
      store,
      transport: config.mail.brevoApiKey ? createBrevoTransport(config.mail.brevoApiKey) : null,
      mailFrom: config.mail.from,
      defer: (promise) => ctx.waitUntil(promise),
      // Index des liens publics : jeton de commande → boutique.
      onInvoiceCreated: (invoice) => (invoice.order_token ? directory(env).register(invoice.order_token, invoice.shop) : null),
    });
    this.store = store;
    this.app = createApp({ config, store, service, assets: ASSETS, hooks: { onShopDeleted: (shop) => directory(env).removeShop(shop) } });
    this.lastPurge = 0;
  }

  async fetch(request) {
    // Purge quotidienne du journal des accès (12 mois).
    if (Date.now() - this.lastPurge > 24 * 3600e3) {
      this.store.purgeAccessLog(365);
      this.lastPurge = Date.now();
    }
    return this.app.fetch(request);
  }
}

/** Annuaire global : retrouve la boutique d'un jeton de commande (lien de téléchargement). */
export class Directory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, shop TEXT NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS tokens_shop ON tokens (shop)');
  }

  register(token, shop) {
    this.sql.exec('INSERT OR REPLACE INTO tokens (token, shop) VALUES (?, ?)', token, shop);
  }

  lookup(token) {
    return this.sql.exec('SELECT shop FROM tokens WHERE token = ?', token).toArray()[0]?.shop ?? null;
  }

  removeShop(shop) {
    this.sql.exec('DELETE FROM tokens WHERE shop = ?', shop);
  }
}

let statelessApp = null;

export default {
  async fetch(request, env) {
    const config = loadConfig(env);
    const { pathname } = new URL(request.url);

    // Webhooks : la boutique est indiquée par Shopify (la signature est vérifiée ensuite).
    if (pathname === '/webhooks') {
      const shop = request.headers.get('x-shopify-shop-domain');
      if (isValidShop(shop)) return shopObject(env, shop).fetch(request);
    }

    // API de l'admin : la boutique vient du jeton de session signé.
    if (pathname.startsWith('/api/')) {
      const token = /^Bearer (.+)$/.exec(request.headers.get('authorization') || '')?.[1];
      try {
        const { shop } = verifySessionToken(token, config);
        return shopObject(env, shop).fetch(request);
      } catch {
        // Jeton absent ou invalide : l'application répond 401.
      }
    }

    // Lien public de facture : la boutique est retrouvée dans l'annuaire.
    const link = /^\/f\/([A-Za-z0-9_-]{16,})(\.pdf)?$/.exec(pathname);
    if (link) {
      const shop = await directory(env).lookup(link[1]);
      if (shop) return shopObject(env, shop).fetch(request);
    }

    // Pages sans données : administration, guide, FAQ, santé.
    statelessApp ??= createApp({ config, store: null, service: null, assets: ASSETS });
    return statelessApp.fetch(request);
  },
};
