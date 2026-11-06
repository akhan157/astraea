import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
// Fonts ship with the app (no Google Fonts request), so the desktop build
// renders the same offline. Each weight file covers every subset through
// unicode-range; the webview only loads the ranges a page uses.
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Scripted smoke mode: only when the desktop shell was launched for it (it
// injects the flag before this script runs); otherwise nothing loads.
if ('__ASTRAEA_SMOKE__' in window) void import('./desktop/smoke').then((smoke) => smoke.runSmoke());
