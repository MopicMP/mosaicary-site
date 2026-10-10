import type { License, ReportKind, Use } from '../../shared/modelRules.js';
import type { CommentReportKind } from '../../shared/talkRules.js';
import { words } from './words.js';

/**
 * A code turned into a name, in the language on screen.
 *
 * <h2>Why these are not beside the rules they belong to</h2>
 *
 * Because the rules travel and the names do not. `shared/modelRules.ts` is imported by
 * the Worker, and `shared/bbmodel.ts` beside it is copied into the plugin whole; a
 * table of Russian labels in either is a table that has to exist fourteen times in two
 * places that have no business knowing about languages. So the list of codes stayed
 * where it is checked, and the words came to the dictionary.
 *
 * <h2>A missing name is the code</h2>
 *
 * Blockbench adds formats, and a model saved in one the site has never heard of still
 * has to show something. The code itself is readable — `java_block` tells a person
 * more than an empty space does — so an unknown code is shown rather than hidden.
 */

export function formatName(format: string): string {
  const named: Record<string, string> = words().names.formats;
  return named[format] ?? format;
}

export function useName(use: Use): string {
  return words().names.uses[use];
}

export function licenseName(license: License): string {
  return words().names.licenses[license];
}

export function reportName(kind: ReportKind): string {
  return words().names.reports[kind];
}

export function commentReportName(kind: CommentReportKind): string {
  return words().names.comment_reports[kind];
}
