// Application pour Node : ressources lues sur le disque et démarrage d'un serveur HTTP.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp as createSharedApp } from './server.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
export const NODE_ASSETS = {
  adminHtml: readFileSync(here('../public/admin.html'), 'utf8'),
  sampleOrder: JSON.parse(readFileSync(here('./sample-order.json'), 'utf8')),
};

/** Même application que sur Cloudflare, avec `.listen(port, callback)` → serveur HTTP Node. */
export function createApp(options) {
  const app = createSharedApp({ assets: NODE_ASSETS, ...options });
  app.listen = (port, callback) => serve({ fetch: app.fetch, port }, () => callback?.());
  return app;
}
