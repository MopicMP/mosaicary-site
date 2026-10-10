/**
 * The few facts about the site itself that a page asks the Worker for.
 *
 * How to reach whoever runs it is not written into the repository: the repository is
 * public, the address is a person's own, and the pages need it anyway. So it is set
 * on the server and sent to the page, which is the one arrangement where the law's
 * "easy, direct and permanent access" holds without a person's own details sitting
 * in a commit.
 *
 * One e-mail and nothing else. A home is not an office, and the site is run from one;
 * what the law asks for beyond the address is given to an authority that asks for it,
 * not printed on a page for everybody.
 */
export interface SiteFacts {
  /** Null until it is set on the server, which the contacts page says out loud. */
  operator: { email: string } | null;
  /** Countries where models for adults are closed outright, by ISO code. */
  closedIn: readonly string[];
  /** How much of the site there is, or null when the count could not be made. */
  counts: SiteCounts | null;
}

/**
 * How much of the site there is, for the line in the foot of every page.
 *
 * Counted on the server because a page cannot see past what it was sent: the catalogue
 * it holds is the public models alone, and how many people have an account is not in
 * it at all. Sent together with the facts above rather than from a route of its own,
 * since the same foot reads both at the same moment, and one answer kept for five
 * minutes is one query every five minutes instead of four on every page.
 *
 * Null rather than zeros when the count fails: a site that says it has nothing in it
 * is worse than a site that says nothing, and the rest of this answer — who runs it —
 * has to arrive either way.
 */
export interface SiteCounts {
  /** Accounts. Signing in is the only way in, so this is what "registered" means. */
  people: number;
  /** People with at least one model anybody can see. */
  authors: number;
  /** Models anybody can see. */
  models: number;
  /** Times a file has been taken, over those models. */
  downloads: number;
}
