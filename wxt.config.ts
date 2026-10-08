import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'GraphQL Inspector',
    version: '2.0.1',
    description: 'Inspect GraphQL queries and mutations',
    permissions: ['storage', 'tabs', 'webRequest'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none';",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
