import { Pipette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { SWATCHES, type Backdrop } from '../lib/backdrop.js';
import { Floating } from './Floating.js';
import { Hint } from './Hint.js';

/**
 * A row of colours to put behind a model: none, the ready ones, or one's own.
 *
 * Swatches and not a list of names, because a colour is chosen by looking at it.
 * Each one says its name on the hover. "Свой" opens the system's own colour picker,
 * which already does everything a picker should and is the one people know.
 */
export function ColourRow({ colour, onPick }: { colour: string | null; onPick: (colour: string | null) => void }) {
  const own = colour !== null && !SWATCHES.some((one) => one.colour === colour);
  return (
    <div className="swatches">
      <Hint says="Без фона">
        <button
          type="button"
          className={colour === null ? 'swatch none on' : 'swatch none'}
          aria-label="Без фона"
          onClick={() => onPick(null)}
        />
      </Hint>
      {SWATCHES.map((one) => (
        <Hint key={one.colour} says={one.name}>
          <button
            type="button"
            className={colour === one.colour ? 'swatch on' : 'swatch'}
            aria-label={one.name}
            style={{ background: one.colour }}
            onClick={() => onPick(one.colour)}
          />
        </Hint>
      ))}
      <Hint says={own ? `Свой цвет, ${colour}` : 'Свой цвет'}>
        <label className={own ? 'swatch own on' : 'swatch own'} style={own ? { background: colour } : undefined}>
          <Pipette size={13} />
          <input
            type="color"
            aria-label="Свой цвет"
            value={colour ?? '#eceff3'}
            onChange={(event) => onPick(event.target.value.toLowerCase())}
          />
        </label>
      </Hint>
    </div>
  );
}

/**
 * The colour behind every model card and window, chosen by the person looking.
 *
 * Beside "в ряд" because both are about how the catalogue looks to them and neither
 * narrows it. Kept in this browser like the number to a row: it is a way of looking,
 * not something the far side needs to know.
 */
export function BackdropPick({ backdrop, onChange }: { backdrop: Backdrop; onChange: (next: Backdrop) => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const at = event.target as Node;
      if (anchor?.contains(at) || panel.current?.contains(at)) return;
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

  const says = backdrop.colour ? 'Фон моделей: свой' : 'Фон моделей';

  return (
    <>
      <Hint says={says}>
        <button
          type="button"
          className={open ? 'chip backdrop-face on' : 'chip backdrop-face'}
          aria-label={says}
          ref={setAnchor}
          onClick={() => setOpen(!open)}
        >
          <span
            className={backdrop.colour ? 'backdrop-dot' : 'backdrop-dot none'}
            style={backdrop.colour ? { background: backdrop.colour } : undefined}
          />
        </button>
      </Hint>

      <Floating anchor={anchor} open={open} align="start" gap={6} prefer="under">
        <div className="backdrop-menu" ref={panel}>
          <span className="who-head">Фон моделей</span>
          <ColourRow colour={backdrop.colour} onPick={(colour) => onChange({ ...backdrop, colour })} />
          <div className="either backdrop-mode">
            <Hint says="Свой фон только там, где автор его не выбрал">
              <button
                type="button"
                className={backdrop.mode === 'empty' ? 'tiny on' : 'tiny'}
                disabled={!backdrop.colour}
                onClick={() => onChange({ ...backdrop, mode: 'empty' })}
              >
                Только пустые
              </button>
            </Hint>
            <Hint says="Свой фон за всеми моделями, и за теми, где автор выбрал свой">
              <button
                type="button"
                className={backdrop.mode === 'all' ? 'tiny on' : 'tiny'}
                disabled={!backdrop.colour}
                onClick={() => onChange({ ...backdrop, mode: 'all' })}
              >
                Заменить все
              </button>
            </Hint>
          </div>
        </div>
      </Floating>
    </>
  );
}
