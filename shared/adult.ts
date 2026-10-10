/**
 * Models for adults: who is shown them, and how.
 *
 * <h2>Three ways of being shown them</h2>
 *
 * Hidden, blurred, or as they are. Hidden is where everybody starts, and it is what
 * anybody gets who has not signed in and said they are eighteen, whatever they asked
 * for. Blurred is for somebody whose screen others can see — a stream, mostly: the
 * models are there, covered, and open one at a time on a press. As they are is as
 * they are.
 *
 * <h2>Where each is decided</h2>
 *
 * Hidden is decided by the Worker: a model somebody may not see is not sent to them,
 * rather than sent and covered up, since a page can be made to draw anything it has
 * been handed. Blurred is drawn by the page, because by then the person has said they
 * may see it and is only choosing not to have it on screen.
 *
 * <h2>Where the site closes them</h2>
 *
 * Where the law asks for a proof of age this site does not take, models for adults
 * are hidden from everybody, with no way of saying otherwise. No confirmation is
 * offered there at all: one a person can click is exactly what such a law does not
 * accept. Decided by the country Cloudflare places the request in.
 */

export type AdultView = 'hide' | 'blur' | 'open';

export const ADULT_VIEWS: readonly AdultView[] = ['hide', 'blur', 'open'];

export const ADULT_VIEW_NAMES: Record<AdultView, string> = {
  hide: 'Скрывать',
  blur: 'Стримерский: размыто',
  open: 'Открытый: как есть',
};

export function isAdultView(value: unknown): value is AdultView {
  return typeof value === 'string' && (ADULT_VIEWS as readonly string[]).includes(value);
}

/**
 * The countries where models for adults are closed, by ISO code.
 *
 * The United Kingdom, whose Online Safety Act asks a site with such content for a
 * check of age that a click does not pass. Meant to last until the site has one.
 */
export const CLOSED_IN: readonly string[] = ['GB'];

/**
 * The list in force: the one set for the Worker, or the one above.
 *
 * Set as `ADULT_CLOSED=GB,XX`, so a country can be added without a change of code,
 * and so the closed case can be tried locally by naming the country one is in.
 */
export function closedList(setting: string | undefined): readonly string[] {
  if (setting === undefined) return CLOSED_IN;
  return setting
    .split(',')
    .map((one) => one.trim().toUpperCase())
    .filter(Boolean);
}

export function closedIn(country: string | null | undefined, list: readonly string[] = CLOSED_IN): boolean {
  return !!country && list.includes(country.toUpperCase());
}

/** What a person has said: when they said they are eighteen, and how they want to be shown. */
export interface AdultSaid {
  adultOk: string | null;
  adultView: AdultView;
}

/** How models for adults are shown to this person, here: what they chose, if they may choose. */
export function viewFor(person: AdultSaid | null, closed: boolean): AdultView {
  if (closed || !person || !person.adultOk) return 'hide';
  return person.adultView;
}

/**
 * Whether the page draws a model covered.
 *
 * Anything for adults, unless shown as it is. That includes your own: somebody
 * streaming with the blur on means their own shelf as well.
 */
export function covered(model: { adult: boolean }, view: AdultView): boolean {
  return model.adult && view !== 'open';
}
