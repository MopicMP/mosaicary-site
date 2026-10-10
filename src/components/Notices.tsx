import {
  Bell,
  Copy,
  Eye,
  EyeOff,
  MessageCircle,
  MessageCircleOff,
  Reply,
  RotateCcw,
  Scale,
  VenetianMask,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Notice } from '../../shared/modelWire.js';
import { placeOf } from '../../shared/paperText.js';
import { noticesFor, noticesSeen } from '../lib/modelApi.js';
import { pathOfPaper } from '../lib/papers.js';
import { ago } from '../lib/when.js';
import { Floating } from './Floating.js';
import { Hint } from './Hint.js';

/**
 * What the site has to tell you, in the header, under a bell.
 *
 * It used to be a band across the top of your own shelf of models, which put the two
 * things that matter most in the worst possible place: a word about somebody
 * publishing your model as theirs waited until you happened to go and look at your
 * own models, and until you did, the shelf opened on three grey rows of notices
 * instead of on your work. Here it is reachable from every page and it is not in the
 * way of anything.
 *
 * <h2>When a notice counts as read</h2>
 *
 * The number on the bell goes out when the list is opened, not when the page draws.
 * Before, a notice was marked read by the page it sat on being visited at all — so a
 * message could be counted as read by somebody who came to look at their models and
 * never looked up. Each one stays marked out in the list until the next visit, which
 * is what tells you which ones you had not seen when you opened it.
 *
 * <h2>The clause beside the decision</h2>
 *
 * A notice that a model or a comment was taken off names the clause it broke, and
 * carries a button to it: the page of rules opens on that clause, marked. The words of
 * the notice give the number in force when it was written; the button goes by the
 * clause's key, so it still lands right after the rules are renumbered.
 */

// A mask for the mark and a plain eye for its removal: the crossed-out eye is the
// catalogue being closed to a model, which is the other notice entirely.
const ICONS: Record<string, typeof Bell> = {
  copy: Copy,
  takedown: EyeOff,
  restore: RotateCcw,
  adult: VenetianMask,
  unadult: Eye,
  comment: MessageCircle,
  reply: Reply,
  commentgone: MessageCircleOff,
  // The same scales as the rules page carries, because that is what the notice is about.
  policy: Scale,
};

/** How many are kept in the list. Older than the twentieth is history, not news. */
const MOST = 20;

export function NoticeBell({
  fresh,
  onOpen,
  onRule,
}: {
  fresh: number;
  onOpen: (id: string) => void;
  /** Goes to a clause, given as the page's address with the clause's number after #. */
  onRule: (href: string) => void;
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    noticesFor().then((got) => {
      if (!alive) return;
      setNotices(got);
      setUnseen(got.filter((one) => !one.seen).length);
    });
    return () => {
      alive = false;
    };
  }, [fresh]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const at = event.target as Node;
      if (anchor?.contains(at) || list.current?.contains(at)) return;
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

  const show = () => {
    const next = !open;
    setOpen(next);
    // Told once, when they are actually in front of somebody. The list itself keeps
    // its marks until the page is loaded again.
    if (next && unseen > 0) {
      setUnseen(0);
      void noticesSeen();
    }
  };

  const says = unseen > 0 ? `Уведомления: новых ${unseen}` : 'Уведомления';

  return (
    <>
      <Hint says={says}>
        <button
          type="button"
          className={open ? 'chip bell on' : 'chip bell'}
          aria-label={says}
          ref={setAnchor}
          onClick={show}
        >
          <Bell size={16} />
          {unseen > 0 && <span className="bell-count">{unseen > 9 ? '9+' : unseen}</span>}
        </button>
      </Hint>

      <Floating anchor={anchor} open={open} align="start" gap={6} prefer="under">
        <div className="bell-menu" ref={list}>
          <span className="who-head">Уведомления</span>
          {notices.length === 0 && <p className="who-note">Пока ничего не случилось.</p>}
          {notices.length > 0 && (
            <ul className="notices">
              {notices.slice(0, MOST).map((notice) => {
                const Icon = ICONS[notice.kind] ?? Bell;
                const rule = notice.rule ? placeOf(notice.rule) : null;
                return (
                  <li key={notice.id} className={notice.seen ? 'notice' : 'notice fresh'}>
                    <Icon size={14} />
                    <span className="notice-said">{notice.said}</span>
                    <span className="notice-when">{ago(notice.made)}</span>
                    <span className="notice-acts">
                      {rule && (
                        <button
                          type="button"
                          className="chip notice-go"
                          onClick={() => {
                            setOpen(false);
                            onRule(`${pathOfPaper(rule.paper)}#${rule.number}`);
                          }}
                        >
                          Пункт {rule.number}
                        </button>
                      )}
                      {notice.about && (
                        <button
                          type="button"
                          className="chip notice-go"
                          onClick={() => {
                            setOpen(false);
                            onOpen(notice.about as string);
                          }}
                        >
                          Открыть
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Floating>
    </>
  );
}
