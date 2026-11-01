// Mise en page de la facture PDF (A4) avec pdfkit, au format PDF/A-3b.
// Si un XML Factur-X est fourni, il est embarqué : le PDF devient une facture Factur-X.

import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { dictionary, format } from './i18n/index.js';
import { FACTURX_FILENAME, FACTURX_XMP } from './facturx.js';

const PAGE = { margin: 45, width: 595.28, height: 841.89 };
const RIGHT = PAGE.width - PAGE.margin;
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

const COLUMNS = [
  { key: 'label', title: 'description', x: 45, width: 205, align: 'left' },
  { key: 'quantity', title: 'qty', x: 250, width: 40, align: 'right' },
  { key: 'unit', title: 'unitPrice', x: 290, width: 75, align: 'right' },
  { key: 'discount', title: 'discount', x: 365, width: 60, align: 'right' },
  { key: 'rate', title: 'vat', x: 425, width: 45, align: 'right' },
  { key: 'total', title: 'lineTotal', x: 470, width: 80, align: 'right' },
];

// Polices embarquées (obligatoire en PDF/A) : Liberation Sans, licence SIL OFL.
const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
const FONTS = {
  regular: `${FONT_DIR}LiberationSans-Regular.ttf`,
  bold: `${FONT_DIR}LiberationSans-Bold.ttf`,
  italic: `${FONT_DIR}LiberationSans-Italic.ttf`,
};

// Espaces fines insécables (fr-FR) remplacées par des insécables classiques, plus sûres.
const clean = (text) => String(text ?? '').replace(/[\u202f\u2009]/g, '\u00a0');
// Les métadonnées XMP n'échappent pas le XML : on retire les caractères spéciaux.
const xmpSafe = (text) => String(text ?? '').replace(/[<>&"]/g, '');

export function money(cents, currency, intl = 'fr-FR') {
  return clean(new Intl.NumberFormat(intl, { style: 'currency', currency }).format(cents / 100));
}

const percent = (rate, intl) => clean(new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(rate * 100)) + ' %';

export function formatDate(value, intl = 'fr-FR', timeZone = 'Europe/Paris') {
  try {
    return new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));
  }
}

function countryName(code, intl) {
  try {
    return code ? new Intl.DisplayNames([intl], { type: 'region' }).of(code) : '';
  } catch {
    return '';
  }
}

function sellerLines(s, t, colon, intl) {
  const address = String(s.address || '');
  const country = countryName(s.countryCode, intl);
  return [
    s.legalForm,
    ...address.split('\n'),
    // Pays ajouté s'il n'est pas déjà écrit dans l'adresse.
    country && !address.toLowerCase().includes(country.toLowerCase()) ? country : '',
    s.siret && `${t.siret}${colon}${s.siret}`,
    s.rcs,
    !s.vatExempt && s.vatNumber && `${t.vatNumber}${colon}${s.vatNumber}`,
    s.email,
    s.phone,
    s.website,
  ].filter((line) => line && line.trim());
}

/**
 * @param {object} invoice  résultat de buildInvoice()
 * @param {object} meta     { number, issuedAt, settings, shopName, logo (Buffer|null),
 *                            lang (code de langue), facturxXml (chaîne XML ou null) }
 * @returns {Promise<Buffer>}
 */
export function renderInvoicePdf(invoice, { number, issuedAt, settings, shopName, logo, lang = 'fr', facturxXml = null }) {
  const dict = dictionary(lang);
  const t = dict.invoice;
  const intl = dict.intl;
  const tz = settings.timezone || 'Europe/Paris';
  const date = (value) => formatDate(value, intl, tz);
  const fmt = (cents) => money(cents, invoice.currency, intl);

  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    pdfVersion: '1.7',
    subset: 'PDF/A-3b',
    font: FONTS.regular,
    lang: intl,
    info: {
      Title: xmpSafe(`${dict.email.filename} ${number}`),
      Author: xmpSafe(settings.companyName || shopName),
      Subject: xmpSafe(`${t.order} ${invoice.orderName}`),
      Creator: 'Factures PDF',
    },
  });
  doc.registerFont('Regular', FONTS.regular);
  doc.registerFont('Bold', FONTS.bold);
  doc.registerFont('Italic', FONTS.italic);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const accent = settings.accentColor || '#1f2937';
  const sellerName = settings.companyName || shopName || '';

  // En-tête : logo ou nom du vendeur à gauche, bloc « FACTURE » à droite.
  let top = PAGE.margin;
  let logoBottom = top;
  if (logo) {
    try {
      doc.image(logo, PAGE.margin, top, { fit: [160, 60] });
      logoBottom = top + 64;
    } catch {
      logo = null; // image illisible : on retombe sur le nom
    }
  }
  if (!logo) {
    doc.font('Bold').fontSize(18).fillColor(accent).text(clean(sellerName), PAGE.margin, top, { width: 260 });
    logoBottom = doc.y + 4;
  }

  doc.font('Bold').fontSize(22).fillColor(accent).text(t.title, 330, top, { width: RIGHT - 330, align: 'right' });
  doc.font('Regular').fontSize(9.5).fillColor('#111827');
  const facts = [
    [t.number, number],
    [t.date, date(issuedAt)],
    [t.order, format(t.orderOf, { order: invoice.orderName, date: date(invoice.orderDate) })],
    [
      t.payment,
      [t.status[invoice.financialStatus] ?? '', invoice.paymentMethods.map((g) => t.gateways[g] ?? g).join(', ')]
        .filter(Boolean)
        .join(' – '),
    ],
  ].filter(([, v]) => v);
  let y = top + 30;
  for (const [label, value] of facts) {
    doc.fillColor(MUTED).text(label, 330, y, { width: 70 });
    doc.fillColor('#111827').text(clean(value), 400, y, { width: RIGHT - 400, align: 'right' });
    y = doc.y + 2;
  }

  // Vendeur / client.
  y = Math.max(y, logoBottom) + 18;
  const blockTop = y;
  doc.font('Bold').fontSize(8).fillColor(MUTED).text(t.seller, PAGE.margin, y);
  doc.font('Bold').fontSize(10).fillColor('#111827').text(clean(sellerName), PAGE.margin, y + 12, { width: 240 });
  doc.font('Regular').fontSize(9).fillColor('#374151');
  for (const line of sellerLines(settings, t, lang === 'fr' ? ' : ' : ': ', intl)) doc.text(clean(line), { width: 240 });
  const sellerBottom = doc.y;

  const addressBlock = (title, address, x, startY) => {
    doc.font('Bold').fontSize(8).fillColor(MUTED).text(title, x, startY);
    doc.font('Bold').fontSize(10).fillColor('#111827').text(clean(address.company || address.name), x, startY + 12, { width: 120 });
    doc.font('Regular').fontSize(9).fillColor('#374151');
    if (address.company && address.name) doc.text(clean(address.name), { width: 120 });
    for (const line of address.lines) doc.text(clean(line), { width: 120 });
    return doc.y;
  };
  const billing = invoice.billing ?? { name: invoice.customer.name, company: '', lines: [] };
  let clientBottom = addressBlock(t.billTo, billing, 310, blockTop);
  if (invoice.customer.email) {
    doc.text(clean(invoice.customer.email), 310, clientBottom, { width: 120 });
    clientBottom = doc.y;
  }
  if (invoice.shipping) {
    clientBottom = Math.max(clientBottom, addressBlock(t.shipTo, invoice.shipping, 435, blockTop));
  }

  // Tableau des lignes.
  y = Math.max(sellerBottom, clientBottom) + 24;
  const drawHeader = (atY) => {
    doc.font('Bold').fontSize(8.5);
    const h = Math.max(...COLUMNS.map((c) => doc.heightOfString(t[c.title], { width: c.width - 8 }))) + 10;
    doc.rect(PAGE.margin, atY, RIGHT - PAGE.margin, h).fill(accent);
    doc.font('Bold').fontSize(8.5).fillColor('#ffffff');
    for (const col of COLUMNS) {
      doc.text(t[col.title], col.x + 4, atY + 5, { width: col.width - 8, align: col.align });
    }
    return atY + h + 6;
  };
  y = drawHeader(y);

  for (const line of invoice.lines) {
    const cells = {
      label: `${line.shipping ? `${t.shipping}${line.label ? ` – ${line.label}` : ''}` : line.label}${line.sku ? `\n${t.ref} ${line.sku}` : ''}`,
      quantity: String(line.quantity),
      unit: fmt(line.unitHtCents),
      discount: line.discountHtCents ? `-${fmt(line.discountHtCents)}` : '–',
      rate: settings.vatExempt ? '–' : percent(line.rate, intl),
      total: fmt(line.totalHtCents),
    };
    doc.font('Regular').fontSize(9);
    const height = Math.max(...COLUMNS.map((c) => doc.heightOfString(clean(cells[c.key]), { width: c.width - 8 })));
    if (y + height > PAGE.height - 200) {
      doc.addPage();
      y = drawHeader(PAGE.margin);
    }
    for (const col of COLUMNS) {
      doc.fillColor(col.key === 'label' ? '#111827' : '#374151').text(clean(cells[col.key]), col.x + 4, y, {
        width: col.width - 8,
        align: col.align,
      });
    }
    y += height + 6;
    doc.moveTo(PAGE.margin, y - 3).lineTo(RIGHT, y - 3).lineWidth(0.5).strokeColor(BORDER).stroke();
  }

  // Récapitulatif TVA (gauche) et totaux (droite).
  if (y > PAGE.height - 230) {
    doc.addPage();
    y = PAGE.margin;
  }
  y += 12;
  const recapTop = y;
  if (settings.vatExempt) {
    doc.font('Italic').fontSize(9).fillColor('#374151').text(t.vatExempt, PAGE.margin, y, { width: 240 });
  } else if (invoice.vat.length) {
    doc.font('Bold').fontSize(8).fillColor(MUTED);
    doc.text(t.rate, PAGE.margin, y, { width: 60 });
    doc.text(t.base, 105, y, { width: 80, align: 'right' });
    doc.text(t.vatAmount, 185, y, { width: 75, align: 'right' });
    y += 14;
    doc.font('Regular').fontSize(9).fillColor('#374151');
    for (const v of invoice.vat) {
      doc.text(percent(v.rate, intl), PAGE.margin, y, { width: 60 });
      doc.text(fmt(v.baseCents), 105, y, { width: 80, align: 'right' });
      doc.text(fmt(v.taxCents), 185, y, { width: 75, align: 'right' });
      y += 13;
    }
  }

  let ty = recapTop;
  const totalRow = (label, value, strong = false) => {
    doc.font(strong ? 'Bold' : 'Regular').fontSize(strong ? 11 : 9.5).fillColor(strong ? '#ffffff' : '#374151');
    if (strong) doc.rect(350, ty - 5, RIGHT - 350, 24).fill(accent).fillColor('#ffffff');
    doc.text(label, 358, ty + (strong ? 1 : 0), { width: 115, lineBreak: false });
    doc.text(value, 440, ty + (strong ? 1 : 0), { width: RIGHT - 448, align: 'right', lineBreak: false });
    ty += strong ? 26 : 16;
  };
  if (!settings.vatExempt) {
    totalRow(t.totalExclTax, fmt(invoice.totalHtCents));
    totalRow(t.totalTax, fmt(invoice.totalTaxCents));
  }
  totalRow(settings.vatExempt ? t.total : t.totalInclTax, fmt(invoice.totalTtcCents), true);

  // Mentions légales et message, en bas de la dernière page.
  y = Math.max(y, ty) + 24;
  doc.font('Regular').fontSize(8).fillColor(MUTED);
  const notice = [invoice.financialStatus === 'paid' ? t.paid : '', settings.legalNotice || [t.notePMD, t.notePMT, t.noteAAB].join(' ')].filter(Boolean).join(' ');
  if (notice) {
    doc.text(clean(notice), PAGE.margin, y, { width: RIGHT - PAGE.margin });
    y = doc.y + 8;
  }
  const footerNote = settings.footerNote || t.footerNote;
  if (footerNote) {
    doc.font('Italic').fontSize(9).fillColor('#374151').text(clean(footerNote), PAGE.margin, y, {
      width: RIGHT - PAGE.margin,
      align: 'center',
    });
  }

  // Pied de page sur chaque page : identité du vendeur et pagination.
  const range = doc.bufferedPageRange();
  const footer = [sellerName, settings.siret && `${t.siret} ${settings.siret}`, !settings.vatExempt && settings.vatNumber && `${t.vatNumber} ${settings.vatNumber}`]
    .filter(Boolean)
    .join(' · ');
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = PAGE.height - PAGE.margin + 10;
    doc.page.margins.bottom = 0; // autorise l'écriture sous la marge sans créer de page
    doc.font('Regular').fontSize(7.5).fillColor(MUTED);
    doc.text(clean(footer), PAGE.margin, fy, { width: 380, lineBreak: false });
    doc.text(format(t.page, { number, page: i + 1, pages: range.count }), 380, fy, { width: RIGHT - 380, align: 'right', lineBreak: false });
  }

  // Factur-X : XML joint au PDF (relation « Alternative ») et métadonnées XMP associées.
  if (facturxXml) {
    const now = new Date(issuedAt);
    doc.file(Buffer.from(facturxXml, 'utf8'), {
      name: FACTURX_FILENAME,
      type: 'text/xml',
      relationship: 'Alternative',
      description: 'Factur-X invoice',
      creationDate: now,
      modifiedDate: now,
    });
    doc.appendXML(FACTURX_XMP);
  }

  doc.end();
  return done;
}
