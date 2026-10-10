import { CalendarClock, Eye, Images, Upload as UploadMark, User } from 'lucide-react';

import type { Mine } from '../lib/api.js';
import type { Me } from '../lib/me.js';
import { ago } from '../lib/when.js';
import { Hint } from './Hint.js';
import { SignInWays } from './SignIn.js';
import { SkinCard } from './SkinCard.js';
import type { View } from './SkinFigure.js';

/**
 * Your own corner: who you are, and what you have put here.
 *
 * <h2>Why the shelf is the page and the details are a line</h2>
 *
 * Because a profile is not about the person, it is about their things. A picture,
 * a name and a joining date take a line between them and everything else on the
 * page should be skins — and the moment there are none, the page has exactly one
 * job, which is to say so and offer the way to fix it.
 *
 * <h2>Nothing here is a claim</h2>
 *
 * What it shows comes from the same routes as the catalogue, asked as you. The
 * page could be made to believe anything by anybody with the developer tools open;
 * every answer it draws was decided on the other side against a cookie it cannot
 * read.
 */
export function Profile({
  me,
  skins,
  loading,
  view,
  moving,
  onOpen,
  onUpload,
}: {
  me: Me;
  skins: Mine[];
  loading: boolean;
  view: View;
  moving: boolean;
  onOpen: (id: string) => void;
  onUpload: () => void;
}) {
  if (!me.signedIn) {
    return (
      <div className="alone">
        <User size={28} />
        <h2>Здесь будут твои скины</h2>
        <p>Войди через Discord или GitHub — заведётся аккаунт, и всё, что зальёшь, останется за тобой.</p>
        <SignInWays me={me} back="/me" />
      </div>
    );
  }

  const marked = skins.filter((skin) => skin.mask).length;

  return (
    <div className="mine">
      <header className="mine-top">
        {me.face ? (
          <img src={me.face} alt="" width={56} height={56} />
        ) : (
          <span className="mine-none">
            <User size={24} />
          </span>
        )}
        <div className="mine-said">
          <h2>{me.handle}</h2>
          <div className="mine-facts">
            <Hint says="Сколько здесь твоих скинов">
              <span className="fact">
                <Images size={13} />
                {skins.length}
              </span>
            </Hint>
            <Hint says="На скольких из них размечены глаза: такие моргают и смотрят на тебя">
              <span className="fact">
                <Eye size={13} />
                {marked}
              </span>
            </Hint>
            {me.since && (
              <Hint says="Когда здесь появился твой аккаунт">
                <span className="fact">
                  <CalendarClock size={13} />
                  {ago(me.since)}
                </span>
              </Hint>
            )}
          </div>
        </div>
        <button type="button" className="chip go mine-put" onClick={onUpload}>
          <UploadMark size={15} />
          Загрузить
        </button>
      </header>

      {loading && <p className="note">Смотрю, что у тебя есть…</p>}

      {!loading && skins.length === 0 && (
        <div className="alone">
          <Images size={28} />
          <h2>Пока пусто</h2>
          <p>
            Залей скины — свои или собранные. Они будут видны только тебе, пока ты не решишь иначе.
          </p>
          <button type="button" className="chip go alone-go" onClick={onUpload}>
            <UploadMark size={15} />
            Загрузить
          </button>
        </div>
      )}

      {skins.length > 0 && (
        <div className="grid">
          {skins.map((skin) => (
            <SkinCard
              key={skin.id}
              skin={skin}
              view={view}
              moving={moving}
              onOpen={() => onOpen(skin.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
