// Intégration Shopify sans SDK : vérification des webhooks (HMAC), des jetons de session
// App Bridge (JWT HS256), échange de jeton (installation gérée) et appels GraphQL Admin.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export const isValidShop = (shop) => typeof shop === 'string' && SHOP_RE.test(shop);

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** En-tête X-Shopify-Hmac-Sha256 : HMAC-SHA256 base64 du corps brut. */
export function verifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !rawBody) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqual(digest, hmacHeader);
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/** Vérifie le jeton de session envoyé par App Bridge et renvoie la boutique concernée. */
export function verifySessionToken(token, { apiKey, apiSecret }, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Jeton de session mal formé');
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest('base64url');
  if (!safeEqual(expected, signature)) throw new Error('Signature du jeton invalide');
  const { alg } = JSON.parse(Buffer.from(header, 'base64url').toString());
  if (alg !== 'HS256') throw new Error('Algorithme de jeton inattendu');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const seconds = now / 1000;
  const leeway = 10;
  if (claims.exp && seconds > claims.exp + leeway) throw new Error('Jeton expiré');
  if (claims.nbf && seconds < claims.nbf - leeway) throw new Error('Jeton pas encore valide');
  if (claims.aud !== apiKey) throw new Error('Jeton destiné à une autre appli');
  const shop = new URL(claims.dest).hostname;
  if (!isValidShop(shop) || new URL(claims.iss).hostname !== shop) throw new Error('Boutique invalide');
  return { shop, claims };
}

/** Utilitaire de test : fabrique un jeton de session signé. */
export function signSessionToken(claims, apiSecret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** Échange un jeton de session contre un jeton d'accès hors ligne (installation gérée). */
export async function exchangeToken(shop, sessionToken, { apiKey, apiSecret }, fetchImpl = fetch) {
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    }),
  });
  if (!response.ok) throw new Error(`Échange de jeton refusé (${response.status})`);
  return response.json(); // { access_token, scope }
}

export async function adminGraphql(shop, accessToken, apiVersion, query, variables = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`API Admin : HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors) throw new Error(`API Admin : ${JSON.stringify(body.errors)}`);
  return body.data;
}

export const SHOP_INFO_QUERY = `#graphql
  query ShopInfo {
    shop {
      name
      email
      contactEmail
      url
      ianaTimezone
      billingAddress { company address1 address2 zip city country countryCodeV2 phone }
    }
  }`;

/** Entité légale principale de la boutique (raison sociale et adresse légale). */
export const BUSINESS_ENTITY_QUERY = `#graphql
  query PrimaryBusinessEntity {
    businessEntity {
      companyName
      address { address1 address2 zip city countryCode }
    }
  }`;

// ---------- Facturation de l'appli (Billing API) ----------

export const SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $trialDays: Int
    $test: Boolean
  ) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, trialDays: $trialDays, test: $test) {
      confirmationUrl
      appSubscription { id status }
      userErrors { field message }
    }
  }`;

export const SUBSCRIPTION_CANCEL = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }`;

export const ACTIVE_SUBSCRIPTIONS = `#graphql
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions { id name status test }
    }
  }`;
