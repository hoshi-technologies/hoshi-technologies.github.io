// Serveur de l'appli : page d'administration intégrée, API, webhooks et lien public de facture.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { createTransport } from './mailer.js';
import { InvoiceService } from './service.js';
import { sanitizeSettings } from './settings.js';
import { buildInvoice } from './invoice.js';
import {
  verifyWebhook,
  verifySessionToken,
  exchangeToken,
  adminGraphql,
  isValidShop,
  SHOP_INFO_QUERY,
} from './shopify.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const ADMIN_HTML = readFileSync(here('../public/admin.html'), 'utf8');
const SAMPLE_ORDER = JSON.parse(readFileSync(here('./sample-order.json'), 'utf8'));

export function createApp({ config, store, service, fetchImpl = fetch, logger = console }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (req, res) => res.json({ ok: true }));

  // ---------- Webhooks (corps brut obligatoire pour vérifier la signature) ----------
  app.post('/webhooks', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
    if (!verifyWebhook(req.body, req.get('x-shopify-hmac-sha256'), config.apiSecret)) {
      return res.status(401).send('Signature invalide');
    }
    const topic = req.get('x-shopify-topic');
    const shop = req.get('x-shopify-shop-domain');
    if (!isValidShop(shop)) return res.status(400).send('Boutique invalide');
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('JSON invalide');
    }

    try {
      switch (topic) {
        case 'orders/create':
        case 'orders/paid':
          await service.handleOrder(shop, payload, topic);
          break;
        case 'app/uninstalled':
          store.markUninstalled(shop);
          break;
        case 'customers/data_request':
          // Les données détenues sont les factures des commandes listées : le marchand
          // peut les télécharger depuis l'appli. Rien à faire automatiquement.
          logger.info(`${shop} : demande d'accès aux données client ${payload.customer?.id}`);
          break;
        case 'customers/redact':
          store.deleteInvoicesForOrders(shop, payload.orders_to_redact ?? []);
          break;
        case 'shop/redact':
          store.deleteShop(shop);
          break;
        default:
          logger.warn(`Webhook ignoré : ${topic}`);
      }
      res.status(200).send('OK');
    } catch (error) {
      logger.error(`Webhook ${topic} (${shop}) en échec : ${error.stack || error.message}`);
      res.status(500).send('Erreur'); // Shopify renverra le webhook plus tard
    }
  });

  // ---------- Lien public : /f/<jeton de la commande> ----------
  app.get('/f/:token', (req, res) => {
    const token = String(req.params.token).replace(/\.pdf$/, '');
    const invoice = /^[A-Za-z0-9_-]{16,}$/.test(token) ? store.findInvoiceByToken(token) : null;
    if (!invoice) {
      return res
        .status(404)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Facture</title><body style="font-family:sans-serif;padding:2rem">' +
            "<p>Votre facture n'est pas encore disponible. Elle est générée dès le paiement de la commande : " +
            'réessayez dans quelques minutes.</p>',
        );
    }
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex');
    res.type('application/pdf');
    res.set('Content-Disposition', `inline; filename="Facture-${invoice.number}.pdf"`);
    res.send(Buffer.from(invoice.pdf));
  });

  // ---------- Page d'administration intégrée à Shopify ----------
  app.get('/', (req, res) => {
    const shop = isValidShop(req.query.shop) ? req.query.shop : null;
    res.set(
      'Content-Security-Policy',
      `frame-ancestors ${shop ? `https://${shop} ` : ''}https://admin.shopify.com;`,
    );
    res.type('html').send(ADMIN_HTML.replaceAll('%SHOPIFY_API_KEY%', config.apiKey).replaceAll('%APP_URL%', config.appUrl));
  });

  // ---------- API de l'admin, authentifiée par le jeton de session App Bridge ----------
  const api = express.Router();
  api.use(express.json({ limit: '200kb' }));
  api.use((req, res, next) => {
    const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    try {
      if (!match) throw new Error('Jeton manquant');
      req.sessionToken = match[1];
      req.shop = verifySessionToken(match[1], config).shop;
      next();
    } catch (error) {
      res.status(401).json({ error: error.message });
    }
  });

  // Appelé au chargement de l'admin : obtient le jeton d'accès hors ligne si besoin et
  // pré-remplit les réglages avec les informations de la boutique.
  api.post('/session', async (req, res) => {
    const shopRow = store.ensureShop(req.shop);
    if (!shopRow.access_token) {
      try {
        const { access_token, scope } = await exchangeToken(req.shop, req.sessionToken, config, fetchImpl);
        store.saveToken(req.shop, access_token, scope);
        const { shop: info } = await adminGraphql(req.shop, access_token, config.apiVersion, SHOP_INFO_QUERY, {}, fetchImpl);
        const s = shopRow.settings;
        const a = info.billingAddress ?? {};
        store.saveSettings(req.shop, {
          ...s,
          companyName: s.companyName || a.company || info.name,
          email: s.email || info.contactEmail || info.email,
          phone: s.phone || a.phone || '',
          website: s.website || info.url || '',
          address:
            s.address ||
            [a.address1, a.address2, [a.zip, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n'),
        });
      } catch (error) {
        logger.error(`${req.shop} : initialisation impossible : ${error.message}`);
      }
    }
    res.json({ shop: req.shop, mailConfigured: Boolean(service.transport && service.mailFrom) });
  });

  api.get('/settings', (req, res) => {
    const row = store.ensureShop(req.shop);
    res.json({ settings: row.settings, nextNumber: row.next_number });
  });

  api.put('/settings', (req, res) => {
    const row = store.ensureShop(req.shop);
    const settings = sanitizeSettings(req.body.settings ?? {}, row.settings);
    try {
      if (req.body.nextNumber !== undefined && Number(req.body.nextNumber) !== row.next_number) {
        store.setNextNumber(req.shop, Number(req.body.nextNumber));
      }
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    store.saveSettings(req.shop, settings);
    service.logos.delete(settings.logoUrl); // le logo a pu changer à la même adresse
    res.json({ settings, nextNumber: store.getShop(req.shop).next_number });
  });

  api.get('/invoices', (req, res) => {
    res.json({ invoices: store.listInvoices(req.shop, 100) });
  });

  api.get('/invoices/:id/pdf', (req, res) => {
    const invoice = store.getInvoice(req.shop, Number(req.params.id));
    if (!invoice) return res.status(404).json({ error: 'Facture introuvable' });
    res.type('application/pdf');
    res.set('Content-Disposition', `attachment; filename="Facture-${invoice.number}.pdf"`);
    res.send(Buffer.from(invoice.pdf));
  });

  api.post('/invoices/:id/send', async (req, res) => {
    try {
      res.json(await service.sendInvoice(req.shop, Number(req.params.id)));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Aperçu avec une commande fictive et les réglages en cours d'édition (non enregistrés).
  api.post('/preview', async (req, res) => {
    const row = store.ensureShop(req.shop);
    const settings = sanitizeSettings(req.body.settings ?? {}, row.settings);
    const pdf = await service.renderPdf(buildInvoice(SAMPLE_ORDER), {
      number: `${settings.numberPrefix}${new Date().getFullYear()}-APERCU`,
      issuedAt: new Date().toISOString(),
      settings,
      shopName: req.shop.replace('.myshopify.com', ''),
    });
    res.type('application/pdf').send(pdf);
  });

  app.use('/api', api);
  return app;
}

// Démarrage direct : `node src/server.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  const store = openDatabase(config.databasePath);
  const service = new InvoiceService({
    store,
    transport: createTransport(config.mail.transport),
    mailFrom: config.mail.from,
  });
  if (!service.transport) console.warn('SMTP_URL absent : les factures seront créées mais pas envoyées.');
  createApp({ config, store, service }).listen(config.port, () => {
    console.log(`Factures PDF à l'écoute sur le port ${config.port} (${config.appUrl})`);
  });
}
