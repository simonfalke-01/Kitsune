import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './app';
import { AppProviders } from './app/providers';
import './app.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Kitsune could not find its application root.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>
);
