/// <reference types="vite/client" />
/// <reference types="@cloudflare/workers-types" />

/** Liaisons et variables du Worker (voir wrangler.jsonc). */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SHOPIFY_API_KEY: string;
    SHOPIFY_API_SECRET: string;
    SHOPIFY_APP_URL: string;
    SHOPIFY_APP_HANDLE: string;
    SCOPES: string;
    BILLING_REQUIRED?: string;
    SUPPORT_EMAIL?: string;
    SHOW_LOGIN_FORM?: string;
  }
}
interface Env extends Cloudflare.Env {}

declare module "virtual:react-router/server-build" {
  import type { ServerBuild } from "react-router";
  const build: ServerBuild;
  export = build;
}
