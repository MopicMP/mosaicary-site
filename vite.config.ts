import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The front of the site.
 *
 * Built into `dist/web` as plain files for GitHub Pages. The API is a Cloudflare
 * Worker on the same address under `/api`, so the page and the API are one origin
 * and nothing in the page needs to know where the other half lives.
 *
 * In development the Worker runs beside Vite under `wrangler dev` and `/api` is
 * proxied across to it.
 *
 * `--mode skins` is the skins site as it was, against its own old local server:
 * skins are the second version and are kept working, not shipped. That mode alone
 * takes `public/`, which holds sample skins for that server and nothing the models
 * site may put on the internet.
 */
export default defineConfig(({ mode }) => {
  const skins = mode === 'skins';
  return {
    plugins: [react()],
    publicDir: skins ? 'public' : false,
    build: {
      outDir: 'dist/web',
      emptyOutDir: true,
      // three is most of the bundle and is needed on the first page that opens a
      // model; a warning about it at 500 kB would be noise rather than news.
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
      // Refuse rather than slide to the next free port. The Worker beside this one is
      // told the address of the page as a number written out by hand
      // (PUBLIC_ORIGIN:http://localhost:5173), and when Vite quietly moved to 5174 the
      // two stopped agreeing: every change made from the page was refused with "запрос
      // пришёл не с сайта", signing in through GitHub came back to 5173 — a different
      // stand with a different database, which looked like models appearing out of
      // nowhere the moment somebody signed in — and the page of consent for the plugin
      // pointed at a front end that knew nothing of the code on it. A port that is
      // taken is now said out loud at the start instead.
      strictPort: true,
      proxy: {
        // API_ORIGIN points the page at another Worker, for when 8787 is taken by a
        // second dev server with a database of its own — both answer on "localhost",
        // and which one a request reaches then depends on how the name resolves.
        '/api': skins ? 'http://localhost:3000' : (process.env.API_ORIGIN ?? 'http://localhost:8787'),
      },
    },
  };
});
