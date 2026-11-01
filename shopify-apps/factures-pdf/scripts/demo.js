// Mode démo : l'appli complète sur votre ordinateur, sans compte ni boutique Shopify.
//
//   npm run demo            puis ouvrir http://localhost:3000
//   npm run demo -- en      interface dans une autre langue (fr, en, de, es, it, nl, pt-BR)
//
// Shopify est simulé : boutique fictive, commandes d'exemple, abonnement de test. Les e-mails
// ne partent pas : ils sont affichés dans le terminal. Tout est effacé à l'arrêt (Ctrl+C).

import express from 'express';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../src/db.js';
import { InvoiceService } from '../src/service.js';
import { createApp } from '../src/server.js';
import { signSessionToken } from '../src/shopify.js';
import { sanitizeSettings } from '../src/settings.js';
import { matchLanguage } from '../src/i18n/index.js';

const SHOP = 'boutique-demo.myshopify.com';
const PORT = Number(process.env.PORT || 3000);
const lang = matchLanguage(process.argv[2]) ?? 'fr';
const config = {
  apiKey: 'demo-api-key',
  apiSecret: 'demo-api-secret',
  apiVersion: '2026-10',
  appUrl: `http://localhost:${PORT}`,
  billingTest: true,
  supportEmail: 'support@exemple.fr',
};
const quiet = { info() {}, warn: console.warn, error: console.error };

// ---------- Shopify simulé ----------
let activeSubscription = null;
const json = (data) => Response.json({ data });
async function fakeShopify(url, options = {}) {
  if (!url.includes('.myshopify.com')) return fetch(url, options); // logo, registre SIRENE : réseau réel
  if (url.endsWith('/admin/oauth/access_token')) return Response.json({ access_token: 'shpat_demo', scope: 'read_orders' });
  const { query, variables } = JSON.parse(options.body);
  if (query.includes('appSubscriptionCreate')) {
    activeSubscription = { id: 'gid://shopify/AppSubscription/1', name: variables.name, status: 'ACTIVE', test: true };
    return json({ appSubscriptionCreate: { confirmationUrl: `${config.appUrl}/demo/subscribed`, appSubscription: activeSubscription, userErrors: [] } });
  }
  if (query.includes('appSubscriptionCancel')) {
    activeSubscription = null;
    return json({ appSubscriptionCancel: { appSubscription: { id: variables.id, status: 'CANCELLED' }, userErrors: [] } });
  }
  if (query.includes('currentAppInstallation')) return json({ currentAppInstallation: { activeSubscriptions: activeSubscription ? [activeSubscription] : [] } });
  if (query.includes('businessEntity')) {
    return json({ businessEntity: { companyName: 'Atelier Démo SAS', address: { address1: '8 place Bellecour', address2: null, zip: '69002', city: 'Lyon', countryCode: 'FR' } } });
  }
  return json({
    shop: {
      name: 'Boutique Démo',
      email: 'proprietaire@exemple.fr',
      contactEmail: 'contact@exemple.fr',
      url: 'https://boutique-demo.exemple.fr',
      ianaTimezone: 'Europe/Paris',
      billingAddress: { company: null, address1: '8 place Bellecour', zip: '69002', city: 'Lyon', countryCodeV2: 'FR', phone: '+33 4 00 00 00 00' },
    },
  });
}

// E-mails affichés dans le terminal au lieu d'être envoyés.
const transport = {
  async sendMail(message) {
    const files = (message.attachments ?? []).map((a) => a.filename).join(', ');
    console.log(`\n✉️  E-mail (non envoyé, mode démo)\n   À : ${message.to}${message.bcc ? ` (copie : ${message.bcc})` : ''}\n   Objet : ${message.subject}\n   Pièce jointe : ${files || '–'}\n`);
  },
};

const store = openDatabase(':memory:');
const service = new InvoiceService({ store, transport, mailFrom: 'factures@exemple.fr', logger: quiet, fetchImpl: fakeShopify });
const inner = createApp({ config, store, service, fetchImpl: fakeShopify, logger: quiet });

// ---------- Serveur de démo ----------
const app = express();
const token = () => {
  const now = Math.floor(Date.now() / 1000);
  return signSessionToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: config.apiKey, sub: '1', exp: now + 300, nbf: now - 5 }, config.apiSecret);
};
app.get('/demo/token', (req, res) => res.type('text').send(token()));
app.get('/demo/subscribed', (req, res) => res.redirect('/')); // retour de la « page de paiement Shopify »

// Nouvelle commande d'exemple, pour voir une facture arriver en direct.
const ORDER = JSON.parse(readFileSync(new URL('../src/sample-order.json', import.meta.url)));
const CUSTOMERS = [
  ['Marie', 'Dupont', 'fr'],
  ['John', 'Smith', 'en-GB'],
  ['Lena', 'Müller', 'de-DE'],
  ['Lucía', 'García', 'es-ES'],
  ['Giulia', 'Rossi', 'it-IT'],
  ['Daan', 'de Vries', 'nl-NL'],
  ['Ana', 'Souza', 'pt-BR'],
];
let orderCount = 0;
async function newOrder() {
  orderCount += 1;
  const [first, last, locale] = CUSTOMERS[(orderCount - 1) % CUSTOMERS.length];
  const id = 9000 + orderCount;
  const orderToken = `demo${String(orderCount).padStart(28, '0')}`;
  const person = { ...ORDER.billing_address, first_name: first, last_name: last };
  const order = {
    ...ORDER,
    id,
    name: `#${1000 + orderCount}`,
    order_number: 1000 + orderCount,
    email: `${first.toLowerCase()}@exemple.com`,
    customer_locale: locale,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    token: orderToken,
    order_status_url: `https://${SHOP}/1/orders/${orderToken}/authenticate?key=demo`,
    customer: { ...ORDER.customer, first_name: first, last_name: last },
    billing_address: person,
    shipping_address: person,
  };
  await service.handleOrder(SHOP, order, 'orders/paid');
  return order;
}
app.post('/demo/order', async (req, res) => {
  const order = await newOrder();
  res.json({ name: order.name });
});

// Page d'admin : App Bridge remplacé par une version simulée + bandeau « mode démo ».
app.get('/', async (req, res, next) => {
  if (!req.query.shop) return res.redirect(`/?shop=${SHOP}&locale=${lang}`);
  const html = await (await fetch(`${config.appUrl}/_inner/?${new URLSearchParams(req.query)}`)).text();
  const stub = `<script>
    window.shopify = {
      idToken: async () => (await fetch('/demo/token')).text(),
      toast: { show(message, opts = {}) {
        const el = Object.assign(document.createElement('div'), { textContent: message });
        el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;padding:10px 16px;border-radius:10px;color:#fff;font:600 14px sans-serif;background:' + (opts.isError ? '#c70a24' : '#303030');
        document.body.append(el); setTimeout(() => el.remove(), 3000);
      } },
    };
  </script>`;
  const banner = `<div style="background:#fff4d6;border-bottom:1px solid #f0d58c;padding:10px 16px;font:14px sans-serif;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap">
    <b>Mode démo</b> – Shopify est simulé, les e-mails s'affichent dans le terminal.
    <button onclick="fetch('/demo/order',{method:'POST'}).then(r=>r.json()).then(o=>{shopify.toast.show('Commande '+o.name+' payée');setTimeout(()=>location.reload(),600)})"
      style="font:600 14px sans-serif;padding:6px 12px;border-radius:8px;border:0;background:#303030;color:#fff;cursor:pointer">+ Simuler une commande payée</button>
    <a href="/guide?lang=${lang}" target="_blank">Guide</a> · <a href="/faq?lang=${lang}" target="_blank">FAQ</a>
  </div>`;
  res
    .type('html')
    .send(html.replace('<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>', stub).replace('<body>', `<body>${banner}`));
});
app.use('/_inner', inner);
app.use(inner);

app.listen(PORT, async () => {
  // Installation simulée (infos reprises de « Shopify »), puis deux commandes d'exemple.
  store.saveSettings(SHOP, sanitizeSettings({ fallbackLanguage: lang }));
  await fetch(`${config.appUrl}/api/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: lang }),
  });
  await newOrder();
  await newOrder();
  console.log(`\nFactures PDF – mode démo\n  Ouvrez http://localhost:${PORT} dans votre navigateur.\n  Arrêt : Ctrl+C (les données de démo sont effacées).\n`);
});
