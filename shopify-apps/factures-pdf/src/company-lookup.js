// Recherche d'une entreprise française dans le registre officiel (base SIRENE), via l'API
// publique et gratuite « Recherche d'entreprises » de l'État (sans clé, ~7 requêtes/s).
// Shopify ne connaît ni le SIRET ni le n° de TVA : c'est d'ici qu'ils viennent.

const API = 'https://recherche-entreprises.api.gouv.fr/search';

// Codes « nature juridique » INSEE les plus courants chez les e-commerçants.
const LEGAL_FORMS = {
  1000: 'Entrepreneur individuel',
  5202: 'SNC',
  5410: 'SARL',
  5422: 'SARL immatriculée au RM',
  5485: 'SELARL',
  5498: 'EURL',
  5499: 'SARL',
  5505: 'SA',
  5599: 'SA',
  5699: 'SA',
  5710: 'SAS',
  5720: 'SASU',
  5785: 'SELAS',
  6540: 'SCI',
  6589: 'Société civile',
  9220: 'Association',
};

/** N° de TVA intracommunautaire français, calculé à partir du SIREN (clé officielle). */
export function frenchVatNumber(siren) {
  const digits = String(siren ?? '').replace(/\D/g, '');
  if (digits.length !== 9) return '';
  const key = (12 + 3 * (Number(digits) % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${digits}`;
}

const formatSiret = (siret) => String(siret ?? '').replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');

/** Adresse du siège sur plusieurs lignes : rue, puis « code postal ville ». */
function headOfficeAddress(siege = {}) {
  const cityLine = [siege.code_postal, siege.libelle_commune].filter(Boolean).join(' ');
  let street = String(siege.adresse ?? '').trim();
  if (cityLine && street.toUpperCase().endsWith(cityLine.toUpperCase())) street = street.slice(0, -cityLine.length).trim();
  if (!street) {
    street = [siege.numero_voie, siege.indice_repetition, siege.type_voie, siege.libelle_voie].filter(Boolean).join(' ');
  }
  return [siege.complement_adresse, street, cityLine].filter(Boolean).join('\n');
}

/**
 * @param query  SIRET, SIREN ou nom (avec la ville si besoin)
 * @returns      jusqu'à 5 entreprises : { name, siren, siret, legalForm, address, countryCode, vatNumber, active }
 */
export async function lookupFrenchCompany(query, fetchImpl = fetch) {
  const q = String(query ?? '').trim();
  if (q.length < 3) return [];
  const digits = q.replace(/[\s.]/g, '');
  const searchTerm = /^\d{9}(\d{5})?$/.test(digits) ? digits : q;
  const url = `${API}?q=${encodeURIComponent(searchTerm)}&per_page=5&page=1`;
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Registre des entreprises indisponible (${response.status})`);
  const { results = [] } = await response.json();
  return results.map((r) => {
    const siege = r.siege ?? {};
    // Si un SIRET précis a été saisi, on le garde ; sinon celui du siège.
    const siret = /^\d{14}$/.test(digits) ? digits : siege.siret || '';
    return {
      name: r.nom_raison_sociale || r.nom_complet || '',
      siren: r.siren || '',
      siret: formatSiret(siret),
      legalForm: LEGAL_FORMS[r.nature_juridique] ?? '',
      address: headOfficeAddress(siege),
      countryCode: 'FR',
      vatNumber: frenchVatNumber(r.siren),
      active: (r.etat_administratif ?? 'A') === 'A',
    };
  });
}
