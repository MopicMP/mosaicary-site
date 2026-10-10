import { LANGS, LANG_NAMES } from '../../shared/langs.js';
import { goToLang, lang } from '../lib/lang.js';
import { words } from '../lib/words.js';
import { Dropdown } from './Dropdown.js';
import { Hint } from './Hint.js';

/**
 * Which language the site is in.
 *
 * <h2>Each language named in itself</h2>
 *
 * Not translated into whatever is on screen. Somebody who landed here in a language
 * they cannot read has one word they are certain to recognise, and it is the one their
 * own language calls itself. For the same reason there is no flag anywhere near this:
 * a flag names a country, and the people who read Spanish or Portuguese do not live in
 * one.
 *
 * <h2>No icon on the choices</h2>
 *
 * The button says the language it is in, which is the whole of what it has to say.
 * Fourteen identical globes down the side of a list are fourteen reasons to look at
 * something that carries no information.
 */
export function LanguagePick() {
  // The skins mode has no language in its addresses, so it has nothing to switch
  // between; it is chosen when the page is built, and this goes with it.
  if (import.meta.env.MODE === 'skins') return null;

  const now = lang();
  return (
    <Hint says={words().head.language}>
      <div className="top-lang">
        <Dropdown
          choices={LANGS.map((code) => ({ value: code, label: LANG_NAMES[code] }))}
          chosen={[now]}
          onChange={([pick]) => {
            if (pick) goToLang(pick);
          }}
          placeholder={words().head.language}
          most={1}
          align="start"
        />
      </div>
    </Hint>
  );
}
