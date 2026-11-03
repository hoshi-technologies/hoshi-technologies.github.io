import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getProgram } from "../loyalty.server";
import { localeFromRequest, pickMessages } from "../i18n/i18n.server";
import { isRtl } from "../i18n/config";
import { I18nProvider, useI18n } from "../i18n/react";

/** Sections du dictionnaire utiles à l'administration. */
const ADMIN_SECTIONS = ["common", "nav", "errors", "labels", "tx", "dashboard", "program", "rewards", "tiers", "members", "member"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session, redirect } = await authenticate.admin(request);
  const locale = localeFromRequest(request);

  // Abonnement obligatoire (tarification gérée par Shopify, définie dans le Partner Dashboard).
  // Sans abonnement actif, le marchand est envoyé sur la page de choix de formule de Shopify.
  if (process.env.BILLING_REQUIRED !== "false") {
    const { hasActivePayment } = await billing.check();
    if (!hasActivePayment) {
      const store = session.shop.replace(".myshopify.com", "");
      const handle = process.env.SHOPIFY_APP_HANDLE || "hoshi-club";
      throw redirect(`https://admin.shopify.com/store/${store}/charges/${handle}/pricing_plans`, {
        target: "_top",
      });
    }
  }

  // Langue (pour les textes générés hors connexion : remises, webhooks) et devise de la boutique.
  let program = await getProgram(session.shop, locale);
  const fullLoad = new URL(request.url).searchParams.has("locale");
  if (fullLoad) {
    let currency = program.currency;
    try {
      const response = await admin.graphql(`#graphql
        query LoyaltyShopCurrency { shop { currencyCode } }`);
      const json = (await response.json()) as { data?: { shop?: { currencyCode?: string } } };
      currency = json.data?.shop?.currencyCode ?? currency;
    } catch (error) {
      console.error("Devise de la boutique indisponible", error);
    }
    if (currency !== program.currency || locale !== program.locale) {
      program = await db.program.update({ where: { shop: session.shop }, data: { currency, locale } });
    }
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    locale,
    dir: isRtl(locale) ? "rtl" : "ltr",
    currency: program.currency,
    messages: pickMessages(locale, ADMIN_SECTIONS),
  };
};

export default function App() {
  const { apiKey, locale, currency, messages } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <I18nProvider locale={locale} currency={currency} messages={messages}>
        <Nav />
        <Outlet />
      </I18nProvider>
    </AppProvider>
  );
}

function Nav() {
  const { t } = useI18n();
  return (
    <s-app-nav>
      <s-link href="/app">{t("nav.dashboard")}</s-link>
      <s-link href="/app/members">{t("nav.members")}</s-link>
      <s-link href="/app/rewards">{t("nav.rewards")}</s-link>
      <s-link href="/app/tiers">{t("nav.tiers")}</s-link>
      <s-link href="/app/program">{t("nav.settings")}</s-link>
    </s-app-nav>
  );
}

// Shopify a besoin que React Router intercepte certaines réponses pour conserver leurs en-têtes.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
