import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { fixLang, startLang } from './lib/lang.js';
import { loadWords, words } from './lib/words.js';
import './style.css';

/**
 * The language is settled and its dictionary read before anything is drawn.
 *
 * In that order, and awaited, so that no component can render in one language and be
 * corrected into another. The title and the description are replaced here for the
 * same reason they are in the document to begin with: what is in `index.html` is the
 * English one, which is what a crawler that runs no scripts gets, and this is what
 * the reader gets.
 */
async function start(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('the page has no root to mount on');

  // The skins mode is the site as it was: Russian throughout, and no language in its
  // addresses. It still shares the header, so it still needs a dictionary.
  const chosen = import.meta.env.MODE === 'skins' ? (fixLang('ru'), 'ru' as const) : startLang();
  await loadWords(chosen);

  document.title = words().site.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', words().site.description);

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
