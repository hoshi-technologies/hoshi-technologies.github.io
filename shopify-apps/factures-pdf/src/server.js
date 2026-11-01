// Serveur de l'appli : page d'administration intégrée, API, webhooks et lien public de facture.

import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sanitizeSettings } from './settings.js';
import { buildInvoice } from './invoice.js';
import {
  verifyWebhook,
  verifySessionToken,
  exchangeToken,
  adminGraphql,
  isValidShop,
  SHOP_INFO_QUERY,
  BUSINESS_ENTITY_QUERY,
  SUBSCRIPTION_CREATE,
  SUBSCRIPTION_CANCEL,
  ACTIVE_SUBSCRIPTIONS,
} from './shopify.js';
import { facturxIssues } from './facturx.js';
import { lookupFrenchCompany } from './company-lookup.js';
import { LANGUAGES, dictionary, resolveLanguage, matchLanguage, invoiceLanguage } from './i18n/index.js';
import { guideContent, faqContent } from './docs.js';
import { renderFaqPage, renderGuidePage } from './docs-page.js';
import { PLANS, BILLING_CURRENCY, subscriptionName, planFromSubscriptionName } from './plans.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const ADMIN_HTML = readFileSync(here('../public/admin.html'), 'utf8');
const SAMPLE_ORDER = JSON.parse(readFileSync(here('./sample-order.json'), 'utf8'));

export function createApp({ config, store, service, fetchImpl = fetch, logger = console }) {
  const app = express();

  const guide = (lang) => guideContent(lang, config.supportEmail);
  const faq = (lang) => faqContent(lang, config.supportEmail);

  const graphql = (shop, query, variables) => {
    const { access_token: token } = store.getShop(shop) ?? {};
    if (!token) throw new Error("Appli non initialisée : rechargez la page de l'appli");
    return adminGraphql(shop, token, config.apiVersion, query, variables, fetchImpl);
  };

  /**
   * Informations d'entreprise connues de Shopify : entité légale principale (raison sociale,
   * adresse légale) si disponible, sinon les coordonnées de la boutique. Shopify ne fournit
   * ni SIRET ni n° de TVA.
   */
  async function shopifyCompanyInfo(shop) {
    const { shop: info } = await graphql(shop, SHOP_INFO_QUERY);
    let entity = null;
    try {
      entity = (await graphql(shop, BUSINESS_ENTITY_QUERY)).businessEntity;
    } catch (error) {
      logger.warn(`${shop} : entité légale Shopify non lue (${error.message})`);
    }
    const billing = info.billingAddress ?? {};
    const legal = entity?.address;
    const addr = legal?.address1
      ? { address1: legal.address1, address2: legal.address2, zip: legal.zip, city: legal.city, countryCode: legal.countryCode }
      : { address1: billing.address1, address2: billing.address2, zip: billing.zip, city: billing.city, countryCode: billing.countryCodeV2 };
    return {
      companyName: entity?.companyName || billing.company || info.name || '',
      address: [addr.address1, addr.address2, [addr.zip, addr.city].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
      countryCode: addr.countryCode || '',
      email: info.contactEmail || info.email || '',
      phone: billing.phone || '',
      website: info.url || '',
      timezone: info.ianaTimezone || '',
    };
  }

  /** Aligne la formule enregistrée sur l'abonnement actif côté Shopify. */
  async function syncSubscription(shop) {
    const data = await graphql(shop, ACTIVE_SUBSCRIPTIONS);
    const active = (data.currentAppInstallation?.activeSubscriptions ?? []).find((sub) => sub.status === 'ACTIVE');
    const plan = active && planFromSubscriptionName(active.name);
    store.setPlan(shop, plan ? plan.key : 'free', plan ? active.id : null);
  }

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
        case 'app_subscriptions/update': {
          const sub = payload.app_subscription ?? {};
          const plan = planFromSubscriptionName(sub.name);
          const current = store.ensureShop(shop);
          if (sub.status === 'ACTIVE' && plan) store.setPlan(shop, plan.key, sub.admin_graphql_api_id);
          else if (sub.admin_graphql_api_id === current.subscription_id) store.setPlan(shop, 'free');
          break;
        }
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
      const lang = resolveLanguage(req.acceptsLanguages(...LANGUAGES.map((l) => l.code), 'pt') || 'en');
      const dict = dictionary(lang);
      return res
        .status(404)
        .type('html')
        .send(
          `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
            `<title>${dict.email.filename}</title><body style="font-family:sans-serif;padding:2rem"><p>${dict.notReady}</p>`,
        );
    }
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex');
    res.type('application/pdf');
    res.set('Content-Disposition', `inline; filename="${dictionary(invoice.language).email.filename}-${invoice.number}.pdf"`);
    res.send(Buffer.from(invoice.pdf));
  });

  // ---------- Guide et FAQ publics (liens de la fiche App Store) : /guide?lang=de, /faq ----------
  const docsLanguage = (req) =>
    matchLanguage(req.query.lang) ?? resolveLanguage(req.acceptsLanguages(...LANGUAGES.map((l) => l.code), 'pt') || 'en');
  const docsContext = (lang) => ({ lang, languages: LANGUAGES, t: dictionary(lang).admin, support: config.supportEmail });
  app.get('/guide', (req, res) => {
    const lang = docsLanguage(req);
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderGuidePage({ ...docsContext(lang), guide: guide(lang) }));
  });
  app.get('/faq', (req, res) => {
    const lang = docsLanguage(req);
    res.set('Cache-Control', 'public, max-age=3600');
    res.type('html').send(renderFaqPage({ ...docsContext(lang), faq: faq(lang) }));
  });

  // ---------- Page d'administration intégrée à Shopify ----------
  app.get('/', (req, res) => {
    const shop = isValidShop(req.query.shop) ? req.query.shop : null;
    res.set(
      'Content-Security-Policy',
      `frame-ancestors ${shop ? `https://${shop} ` : ''}https://admin.shopify.com;`,
    );
    // Shopify passe la langue de l'administrateur dans ?locale= (fr, en, pt-BR…).
    const lang = resolveLanguage(req.query.locale, 'en');
    const i18n = { lang, t: dictionary(lang).admin, languages: LANGUAGES, faq: faq(lang), guide: guide(lang), support: config.supportEmail };
    res.type('html').send(
      ADMIN_HTML.replaceAll('%SHOPIFY_API_KEY%', config.apiKey)
        .replaceAll('%APP_URL%', config.appUrl)
        .replaceAll('%LANG%', lang)
        .replace('/*%I18N%*/', () => `window.I18N = ${JSON.stringify(i18n).replace(/</g, '\\u003c')};`),
    );
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
        const s = shopRow.settings;
        const info = await shopifyCompanyInfo(req.shop);
        // Pré-remplissage : on ne remplace jamais une valeur déjà saisie.
        const filled = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, s[k] || v]));
        store.saveSettings(req.shop, {
          ...s,
          ...filled,
          countryCode: info.countryCode || s.countryCode,
          fallbackLanguage: matchLanguage(req.body?.locale) ?? s.fallbackLanguage,
        });
      } catch (error) {
        logger.error(`${req.shop} : initialisation impossible : ${error.message}`);
      }
    }
    // Au retour de la page de confirmation d'abonnement, la formule est mise à jour ici.
    try {
      if (store.getShop(req.shop).access_token) await syncSubscription(req.shop);
    } catch (error) {
      logger.warn(`${req.shop} : abonnement non synchronisé : ${error.message}`);
    }
    res.json({ shop: req.shop, mailConfigured: Boolean(service.transport && service.mailFrom) });
  });

  const settingsResponse = (row) => ({
    settings: row.settings,
    nextNumber: row.next_number,
    facturxIssues: facturxIssues(row.settings),
  });

  api.get('/settings', (req, res) => {
    res.json(settingsResponse(store.ensureShop(req.shop)));
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
    res.json(settingsResponse(store.getShop(req.shop)));
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

  // ---------- Remplissage automatique des informations d'entreprise ----------
  // Rien n'est enregistré ici : l'admin remplit le formulaire, le marchand vérifie et enregistre.
  api.get('/company/shopify', async (req, res) => {
    try {
      res.json({ company: await shopifyCompanyInfo(req.shop) });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  api.get('/company/lookup', async (req, res) => {
    try {
      res.json({ results: await lookupFrenchCompany(req.query.q, fetchImpl) });
    } catch (error) {
      logger.warn(`${req.shop} : recherche d'entreprise impossible : ${error.message}`);
      res.status(502).json({ error: error.message });
    }
  });

  // ---------- Abonnement ----------
  api.get('/billing', (req, res) => {
    const usage = service.usage(req.shop);
    res.json({
      current: usage.plan.key,
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      pending: usage.pending,
      currency: BILLING_CURRENCY,
      plans: Object.values(PLANS),
    });
  });

  api.post('/billing/subscribe', async (req, res) => {
    const plan = PLANS[req.body.plan];
    if (!plan || plan.price === 0) return res.status(400).json({ error: 'Formule inconnue' });
    try {
      const data = await graphql(req.shop, SUBSCRIPTION_CREATE, {
        name: subscriptionName(plan),
        returnUrl: `https://${req.shop}/admin/apps/${config.apiKey}`,
        trialDays: plan.trialDays ?? 0,
        test: config.billingTest,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: plan.price, currencyCode: BILLING_CURRENCY },
                interval: 'EVERY_30_DAYS',
              },
            },
          },
        ],
      });
      const result = data.appSubscriptionCreate;
      if (result.userErrors.length) throw new Error(result.userErrors.map((e) => e.message).join(', '));
      // Le marchand valide le paiement sur une page Shopify, puis revient dans l'appli.
      res.json({ confirmationUrl: result.confirmationUrl });
    } catch (error) {
      logger.error(`${req.shop} : abonnement impossible : ${error.message}`);
      res.status(502).json({ error: `Abonnement impossible : ${error.message}` });
    }
  });

  api.post('/billing/cancel', async (req, res) => {
    const { subscription_id: id } = store.ensureShop(req.shop);
    try {
      if (id) {
        const { appSubscriptionCancel: result } = await graphql(req.shop, SUBSCRIPTION_CANCEL, { id });
        if (result.userErrors.length) throw new Error(result.userErrors.map((e) => e.message).join(', '));
      }
      store.setPlan(req.shop, 'free');
      res.json({ current: 'free' });
    } catch (error) {
      res.status(502).json({ error: `Résiliation impossible : ${error.message}` });
    }
  });

  api.post('/pending/generate', async (req, res) => {
    res.json(await service.generatePending(req.shop));
  });

  // Aperçu avec une commande fictive et les réglages en cours d'édition (non enregistrés).
  api.post('/preview', async (req, res) => {
    const row = store.ensureShop(req.shop);
    const settings = sanitizeSettings(req.body.settings ?? {}, row.settings);
    const lang = invoiceLanguage(settings, req.body.locale);
    const { pdf } = await service.renderPdf(buildInvoice(SAMPLE_ORDER), {
      number: `${settings.numberPrefix}${new Date().getFullYear()}-${dictionary(lang).invoice.preview}`,
      issuedAt: new Date().toISOString(),
      settings,
      shopName: req.shop.replace('.myshopify.com', ''),
      lang,
    });
    res.type('application/pdf').send(pdf);
  });

  app.use('/api', api);
  return app;
}
