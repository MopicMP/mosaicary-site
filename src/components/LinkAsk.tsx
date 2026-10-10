import { Ban, Check, KeyRound, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';

import { KEYS_MAX } from '../../shared/keyWire.js';
import type { LinkAsked } from '../../shared/linkWire.js';
import { here, pathOfLink } from '../lib/address.js';
import { sayWhy } from '../lib/ask.js';
import { answerLink, askedLink } from '../lib/linkApi.js';
import { NOBODY, askWhoIAm, type Me } from '../lib/me.js';
import { words } from '../lib/words.js';
import { SignInWays } from './SignIn.js';

/**
 * The one page on this site that something else opens: letting Blockbench in.
 *
 * The plugin cannot be sent back to, so nothing here talks to it. A person presses
 * «Войти» in Blockbench, their browser opens this page, and the plugin goes on asking
 * the server every few seconds whether anybody said yes. This page is only ever that
 * yes or that no (shared/linkWire.ts).
 *
 * Three things are on it on purpose, and taking any of them off would make it a
 * button that says «разрешить» to a question nobody asked:
 *
 * - **the code**, large, to be compared by eye with the one in Blockbench. They
 *   differ when the request being answered is somebody else's, and that is the only
 *   way this is ever attacked: a code sent to a person who presses yes out of habit;
 * - **the account**, by name, because the key is given to this one and a person with
 *   two accounts is signed into whichever they last used;
 * - **what the key will and will not be able to do**, which is neither the whole of
 *   an account nor a detail: it publishes and updates, and it undoes nothing.
 */
export function LinkAsk({ code }: { code: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [asked, setAsked] = useState<LinkAsked | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    askWhoIAm().then(setMe, () => setMe(NOBODY));
  }, []);

  useEffect(() => {
    if (!me?.signedIn) return;
    askedLink(code).then(setAsked, (why) => setTrouble(sayWhy(why)));
  }, [me?.signedIn, code]);

  // How long is left, counted here rather than asked for again: the server already
  // said when it runs out, and a page that polls to show a clock polls for a clock.
  useEffect(() => {
    if (!asked) return;
    const tick = () => setLeft(Math.max(0, Date.parse(asked.expires) - Date.now()));
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [asked]);

  const answer = (yes: boolean) => {
    if (busy || !asked) return;
    setBusy(true);
    setTrouble(null);
    answerLink(code, yes)
      .then(
        () => setAsked({ ...asked, state: yes ? 'allowed' : 'denied' }),
        (why) => setTrouble(sayWhy(why)),
      )
      .finally(() => setBusy(false));
  };

  if (me === null) {
    return (
      <main className="alone">
        <LogIn size={28} />
        <p>{words().link.moment}</p>
      </main>
    );
  }

  if (!me.signedIn) {
    return (
      <main className="alone">
        <LogIn size={28} />
        <h2>{words().link.code(code)}</h2>
        <p>{words().link.sign_in_first}</p>
        <SignInWays me={me} back={pathOfLink(code)} />
      </main>
    );
  }

  if (trouble && !asked) {
    return (
      <main className="alone">
        <Ban size={28} />
        <h2>{words().link.broken_title}</h2>
        <p>{trouble}</p>
        <a className="chip go alone-go" href={here('/')}>
          {words().link.to_catalogue}
        </a>
      </main>
    );
  }

  if (!asked) {
    return (
      <main className="alone">
        <LogIn size={28} />
        <p>{words().link.looking}</p>
      </main>
    );
  }

  if (asked.state === 'allowed' || asked.state === 'taken') {
    return (
      <main className="alone">
        <Check size={28} />
        <h2>{words().link.done_title}</h2>
        <p>{words().link.done_text}</p>
        <a className="chip go alone-go" href={here('/me')}>
          {words().link.my_models}
        </a>
      </main>
    );
  }

  if (asked.state === 'denied') {
    return (
      <main className="alone">
        <Ban size={28} />
        <h2>{words().link.denied_title}</h2>
        <p>{words().link.denied_text}</p>
        <a className="chip go alone-go" href={here('/')}>
          {words().link.to_catalogue}
        </a>
      </main>
    );
  }

  if (left === 0) {
    return (
      <main className="alone">
        <Ban size={28} />
        <h2>{words().link.late_title}</h2>
        <p>{words().link.late_text}</p>
      </main>
    );
  }

  const minutes = left === null ? null : Math.ceil(left / 60_000);
  const full = asked.keys >= asked.keysMax;

  return (
    <main className="alone link-ask">
      <KeyRound size={28} />
      <h2>{words().link.ask_title}</h2>
      <p className="link-code">{asked.code}</p>
      <p>{words().link.compare}</p>
      <dl className="link-facts">
        <dt>{words().link.program}</dt>
        <dd>{asked.device}</dd>
        <dt>{words().link.account}</dt>
        <dd>{me.handle}</dd>
        {minutes !== null && (
          <>
            <dt>{words().link.answer_in}</dt>
            <dd>{minutes === 1 ? words().link.under_minute : words().link.minutes_left(minutes)}</dd>
          </>
        )}
      </dl>
      <p className="link-head">{words().link.can_head}</p>
      <ul className="link-can">
        <li>{words().link.can_look}</li>
        <li>{words().link.can_publish}</li>
        <li>{words().link.can_talk}</li>
      </ul>
      <p className="link-head">{words().link.cannot_head}</p>
      <ul className="link-cannot">
        <li>{words().link.cannot_remove}</li>
        <li>{words().link.cannot_age}</li>
        <li>{words().link.cannot_report}</li>
      </ul>
      {full ? (
        <p className="note bad">{words().link.full(KEYS_MAX)}</p>
      ) : (
        <div className="alone-ways">
          <button type="button" className="chip go alone-go" disabled={busy} onClick={() => answer(true)}>
            <Check size={15} />
            {words().link.allow}
          </button>
          <button type="button" className="chip alone-go" disabled={busy} onClick={() => answer(false)}>
            <Ban size={15} />
            {words().link.refuse}
          </button>
        </div>
      )}
      <p>{words().link.afterwards}</p>
      {trouble && <p className="note bad">{trouble}</p>}
    </main>
  );
}
