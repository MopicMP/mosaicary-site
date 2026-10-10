import { AtSign, ExternalLink, Upload } from 'lucide-react';

import type { Author } from '../lib/catalogue.js';
import { Hint } from './Hint.js';

/**
 * Who a skin belongs to, by the rule this site actually uses.
 *
 * <h2>First to publish it is the author</h2>
 *
 * Not because that establishes anything. It cannot: a PNG carries no proof, and
 * every outside anchor — a name, an account, a link to an earlier posting — is ten
 * minutes' work for anybody who wants it. There is no version of this that finds
 * out who drew a picture.
 *
 * So it is a convention, and it is chosen over the alternative that was here
 * before. That one refused to say "автор" and put "со слов" beside every name
 * instead — honest, and unreadable: a hedge repeated on every card in a catalogue
 * stops being information and becomes wallpaper.
 *
 * What makes the convention worth having is the machinery underneath it. The same
 * drawing cannot be published twice, however it is edited — re-saved, one pixel
 * changed, recoloured, drawn at 512 and saved down — so being first is a thing
 * that happens once and is then closed. Somebody publishing another person's work
 * is refused, the first publisher is told, and a second attempt costs them the
 * right to publish for a while.
 *
 * <h2>And somebody else can still be credited</h2>
 *
 * A person publishing work they did not draw can name whoever did. That is a
 * different line — "автор такой-то" rather than the name of the account — and it
 * is the honest answer for most of what people have collected.
 */
export function Byline({
  uploader,
  author,
  small = false,
}: {
  uploader: string;
  author: Author;
  small?: boolean;
}) {
  // Still on somebody's own shelf: nothing has been said about anybody, and the
  // only fact is who put it there.
  if (author.state === 'none') {
    return (
      <Hint says={`${uploader} залил этот скин. На витрину он не выложен.`}>
        <span className={small ? 'by small' : 'by'}>
          <Upload size={small ? 10 : 11} />
          {uploader}
        </span>
      </Hint>
    );
  }

  const named = author.name ?? uploader;
  const credited = author.state === 'named';

  return (
    <Hint
      says={
        credited
          ? `${uploader} выложил это на витрину и указал автором: ${named}.`
          : `${named} — первым выложил этот рисунок на витрину. Второй раз его сюда никто не выложит.`
      }
    >
      <span className={small ? 'by small' : 'by'}>
        <AtSign size={small ? 10 : 11} />
        {named}
        {author.url && !small && (
          <a
            href={author.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            aria-label="откуда"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </span>
    </Hint>
  );
}
