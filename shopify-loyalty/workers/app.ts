/**
 * Point d'entrée Cloudflare Worker :
 *  - fetch     : l'application React Router (admin, webhooks, proxy du widget)
 *  - scheduled : tâche horaire (anniversaires, expiration des points)
 */
import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, { cloudflare: { env, ctx } });
  },

  async scheduled(_controller, _env, ctx) {
    const { runDailyJobs } = await import("../app/jobs.server");
    ctx.waitUntil(runDailyJobs());
  },
} satisfies ExportedHandler<Env>;
