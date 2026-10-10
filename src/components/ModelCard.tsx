import {
  AtSign,
  Box,
  Clapperboard,
  Download,
  ExternalLink,
  EyeOff,
  Heart,
  Lock,
  Maximize2,
  MessageCircle,
  Ruler,
  Upload,
} from 'lucide-react';

import { covered, type AdultView } from '../../shared/adult.js';
import type { Use } from '../../shared/modelRules.js';
import type { ModelSummary } from '../../shared/modelWire.js';
import { backdropOf, backed, useBackdrop } from '../lib/backdrop.js';
import { fileOf } from '../lib/modelApi.js';
import { formatName } from '../lib/names.js';
import { plural } from '../lib/when.js';
import { Hint } from './Hint.js';

/**
 * One model in the grid.
 *
 * The skin card's shape, kept on purpose: name and author across the top, the
 * picture filling the card, facts along the bottom. Somebody who has used one
 * catalogue here has used the other.
 *
 * The picture is a still drawn by the uploader's own page at the angle every card
 * uses, so the grid reads as a shelf of like things. Turning a model round is what
 * the window is for; thirty live models in a grid would be thirty WebGL contexts,
 * and browsers stop at sixteen.
 */

/** The four groups, short enough for the foot of a card. */
export const USE_SHORT: Record<Use, string> = {
  java: 'Java',
  bedrock: 'Bedrock',
  mods: 'Моды',
  free: 'Свободная',
};

export function ModelCard({
  model,
  view,
  rank,
  liked = false,
  onOpen,
}: {
  model: ModelSummary;
  /** How models for adults are shown to whoever is looking. */
  view: AdultView;
  rank?: number;
  /** Whether the person looking has their heart on it: the heart is filled in. */
  liked?: boolean;
  onOpen: () => void;
}) {
  // Blurred rather than hidden: at this level the card is meant to be there, just not
  // readable over somebody's shoulder. Hiding is done by the far side, not here.
  const veiled = covered(model, view);
  const behind = backed(backdropOf(model.background, useBackdrop()));
  return (
    <article
      className="card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <header className="card-top">
        <span className="card-name" title={model.name}>
          {model.name}
        </span>
        <ModelByline model={model} small />
      </header>

      <div className={`card-figure model-figure${behind.className}`} style={behind.style}>
        {rank !== undefined && <span className="card-rank">#{rank}</span>}
        <div className="card-marks">
          {model.hidden && (
            <Hint says="Снята с каталога тем, кто ведёт сайт">
              <span className="mark bad">
                <EyeOff size={13} />
              </span>
            </Hint>
          )}
          {!model.hidden && model.visibility === 'private' && (
            <Hint says="Видна только тебе, пока ты её не опубликуешь">
              <span className="mark">
                <Lock size={13} />
              </span>
            </Hint>
          )}
          {model.adult && (
            <Hint says="Для взрослых: как это показывать, выбирается в меню аккаунта">
              <span className="mark adult">18+</span>
            </Hint>
          )}
          {model.animations > 0 && (
            <Hint says={`Анимаций внутри: ${model.animations}`}>
              <span className="mark done">
                <Clapperboard size={13} />
              </span>
            </Hint>
          )}
          {model.density > 1 && (
            <Hint says={`HD: ${pixels(model.density)} текстуры на единицу модели, в игре один`}>
              <span className="mark">
                <Maximize2 size={13} />
              </span>
            </Hint>
          )}
        </div>

        {model.preview ? (
          <img
            className={veiled ? 'model-picture veiled' : 'model-picture'}
            src={model.preview}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="model-none">
            <Box size={34} />
          </span>
        )}

        {/* Taken without opening, like a skin: the commonest thing anybody does here. */}
        <a
          className="card-get"
          href={fileOf(model.id)}
          aria-label="Скачать"
          title="Скачать"
          onClick={(event) => event.stopPropagation()}
        >
          <Download size={14} />
        </a>
      </div>

      <footer className="card-foot">
        <Hint
          says={
            model.textureWidth
              ? `Текстура ${model.textureWidth} на ${model.textureHeight} пикселей`
              : 'Без встроенной текстуры'
          }
        >
          <span className="size">
            <Ruler size={12} />
            {model.textureWidth || '—'}
          </span>
        </Hint>
        <Hint says={formatName(model.format)}>
          <span className={model.use === 'free' ? 'model' : 'model slim'}>{USE_SHORT[model.use]}</span>
        </Hint>
        {model.comments > 0 && (
          <Hint says={`Комментариев: ${model.comments}`}>
            <span className="talks">
              {model.comments.toLocaleString('ru')}
              <MessageCircle size={12} />
            </span>
          </Hint>
        )}
        <Hint says={liked ? 'Тебе нравится' : `Нравится: ${model.likes}`}>
          <span className={liked ? 'likes on' : 'likes'}>
            {model.likes.toLocaleString('ru')}
            <Heart size={12} />
          </span>
        </Hint>
      </footer>
    </article>
  );
}

/** "2 пикселя", "1.5 пикселя", "8 пикселей". A fraction takes the form for two. */
export function pixels(n: number): string {
  const said = n.toLocaleString('ru');
  return `${said} ${Number.isInteger(n) ? plural(n, 'пиксель', 'пикселя', 'пикселей') : 'пикселя'}`;
}

/**
 * Who a model belongs to, by the rule the site uses.
 *
 * The same rule as for skins: whoever first publishes a model is its author here,
 * because a file proves nothing about who made it and the site will not publish the
 * same model twice. Somebody putting up another person's work names that person,
 * and then the line names them instead.
 */
export function ModelByline({ model, small = false }: { model: ModelSummary; small?: boolean }) {
  const handle = model.by.handle;
  if (!model.published) {
    return (
      <Hint says={`Загружено: ${handle}. В каталоге пока не опубликовано.`}>
        <span className={small ? 'by small' : 'by'}>
          <Upload size={small ? 10 : 11} />
          {handle}
        </span>
      </Hint>
    );
  }
  const named = model.author?.name ?? handle;
  return (
    <Hint
      says={
        model.author
          ? `Автор: ${named}. Опубликовано на сайте: ${handle}.`
          : `Автор: ${handle}, первая публикация этой модели. Второй раз её сюда никто не выложит.`
      }
    >
      <span className={small ? 'by small' : 'by'}>
        <AtSign size={small ? 10 : 11} />
        {named}
        {model.author?.url && !small && (
          <a
            href={model.author.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
            aria-label="Где автор"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </span>
    </Hint>
  );
}
