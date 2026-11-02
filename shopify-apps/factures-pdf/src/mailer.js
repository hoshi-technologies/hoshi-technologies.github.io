// Envoi de la facture par e-mail (SMTP via nodemailer).
// Les notifications natives de Shopify n'acceptent pas de pièce jointe : l'appli envoie donc
// son propre e-mail, et propose en plus un lien de téléchargement à placer dans la
// confirmation de commande Shopify (voir README).

import { fillTemplate } from './settings.js';
import { dictionary } from './i18n/index.js';

/**
 * Envoi par l'API web de Brevo (fonctionne sur Node et sur Cloudflare, qui n'autorise pas le
 * SMTP classique). Même interface que nodemailer : sendMail(message).
 */
export function createBrevoTransport(apiKey, fetchImpl = fetch) {
  const toBase64 = (content) => (typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)).toString('base64');
  const contact = (value) => (typeof value === 'string' ? { email: value } : { email: value.address, name: value.name });
  return {
    async sendMail(message) {
      const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: contact(message.from),
          to: [contact(message.to)],
          ...(message.bcc ? { bcc: [contact(message.bcc)] } : {}),
          ...(message.replyTo ? { replyTo: contact(message.replyTo) } : {}),
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
          attachment: (message.attachments ?? []).map((a) => ({ name: a.filename, content: toBase64(a.content) })),
        }),
      });
      if (!response.ok) throw new Error(`Brevo : ${response.status} ${(await response.text()).slice(0, 200)}`);
      return response.json();
    },
  };
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function buildInvoiceEmail({ invoice, settings, shopName, from }) {
  const t = dictionary(invoice.language || settings.fallbackLanguage).email;
  const shop = settings.companyName || shopName;
  const vars = {
    first_name: invoice.customer_first_name || invoice.customer_name || '',
    name: invoice.customer_name || '',
    invoice_number: invoice.number,
    order: invoice.order_name,
    shop,
  };
  let text = fillTemplate(settings.emailBody || t.body, vars);
  // Pas de prénom connu : « Bonjour ,» devient « Bonjour, ».
  const [emptyGreeting, greeting] = t.greetingFallback;
  if (text.startsWith(emptyGreeting)) text = greeting + text.slice(emptyGreeting.length);
  const html = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#111827;line-height:1.5">
${text
  .split(/\n{2,}/)
  .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
  .join('\n')}
</body></html>`;

  return {
    from: { name: shop, address: from },
    to: invoice.customer_email,
    replyTo: settings.email || undefined,
    bcc: settings.bccMerchant && settings.email ? settings.email : undefined,
    subject: fillTemplate(settings.emailSubject || t.subject, vars),
    text,
    html,
    attachments: [
      {
        filename: `${t.filename}-${invoice.number}.pdf`,
        content: Buffer.from(invoice.pdf),
        contentType: 'application/pdf',
      },
    ],
  };
}
