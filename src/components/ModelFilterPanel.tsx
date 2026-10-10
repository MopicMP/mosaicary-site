import {
  Asterisk,
  Baseline,
  Box,
  Boxes,
  Clapperboard,
  Clock,
  Coffee,
  Download,
  Globe,
  Heart,
  Maximize2,
  MessageCircle,
  Puzzle,
  Ruler,
  Scale,
  Shapes,
  ShieldCheck,
  Smartphone,
  Type,
  VenetianMask,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { Use } from '../../shared/modelRules.js';
import type { ModelSummary } from '../../shared/modelWire.js';
import { MOST_TAGS, toggle } from '../lib/catalogue.js';
import {
  NO_MODEL_FILTERS,
  formatsOf,
  licensesOf,
  modelTagsOf,
  modelsNarrowed,
  sizesOf,
  type AdultWanted,
  type Detail,
  type ModelFilters,
  type ModelSort,
} from '../lib/models.js';
import { Dropdown } from './Dropdown.js';
import { AnyOrAll, Found, FiltersTop, Hunt, Icons, Section, Switch, Within } from './filters/Kit.js';

/**
 * The filter panel for models.
 *
 * The skins' panel, section for section where the two catalogues ask the same thing,
 * and built from the same pieces in `filters/Kit`: one column, everything visible,
 * the count underneath.
 *
 * What is filtered by is what a person choosing a Blockbench model cares about. First
 * where it is going (a Java resource pack, Bedrock, a mod, or nowhere in particular),
 * because a model in the wrong format is no use at any quality. Then the exact
 * Blockbench format for those who know it, the texture size, the licence, and what
 * is inside: animations, and whether it is cubes alone.
 *
 * The section for models for adults shows up only where the catalogue has any. With
 * them hidden the far side does not send them at all, so the choice would be between
 * three answers with the same result — and a filter naming what is not there is a
 * filter telling people what they are not being shown.
 */

const USES: { value: Use; label: string; icon: ReactNode }[] = [
  { value: 'java', label: 'Java: блоки, предметы, OptiFine', icon: <Coffee size={16} /> },
  { value: 'bedrock', label: 'Bedrock: сущности и блоки', icon: <Smartphone size={16} /> },
  { value: 'mods', label: 'Для модов: сущности, GeckoLib', icon: <Puzzle size={16} /> },
  { value: 'free', label: 'Свободные: не для какой-то одной игры', icon: <Shapes size={16} /> },
];

const DETAILS: { value: Detail; label: string; icon: ReactNode }[] = [
  { value: 'any', label: 'Любые', icon: <Globe size={16} /> },
  { value: 'plain', label: 'Как в игре: пиксель текстуры на единицу модели', icon: <Baseline size={16} /> },
  { value: 'hd', label: 'HD: больше пикселя текстуры на единицу модели', icon: <Maximize2 size={16} /> },
];

// Not the globe that stands for "any" one section above: two sections in a row whose
// first button carries the same drawing read as the same control twice.
const ADULTS: { value: AdultWanted; label: string; icon: ReactNode }[] = [
  { value: 'any', label: 'Любые', icon: <Asterisk size={16} /> },
  { value: 'without', label: 'Без 18+: только модели для всех', icon: <ShieldCheck size={16} /> },
  { value: 'only', label: 'Только 18+', icon: <VenetianMask size={16} /> },
];

const SORTS: { value: ModelSort; label: string; icon: ReactNode }[] = [
  { value: 'new', label: 'Сначала новые', icon: <Clock size={16} /> },
  { value: 'popular', label: 'Сначала любимые', icon: <Heart size={16} /> },
  { value: 'downloads', label: 'Сначала скачиваемые', icon: <Download size={16} /> },
  { value: 'talked', label: 'Сначала обсуждаемые', icon: <MessageCircle size={16} /> },
  { value: 'name', label: 'По названию', icon: <Type size={16} /> },
];

export function ModelFilterPanel({
  filters,
  onChange,
  models,
  found,
  onClose,
}: {
  filters: ModelFilters;
  onChange: (next: ModelFilters) => void;
  /** Everything the catalogue has, which is what the choices are offered from. */
  models: ModelSummary[];
  found: number;
  onClose?: () => void;
}) {
  const set = (over: Partial<ModelFilters>) => onChange({ ...filters, ...over });
  const tagChoices = modelTagsOf(models).map((one) => ({ value: one.tag, label: one.tag, hint: String(one.count) }));
  const formats = formatsOf(models);
  const sizes = sizesOf(models);
  const licenses = licensesOf(models);

  return (
    <aside className="filters">
      <FiltersTop
        narrowed={modelsNarrowed(filters)}
        onReset={() => onChange({ ...NO_MODEL_FILTERS, sort: filters.sort, scope: filters.scope })}
        onClose={onClose}
      />

      <Hunt
        search={filters.search}
        scope={filters.scope}
        onSearch={(search) => set({ search })}
        onScope={(scope) => set({ scope })}
      />

      <Section title="Для чего">
        <Icons
          options={USES}
          isOn={(value) => filters.uses.includes(value)}
          onPick={(value) => set({ uses: toggle(filters.uses, value) })}
        />
      </Section>

      <Section title="Подробность">
        <Icons
          options={DETAILS}
          isOn={(value) => filters.detail === value}
          onPick={(value) => set({ detail: value })}
        />
      </Section>

      {models.some((model) => model.adult) && (
        <Section title="18+">
          <Icons options={ADULTS} isOn={(value) => filters.adult === value} onPick={(value) => set({ adult: value })} />
        </Section>
      )}

      <Section title="Порядок">
        <Icons options={SORTS} isOn={(value) => filters.sort === value} onPick={(value) => set({ sort: value })} />
      </Section>

      <Section title="Когда добавлена">
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

      <Section title="Точный формат" folded>
        <Dropdown
          choices={formats.map((one) => ({
            value: one.format,
            label: one.label,
            hint: String(one.count),
            icon: <Box size={14} />,
          }))}
          chosen={filters.formats}
          onChange={(next) => set({ formats: next })}
          placeholder="Любой формат"
          most={Math.max(2, formats.length)}
        />
      </Section>

      <Section title="Размер текстуры" folded>
        <Dropdown
          choices={sizes.map((one) => ({
            value: one.size,
            label: one.size === 0 ? 'Без текстуры' : `${one.size} пикселей`,
            hint: String(one.count),
            icon: <Ruler size={14} />,
          }))}
          chosen={filters.sizes}
          onChange={(next) => set({ sizes: next })}
          placeholder="Любой размер"
          most={Math.max(2, sizes.length)}
        />
      </Section>

      <Section title="Лицензия" folded>
        <Dropdown
          choices={licenses.map((one) => ({
            value: one.license,
            label: one.label,
            hint: String(one.count),
            icon: <Scale size={14} />,
          }))}
          chosen={filters.licenses}
          onChange={(next) => set({ licenses: next })}
          placeholder="Любая лицензия"
          most={Math.max(2, licenses.length)}
        />
      </Section>

      <Section title="Что внутри">
        <Switch
          on={filters.animatedOnly}
          icon={<Clapperboard size={15} />}
          label="Есть анимации"
          says="В файле есть анимации Blockbench. Их можно проиграть прямо здесь, в окне модели."
          onToggle={() => set({ animatedOnly: !filters.animatedOnly })}
        />
        <Switch
          on={filters.cubesOnly}
          icon={<Boxes size={15} />}
          label="Только кубы"
          says="Без мешей, из одних кубов. Такую модель примет любой формат Minecraft, а не только свободная модель."
          onToggle={() => set({ cubesOnly: !filters.cubesOnly })}
        />
      </Section>

      <Found found={found} />
    </aside>
  );
}
