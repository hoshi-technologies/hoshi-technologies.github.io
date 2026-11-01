// Logique métier : création de la facture d'une commande et envoi au client.

import { buildInvoice, formatInvoiceNumber } from './invoice.js';
import { renderInvoicePdf } from './pdf.js';
import { buildInvoiceEmail } from './mailer.js';
import { getPlan, monthKey, monthStart } from './plans.js';

export class InvoiceService {
  constructor({ store, transport, mailFrom, fetchImpl = fetch, logger = console }) {
    this.store = store;
    this.transport = transport;
    this.mailFrom = mailFrom;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.queue = Promise.resolve(); // une seule création à la fois : numérotation sans trou
    this.logos = new Map();
  }

  async loadLogo(url) {
    if (!url) return null;
    if (this.logos.has(url)) return this.logos.get(url);
    let logo = null;
    try {
      const response = await this.fetch(url, { signal: AbortSignal.timeout(4000) });
      const type = response.headers.get('content-type') || '';
      if (response.ok && /image\/(png|jpe?g)/.test(type)) logo = Buffer.from(await response.arrayBuffer());
      else this.logger.warn(`Logo ignoré (${response.status} ${type}) : seuls PNG et JPEG sont acceptés`);
    } catch (error) {
      this.logger.warn(`Logo injoignable : ${error.message}`);
    }
    this.logos.set(url, logo);
    return logo;
  }

  async renderPdf(invoice, { number, issuedAt, settings, shopName }) {
    const logo = await this.loadLogo(settings.logoUrl);
    return renderInvoicePdf(invoice, { number, issuedAt, settings, shopName, logo });
  }

  /**
   * Traite un webhook orders/create ou orders/paid. Renvoie la facture (existante ou créée),
   * ou null si ce déclencheur n'est pas celui choisi par le marchand.
   */
  async handleOrder(shop, order, topic) {
    const shopRow = this.store.ensureShop(shop);
    const { settings } = shopRow;
    const wanted = settings.trigger === 'create' ? 'orders/create' : 'orders/paid';
    if (topic !== wanted) return null;

    const result = await this.createInvoice(shop, order);
    if (result.created && settings.autoSend) {
      // L'e-mail part après la réponse au webhook ; un échec reste visible dans l'admin.
      this.sendInvoice(shop, result.invoice.id).catch(() => {});
    }
    if (result.pending) this.notifyQuotaReached(shop).catch(() => {});
    return result;
  }

  /** Formule de la boutique et consommation du mois civil en cours. */
  usage(shop, now = new Date()) {
    const row = this.store.ensureShop(shop);
    const plan = getPlan(row.plan);
    const used = this.store.countInvoicesSince(shop, monthStart(now));
    return {
      plan,
      used,
      limit: plan.monthlyLimit,
      remaining: plan.monthlyLimit === null ? null : Math.max(0, plan.monthlyLimit - used),
      pending: this.store.listPendingOrders(shop).length,
    };
  }

  /** Factures des commandes mises en attente faute de quota, dans la limite disponible. */
  async generatePending(shop) {
    const { remaining } = this.usage(shop);
    const orders = this.store.getPendingPayloads(shop, remaining ?? 10_000);
    const { settings } = this.store.getShop(shop);
    let created = 0;
    for (const order of orders) {
      const result = await this.createInvoice(shop, order);
      if (!result.created) continue;
      created += 1;
      if (settings.autoSend) await this.sendInvoice(shop, result.invoice.id).catch(() => {});
    }
    return { created, pending: this.store.listPendingOrders(shop).length };
  }

  /** Prévient le marchand (une fois par mois) que le quota gratuit est atteint. */
  async notifyQuotaReached(shop) {
    const { settings } = this.store.getShop(shop);
    if (!this.transport || !this.mailFrom || !settings.email) return;
    if (!this.store.markQuotaNotified(shop, monthKey())) return;
    const { plan } = this.usage(shop);
    await this.transport.sendMail({
      from: { name: 'Factures PDF', address: this.mailFrom },
      to: settings.email,
      subject: `Limite de ${plan.monthlyLimit} factures atteinte ce mois-ci`,
      text:
        `Bonjour,\n\nVotre boutique a atteint la limite de ${plan.monthlyLimit} factures par mois de la formule ${plan.name}.\n` +
        "Les nouvelles commandes sont mises en attente : leurs factures ne sont ni créées ni envoyées.\n\n" +
        "Pour les générer et continuer à facturer automatiquement, choisissez une formule supérieure dans " +
        "Shopify > Applis > Factures PDF > Abonnement.\n\nL'équipe Factures PDF",
    });
  }

  createInvoice(shop, order) {
    const run = async () => {
      const existing = this.store.findInvoiceByOrder(shop, order.id);
      if (existing) return { invoice: existing, created: false };

      // Quota de la formule atteint : la commande est gardée pour être facturée plus tard.
      if (this.usage(shop).remaining === 0) {
        this.store.addPendingOrder(shop, order);
        this.logger.info(`${shop} : quota atteint, ${order.name ?? order.id} mise en attente`);
        return { invoice: null, created: false, pending: true };
      }

      const { settings, next_number: seq } = this.store.ensureShop(shop);
      const shopName = settings.companyName || shop.replace('.myshopify.com', '');
      const invoice = buildInvoice(order);
      if (invoice.mismatchCents) {
        this.logger.warn(`${shop} ${invoice.orderName} : écart de ${invoice.mismatchCents} centimes avec le total Shopify`);
      }
      const issuedAt = new Date().toISOString();
      const number = formatInvoiceNumber(settings.numberPrefix, seq, new Date(issuedAt));
      const pdf = await this.renderPdf(invoice, { number, issuedAt, settings, shopName });

      const saved = this.store.insertInvoice(shop, seq, {
        orderId: invoice.orderId,
        orderName: invoice.orderName,
        orderToken: invoice.orderToken,
        number,
        issuedAt,
        customerEmail: invoice.customer.email,
        customerName: invoice.customer.name,
        customerFirstName: invoice.customer.firstName,
        totalCents: invoice.totalTtcCents,
        currency: invoice.currency,
        pdf,
      });
      this.store.deletePendingOrder(shop, order.id);
      this.logger.info(`${shop} : facture ${number} créée pour ${invoice.orderName}`);
      return { invoice: saved, created: true };
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  async sendInvoice(shop, invoiceId) {
    const invoice = this.store.getInvoice(shop, invoiceId);
    if (!invoice) throw new Error('Facture introuvable');
    try {
      if (!this.transport || !this.mailFrom) throw new Error("Envoi d'e-mails non configuré (SMTP_URL, MAIL_FROM)");
      if (!invoice.customer_email) throw new Error("La commande n'a pas d'adresse e-mail");
      const { settings } = this.store.getShop(shop);
      const shopName = settings.companyName || shop.replace('.myshopify.com', '');
      const message = buildInvoiceEmail({ invoice, settings, shopName, from: this.mailFrom });
      await this.transport.sendMail(message);
      this.store.setEmailStatus(invoice.id, 'sent');
      return { status: 'sent' };
    } catch (error) {
      this.store.setEmailStatus(invoice.id, 'failed', error.message);
      this.logger.error(`${shop} : envoi de ${invoice.number} impossible : ${error.message}`);
      throw error;
    }
  }
}
