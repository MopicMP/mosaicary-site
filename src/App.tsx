import { ModelsApp } from './ModelsApp.js';
import { SkinsApp } from './SkinsApp.js';
import { LinkAsk } from './components/LinkAsk.js';
import { linkInPath } from './lib/address.js';

/**
 * Which of the two sites this page is.
 *
 * The models site is what goes up. The skins site is the whole of what was here
 * before, kept running for `npm run dev:skins` (Vite's `--mode skins`) against its old local
 * server, until skins open in the second version and move in under /skins. Chosen
 * when the page is built rather than when it runs, so the site that is put up does
 * not carry a switch anybody could flip from the address bar.
 *
 * Letting Blockbench into an account is decided here rather than inside the catalogue
 * for one reason: it is the only address something outside opens, and what it asks has
 * to be the whole of what is on the screen. A consent screen behind a grid of models,
 * with filters beside it and windows over it, is a consent screen nobody reads.
 */
export function App() {
  if (import.meta.env.MODE === 'skins') return <SkinsApp />;
  const code = linkInPath(location.pathname);
  return code ? <LinkAsk code={code} /> : <ModelsApp />;
}
