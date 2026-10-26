import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas de integración del OCR con Tesseract.js real (más lentas; separadas del resto).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/ocr-integration/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
