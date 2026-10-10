import { Clapperboard, Pause, Play, Repeat, Square } from 'lucide-react';

import type { Clip } from '../lib/bbanim.js';
import { Hint } from './Hint.js';

export type StageTab = 'look' | 'clips';

/**
 * The two ways of looking at a figure: the model itself, and what it can do.
 *
 * Tabs and not a dropdown, because a dropdown of animations hides the one fact worth
 * seeing at a glance — how many there are and what they are called. Shown with nothing
 * in it, the second tab says so instead of opening onto an empty list.
 *
 * While the file is still being read, the number is the one the model was uploaded
 * with. A zero there beside "1 анимация" in the facts beneath it read as the site
 * disagreeing with itself, when all it meant was that the file had not arrived yet.
 */
export function StageTabs({
  tab,
  onTab,
  count,
  reading = false,
}: {
  tab: StageTab;
  onTab: (tab: StageTab) => void;
  count: number;
  /** Whether the file is still on its way, so the count is a claim and not a reading. */
  reading?: boolean;
}) {
  return (
    <div className="stage-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'look'}
        className={tab === 'look' ? 'stage-tab on' : 'stage-tab'}
        onClick={() => onTab('look')}
      >
        Превью
      </button>
      <Hint
        says={
          reading
            ? 'Анимации появятся, когда откроется файл модели'
            : count > 0
              ? 'Все анимации модели'
              : 'В модели нет анимаций'
        }
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clips'}
          className={tab === 'clips' ? 'stage-tab on' : 'stage-tab'}
          disabled={reading || count === 0}
          onClick={() => onTab('clips')}
        >
          Анимации
          <span className="stage-tab-count">{count}</span>
        </button>
      </Hint>
    </div>
  );
}

/**
 * Every animation in the model, each one a press away from playing.
 *
 * The first row is the figure at rest, because "none" is a thing somebody looking at
 * a rig wants to go back to. Pressing the row that is playing pauses it; pressing it
 * again goes on from where it stopped.
 */
export function ClipList({
  clips,
  at,
  playing,
  onPick,
  onPlay,
}: {
  clips: Clip[];
  /** Which one is chosen, -1 for the figure at rest. */
  at: number;
  playing: boolean;
  onPick: (at: number) => void;
  onPlay: (playing: boolean) => void;
}) {
  return (
    <div className="clip-list" role="list">
      <button
        type="button"
        role="listitem"
        className={at === -1 ? 'clip-row on' : 'clip-row'}
        onClick={() => {
          onPick(-1);
          onPlay(false);
        }}
      >
        <Square size={13} />
        <span className="clip-name">Без анимации</span>
      </button>
      {clips.map((clip, index) => {
        const on = index === at;
        return (
          <button
            type="button"
            role="listitem"
            key={`${index}-${clip.name}`}
            className={on ? 'clip-row on' : 'clip-row'}
            onClick={() => {
              if (on) onPlay(!playing);
              else {
                onPick(index);
                onPlay(true);
              }
            }}
          >
            {on && playing ? <Pause size={13} /> : on ? <Play size={13} /> : <Clapperboard size={13} />}
            <span className="clip-name">{clip.name}</span>
            {clip.loop === 'loop' && (
              <Hint says="Повторяется">
                <span className="clip-loop">
                  <Repeat size={12} />
                </span>
              </Hint>
            )}
            <span className="clip-length">
              {clip.length.toLocaleString('ru', { maximumFractionDigits: 2 })} с
            </span>
          </button>
        );
      })}
    </div>
  );
}
