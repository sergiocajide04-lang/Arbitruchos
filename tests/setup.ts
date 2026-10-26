import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom no implementa estas APIs del navegador.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:preview';
    URL.revokeObjectURL = () => undefined;
  }
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
}

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* entorno node */
  }
});
