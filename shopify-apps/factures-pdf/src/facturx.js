// Factur-X (profil EN 16931) : XML CII embarqué dans le PDF/A-3 de la facture.
// Lisible par les logiciels comptables et accepté par les plateformes de la réforme
// française de la facturation électronique.

export const FACTURX_FILENAME = 'factur-x.xml';
export const FACTURX_PROFILE = 'EN 16931';
const GUIDELINE = 'urn:cen.eu:en16931:2017';
const EXEMPTION_293B = 'TVA non applicable, art. 293 B du CGI';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const amount = (cents) => (cents / 100).toFixed(2);
const percent = (rate) => String(Math.round(rate * 10000) / 100);
const ymd = (iso) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};
const digits = (value) => String(value ?? '').replace(/\D/g, '');
const compact = (value) => String(value ?? '').replace(/\s/g, '').toUpperCase();

/** Catégorie de TVA UNCL5305 : S = taux normal, Z = taux zéro, E = exonération (franchise). */
function category(rate, settings) {
  if (settings.vatExempt) return 'E';
  return rate > 0 ? 'S' : 'Z';
}

/**
 * Données manquantes pour produire un Factur-X valide. Liste vide = prêt.
 * Les codes sont traduits dans l'admin.
 */
export function facturxIssues(settings, invoice = null) {
  const issues = [];
  if (!settings.companyName) issues.push('companyName');
  if (!settings.address) issues.push('address');
  if (!/^[A-Z]{2}$/.test(settings.countryCode || '')) issues.push('countryCode');
  if (!settings.vatExempt && !settings.vatNumber) issues.push('vatNumber');
  if (settings.vatExempt && !settings.vatNumber && !settings.siret) issues.push('siret');
  if (invoice && settings.vatExempt && invoice.totalTaxCents > 0) issues.push('vatCharged');
  return issues;
}

/** Adresse libre (plusieurs lignes) → champs CII ; code postal et ville sur l'avant-dernière ligne. */
function splitSellerAddress(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const cityIndex = lines.findIndex((l) => /^\d{4,5}\s+\S/.test(l));
  let postcode = '';
  let city = '';
  if (cityIndex >= 0) {
    [, postcode, city] = /^(\d{4,5})\s+(.*)$/.exec(lines[cityIndex]);
  }
  const streets = lines.filter((_, i) => i !== cityIndex && i < (cityIndex >= 0 ? cityIndex : lines.length));
  return { postcode, line1: streets[0] || '', line2: streets[1] || '', city };
}

function addressXml({ postcode, line1, line2, city, country }) {
  return `<ram:PostalTradeAddress>${postcode ? `<ram:PostcodeCode>${esc(postcode)}</ram:PostcodeCode>` : ''}${
    line1 ? `<ram:LineOne>${esc(line1)}</ram:LineOne>` : ''
  }${line2 ? `<ram:LineTwo>${esc(line2)}</ram:LineTwo>` : ''}${city ? `<ram:CityName>${esc(city)}</ram:CityName>` : ''}<ram:CountryID>${esc(
    country,
  )}</ram:CountryID></ram:PostalTradeAddress>`;
}

function taxXml(rate, settings, { basis, calculated } = {}) {
  const cat = category(rate, settings);
  return `<ram:ApplicableTradeTax>${calculated !== undefined ? `<ram:CalculatedAmount>${amount(calculated)}</ram:CalculatedAmount>` : ''}<ram:TypeCode>VAT</ram:TypeCode>${
    cat === 'E' && basis !== undefined ? `<ram:ExemptionReason>${EXEMPTION_293B}</ram:ExemptionReason>` : ''
  }${basis !== undefined ? `<ram:BasisAmount>${amount(basis)}</ram:BasisAmount>` : ''}<ram:CategoryCode>${cat}</ram:CategoryCode>${
    cat === 'E' && basis !== undefined ? '<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>' : ''
  }<ram:RateApplicablePercent>${cat === 'E' ? '0' : percent(rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`;
}

/**
 * @param invoice  résultat de buildInvoice()
 * @param meta     { number, issuedAt, settings, shopName, texts } (texts : libellés traduits)
 */
export function buildFacturxXml(invoice, { number, issuedAt, settings, shopName, texts = {} }) {
  const cur = esc(invoice.currency);
  const sellerName = settings.companyName || shopName;
  const seller = splitSellerAddress(settings.address);
  const siret = digits(settings.siret);
  // SIREN (9 premiers chiffres du SIRET), schéma 0002 : exigé par la réforme française (BR-FR-10).
  const siren = siret.length === 14 || siret.length === 9 ? siret.slice(0, 9) : '';
  const legalId = siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${siren}</ram:ID></ram:SpecifiedLegalOrganization>` : '';
  const taxRegistration = settings.vatNumber
    ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(compact(settings.vatNumber))}</ram:ID></ram:SpecifiedTaxRegistration>`
    : siret
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${siret}</ram:ID></ram:SpecifiedTaxRegistration>`
      : '';

  const buyer = invoice.buyer ?? {};
  const buyerName = buyer.company || invoice.customer.name || invoice.customer.email || 'Client';

  const lines = invoice.lines
    .map((line, i) => {
      const allowance = line.discountHtCents
        ? `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${amount(
            line.discountHtCents,
          )}</ram:ActualAmount><ram:ReasonCode>95</ram:ReasonCode><ram:Reason>${esc(texts.discount || 'Remise')}</ram:Reason></ram:SpecifiedTradeAllowanceCharge>`
        : '';
      return `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct>${
        line.sku ? `<ram:SellerAssignedID>${esc(line.sku)}</ram:SellerAssignedID>` : ''
      }<ram:Name>${esc(line.shipping ? [texts.shipping || 'Livraison', line.label].filter(Boolean).join(' – ') : line.label)}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amount(
        line.unitHtCents,
      )}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${
        line.quantity
      }</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement>${taxXml(line.rate, settings)}${allowance}<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(
        line.totalHtCents,
      )}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join('');

  const vat = invoice.vat.map((v) => taxXml(v.rate, settings, { basis: v.baseCents, calculated: v.taxCents })).join('');
  const paid = invoice.financialStatus === 'paid';
  const prepaid = paid ? invoice.totalTtcCents : 0;
  // Cadre de facturation (BT-23, réforme française) : B = biens, S = services, M = mixte ;
  // 2 = facture déjà payée, 1 = facture à payer.
  const businessProcess = `${{ goods: 'B', services: 'S', mixed: 'M' }[settings.supplyType] ?? 'B'}${paid ? 2 : 1}`;
  // Mentions obligatoires codées (BR-FR-05) : pénalités de retard, indemnité de recouvrement, escompte.
  const notes = [
    ['PMD', texts.notePMD],
    ['PMT', texts.notePMT],
    ['AAB', texts.noteAAB],
  ]
    .filter(([, content]) => content)
    .map(([code, content]) => `<ram:IncludedNote><ram:Content>${esc(content)}</ram:Content><ram:SubjectCode>${code}</ram:SubjectCode></ram:IncludedNote>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext><ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${businessProcess}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${GUIDELINE}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${esc(number)}</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${ymd(issuedAt)}</udt:DateTimeString></ram:IssueDateTime>${notes}</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lines}
<ram:ApplicableHeaderTradeAgreement><ram:SellerTradeParty><ram:Name>${esc(sellerName)}</ram:Name>${legalId}${addressXml({ ...seller, country: settings.countryCode || 'FR' })}${
    settings.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(settings.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''
  }${taxRegistration}</ram:SellerTradeParty><ram:BuyerTradeParty><ram:Name>${esc(buyerName)}</ram:Name>${addressXml({
    postcode: buyer.zip,
    line1: buyer.address1,
    line2: buyer.address2,
    city: buyer.city,
    country: buyer.countryCode || settings.countryCode || 'FR',
  })}${
    invoice.customer.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(invoice.customer.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''
  }</ram:BuyerTradeParty><ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(invoice.orderName)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument></ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${ymd(
    invoice.orderDate || issuedAt,
  )}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>${cur}</ram:InvoiceCurrencyCode>${vat}<ram:SpecifiedTradePaymentTerms><ram:Description>${esc(
    paid ? texts.paymentTermsPaid || 'Facture acquittée' : texts.paymentTermsDue || 'Paiement à réception',
  )}</ram:Description><ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(
    paid ? invoice.orderDate || issuedAt : issuedAt,
  )}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms><ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${amount(
    invoice.totalHtCents,
  )}</ram:LineTotalAmount><ram:ChargeTotalAmount>0.00</ram:ChargeTotalAmount><ram:AllowanceTotalAmount>0.00</ram:AllowanceTotalAmount><ram:TaxBasisTotalAmount>${amount(
    invoice.totalHtCents,
  )}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="${cur}">${amount(invoice.totalTaxCents)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${amount(
    invoice.totalTtcCents,
  )}</ram:GrandTotalAmount><ram:TotalPrepaidAmount>${amount(prepaid)}</ram:TotalPrepaidAmount><ram:DuePayableAmount>${amount(
    invoice.totalTtcCents - prepaid,
  )}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/** Métadonnées XMP exigées par Factur-X (schéma d'extension PDF/A + propriétés fx). */
export const FACTURX_XMP = `
<rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">
  <pdfaExtension:schemas>
    <rdf:Bag>
      <rdf:li rdf:parseType="Resource">
        <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
        <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
        <pdfaSchema:prefix>fx</pdfaSchema:prefix>
        <pdfaSchema:property>
          <rdf:Seq>
            <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description></rdf:li>
            <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description></rdf:li>
            <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description></rdf:li>
            <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description></rdf:li>
          </rdf:Seq>
        </pdfaSchema:property>
      </rdf:li>
    </rdf:Bag>
  </pdfaExtension:schemas>
</rdf:Description>
<rdf:Description xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#" rdf:about="">
  <fx:DocumentType>INVOICE</fx:DocumentType>
  <fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
  <fx:Version>1.0</fx:Version>
  <fx:ConformanceLevel>${FACTURX_PROFILE}</fx:ConformanceLevel>
</rdf:Description>`;
