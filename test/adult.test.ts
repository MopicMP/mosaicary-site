import { describe, expect, it } from 'vitest';

import {
  ADULT_VIEWS,
  CLOSED_IN,
  closedIn,
  closedList,
  covered,
  isAdultView,
  viewFor,
  type AdultSaid,
  type AdultView,
} from '../shared/adult.js';

/**
 * Who is shown models for adults, and how.
 *
 * The rule itself rather than the routes built on it: every answer the Worker gives
 * about such a model comes from `viewFor`, so a mistake here is a model for adults on
 * the screen of somebody who never said they were eighteen.
 *
 * The Worker's own `closedHere` is these two together — the list from its setting and
 * the country Cloudflare put on the request — and is not imported here, because the
 * Worker's types are not the browser's.
 */

function said(over: Partial<AdultSaid> = {}): AdultSaid {
  return { adultOk: '2026-10-06T12:00:00Z', adultView: 'open', ...over };
}

describe('how somebody is shown models for adults', () => {
  it('is hidden until they are signed in and have said their age', () => {
    expect(viewFor(null, false)).toBe('hide');
    expect(viewFor(said({ adultOk: null }), false)).toBe('hide');
    expect(viewFor(said({ adultOk: null, adultView: 'open' }), false)).toBe('hide');
  });

  it('is what they chose once they have said it', () => {
    for (const view of ADULT_VIEWS) {
      expect(viewFor(said({ adultView: view }), false)).toBe(view);
    }
  });

  it('is hidden where the site closes them, whatever was chosen or confirmed', () => {
    expect(viewFor(said(), true)).toBe('hide');
    expect(viewFor(said({ adultView: 'blur' }), true)).toBe('hide');
    expect(viewFor(null, true)).toBe('hide');
  });
});

describe('where the site closes them', () => {
  it('is the United Kingdom, by whatever case the country arrives in', () => {
    expect(CLOSED_IN).toContain('GB');
    expect(closedIn('GB')).toBe(true);
    expect(closedIn('gb')).toBe(true);
    expect(closedIn('DE')).toBe(false);
  });

  it('is nowhere when the country is not known, which is what a local run looks like', () => {
    expect(closedIn(null)).toBe(false);
    expect(closedIn(undefined)).toBe(false);
    expect(closedIn('')).toBe(false);
  });

  it('is the setting when there is one, so a country can be added without a release', () => {
    expect(closedList(undefined)).toBe(CLOSED_IN);
    expect(closedList('GB,FR')).toEqual(['GB', 'FR']);
    expect(closedList(' gb , fr ')).toEqual(['GB', 'FR']);
    expect(closedIn('FR', closedList('GB,FR'))).toBe(true);
    expect(closedIn('GB', closedList('FR'))).toBe(false);
  });

  it('is nowhere when the setting is empty, which is how the closed case is turned off', () => {
    expect(closedList('')).toEqual([]);
    expect(closedIn('GB', closedList(''))).toBe(false);
  });
});

describe('what the page draws covered', () => {
  it('is a model for adults at every level but the open one', () => {
    expect(covered({ adult: true }, 'hide')).toBe(true);
    expect(covered({ adult: true }, 'blur')).toBe(true);
    expect(covered({ adult: true }, 'open')).toBe(false);
  });

  it('is never a model for everybody', () => {
    for (const view of ADULT_VIEWS) {
      expect(covered({ adult: false }, view)).toBe(false);
    }
  });
});

describe('a level arriving from outside', () => {
  it('is one of the three or nothing', () => {
    for (const view of ADULT_VIEWS) expect(isAdultView(view)).toBe(true);
    for (const wrong of ['blurred', '', 'HIDE', null, undefined, 1, {}]) {
      expect(isAdultView(wrong)).toBe(false);
    }
  });

  it('is written the same way in the three places that know the names', () => {
    const names: AdultView[] = ['hide', 'blur', 'open'];
    expect([...ADULT_VIEWS]).toEqual(names);
  });
});
