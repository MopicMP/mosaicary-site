import { here } from './address.js';
import { withoutLang } from './lang.js';
import { words } from './words.js';

/**
 * The pages that say what the site is, what the rules are and what is kept.
 *
 * <h2>Why they are part of the site and not a wiki page somewhere</h2>
 *
 * Because three of the duties that apply to us name the place as well as the words:
 * the operator's name, address and e-mail have to be easy, direct and permanently
 * reachable; the terms have to be public and easy to find; the data notice has to be
 * given at the moment data is collected. A link into somebody else's wiki is none of
 * those the day the wiki moves.
 *
 * <h2>Why they sit beside the sections rather than inside them</h2>
 *
 * The three sections (models, skins, animations) are things to look through, and each
 * brings a header full of its own tools. These are things to read once. They answer
 * their own addresses, keep the header without the section's tools, and are reached
 * from the foot of every page — which is where a hand goes looking for them.
 */

export type Paper = 'rules' | 'data' | 'contact' | 'faq' | 'feedback';

export const ALL_PAPERS: Paper[] = ['rules', 'data', 'contact', 'faq', 'feedback'];

/**
 * The wall of reviews is counted among these, and it is the odd one out.
 *
 * It is not a text to read once: people write on it. What it needs is the place these
 * pages have and nothing else — an address of its own, the header without the
 * catalogue's tools beside it, and a link in the foot of every page, which is where a
 * hand goes looking for "what do people think of this". Being one of these is how it
 * gets all three without the catalogue learning about it.
 */

/** What a paper is called, in the language on screen. */
export function titleOfPaper(paper: Paper): string {
  return words().papers.titles[paper];
}

const PAPER_PATHS: Record<Paper, string> = {
  rules: '/rules',
  data: '/data',
  contact: '/contact',
  faq: '/faq',
  feedback: '/feedback',
};

export function pathOfPaper(paper: Paper): string {
  return here(PAPER_PATHS[paper]);
}

/** The paper an address names, if it names one. */
export function paperInPath(path: string): Paper | null {
  const clean = withoutLang(path).replace(/\/+$/, '') || '/';
  for (const paper of ALL_PAPERS) {
    if (clean === PAPER_PATHS[paper]) return paper;
  }
  return null;
}

/**
 * When these were last changed, in one place.
 *
 * Shown on every one of them, because a rule without a date is a rule nobody can tell
 * has changed. Written by hand on purpose: a build date would move when nothing was
 * changed, which is the lie in the other direction.
 *
 * Kept as a date rather than as the words for one, because the words differ in every
 * language and `Intl` already knows all of them — see `onDay`.
 */
export const PAPERS_CHANGED = '2026-10-08';
