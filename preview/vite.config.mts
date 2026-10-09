import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The panel preview: the real panel in an ordinary page, with a simulated
// `chrome` API. A dev server only; nothing here is part of the extension.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [tailwindcss()],
  server: {
    port: 5183,
    // A fixed address, so scripts and agents know where the preview is
    strictPort: true,
  },
});
