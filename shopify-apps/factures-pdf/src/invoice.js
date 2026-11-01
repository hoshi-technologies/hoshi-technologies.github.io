// Transforme une commande Shopify (charge utile des webhooks orders/*) en facture :
// lignes HT, remises, TVA par taux et totaux. Tous les montants sont en centimes entiers.

export function toCents(amount) {
  if (amount === null || amount === undefined || amount === '') return 0;
  return Math.round(Number(amount) * 100);
}

const sum = (items, pick) => (items ?? []).reduce((total, item) => total + pick(item), 0);

function lineFrom({ label, sku, quantity, unitCents, discountCents, taxLines, taxesIncluded }) {
  const grossCents = unitCents * quantity;
  const netCents = grossCents - discountCents; // prix payé, TTC ou HT selon la boutique
  const taxCents = sum(taxLines, (t) => toCents(t.price));
  const rate = sum(taxLines, (t) => Number(t.rate) || 0);
  const totalHtCents = taxesIncluded ? netCents - taxCents : netCents;
  const unitHtCents = taxesIncluded ? Math.round(unitCents / (1 + rate)) : unitCents;
  return {
    label,
    sku: sku || '',
    quantity,
    unitHtCents,
    // Remise HT déduite des autres colonnes pour que la ligne soit toujours juste au centime.
    discountHtCents: Math.max(0, unitHtCents * quantity - totalHtCents),
    rate,
    taxCents,
    totalHtCents,
    totalTtcCents: totalHtCents + taxCents,
  };
}

function variantLabel(item) {
  const title = item.title || item.name || 'Article';
  return item.variant_title ? `${title} – ${item.variant_title}` : title;
}

function formatAddress(a) {
  if (!a) return null;
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.name || '';
  return {
    name,
    company: a.company || '',
    lines: [a.address1, a.address2, [a.zip, a.city].filter(Boolean).join(' '), a.province && a.country_code !== 'FR' ? a.province : null, a.country]
      .filter(Boolean),
  };
}

/** Jeton présent dans l'URL de la page de statut de commande (aussi accessible en Liquid). */
export function orderStatusToken(order) {
  const match = /\/orders\/([^/?#]+)/.exec(order.order_status_url || '');
  return match ? match[1] : order.token || null;
}

export function buildInvoice(order) {
  const taxesIncluded = Boolean(order.taxes_included);

  const lines = (order.line_items ?? [])
    .filter((item) => (item.current_quantity ?? item.quantity) > 0)
    .map((item) =>
      lineFrom({
        label: variantLabel(item),
        sku: item.sku,
        quantity: item.current_quantity ?? item.quantity,
        unitCents: toCents(item.price),
        discountCents: sum(item.discount_allocations, (d) => toCents(d.amount)),
        taxLines: item.tax_lines,
        taxesIncluded,
      }),
    );

  for (const shipping of order.shipping_lines ?? []) {
    const price = toCents(shipping.price);
    if (price === 0 && !shipping.title) continue;
    lines.push(
      lineFrom({
        label: `Livraison${shipping.title ? ` – ${shipping.title}` : ''}`,
        quantity: 1,
        unitCents: price,
        discountCents: sum(shipping.discount_allocations, (d) => toCents(d.amount)),
        taxLines: shipping.tax_lines,
        taxesIncluded,
      }),
    );
  }

  const vatByRate = new Map();
  for (const line of lines) {
    const key = line.rate.toFixed(4);
    const entry = vatByRate.get(key) ?? { rate: line.rate, baseCents: 0, taxCents: 0 };
    entry.baseCents += line.totalHtCents;
    entry.taxCents += line.taxCents;
    vatByRate.set(key, entry);
  }

  const totalHtCents = sum(lines, (l) => l.totalHtCents);
  const totalTaxCents = sum(lines, (l) => l.taxCents);
  const totalTtcCents = totalHtCents + totalTaxCents;
  const shopifyTotalCents = toCents(order.current_total_price ?? order.total_price);

  const billing = formatAddress(order.billing_address) ?? formatAddress(order.customer?.default_address);
  const shipping = formatAddress(order.shipping_address);
  const customerName =
    billing?.name || [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || '';

  return {
    orderId: String(order.id),
    orderName: order.name || `#${order.order_number ?? order.id}`,
    orderToken: orderStatusToken(order),
    orderDate: order.processed_at || order.created_at,
    currency: order.currency || order.presentment_currency || 'EUR',
    taxesIncluded,
    financialStatus: order.financial_status || '',
    paymentMethods: order.payment_gateway_names ?? [],
    customer: {
      name: customerName,
      firstName: order.customer?.first_name || order.billing_address?.first_name || '',
      email: order.email || order.contact_email || order.customer?.email || '',
    },
    billing,
    shipping,
    lines,
    vat: [...vatByRate.values()].sort((a, b) => a.rate - b.rate),
    totalHtCents,
    totalTaxCents,
    totalTtcCents,
    // Écart possible (pourboire, droits de douane, ajustements) : signalé pour vérification.
    mismatchCents: shopifyTotalCents ? shopifyTotalCents - totalTtcCents : 0,
  };
}

export function formatInvoiceNumber(prefix, seq, date = new Date()) {
  return `${prefix}${date.getFullYear()}-${String(seq).padStart(5, '0')}`;
}
