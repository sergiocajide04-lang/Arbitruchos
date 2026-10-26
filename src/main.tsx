import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/700-italic.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { captureInstallPrompt } from './features/pwa/install';
import { applyTheme, readThemePref } from './lib/theme';

// Antes de pintar: tema guardado y captura temprana del evento de instalación.
applyTheme(readThemePref());
captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
