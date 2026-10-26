// Arnés visual SOLO de desarrollo: renderiza la app con datos sintéticos y sin
// Supabase, para revisar el diseño en distintos tamaños. Uso:
//   npx vite --config tests/visual/vite.config.ts   →  http://localhost:5199/?ruta=/clasificacion
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const MOCK_PROVIDERS = /src\/features\/(auth\/AuthProvider|group\/GroupProvider)\.tsx$/;
const REAL_API = /src\/services\/api\.ts$/;

export default defineConfig({
  root: r('.'),
  plugins: [
    react(),
    {
      // Sustituye proveedores y API reales por dobles, también en importaciones relativas.
      name: 'refrun-visual-mocks',
      enforce: 'pre',
      async resolveId(source, importer) {
        if (!importer || source.startsWith('virtual:')) return null;
        const res = await this.resolve(source, importer, { skipSelf: true });
        const id = res?.id.split('\\').join('/') ?? '';
        if (MOCK_PROVIDERS.test(id)) return r('../ui/mocks.tsx');
        if (REAL_API.test(id)) return r('./mock-api.ts');
        return null;
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify('dev') },
  css: { postcss: r('../../postcss.config.js') },
  resolve: {
    alias: [
      { find: /^virtual:pwa-register\/react$/, replacement: r('./pwa-stub.ts') },
      { find: '@', replacement: r('../../src') },
    ],
  },
  server: { port: 5199, strictPort: true },
});
