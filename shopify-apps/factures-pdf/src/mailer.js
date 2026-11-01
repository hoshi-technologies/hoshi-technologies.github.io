// Envoi de la facture par e-mail (SMTP via nodemailer).
// Les notifications natives de Shopify n'acceptent pas de pièce jointe : l'appli envoie donc
// son propre e-mail, et propose en plus un lien de téléchargement à placer dans la
// confirmation de commande Shopify (voir README).

import nodemailer from 'nodemailer';
import { fillTemplate } from './settings.js';

export function createTransport(url) {
  if (!url) return null;
  if (url === 'json') return nodemailer.createTransport({ jsonTransport: true });
  return nodemailer.createTransport(url);
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function buildInvoiceEmail({ invoice, settings, shopName, from }) {
  const boutique = settings.companyName || shopName;
  const vars = {
    prenom: invoice.customer_first_name || invoice.customer_name || '',
    nom: invoice.customer_name || '',
    numero_facture: invoice.number,
    commande: invoice.order_name,
    boutique,
  };
  const text = fillTemplate(settings.emailBody, vars).replace(/^Bonjour ,/, 'Bonjour,');
  const html = `<!doctype html><html lang="fr"><body style="font-family:Helvetica,Arial,sans-serif;color:#111827;line-height:1.5">
${text
  .split(/\n{2,}/)
  .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
  .join('\n')}
</body></html>`;

  return {
    from: { name: boutique, address: from },
    to: invoice.customer_email,
    replyTo: settings.email || undefined,
    bcc: settings.bccMerchant && settings.email ? settings.email : undefined,
    subject: fillTemplate(settings.emailSubject, vars),
    text,
    html,
    attachments: [
      {
        filename: `Facture-${invoice.number}.pdf`,
        content: Buffer.from(invoice.pdf),
        contentType: 'application/pdf',
      },
    ],
  };
}
