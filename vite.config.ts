/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import brand from './src/config/brand.json';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE || '/';

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Vendors separados: cambian poco y se cachean entre versiones.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            data: ['@tanstack/react-query', 'react-hook-form', 'zod', '@hookform/resolvers'],
            charts: ['recharts'],
          },
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          id: base,
          name: brand.fullName,
          short_name: brand.name,
          description: brand.description,
          lang: brand.lang,
          dir: 'ltr',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: brand.colors.background,
          theme_color: brand.colors.background,
          categories: ['sports', 'health', 'fitness'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Solo se precachea el shell estático. Las respuestas de Supabase NUNCA se cachean.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          globIgnores: ['ocr/**', 'icons/splash-*.png', '404.html', '_redirects'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/\/ocr\//],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          runtimeCaching: [
            {
              // Motor OCR y modelo de idioma: recursos públicos e idénticos para todos.
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/ocr/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'refrun-ocr-assets-v1',
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      exclude: ['tests/ocr-integration/**', 'node_modules/**'],
      css: false,
      testTimeout: 30000,
    },
  };
});
