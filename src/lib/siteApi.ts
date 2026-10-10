import type { SiteFacts } from '../../shared/siteWire.js';

/**
 * Who runs the site, asked of the Worker.
 *
 * Its own module rather than a line in `modelApi`, because it has nothing to do with
 * models and everything to do with the pages that have to name a person and an
 * address. Failure is answered with nothing rather than thrown: the contacts page
 * says plainly that the details are missing, which is the same thing it says before
 * they have been set.
 */
export async function siteFacts(): Promise<SiteFacts | null> {
  try {
    const answer = await fetch('/api/site');
    if (!answer.ok) return null;
    return (await answer.json()) as SiteFacts;
  } catch {
    return null;
  }
}
