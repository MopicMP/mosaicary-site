import { beforeAll, describe, expect, it } from 'vitest';

import { LICENSES, REPORT_KINDS } from '../shared/modelRules.js';
import { COMMENT_REPORT_KINDS } from '../shared/talkRules.js';
import { commentReportName, formatName, licenseName, reportName, useName } from '../src/lib/names.js';
import { loadWords } from '../src/lib/words.js';

/**
 * That every code the site keeps has a name to show for it.
 *
 * The codes are checked next door, in `modelRules.test.ts`; this asks the other half of
 * the question — whether the dictionary answers for each of them. A code with no name
 * is a blank on a card or in a dropdown, which is the kind of fault that gets noticed
 * by a visitor and not by a build.
 *
 * Read in Russian, because that is the dictionary with the words in it. The other
 * thirteen cannot be short of a key: each is declared as `Words`, so a missing one is a
 * build error rather than something a test could find.
 */

beforeAll(async () => {
  await loadWords('ru');
});

describe('a code turned into a name', () => {
  it('names every licence that can be chosen', () => {
    for (const one of LICENSES) expect(licenseName(one)).toBeTruthy();
    expect(licenseName('cc0')).toContain('CC0');
  });

  it('names every reason a model or a comment can be reported for', () => {
    for (const one of REPORT_KINDS) expect(reportName(one)).toBeTruthy();
    for (const one of COMMENT_REPORT_KINDS) expect(commentReportName(one)).toBeTruthy();
  });

  it('names each of the four things a model can be for', () => {
    for (const one of ['java', 'bedrock', 'mods', 'free'] as const) expect(useName(one)).toBeTruthy();
  });

  it('shows a format it has never heard of by its own code', () => {
    expect(formatName('geckolib_model')).toBe('GeckoLib');
    expect(formatName('some_plugin_format')).toBe('some_plugin_format');
  });
});
