import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session, redirect } = await authenticate.admin(request);

  // Abonnement obligatoire (tarification gérée par Shopify, définie dans le Partner Dashboard).
  // Sans abonnement actif, le marchand est envoyé sur la page de choix de formule de Shopify.
  if (process.env.BILLING_REQUIRED !== "false") {
    const { hasActivePayment } = await billing.check();
    if (!hasActivePayment) {
      const store = session.shop.replace(".myshopify.com", "");
      const handle = process.env.SHOPIFY_APP_HANDLE || "hoshi-fidelite";
      throw redirect(`https://admin.shopify.com/store/${store}/charges/${handle}/pricing_plans`, {
        target: "_top",
      });
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Tableau de bord</s-link>
        <s-link href="/app/members">Membres</s-link>
        <s-link href="/app/rewards">Récompenses</s-link>
        <s-link href="/app/tiers">Niveaux clients</s-link>
        <s-link href="/app/program">Réglages</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify a besoin que React Router intercepte certaines réponses pour conserver leurs en-têtes.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
