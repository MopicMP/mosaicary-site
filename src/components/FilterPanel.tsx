import { Baseline, Clock, Eye, Globe, Heart, Layers, Mars, Maximize2, NonBinary, Ruler, Type, Venus } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  MOST_TAGS,
  NO_FILTERS,
  narrowed,
  toggle,
  type Filters,
  type Gender,
  type Quality,
  type Sort,
} from '../lib/catalogue.js';
import { Dropdown } from './Dropdown.js';
import { AnyOrAll, Found, FiltersTop, Hunt, Icons, Section, Switch, Within } from './filters/Kit.js';

/**
 * The filter panel.
 *
 * Built to the shape of the reference we took, and that shape is right for a
 * reason worth naming: every control is **visible at once**, in one column, with
 * the result count under it. Filters folded into menus look tidier and make you
 * open three of them to find out why a search returned nothing.
 *
 * The pieces it is built from are in `filters/Kit`, shared with the other
 * catalogues, and so are the two rules every panel keeps.
 *
 * What is ours rather than borrowed is what is filtered *by*. Nobody else has a
 * catalogue that knows whether a face has been marked out by hand, and a marked
 * face is one that blinks and looks at you rather than stares.
 */

const GENDERS: { value: Gender; label: string; icon: ReactNode }[] = [
  { value: 'girl', label: 'Девушка', icon: <Venus size={16} /> },
  { value: 'boy', label: 'Парень', icon: <Mars size={16} /> },
  { value: 'neutral', label: 'Нейтральный', icon: <NonBinary size={16} /> },
];

const SORTS: { value: Sort; label: string; icon: ReactNode }[] = [
  { value: 'new', label: 'Сначала новые', icon: <Clock size={16} /> },
  { value: 'popular', label: 'Сначала любимые', icon: <Heart size={16} /> },
  { value: 'name', label: 'По названию', icon: <Type size={16} /> },
  { value: 'marked', label: 'Сначала с размеченными глазами', icon: <Eye size={16} /> },
];

const QUALITIES: { value: Quality; label: string; icon: ReactNode }[] = [
  { value: 'any', label: 'Любые', icon: <Globe size={16} /> },
  { value: 'plain', label: 'Обычные, 64 пикселя', icon: <Baseline size={16} /> },
  { value: 'hd', label: 'HD: 128 пикселей и больше', icon: <Maximize2 size={16} /> },
];

const WIDTHS = [64, 128, 256, 512, 1024, 2048];

export function FilterPanel({
  filters,
  onChange,
  tags,
  found,
  onClose,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  tags: { tag: string; count: number }[];
  found: number;
  onClose?: () => void;
}) {
  const set = (over: Partial<Filters>) => onChange({ ...filters, ...over });
  const tagChoices = tags.map((one) => ({
    value: one.tag,
    label: one.tag,
    hint: String(one.count),
  }));

  return (
    <aside className="filters">
      <FiltersTop
        narrowed={narrowed(filters)}
        onReset={() => onChange({ ...NO_FILTERS, sort: filters.sort, scope: filters.scope })}
        onClose={onClose}
      />

      <Hunt
        search={filters.search}
        scope={filters.scope}
        onSearch={(search) => set({ search })}
        onScope={(scope) => set({ scope })}
      />

      <Section title="Кто">
        <Icons
          options={GENDERS}
          isOn={(value) => filters.genders.includes(value)}
          onPick={(value) => set({ genders: toggle(filters.genders, value) })}
        />
      </Section>

      <Section title="Подробность">
        <Icons
          options={QUALITIES}
          isOn={(value) => filters.quality === value}
          onPick={(value) => set({ quality: value })}
        />
      </Section>

      <Section title="Порядок">
        <Icons
          options={SORTS}
          isOn={(value) => filters.sort === value}
          onPick={(value) => set({ sort: value })}
        />
      </Section>

      <Section title="Когда добавлен">
        <Within days={filters.within} onChange={(within) => set({ within })} />
      </Section>

      <Section title="Теги" aside={<AnyOrAll all={filters.tagsAll} onChange={(tagsAll) => set({ tagsAll })} />}>
        <Dropdown
          choices={tagChoices.filter((one) => !filters.without.includes(one.value))}
          chosen={filters.tags}
          onChange={(next) => set({ tags: next })}
          placeholder="Выбрать тег"
          most={MOST_TAGS}
          searchable
        />
      </Section>

      <Section title="Кроме" folded>
        <Dropdown
          choices={tagChoices.filter((one) => !filters.tags.includes(one.value))}
          chosen={filters.without}
          onChange={(next) => set({ without: next })}
          placeholder="Исключить тег"
          most={MOST_TAGS}
          searchable
          tone="out"
        />
      </Section>

      <Section title="Точный размер" folded>
        <Dropdown
          choices={WIDTHS.map((width) => ({
            value: width,
            label: `${width} пикселей`,
            icon: <Ruler size={14} />,
          }))}
          chosen={filters.widths}
          onChange={(next) => set({ widths: next })}
          placeholder="Любой размер"
          most={WIDTHS.length}
        />
      </Section>

      <Section title="Что уже сделано">
        <Switch
          on={filters.markedOnly}
          icon={<Eye size={15} />}
          label="Глаза размечены"
          says="Кто-то уже отметил на этом лице зрачок, белок, бровь и ресницу. Такой персонаж моргает и смотрит на тебя; неразмеченный просто таращится."
          onToggle={() => set({ markedOnly: !filters.markedOnly })}
        />
        <Switch
          on={filters.overlayOnly}
          icon={<Layers size={15} />}
          label="Есть верхний слой"
          says="Поверх лица нарисован второй слой: чёлка, уши, очки. У HD-скинов там часто более подробная версия той же детали."
          onToggle={() => set({ overlayOnly: !filters.overlayOnly })}
        />
      </Section>

      <Found found={found} />
    </aside>
  );
}
