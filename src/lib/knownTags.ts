import { createContext, useContext } from 'react';

/**
 * The tags already in use, with how many models carry each, for the tag field to offer.
 *
 * Offered from what is there, the catalogue and one's own models together, because a
 * tag is only useful if the next person reaches for the same word: "мебель" on forty
 * models finds forty, and "мебель", "мебеля" and "furniture" on fourteen each find
 * fourteen. The field suggests the word that is already winning before it lets a new
 * one be made.
 */
export const KnownTagsContext = createContext<{ tag: string; count: number }[]>([]);

export function useKnownTags(): { tag: string; count: number }[] {
  return useContext(KnownTagsContext);
}
