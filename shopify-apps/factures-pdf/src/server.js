// Application web (Hono) : page d'administration intégrée, API, webhooks, lien public de facture,
// guide et FAQ. Le même code tourne sur Node (src/node-app.js) et sur Cloudflare Workers
// (src/worker.js) : il ne lit aucun fichier, tout lui est fourni (stockage, service, ressources).

import { Hono } from 'hono';
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

/** Adresse IP du client, derrière Cloudflare, un tunnel ou un hébergeur. */
export function clientIp(c) {
  const forwarded = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || c.env?.incoming?.socket?.remoteAddress || null;
}

/** Première langue prise en charge de l'en-tête Accept-Language (par ordre de préférence). */
export function preferredLanguage(header, fallback = 'en') {
  const candidates = String(header || '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag, q: q === undefined ? 1 : Number(q) };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of candidates) {
    const lang = matchLanguage(tag);
    if (lang) return lang;
  }
  return fallback;
}

/**
 * @param assets  { adminHtml: string, sampleOrder: object } : page d'admin et commande d'exemple
 * @param hooks   { onShopDeleted(shop) } : actions propres à l'hébergement (index Cloudflare…)
 */
export function createApp({ config, store, service, assets, fetchImpl = fetch, logger = console, hooks = {} }) {
  const app = new Hono();

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

  const pdfResponse = (c, pdf, disposition) =>
    c.body(new Uint8Array(pdf), 200, { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition });

  app.onError((error, c) => {
    logger.error(`${c.req.method} ${c.req.path} : ${error.stack || error.message}`);
    return c.json({ error: error.message }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  // ---------- Webhooks (corps brut obligatoire pour vérifier la signature) ----------
  app.post('/webhooks', async (c) => {
    const raw = new Uint8Array(await c.req.arrayBuffer());
    if (!verifyWebhook(raw, c.req.header('x-shopify-hmac-sha256'), config.apiSecret)) {
      return c.text('Signature invalide', 401);
    }
    const topic = c.req.header('x-shopify-topic');
    const shop = c.req.header('x-shopify-shop-domain');
    if (!isValidShop(shop)) return c.text('Boutique invalide', 400);
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return c.text('JSON invalide', 400);
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
          store.logAccess(shop, { actor: 'shopify', action: 'customer.data_request', target: payload.customer?.id ?? null });
          break;
        case 'customers/redact':
          store.deleteInvoicesForOrders(shop, payload.orders_to_redact ?? []);
          store.logAccess(shop, { actor: 'shopify', action: 'customer.redact', target: (payload.orders_to_redact ?? []).length });
          break;
        case 'shop/redact':
          store.deleteShop(shop);
          await hooks.onShopDeleted?.(shop);
          break;
        default:
          logger.warn(`Webhook ignoré : ${topic}`);
      }
      return c.text('OK');
    } catch (error) {
      logger.error(`Webhook ${topic} (${shop}) en échec : ${error.stack || error.message}`);
      return c.text('Erreur', 500); // Shopify renverra le webhook plus tard
    }
  });

  // ---------- Lien public : /f/<jeton de la commande> ----------
  app.get('/f/:token', (c) => {
    const token = String(c.req.param('token')).replace(/\.pdf$/, '');
    const invoice = /^[A-Za-z0-9_-]{16,}$/.test(token) ? store?.findInvoiceByToken(token) : null;
    if (!invoice) {
      const lang = preferredLanguage(c.req.header('accept-language'));
      const dict = dictionary(lang);
      return c.html(
        `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
          `<title>${dict.email.filename}</title><body style="font-family:sans-serif;padding:2rem"><p>${dict.notReady}</p>`,
        404,
      );
    }
    store.logAccess(invoice.shop, { actor: 'customer', action: 'invoice.public_download', target: invoice.number, ip: clientIp(c) });
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Robots-Tag', 'noindex');
    return pdfResponse(c, invoice.pdf, `inline; filename="${dictionary(invoice.language).email.filename}-${invoice.number}.pdf"`);
  });

  // ---------- Guide et FAQ publics (liens de la fiche App Store) : /guide?lang=de, /faq ----------
  const docsLanguage = (c) => matchLanguage(c.req.query('lang')) ?? preferredLanguage(c.req.header('accept-language'));
  const docsContext = (lang) => ({ lang, languages: LANGUAGES, t: dictionary(lang).admin, support: config.supportEmail });
  app.get('/guide', (c) => {
    const lang = docsLanguage(c);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.html(renderGuidePage({ ...docsContext(lang), guide: guide(lang) }));
  });
  app.get('/faq', (c) => {
    const lang = docsLanguage(c);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.html(renderFaqPage({ ...docsContext(lang), faq: faq(lang) }));
  });

  // ---------- Page d'administration intégrée à Shopify ----------
  app.get('/', (c) => {
    const shop = isValidShop(c.req.query('shop')) ? c.req.query('shop') : null;
    c.header('Content-Security-Policy', `frame-ancestors ${shop ? `https://${shop} ` : ''}https://admin.shopify.com;`);
    // Shopify passe la langue de l'administrateur dans ?locale= (fr, en, pt-BR…).
    const lang = resolveLanguage(c.req.query('locale'), 'en');
    const i18n = { lang, t: dictionary(lang).admin, languages: LANGUAGES, faq: faq(lang), guide: guide(lang), support: config.supportEmail };
    return c.html(
      assets.adminHtml
        .replaceAll('%SHOPIFY_API_KEY%', config.apiKey)
        .replaceAll('%APP_URL%', config.appUrl)
        .replaceAll('%LANG%', lang)
        .replace('/*%I18N%*/', () => `window.I18N = ${JSON.stringify(i18n).replace(/</g, '\\u003c')};`),
    );
  });

  // ---------- API de l'admin, authentifiée par le jeton de session App Bridge ----------
  const api = new Hono();
  api.use('*', async (c, next) => {
    const match = /^Bearer (.+)$/.exec(c.req.header('authorization') || '');
    try {
      if (!match) throw new Error('Jeton manquant');
      const { shop, claims } = verifySessionToken(match[1], config);
      c.set('sessionToken', match[1]);
      c.set('shop', shop);
      c.set('actor', `user:${claims.sub ?? 'inconnu'}`); // utilisateur de l'admin Shopify
    } catch (error) {
      return c.json({ error: error.message }, 401);
    }
    await next();
  });
  const body = (c) => c.req.json().catch(() => ({}));

  // Appelé au chargement de l'admin : obtient le jeton d'accès hors ligne si besoin et
  // pré-remplit les réglages avec les informations de la boutique.
  api.post('/session', async (c) => {
    const shop = c.get('shop');
    const input = await body(c);
    const shopRow = store.ensureShop(shop);
    if (!shopRow.access_token) {
      try {
        const { access_token, scope } = await exchangeToken(shop, c.get('sessionToken'), config, fetchImpl);
        store.saveToken(shop, access_token, scope);
        const s = shopRow.settings;
        const info = await shopifyCompanyInfo(shop);
        // Pré-remplissage : on ne remplace jamais une valeur déjà saisie.
        const filled = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, s[k] || v]));
        store.saveSettings(shop, {
          ...s,
          ...filled,
          countryCode: info.countryCode || s.countryCode,
          fallbackLanguage: matchLanguage(input.locale) ?? s.fallbackLanguage,
        });
      } catch (error) {
        logger.error(`${shop} : initialisation impossible : ${error.message}`);
      }
    }
    // Au retour de la page de confirmation d'abonnement, la formule est mise à jour ici.
    try {
      if (store.getShop(shop).access_token) await syncSubscription(shop);
    } catch (error) {
      logger.warn(`${shop} : abonnement non synchronisé : ${error.message}`);
    }
    return c.json({ shop, mailConfigured: Boolean(service.transport && service.mailFrom) });
  });

  const settingsResponse = (row) => ({
    settings: row.settings,
    nextNumber: row.next_number,
    facturxIssues: facturxIssues(row.settings),
  });

  api.get('/settings', (c) => c.json(settingsResponse(store.ensureShop(c.get('shop')))));

  api.put('/settings', async (c) => {
    const shop = c.get('shop');
    const input = await body(c);
    const row = store.ensureShop(shop);
    const settings = sanitizeSettings(input.settings ?? {}, row.settings);
    try {
      if (input.nextNumber !== undefined && Number(input.nextNumber) !== row.next_number) {
        store.setNextNumber(shop, Number(input.nextNumber));
      }
    } catch (error) {
      return c.json({ error: error.message }, 400);
    }
    store.saveSettings(shop, settings);
    service.logos.delete(settings.logoUrl); // le logo a pu changer à la même adresse
    return c.json(settingsResponse(store.getShop(shop)));
  });

  // Chaque consultation de données personnelles est journalisée (voir /api/access-log).
  const audit = (c, action, target = null) =>
    store.logAccess(c.get('shop'), { actor: c.get('actor'), action, target, ip: clientIp(c) });

  api.get('/invoices', (c) => {
    audit(c, 'invoice.list');
    return c.json({ invoices: store.listInvoices(c.get('shop'), 100) });
  });

  api.get('/access-log', (c) => c.json({ entries: store.listAccessLog(c.get('shop'), 200) }));

  api.get('/invoices/:id/pdf', (c) => {
    const invoice = store.getInvoice(c.get('shop'), Number(c.req.param('id')));
    if (!invoice) return c.json({ error: 'Facture introuvable' }, 404);
    audit(c, 'invoice.download', invoice.number);
    return pdfResponse(c, invoice.pdf, `attachment; filename="Facture-${invoice.number}.pdf"`);
  });

  api.post('/invoices/:id/send', async (c) => {
    const shop = c.get('shop');
    const id = Number(c.req.param('id'));
    try {
      const invoice = store.getInvoice(shop, id);
      if (invoice) audit(c, 'invoice.send', invoice.number);
      return c.json(await service.sendInvoice(shop, id));
    } catch (error) {
      return c.json({ error: error.message }, 400);
    }
  });

  // ---------- Remplissage automatique des informations d'entreprise ----------
  // Rien n'est enregistré ici : l'admin remplit le formulaire, le marchand vérifie et enregistre.
  api.get('/company/shopify', async (c) => {
    try {
      return c.json({ company: await shopifyCompanyInfo(c.get('shop')) });
    } catch (error) {
      return c.json({ error: error.message }, 502);
    }
  });

  api.get('/company/lookup', async (c) => {
    try {
      return c.json({ results: await lookupFrenchCompany(c.req.query('q'), fetchImpl) });
    } catch (error) {
      logger.warn(`${c.get('shop')} : recherche d'entreprise impossible : ${error.message}`);
      return c.json({ error: error.message }, 502);
    }
  });

  // ---------- Abonnement ----------
  api.get('/billing', (c) => {
    const usage = service.usage(c.get('shop'));
    return c.json({
      current: usage.plan.key,
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      pending: usage.pending,
      currency: BILLING_CURRENCY,
      plans: Object.values(PLANS),
    });
  });

  api.post('/billing/subscribe', async (c) => {
    const shop = c.get('shop');
    const plan = PLANS[(await body(c)).plan];
    if (!plan || plan.price === 0) return c.json({ error: 'Formule inconnue' }, 400);
    try {
      const data = await graphql(shop, SUBSCRIPTION_CREATE, {
        name: subscriptionName(plan),
        returnUrl: `https://${shop}/admin/apps/${config.apiKey}`,
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
      return c.json({ confirmationUrl: result.confirmationUrl });
    } catch (error) {
      logger.error(`${shop} : abonnement impossible : ${error.message}`);
      return c.json({ error: `Abonnement impossible : ${error.message}` }, 502);
    }
  });

  api.post('/billing/cancel', async (c) => {
    const shop = c.get('shop');
    const { subscription_id: id } = store.ensureShop(shop);
    try {
      if (id) {
        const { appSubscriptionCancel: result } = await graphql(shop, SUBSCRIPTION_CANCEL, { id });
        if (result.userErrors.length) throw new Error(result.userErrors.map((e) => e.message).join(', '));
      }
      store.setPlan(shop, 'free');
      return c.json({ current: 'free' });
    } catch (error) {
      return c.json({ error: `Résiliation impossible : ${error.message}` }, 502);
    }
  });

  api.post('/pending/generate', async (c) => {
    audit(c, 'pending.generate');
    return c.json(await service.generatePending(c.get('shop')));
  });

  // Aperçu avec une commande fictive et les réglages en cours d'édition (non enregistrés).
  api.post('/preview', async (c) => {
    const shop = c.get('shop');
    const input = await body(c);
    const row = store.ensureShop(shop);
    const settings = sanitizeSettings(input.settings ?? {}, row.settings);
    const lang = invoiceLanguage(settings, input.locale);
    const { pdf } = await service.renderPdf(buildInvoice(assets.sampleOrder), {
      number: `${settings.numberPrefix}${new Date().getFullYear()}-${dictionary(lang).invoice.preview}`,
      issuedAt: new Date().toISOString(),
      settings,
      shopName: shop.replace('.myshopify.com', ''),
      lang,
    });
    return c.body(new Uint8Array(pdf), 200, { 'Content-Type': 'application/pdf' });
  });

  app.route('/api', api);
  return app;
}
