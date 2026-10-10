import { createContext, useContext, type CSSProperties } from 'react';

/**
 * What is drawn behind a model: by its author, by the person looking, or neither.
 *
 * <h2>Why a colour and not a picture</h2>
 *
 * A model's picture is drawn with a transparent background, and the chequer behind it
 * says so. Models shown on a plain light colour have become the way to stand out in a
 * grid of chequers, so an author can choose one; and somebody looking through the
 * catalogue can choose their own, behind the cards that have none or behind every
 * card. That is only possible if the colour is laid under the picture by the page and
 * not painted into it.
 *
 * <h2>Who wins</h2>
 *
 * The person looking, when they say so. "Только пустые" keeps every author's colour
 * and fills the rest; "Заменить все" puts theirs behind everything, for somebody who
 * wants a grid that reads as one surface. With nothing chosen, authors' colours show
 * and the rest keep the chequer.
 */

/**
 * The colours offered, light to dark.
 *
 * Seven of the eight here used to be a shade of white, which made the row read as one
 * colour offered seven times and left a light model with nowhere to stand. So each
 * light one now has a dark one of its own hue — sand against amber, sky against sea,
 * pink against terracotta, lavender against plum — with white and light grey at one
 * end and graphite and night at the other. Running light to dark says what the choice
 * is for without a word of explanation: whatever the model is, take the far side.
 */
export const SWATCHES: { colour: string; name: string }[] = [
  { colour: '#ffffff', name: 'Белый' },
  { colour: '#eceff3', name: 'Светло-серый' },
  { colour: '#f3e9d2', name: 'Песочный' },
  { colour: '#e2ebf5', name: 'Небесный' },
  { colour: '#e9e4f4', name: 'Лавандовый' },
  { colour: '#f6e5ea', name: 'Розовый' },
  { colour: '#b67f22', name: 'Янтарный' },
  { colour: '#8f4a37', name: 'Терракотовый' },
  { colour: '#2d5b80', name: 'Морской' },
  { colour: '#4a3558', name: 'Сливовый' },
  { colour: '#2b3038', name: 'Графитовый' },
  { colour: '#12151b', name: 'Ночной' },
];

export type BackdropMode = 'empty' | 'all';

/** What the person looking chose: a colour or none, and whether it covers authors' colours. */
export interface Backdrop {
  colour: string | null;
  mode: BackdropMode;
}

export const NO_BACKDROP: Backdrop = { colour: null, mode: 'empty' };

export function isBackdrop(value: unknown): value is Backdrop {
  if (!value || typeof value !== 'object') return false;
  const { colour, mode } = value as Record<string, unknown>;
  return (colour === null || (typeof colour === 'string' && /^#[0-9a-f]{6}$/.test(colour))) && (mode === 'empty' || mode === 'all');
}

/** The colour actually drawn behind a model, or null for the chequer. */
export function backdropOf(author: string | null, looking: Backdrop): string | null {
  if (looking.colour && (looking.mode === 'all' || !author)) return looking.colour;
  return author;
}

/**
 * Whether marks drawn over the colour should be dark.
 *
 * The rank and the little marks on a card are light, made for the dark chequer; on
 * white they vanish. Relative luminance, the same measure contrast checkers use.
 */
export function isLight(colour: string): boolean {
  const channel = (at: number) => {
    const value = parseInt(colour.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) > 0.4;
}

/**
 * What a figure's box needs to show a colour instead of the chequer: the classes to
 * add and the colour itself, handed to the stylesheet as a variable.
 */
export function backed(colour: string | null): { className: string; style?: CSSProperties } {
  if (!colour) return { className: '' };
  return {
    className: isLight(colour) ? ' backed light' : ' backed',
    style: { '--backdrop': colour } as CSSProperties,
  };
}

/** The choice of the person looking, for every card and window under it. */
export const BackdropContext = createContext<Backdrop>(NO_BACKDROP);

export function useBackdrop(): Backdrop {
  return useContext(BackdropContext);
}
