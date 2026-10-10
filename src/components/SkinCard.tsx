import { Download, Eye, Heart, Layers, Ruler } from 'lucide-react';

import { useArms } from '../lib/arms.js';
import type { Skin } from '../lib/catalogue.js';
import { Byline } from './Byline.js';
import { Hint } from './Hint.js';
import { SkinFigure, type View } from './SkinFigure.js';

/**
 * One skin in the grid.
 *
 * The shape a skin site has settled on and which there is no reason to argue with:
 * a name across the top, the figure filling the card, and the facts along the
 * bottom. It is that shape because the figure is what people choose by, and
 * everything else has to get out of its way.
 *
 * The author is under the name because a catalogue without one is a catalogue
 * where nobody can find the rest of what somebody drew — which is most of why
 * anybody comes back to a skin site at all.
 *
 * The two marks in the corner are ours rather than borrowed. Whether a face has
 * been marked out by hand is the one thing about a skin that matters here and
 * nowhere else, and it has to be visible without opening anything.
 */
export function SkinCard({
  skin,
  rank,
  view,
  moving,
  onOpen,
}: {
  skin: Skin;
  rank?: number;
  view: View;
  moving: boolean;
  onOpen: () => void;
}) {
  const arms = useArms(skin.url) ?? 'wide';

  return (
    // The whole card opens it, because the whole card is what a hand aims at — a
    // small link on the name is a target people miss and then press again harder.
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
        <span className="card-name" title={skin.name}>
          {skin.name}
        </span>
        <Byline uploader={skin.uploader} author={skin.author} small />
      </header>

      <div className="card-figure">
        {rank !== undefined && <span className="card-rank">#{rank}</span>}
        <div className="card-marks">
          {skin.mask && (
            <Hint says="Глаза размечены: этот персонаж моргает и смотрит на тебя.">
              <span className="mark done">
                <Eye size={13} />
              </span>
            </Hint>
          )}
          {skin.hasOverlay && (
            <Hint says="Поверх лица есть второй слой: чёлка, уши, очки.">
              <span className="mark">
                <Layers size={13} />
              </span>
            </Hint>
          )}
        </div>
        <SkinFigure
          url={skin.url}
          layout={skin.layout}
          view={view}
          moving={moving}
          height={172}
          className="figure"
        />

        {/*
         * Taking a skin is the commonest thing anybody does here, and making it
         * cost an open and a close is making the common case the slow one. The
         * press is kept off the card underneath it — otherwise it downloads and
         * opens the window at the same time, which reads as a fault.
         */}
        <a
          className="card-get"
          href={skin.url}
          download={`${skin.name}.png`}
          aria-label="скачать"
          title="скачать"
          onClick={(event) => event.stopPropagation()}
        >
          <Download size={14} />
        </a>
      </div>

      <footer className="card-foot">
        <Hint
          says={
            skin.layout === 32
              ? `${skin.width} пикселей, раскладка до версии 1.8`
              : `${skin.width} пикселей в ширину`
          }
        >
          <span className="size">
            <Ruler size={12} />
            {skin.width}
            {skin.layout === 32 && <span className="old">32</span>}
          </span>
        </Hint>
        {/*
         * Which of the two models it was drawn for. It matters before opening
         * anything: a three-pixel skin worn on the four-pixel model has a
         * transparent stripe down the back of both arms, and everybody who has
         * seen that read it as a broken file.
         */}
        <Hint
          says={
            arms === 'slim'
              ? 'Модель Alex — руки в три пикселя'
              : 'Модель Steve — руки в четыре пикселя'
          }
        >
          <span className={arms === 'slim' ? 'model slim' : 'model'}>
            {arms === 'slim' ? 'Alex' : 'Steve'}
          </span>
        </Hint>
        <span className="stars">
          {skin.stars.toLocaleString('ru')}
          <Heart size={12} />
        </span>
      </footer>
    </article>
  );
}
