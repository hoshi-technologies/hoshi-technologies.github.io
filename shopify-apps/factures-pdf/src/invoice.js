// Transforme une commande Shopify (charge utile des webhooks orders/*) en facture :
// lignes HT, remises, TVA par taux et totaux. Tous les montants sont en centimes entiers.

export function toCents(amount) {
  if (amount === null || amount === undefined || amount === '') return 0;
  return Math.round(Number(amount) * 100);
}

const sum = (items, pick) => (items ?? []).reduce((total, item) => total + pick(item), 0);

function lineFrom({ label, sku, shipping = false, quantity, unitCents, discountCents, taxLines, taxesIncluded }) {
  const grossCents = unitCents * quantity;
  const netCents = grossCents - discountCents; // prix payé, TTC ou HT selon la boutique
  const taxCents = sum(taxLines, (t) => toCents(t.price));
  const rate = sum(taxLines, (t) => Number(t.rate) || 0);
  const totalHtCents = taxesIncluded ? netCents - taxCents : netCents;
  const unitHtCents = taxesIncluded ? Math.round(unitCents / (1 + rate)) : unitCents;
  return {
    label,
    shipping,
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

/**
 * TVA calculée par taux sur le total HT (règle EN 16931 BR-CO-17 : TVA = base × taux,
 * arrondie au centime). Shopify arrondit ligne par ligne : l'écart éventuel (1 ou 2 centimes)
 * est reporté sur une ligne pour que lignes, récapitulatif et totaux restent cohérents.
 * Prix TTC : le TTC payé par le client ne change jamais, seule la ventilation HT/TVA bouge.
 */
function balanceVat(lines, taxesIncluded) {
  const groups = new Map();
  for (const line of lines) {
    const key = line.rate.toFixed(4);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  const vat = [];
  for (const group of groups.values()) {
    const rate = group[0].rate;
    const taxOf = (base) => Math.round(base * rate);
    let base = sum(group, (l) => l.totalHtCents);
    if (taxesIncluded) {
      const ttc = sum(group, (l) => l.totalTtcCents);
      const guess = Math.round(ttc / (1 + rate));
      const exact = [0, -1, 1, -2, 2].map((d) => guess + d).find((b) => b + taxOf(b) === ttc);
      base = exact ?? guess;
    }
    const diff = base - sum(group, (l) => l.totalHtCents);
    if (diff) {
      // Ligne absorbant l'écart : une remise suffisante, sinon quantité 1, sinon la plus grosse.
      const target =
        group.find((l) => l.discountHtCents >= -diff && l.discountHtCents - diff >= 0) ??
        group.find((l) => l.quantity === 1) ??
        group.reduce((a, b) => (b.totalHtCents > a.totalHtCents ? b : a));
      target.totalHtCents += diff;
      if (target.quantity === 1 && target.discountHtCents === 0) target.unitHtCents = target.totalHtCents;
      else target.discountHtCents = target.unitHtCents * target.quantity - target.totalHtCents;
    }
    const tax = taxesIncluded ? sum(group, (l) => l.totalTtcCents) - base : taxOf(base);
    for (const line of group) {
      line.taxCents = taxOf(line.totalHtCents);
      line.totalTtcCents = line.totalHtCents + line.taxCents;
    }
    vat.push({ rate, baseCents: base, taxCents: tax });
  }
  return vat.sort((a, b) => a.rate - b.rate);
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
        label: shipping.title || '',
        shipping: true,
        quantity: 1,
        unitCents: price,
        discountCents: sum(shipping.discount_allocations, (d) => toCents(d.amount)),
        taxLines: shipping.tax_lines,
        taxesIncluded,
      }),
    );
  }

  const vat = balanceVat(lines, taxesIncluded);
  const totalHtCents = sum(lines, (l) => l.totalHtCents);
  const totalTaxCents = sum(vat, (v) => v.taxCents);
  const totalTtcCents = totalHtCents + totalTaxCents;
  const shopifyTotalCents = toCents(order.current_total_price ?? order.total_price);

  const rawBuyer = order.billing_address ?? order.shipping_address ?? order.customer?.default_address ?? null;
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
    buyer: rawBuyer && {
      company: rawBuyer.company || '',
      address1: rawBuyer.address1 || '',
      address2: rawBuyer.address2 || '',
      zip: rawBuyer.zip || '',
      city: rawBuyer.city || '',
      countryCode: rawBuyer.country_code || '',
    },
    locale: order.customer_locale || '',
    lines,
    vat,
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
