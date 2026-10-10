import { Scale } from 'lucide-react';

import { BREAKABLE } from '../../shared/paperText.js';
import { Dropdown } from './Dropdown.js';

/**
 * Which clause of the rules a model or a comment broke, chosen from the clauses there are.
 *
 * A list and not a field, because what reaches the author is the clause's number and
 * its words as the rules have them — "пункт 4.1, чужая работа без разрешения" — and
 * a reason typed fresh each time is a reason nobody can look up. The words typed
 * beside it are the explanation; this is the ground.
 *
 * Searchable, since by the second month somebody will know "травля" and not "6.6".
 */
export function RulePick({
  rule,
  onPick,
  needed,
}: {
  rule: string | null;
  onPick: (rule: string | null) => void;
  /** Whether the decision cannot go without one, which the empty choice says. */
  needed: boolean;
}) {
  return (
    <Dropdown
      choices={BREAKABLE.map((one) => ({
        value: one.key,
        label: `${one.number}  ${one.short}`,
        icon: <Scale size={14} />,
      }))}
      chosen={rule ? [rule] : []}
      onChange={([pick]) => onPick(pick ?? null)}
      placeholder={needed ? 'Выбрать пункт правил' : 'Пункт правил, если нарушен'}
      most={1}
      searchable
    />
  );
}
