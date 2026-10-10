import {
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Link2,
  ListTree,
  Mail,
  MessagesSquare,
  Scale,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { PAPERS, numberAt, placeOf, type Part } from '../../shared/paperText.js';
import type { SiteFacts } from '../../shared/siteWire.js';
import { FAQ } from '../lib/faq.js';
import { lang } from '../lib/lang.js';
import { countryName } from '../lib/numbers.js';
import { PAPERS_CHANGED, pathOfPaper, titleOfPaper, type Paper } from '../lib/papers.js';
import { NAME } from '../lib/site.js';
import { siteFacts } from '../lib/siteApi.js';
import { onDay } from '../lib/when.js';
import { words } from '../lib/words.js';
import { Feedback } from './Feedback.js';
import { Hint } from './Hint.js';

/**
 * The pages that say what the rules are, what is kept, and who to write to.
 *
 * <h2>Numbered clauses, not paragraphs</h2>
 *
 * The first version was headings over friendly paragraphs, and read like a page of
 * tips: pleasant, and impossible to point at. Every sentence that binds anybody is now
 * a clause with a number, and the number is a link — pressed, it copies an address
 * that opens the page on that clause, marked. The same numbers are what a takedown
 * notice cites, which is why the words live in `shared/paperText` and not here.
 *
 * <h2>Why the words are the site's own and not a template</h2>
 *
 * Because the one duty here that is written about wording asks for "clear, simple,
 * intelligible, user-friendly and unambiguous language". A generated terms-of-service
 * is none of those, and worse, it promises things this site does not do — mailing
 * lists it has no addresses for, analytics it does not run. Everything in the clauses
 * is checked against what the code actually stores and does.
 *
 * <h2>Why the operator's details come from the server</h2>
 *
 * A name, a postal address and an e-mail have to be permanently reachable from the
 * site, and the repository is public. So they are set as secrets and fetched; until
 * they are set the page says so, rather than showing a convincing half.
 */
export function Papers({ paper, onNav }: { paper: Paper; onNav: (href: string) => void }) {
  const [facts, setFacts] = useState<SiteFacts | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  // Two of these are not made of clauses: the questions, and the wall of reviews,
  // which is here for the address and the place in the foot and nothing else.
  const clauses = paper !== 'faq' && paper !== 'feedback';
  const parts = clauses ? PAPERS[paper] : [];

  useEffect(() => {
    void siteFacts().then(setFacts);
  }, []);

  /**
   * Go to the clause the address names, once the text is there to go to.
   *
   * The browser does this itself for a page that arrives whole. This one is drawn
   * after the script runs, so by the time the clause exists the browser has long
   * given up looking for it.
   */
  useEffect(() => {
    const go = () => {
      const number = decodeURIComponent(location.hash.slice(1));
      if (!number) return setMarked(null);
      const clause = document.getElementById(number);
      if (!clause) return;
      setMarked(number);
      clause.scrollIntoView({ block: 'center' });
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [paper]);

  /**
   * A link inside the text, to this page or another of the three.
   *
   * The address is set before the page changes, so the page that comes up finds the
   * clause in it and goes there.
   */
  const follow = (to: Paper, number: string | null) => {
    const href = pathOfPaper(to) + (number ? `#${number}` : '');
    if (to !== paper) {
      onNav(pathOfPaper(to));
      history.replaceState(null, '', href);
      return;
    }
    history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  return (
    <main className="paper">
      <nav className="paper-tabs">
        {PAPER_TABS.map((tab) => (
          <a
            key={tab.paper}
            className={tab.paper === paper ? 'chip on' : 'chip'}
            href={pathOfPaper(tab.paper)}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.button !== 0) return;
              event.preventDefault();
              onNav(pathOfPaper(tab.paper));
            }}
          >
            {tab.icon}
            {titleOfPaper(tab.paper)}
          </a>
        ))}
      </nav>

      <article className="paper-text">
        <h1>{heading(paper)}</h1>
        {paper === 'faq' && <Answers facts={facts} follow={follow} marked={marked} />}
        {paper === 'feedback' && <Feedback />}
        {clauses && <Contents parts={parts} />}

        {parts.map((part, p) => (
          <section key={part.title} id={`part-${p + 1}`} className="paper-part">
            <h2>
              <span className="paper-part-n">{p + 1}.</span>
              {part.title}
            </h2>
            <ol className="clauses">
              {part.clauses.map((clause, c) => {
                const number = numberAt(p, c);
                return (
                  <li key={number} id={number} className={marked === number ? 'clause on' : 'clause'}>
                    <ClauseNumber paper={paper} number={number} onMark={setMarked} />
                    <p>{spoken(clause.text, facts, follow)}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {/*
         * When these were last changed, and which wording governs — about the texts,
         * and so not about the wall, where the words belong to whoever wrote them.
         *
         * Her decision on the second: all fourteen languages, and the Russian one
         * governs. Somebody held to a rule has to know which wording they are held to
         * — and in Russian there is nothing to say, because that is the wording.
         */}
        {paper !== 'feedback' && (
          <>
            <p className="paper-when">{words().papers.changed_on(onDay(PAPERS_CHANGED))}</p>
            {lang() !== 'ru' && <p className="paper-governs">{words().papers.governs}</p>}
          </>
        )}
      </article>
    </main>
  );
}

const PAPER_TABS: { paper: Paper; icon: ReactNode }[] = [
  { paper: 'rules', icon: <Scale size={15} /> },
  { paper: 'data', icon: <Database size={15} /> },
  { paper: 'contact', icon: <Mail size={15} /> },
  { paper: 'faq', icon: <CircleHelp size={15} /> },
  { paper: 'feedback', icon: <MessagesSquare size={15} /> },
];

/**
 * The title over the text, where it is not simply what the page is called.
 *
 * The foot of every page carries all five names in one row, so there they are short:
 * "Вопросы", "Отзывы". At the top of the page itself there is room to say what the
 * page is, and both of those are better for it.
 */
function heading(paper: Paper): string {
  if (paper === 'faq') return words().papers.faq_title;
  if (paper === 'feedback') return words().wall.title;
  return titleOfPaper(paper);
}

/**
 * The questions, a card each, the answer under the question.
 *
 * Not numbered: these bind nobody, and a number on an answer would make it look like
 * a rule. Each has its own address all the same, by its key, so the question mark in
 * a model window can open the page on the one answer it is about.
 */
function Answers({
  facts,
  follow,
  marked,
}: {
  facts: SiteFacts | null;
  follow: (to: Paper, number: string | null) => void;
  marked: string | null;
}) {
  return (
    <div className="answers">
      {FAQ.map((one) => (
        <section key={one.key} id={one.key} className={marked === one.key ? 'answer on' : 'answer'}>
          <h2>{one.question}</h2>
          <p>{spoken(one.answer, facts, follow)}</p>
        </section>
      ))}
    </div>
  );
}

/**
 * What is on the page, folded until asked for.
 *
 * Folded because the parts are in front of you anyway, a card each, and ten headings
 * standing between the title and the first rule are ten lines to scroll past every
 * visit. Opened, it is the quick way to the one part somebody came for.
 */
function Contents({ parts }: { parts: Part[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? 'paper-toc open' : 'paper-toc'}>
      <button type="button" className="paper-toc-face" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ListTree size={15} />
        {words().papers.contents}
        <ChevronDown size={14} className="caret" />
      </button>
      {open && (
        <nav className="paper-toc-list">
          {parts.map((part, p) => (
            <a
              key={part.title}
              href={`#part-${p + 1}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(`part-${p + 1}`)?.scrollIntoView({ block: 'start' });
                setOpen(false);
              }}
            >
              <span className="paper-part-n">{p + 1}.</span>
              {part.title}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

/**
 * A clause's number, which is also the way to hand the clause to somebody.
 *
 * Pressed, it puts the clause in the address and copies the address. The tick that
 * answers stays for a moment and goes: a word that stayed would be a second label on
 * a thing that already has one.
 */
function ClauseNumber({ paper, number, onMark }: { paper: Paper; number: string; onMark: (n: string) => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    const href = `${location.origin}${pathOfPaper(paper)}#${number}`;
    history.replaceState(null, '', `#${number}`);
    onMark(number);
    // Without a secure page or permission the copying fails; the address bar still
    // has the link, so nothing is said about it.
    void navigator.clipboard?.writeText(href).then(
      () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };

  return (
    <Hint says={copied ? words().papers.copied : words().papers.copy_clause}>
      <a className={copied ? 'clause-n done' : 'clause-n'} href={`#${number}`} onClick={copy}>
        <span>{number}</span>
        {copied ? <Check size={12} /> : <Link2 size={12} />}
      </a>
    </Hint>
  );
}

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * A clause's text, with its links made links and its blanks filled.
 *
 * The blanks are numbers of other clauses, the site's name, and the two facts only the
 * server knows: where models for adults are closed outright, and the address to write
 * to. Numbers are filled before links are found, since a link's words can hold one.
 */
function spoken(
  text: string,
  facts: SiteFacts | null,
  follow: (to: Paper, number: string | null) => void,
): ReactNode[] {
  const filled = text
    .replace(/\{n:([^}]+)\}/g, (_, key: string) => placeOf(key)?.number ?? '?')
    .replace(/\{name\}/g, NAME)
    .replace(/\{closedIn\}/g, () => {
      if (!facts) return '…';
      return facts.closedIn.length > 0 ? facts.closedIn.map(countryName).join(', ') : words().papers.nowhere;
    });

  const out: ReactNode[] = [];
  let from = 0;
  for (const found of filled.matchAll(LINK)) {
    const at = found.index ?? 0;
    out.push(...withEmail(filled.slice(from, at), facts, out.length));
    // Named `shown` rather than `words`, which is the dictionary everywhere else.
    const [whole, shown, target] = found;
    const [to, key] = target!.split('#') as [Paper, string | undefined];
    // Answers are found by their key, clauses by their number.
    const number = key ? (to === 'faq' ? key : (placeOf(key)?.number ?? null)) : null;
    out.push(
      <a
        key={`link-${out.length}`}
        href={pathOfPaper(to) + (number ? `#${number}` : '')}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.button !== 0) return;
          event.preventDefault();
          follow(to, number);
        }}
      >
        {shown}
      </a>,
    );
    from = at + whole.length;
  }
  out.push(...withEmail(filled.slice(from), facts, out.length));
  return out;
}

/** Plain text, with the operator's address dropped in where the clause asks for it. */
function withEmail(text: string, facts: SiteFacts | null, at: number): ReactNode[] {
  if (!text.includes('{email}')) return text ? [<Fragment key={`text-${at}`}>{text}</Fragment>] : [];
  const [before, after] = text.split('{email}');
  const who = facts?.operator ?? null;
  return [
    <Fragment key={`text-${at}`}>{before}</Fragment>,
    who ? (
      <a key={`mail-${at}`} href={`mailto:${who.email}`}>
        {who.email}
      </a>
    ) : (
      <span key={`mail-${at}`} className="paper-missing">
        {facts ? words().papers.no_email : '…'}
      </span>
    ),
    <Fragment key={`after-${at}`}>{after}</Fragment>,
  ];
}
