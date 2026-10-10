import { describe, expect, it } from 'vitest';

import { DAILY_UPLOADS, MODEL_MAX_BYTES, PENALTY_DAYS, QUOTA_BYTES } from '../shared/modelRules.js';
import {
  BREAKABLE,
  PAPERS,
  RULES,
  citing,
  isBreakable,
  placeOf,
  plural,
  type PaperName,
} from '../shared/paperText.js';

const ALL = (Object.keys(PAPERS) as PaperName[]).flatMap((paper) =>
  PAPERS[paper].flatMap((part) => part.clauses.map((clause) => ({ paper, clause }))),
);

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const SLOT = /\{([^}]+)\}/g;
const FILLED_BY_PAGE = new Set(['name', 'closedIn', 'email']);

describe('the papers', () => {
  it('give every key to one clause only', () => {
    const keys = ALL.flatMap(({ clause }) => (clause.key ? [clause.key] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('link only to papers and clauses that exist, on the paper the link names', () => {
    for (const { clause } of ALL) {
      for (const [, , target] of clause.text.matchAll(LINK)) {
        const [paper, key] = target!.split('#');
        expect(Object.keys(PAPERS), clause.text).toContain(paper);
        if (key) expect(placeOf(key)?.paper, `${target} in «${clause.text}»`).toBe(paper);
      }
    }
  });

  it('name only clauses that exist, and only the slots the page fills', () => {
    for (const { clause } of ALL) {
      for (const [, slot] of clause.text.matchAll(SLOT)) {
        if (slot!.startsWith('n:')) expect(placeOf(slot!.slice(2)), `${slot} in «${clause.text}»`).not.toBeNull();
        else expect(FILLED_BY_PAGE, `${slot} in «${clause.text}»`).toContain(slot);
      }
    }
  });

  it('have no empty part and no empty clause', () => {
    for (const paper of Object.values(PAPERS)) {
      for (const part of paper) {
        expect(part.title.trim()).not.toBe('');
        expect(part.clauses.length).toBeGreaterThan(0);
        for (const clause of part.clauses) expect(clause.text.trim()).not.toBe('');
      }
    }
  });

  it('promise the limits the Worker enforces, not other ones', () => {
    const limits = RULES.flatMap((part) => part.clauses).find((clause) => clause.key === 'limits')!.text;
    expect(limits).toContain(`${MODEL_MAX_BYTES / 1024 / 1024} МБ`);
    expect(limits).toContain(`${QUOTA_BYTES / 1024 / 1024} МБ`);
    expect(limits).toContain(`${DAILY_UPLOADS} загрузок`);
    const penalty = RULES.flatMap((part) => part.clauses).find((clause) => clause.key === 'penalty')!.text;
    expect(penalty).toContain(String(PENALTY_DAYS));
  });
});

describe('what a decision can cite', () => {
  it('is only clauses of the rules that say in a few words what they forbid', () => {
    expect(BREAKABLE.length).toBeGreaterThan(0);
    for (const rule of BREAKABLE) {
      expect(placeOf(rule.key)).toEqual({ paper: 'rules', number: rule.number });
      expect(rule.short.trim()).not.toBe('');
    }
  });

  it('includes the clauses the takedowns lean on', () => {
    for (const key of ['theft', 'minors', 'unmarked', 'abuse', 'ads']) expect(isBreakable(key), key).toBe(true);
    expect(isBreakable('appeal')).toBe(false);
    expect(isBreakable('nonsense')).toBe(false);
    expect(isBreakable(4)).toBe(false);
  });

  it('is written into a notice with its number and its name', () => {
    const theft = BREAKABLE.find((rule) => rule.key === 'theft')!;
    expect(citing('theft')).toBe(`Нарушен пункт ${theft.number} правил: чужая работа без разрешения.`);
    expect(citing('nonsense')).toBe('');
  });
});

describe('plural', () => {
  it('takes the form Russian takes after a number', () => {
    const days = (n: number) => plural(n, 'день', 'дня', 'дней');
    expect(days(1)).toBe('1 день');
    expect(days(2)).toBe('2 дня');
    expect(days(5)).toBe('5 дней');
    expect(days(7)).toBe('7 дней');
    expect(days(11)).toBe('11 дней');
    expect(days(14)).toBe('14 дней');
    expect(days(21)).toBe('21 день');
    expect(days(22)).toBe('22 дня');
    expect(days(111)).toBe('111 дней');
  });
});

describe('the answers to questions', () => {
  it('have keys of their own and links that land', async () => {
    const { FAQ } = await import('../src/lib/faq.js');
    const keys = FAQ.map((one) => one.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const one of FAQ) {
      expect(one.question.trim().endsWith('?'), one.question).toBe(true);
      for (const [, , target] of one.answer.matchAll(LINK)) {
        const [paper, key] = target!.split('#');
        if (paper === 'faq') {
          expect(keys, target).toContain(key);
          continue;
        }
        expect(Object.keys(PAPERS), target).toContain(paper);
        if (key) expect(placeOf(key)?.paper, `${target} in «${one.question}»`).toBe(paper);
      }
    }
    // The question mark in a model window opens the page on this one.
    expect(keys).toContain('open');
  });
});
