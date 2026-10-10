import { words } from './words.js';

/**
 * What the site is called and which of its parts are open.
 *
 * <h2>The name is one constant</h2>
 *
 * Because it is going to change: the old one belongs to the skin tool, and the new
 * one is chosen together with the domain. Everything that prints it — the header, the
 * page title, the empty pages — reads it from here, so the day it is chosen is one
 * line.
 *
 * <h2>Sections are switched off, not taken out</h2>
 *
 * The site grows in three steps: models first, skins in the second version,
 * animations in the third. The code for skins and animations already exists and
 * stays where it is; a section that is not open yet keeps its place in the
 * navigation and answers its addresses with a page saying when it is coming. Taking
 * it out and putting it back later is two chances to lose something.
 */

export const NAME = 'Mosaicary';

export type Section = 'models' | 'skins' | 'animations';

export const SECTIONS: Record<Section, boolean> = {
  models: true,
  skins: false,
  animations: false,
};

/**
 * When a closed section opens, in the words the page uses for it.
 *
 * A function rather than a constant because the words are in the dictionary now, and
 * the dictionary is not there yet when this module loads. The name is unchanged: what
 * it answers is the same thing.
 */
export function coming(section: Section): string {
  if (section === 'skins') return words().site.coming_skins;
  if (section === 'animations') return words().site.coming_animations;
  return '';
}
