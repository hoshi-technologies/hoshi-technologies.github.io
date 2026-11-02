import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  future: {
    // Requis par le plugin Vite de Cloudflare
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
