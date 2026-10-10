import { useSyncExternalStore } from 'react';

/**
 * Whether this person ticked "Мне есть 18 лет" during this visit, before the far side
 * was told.
 *
 * <h2>Why it is kept here and not in the window that asks</h2>
 *
 * The far side only hears it together with something it is for: a level of showing
 * models for adults chosen in the account menu, or a model published as 18+. A tick
 * held by the menu or the window itself went with them when they closed, so ticking
 * it, closing the menu to look at something, and coming back found it empty again —
 * which reads as the site refusing the answer. Held here, it is the same tick in both
 * places until it is used.
 *
 * <h2>Why only for the visit</h2>
 *
 * Not in the browser's storage, because a computer is often shared and an age is a
 * person's, not a machine's. A reload asks again; saying it once to the far side, by
 * choosing a level or publishing, is what makes it last.
 *
 * It is forgotten when it is used, when the person signs out, and when they go back
 * to hiding models for adults — the rules promise the age is asked again after that,
 * and a tick still standing from before would answer for them.
 */

let said = false;
const listeners = new Set<() => void>();

function tell(on: boolean) {
  said = on;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSaidAge(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => said), tell];
}

export function forgetSaidAge() {
  tell(false);
}
