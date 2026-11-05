import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/baloo-2';
import '@fontsource/sometype-mono/400.css';
import '@fontsource/sometype-mono/500.css';
import 'katex/dist/katex.min.css';
import './styles/app.css';
import { App } from './App';
import { initI18n } from './lib/i18n/bootstrap';
import { useVault } from './stores/vault';

initI18n();
useVault.getState().initialize();

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
