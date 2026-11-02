import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// La CLI Shopify fournit HOST : on le recopie dans SHOPIFY_APP_URL pour ne pas perturber Vite.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

const hmrConfig =
  host === "localhost"
    ? { protocol: "ws", host: "localhost", port: 64999, clientPort: 64999 }
    : {
        protocol: "wss",
        host,
        port: parseInt(process.env.FRONTEND_PORT!) || 8002,
        clientPort: 443,
      };

// En développement (`shopify app dev`), la CLI Shopify fournit les clés et l'URL du tunnel
// dans process.env : on les transmet au Worker local. Jamais au build de production.
const SHOPIFY_DEV_VARS = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "SCOPES"];

export default defineConfig(({ command }) => {
  const devVars: Record<string, string> = {};
  if (command === "serve") {
    for (const key of SHOPIFY_DEV_VARS) {
      if (process.env[key]) devVars[key] = process.env[key]!;
    }
    devVars.BILLING_REQUIRED = process.env.BILLING_REQUIRED ?? "false";
    devVars.SHOW_LOGIN_FORM = "true";
  }

  return {
    server: {
      allowedHosts: [host],
      cors: { preflightContinue: true },
      port: Number(process.env.PORT || 3000),
      hmr: hmrConfig,
      fs: { allow: ["app", "node_modules", "workers"] },
    },
    plugins: [
      // Exécute le serveur dans workerd (comme en production sur Cloudflare)
      cloudflare({
        viteEnvironment: { name: "ssr" },
        config: (config) => ({ vars: { ...config.vars, ...devVars } }),
      }),
      reactRouter(),
      tsconfigPaths(),
    ],
    build: { assetsInlineLimit: 0 },
    // Le Worker doit embarquer toutes ses dépendances (pas de node_modules en production).
    ssr: { noExternal: true },
    environments: { ssr: { resolve: { noExternal: true } } },
    optimizeDeps: { include: ["@shopify/app-bridge-react"] },
  } satisfies UserConfig;
});
