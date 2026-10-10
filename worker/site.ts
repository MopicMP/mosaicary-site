import { closedList } from '../shared/adult.js';
import type { SiteCounts, SiteFacts } from '../shared/siteWire.js';
import type { Env } from './env.js';
import { PUBLIC } from './models.js';

/**
 * What the pages that say who we are read from the server.
 *
 * Unset rather than half-set: a contacts page is either reachable or it says plainly
 * that it is not, because the half-filled one looks finished.
 */
export async function siteFacts(env: Env): Promise<SiteFacts> {
  const email = env.OPERATOR_EMAIL?.trim();
  return {
    operator: email ? { email } : null,
    closedIn: closedList(env.ADULT_CLOSED),
    counts: await siteCounts(env),
  };
}

/**
 * How much of the site there is, in one statement.
 *
 * Four subqueries and not four queries: the four numbers are read at the same moment
 * by the same foot of the same page, and a database that answers them separately can
 * answer that there are more authors than models if an upload lands between two of
 * them. The answer above is kept for five minutes, so this runs once per five minutes
 * however many people are looking.
 *
 * Counted over every public model, including the ones for adults that a person who
 * has not asked for them does not see. The number is one number for everybody — it is
 * cached for everybody — so it has to be the whole site rather than one viewer's share
 * of it; what each person sees is their own setting, not a fact about the site.
 *
 * Null when the query fails. The rest of the answer is who runs the site, which the
 * law wants reachable at all times, and losing that to a counting error would be the
 * one failure here that matters.
 */
async function siteCounts(env: Env): Promise<SiteCounts | null> {
  try {
    const row = await env.DB.prepare(
      `select (select count(*) from users) as people,
              (select count(distinct m.owner) from models m where ${PUBLIC}) as authors,
              (select count(*) from models m where ${PUBLIC}) as models,
              (select coalesce(sum(m.downloads), 0) from models m where ${PUBLIC}) as downloads`,
    ).first<SiteCounts>();
    return row ?? null;
  } catch {
    return null;
  }
}
