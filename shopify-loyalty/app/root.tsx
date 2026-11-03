import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";

type LocaleData = { locale?: string; dir?: string } | undefined;

export default function App() {
  // Langue et sens d'écriture : ceux de l'admin (routes/app) ou des pages publiques.
  // (hooks appelés sans condition, dans un ordre fixe)
  const admin = useRouteLoaderData("routes/app") as LocaleData;
  const landing = useRouteLoaderData("routes/_index") as LocaleData;
  const privacy = useRouteLoaderData("routes/privacy") as LocaleData;
  const support = useRouteLoaderData("routes/support") as LocaleData;
  const data = admin ?? landing ?? privacy ?? support;

  return (
    <html lang={data?.locale ?? "en"} dir={data?.dir ?? "ltr"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
