// Mise en page de la facture PDF (A4) avec pdfkit.

import PDFDocument from 'pdfkit';

const PAGE = { margin: 45, width: 595.28, height: 841.89 };
const RIGHT = PAGE.width - PAGE.margin;
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

const COLUMNS = [
  { key: 'label', title: 'Désignation', x: 45, width: 215, align: 'left' },
  { key: 'quantity', title: 'Qté', x: 260, width: 35, align: 'right' },
  { key: 'unit', title: 'PU HT', x: 295, width: 70, align: 'right' },
  { key: 'discount', title: 'Remise HT', x: 365, width: 60, align: 'right' },
  { key: 'rate', title: 'TVA', x: 425, width: 45, align: 'right' },
  { key: 'total', title: 'Total HT', x: 470, width: 80, align: 'right' },
];

// Les polices standard du PDF (WinAnsi) n'ont pas l'espace fine insécable de fr-FR.
const clean = (text) => String(text ?? '').replace(/[  ]/g, ' ');

export function money(cents, currency) {
  return clean(new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100));
}

const percent = (rate) => clean(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(rate * 100)) + ' %';

export function formatDate(value) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(value));
}

const PAYMENT_LABELS = {
  paid: 'Payée',
  partially_paid: 'Partiellement payée',
  pending: 'Paiement en attente',
  authorized: 'Paiement autorisé',
  refunded: 'Remboursée',
  partially_refunded: 'Partiellement remboursée',
};

const GATEWAY_LABELS = {
  shopify_payments: 'Carte bancaire',
  paypal: 'PayPal',
  manual: 'Paiement manuel',
  bogus: 'Paiement de test',
  gift_card: 'Carte cadeau',
};

function sellerLines(s) {
  return [
    s.legalForm,
    ...String(s.address || '').split('\n'),
    s.siret && `SIRET : ${s.siret}`,
    s.rcs,
    !s.vatExempt && s.vatNumber && `N° TVA : ${s.vatNumber}`,
    s.email,
    s.phone,
    s.website,
  ].filter((line) => line && line.trim());
}

/**
 * @param {object} invoice  résultat de buildInvoice()
 * @param {object} meta     { number, issuedAt, settings, shopName, logo (Buffer|null) }
 * @returns {Promise<Buffer>}
 */
export function renderInvoicePdf(invoice, { number, issuedAt, settings, shopName, logo }) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    info: { Title: `Facture ${number}`, Author: settings.companyName || shopName, Subject: `Commande ${invoice.orderName}` },
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const accent = settings.accentColor || '#1f2937';
  const cur = invoice.currency;
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
    doc.font('Helvetica-Bold').fontSize(18).fillColor(accent).text(clean(sellerName), PAGE.margin, top, { width: 260 });
    logoBottom = doc.y + 4;
  }

  doc.font('Helvetica-Bold').fontSize(22).fillColor(accent).text('FACTURE', 330, top, { width: RIGHT - 330, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor('#111827');
  const facts = [
    ['N°', number],
    ['Date', formatDate(issuedAt)],
    ['Commande', `${invoice.orderName} du ${formatDate(invoice.orderDate)}`],
    ['Paiement', [PAYMENT_LABELS[invoice.financialStatus] ?? '', invoice.paymentMethods.map((g) => GATEWAY_LABELS[g] ?? g).join(', ')].filter(Boolean).join(' – ')],
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
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('VENDEUR', PAGE.margin, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(clean(sellerName), PAGE.margin, y + 12, { width: 240 });
  doc.font('Helvetica').fontSize(9).fillColor('#374151');
  for (const line of sellerLines(settings)) doc.text(clean(line), { width: 240 });
  const sellerBottom = doc.y;

  const addressBlock = (title, address, x, startY) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(title, x, startY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(clean(address.company || address.name), x, startY + 12, { width: 120 });
    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    if (address.company && address.name) doc.text(clean(address.name), { width: 120 });
    for (const line of address.lines) doc.text(clean(line), { width: 120 });
    return doc.y;
  };
  const billing = invoice.billing ?? { name: invoice.customer.name, company: '', lines: [] };
  let clientBottom = addressBlock('FACTURÉ À', billing, 310, blockTop);
  if (invoice.customer.email) {
    doc.text(clean(invoice.customer.email), 310, clientBottom, { width: 120 });
    clientBottom = doc.y;
  }
  if (invoice.shipping) {
    clientBottom = Math.max(clientBottom, addressBlock('LIVRÉ À', invoice.shipping, 435, blockTop));
  }

  // Tableau des lignes.
  y = Math.max(sellerBottom, clientBottom) + 24;
  const drawHeader = (atY) => {
    doc.rect(PAGE.margin, atY, RIGHT - PAGE.margin, 20).fill(accent);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
    for (const col of COLUMNS) {
      doc.text(col.title, col.x + 4, atY + 6, { width: col.width - 8, align: col.align });
    }
    return atY + 26;
  };
  y = drawHeader(y);

  for (const line of invoice.lines) {
    const cells = {
      label: line.sku ? `${line.label}\nRéf. ${line.sku}` : line.label,
      quantity: String(line.quantity),
      unit: money(line.unitHtCents, cur),
      discount: line.discountHtCents ? `-${money(line.discountHtCents, cur)}` : '–',
      rate: settings.vatExempt ? '–' : percent(line.rate),
      total: money(line.totalHtCents, cur),
    };
    doc.font('Helvetica').fontSize(9);
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
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#374151').text('TVA non applicable, art. 293 B du CGI', PAGE.margin, y, { width: 240 });
  } else if (invoice.vat.length) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
    doc.text('TAUX', PAGE.margin, y, { width: 60 });
    doc.text('BASE HT', 105, y, { width: 80, align: 'right' });
    doc.text('TVA', 185, y, { width: 75, align: 'right' });
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    for (const v of invoice.vat) {
      doc.text(percent(v.rate), PAGE.margin, y, { width: 60 });
      doc.text(money(v.baseCents, cur), 105, y, { width: 80, align: 'right' });
      doc.text(money(v.taxCents, cur), 185, y, { width: 75, align: 'right' });
      y += 13;
    }
  }

  let ty = recapTop;
  const totalRow = (label, value, strong = false) => {
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 9.5).fillColor(strong ? '#ffffff' : '#374151');
    if (strong) doc.rect(350, ty - 5, RIGHT - 350, 24).fill(accent).fillColor('#ffffff');
    doc.text(label, 358, ty + (strong ? 1 : 0), { width: 100 });
    doc.text(value, 450, ty + (strong ? 1 : 0), { width: RIGHT - 458, align: 'right' });
    ty += strong ? 26 : 16;
  };
  if (!settings.vatExempt) {
    totalRow('Total HT', money(invoice.totalHtCents, cur));
    totalRow('TVA', money(invoice.totalTaxCents, cur));
  }
  totalRow(settings.vatExempt ? 'Total' : 'Total TTC', money(invoice.totalTtcCents, cur), true);

  // Mentions légales et message, en bas de la dernière page.
  y = Math.max(y, ty) + 24;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  const notice = [invoice.financialStatus === 'paid' ? 'Facture acquittée.' : '', settings.legalNotice].filter(Boolean).join(' ');
  if (notice) {
    doc.text(clean(notice), PAGE.margin, y, { width: RIGHT - PAGE.margin });
    y = doc.y + 8;
  }
  if (settings.footerNote) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#374151').text(clean(settings.footerNote), PAGE.margin, y, {
      width: RIGHT - PAGE.margin,
      align: 'center',
    });
  }

  // Pied de page sur chaque page : identité du vendeur et pagination.
  const range = doc.bufferedPageRange();
  const footer = [sellerName, settings.siret && `SIRET ${settings.siret}`, !settings.vatExempt && settings.vatNumber && `TVA ${settings.vatNumber}`]
    .filter(Boolean)
    .join(' · ');
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = PAGE.height - PAGE.margin + 10;
    doc.page.margins.bottom = 0; // autorise l'écriture sous la marge sans créer de page
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    doc.text(clean(footer), PAGE.margin, fy, { width: 380, lineBreak: false });
    doc.text(`Facture ${number} · page ${i + 1}/${range.count}`, 380, fy, { width: RIGHT - 380, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
