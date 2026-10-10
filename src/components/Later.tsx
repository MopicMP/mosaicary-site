import { Hourglass } from 'lucide-react';

import { coming, type Section } from '../lib/site.js';
import { words } from '../lib/words.js';

/**
 * The page a section answers with before it is open.
 *
 * A page and not a missing one: a link to /skins sent today should still land
 * somewhere that says what it is and when it comes, rather than on a catalogue of
 * models that looks as though the link was wrong.
 */
export function Later({ section, onBack }: { section: Section; onBack: () => void }) {
  const title = section === 'skins' ? words().nav.skins : words().nav.animations;
  return (
    <main className="later">
      <div className="alone">
        <Hourglass size={28} />
        <h2>{words().later.soon(title)}</h2>
        <p>
          {coming(section)} {words().later.only_models}
        </p>
        <button type="button" className="chip go alone-go" onClick={onBack}>
          {words().later.to_models}
        </button>
      </div>
    </main>
  );
}
