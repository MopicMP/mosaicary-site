import { Check, CloudFog, Eye, EyeOff, LogIn, LogOut, User } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ADULT_VIEWS, ADULT_VIEW_NAMES, type AdultView } from '../../shared/adult.js';
import {
  PROVIDERS,
  PROVIDER_NAMES,
  canSignInWith,
  chooseAdult,
  leave,
  signInPath,
  type Me,
  type Provider,
} from '../lib/me.js';
import { forgetSaidAge, useSaidAge } from '../lib/saidAge.js';
import { BrandMark } from './Brands.js';
import { Floating } from './Floating.js';
import { Hint } from './Hint.js';
import { Icons, Switch } from './filters/Kit.js';

/**
 * Signing in, and being signed in, in one corner.
 *
 * Whichever it is takes the same room, so the header does not jump when the answer
 * to "who are you" comes back a moment after the page draws.
 *
 * <h2>Two ways in, one account</h2>
 *
 * Discord or GitHub, whichever somebody has. Signed in with one, the menu offers to
 * tie the other to the same account, so that a person who later only has the other
 * at hand still finds their own models — rather than a second, empty account under
 * the same name.
 *
 * The way out is behind a press rather than sitting next to the name. A button that
 * signs you out, one pixel from the one that opens your things, is a button that
 * gets pressed by mistake — and this one costs a trip through another site to undo.
 */
export function Account({ me, onLeave, onMe }: { me: Me; onLeave: () => void; onMe: () => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const at = event.target as Node;
      if (anchor?.contains(at) || menu.current?.contains(at)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, anchor]);

  if (!me.signedIn) {
    return (
      <>
        <button
          type="button"
          className={open ? 'ghost on' : 'ghost'}
          ref={setAnchor}
          onClick={() => setOpen(!open)}
        >
          <LogIn size={16} />
          Войти
        </button>
        <Floating anchor={anchor} open={open} align="start" gap={6}>
          <div className="who-menu" ref={menu}>
            {PROVIDERS.map((provider) => (
              <Way key={provider} provider={provider} me={me} label={`Через ${PROVIDER_NAMES[provider]}`} />
            ))}
          </div>
        </Floating>
      </>
    );
  }

  const tied = me.providers ?? [];

  return (
    <>
      <button
        type="button"
        className={open ? 'who on' : 'who'}
        ref={setAnchor}
        onClick={() => setOpen(!open)}
      >
        {me.face ? <img src={me.face} alt="" width={22} height={22} /> : <User size={16} />}
        <span className="who-name">{me.handle}</span>
      </button>

      <Floating anchor={anchor} open={open} align="start" gap={6}>
        <div className="who-menu" ref={menu}>
          {me.providers &&
            PROVIDERS.map((provider) =>
              tied.includes(provider) ? (
                <span key={provider} className="who-line">
                  <BrandMark provider={provider} size={14} />
                  {PROVIDER_NAMES[provider]}
                  <Check size={13} className="who-tick" />
                </span>
              ) : (
                <Way key={provider} provider={provider} me={me} label={`Привязать ${PROVIDER_NAMES[provider]}`} />
              ),
            )}
          <AdultSetting me={me} onMe={onMe} />
          <button
            type="button"
            className="who-out"
            onClick={async () => {
              setOpen(false);
              await leave();
              forgetSaidAge();
              onLeave();
            }}
          >
            <LogOut size={14} />
            Выйти
          </button>
        </div>
      </Floating>
    </>
  );
}

const ADULT_ICONS: Record<AdultView, ReactNode> = {
  hide: <EyeOff size={14} />,
  blur: <CloudFog size={14} />,
  open: <Eye size={14} />,
};

/**
 * How models for adults are shown to this person.
 *
 * Three levels rather than a yes-or-no, because the middle one is the whole point:
 * blurred is what somebody shows on a stream, where the catalogue is on screen and
 * what is in it is their own business and nobody else's.
 *
 * Kept with the account rather than in this browser, because it is the far side that
 * honours it: with them hidden, a model for adults is not sent at all. Saying one's
 * age is asked once and then remembered, so the two upper levels can be gone back and
 * forth between without being asked again — and where the site closes them there is
 * nothing here but a line saying so.
 *
 * Going back to hidden takes the saying of one's age back with it, which is why that
 * is said here rather than left to be discovered the next time the question returns.
 */
function AdultSetting({ me, onMe }: { me: Me; onMe: () => void }) {
  const confirmed = me.adult?.confirmed ?? false;
  // Held for the visit and shared with the publishing window: the menu closes the
  // moment somebody clicks elsewhere, and the tick used to close with it.
  const [said, setSaid] = useSaidAge();
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  if (me.adult?.closed) {
    return (
      <div className="who-adult">
        <span className="who-head">Модели 18+</span>
        <p className="who-note">В твоей стране они на сайте закрыты.</p>
      </div>
    );
  }

  const chosen = me.adult?.chosen ?? 'hide';
  const pick = async (view: AdultView) => {
    if (busy || view === chosen) return;
    setBusy(true);
    const why = await chooseAdult(view, said);
    setBusy(false);
    setTrouble(why);
    if (why) return;
    // Used: the far side has it now, or, going back to hiding, has taken it back.
    setSaid(false);
    onMe();
  };

  return (
    <div className="who-adult">
      <span className="who-head">Модели 18+</span>
      {!confirmed && (
        <Switch
          on={said}
          icon={<Check size={12} />}
          label="Мне есть 18 лет"
          says="Без этого их видно не будет"
          onToggle={() => {
            setSaid(!said);
            setTrouble(null);
          }}
        />
      )}
      <Icons
        options={ADULT_VIEWS.map((view) => ({ value: view, label: ADULT_VIEW_NAMES[view], icon: ADULT_ICONS[view] }))}
        isOn={(view) => view === chosen}
        onPick={pick}
      />
      {confirmed && <p className="who-note">«Скрывать» отзовёт и подтверждение возраста.</p>}
      {trouble && <p className="who-note bad">{trouble}</p>}
    </div>
  );
}

/**
 * One way in, or the reason it is not one yet.
 *
 * Before the application exists on the service's side this cannot work, and it says
 * so on the hover rather than sending somebody to that service's own error page.
 */
function Way({ provider, me, label }: { provider: Provider; me: Me; label: string }) {
  if (!canSignInWith(me, provider)) {
    return (
      <Hint says="Этот вход ещё не настроен">
        <span className="who-out off">
          <BrandMark provider={provider} size={14} />
          {label}
        </span>
      </Hint>
    );
  }
  return (
    <a className="who-out" href={signInPath(provider)}>
      <BrandMark provider={provider} size={14} />
      {label}
    </a>
  );
}
