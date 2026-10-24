import type { ScopeExtraction } from './schemas';

export type ClauseCategory = 'deliverable' | 'exclusion' | 'revision_limit' | 'assumption' | 'deadline';

export interface ClauseDraft {
  category: ClauseCategory;
  text: string;
}

export interface StoredClause {
  ref: string;
  category: string;
  text: string;
}

/** Extracted scope -> editable clause list (F5). */
export function scopeToClauses(extracted: ScopeExtraction): ClauseDraft[] {
  const clauses: ClauseDraft[] = [];
  for (const text of extracted.deliverables) clauses.push({ category: 'deliverable', text });
  if (extracted.included_revisions != null) {
    const rounds = extracted.included_revisions;
    clauses.push({
      category: 'revision_limit',
      text: `${rounds} round${rounds === 1 ? '' : 's'} of revisions included.`,
    });
  }
  for (const text of extracted.exclusions) clauses.push({ category: 'exclusion', text });
  for (const text of extracted.assumptions) clauses.push({ category: 'assumption', text });
  return clauses;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * The revision limit as a number, read from the revision clause
 * ("2 rounds of revisions included." -> 2). Null when there is no such clause.
 */
export function revisionLimit(clauses: { category: string; text: string }[]): number | null {
  const clause = clauses.find((item) => item.category === 'revision_limit');
  if (!clause) return null;
  const digits = clause.text.match(/(\d+)/);
  if (digits) return Number(digits[1]);
  const word = clause.text.match(new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'i'));
  return word ? NUMBER_WORDS.indexOf(word[1].toLowerCase()) : null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function refNumber(ref: string): number {
  const parsed = Number(ref.replace(/^[^0-9]+/i, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Clause ids must stay stable: a clause that was not edited keeps its id, an
 * edited clause keeps the id it had in that position, a new clause gets the
 * next free id.
 */
export function assignClauseRefs(
  drafts: ClauseDraft[],
  existing: StoredClause[],
): (StoredClause & { category: ClauseCategory })[] {
  const taken = new Set<string>();
  const refs = new Array<string | undefined>(drafts.length);

  // Unchanged clauses keep their id.
  drafts.forEach((draft, index) => {
    const match = existing.find(
      (clause) =>
        !taken.has(clause.ref) &&
        clause.category === draft.category &&
        normalize(clause.text) === normalize(draft.text),
    );
    if (match) {
      taken.add(match.ref);
      refs[index] = match.ref;
    }
  });

  // An edited clause keeps the id it had in that spot.
  drafts.forEach((draft, index) => {
    if (refs[index]) return;
    const sameSpot = existing[index];
    if (sameSpot && !taken.has(sameSpot.ref)) {
      taken.add(sameSpot.ref);
      refs[index] = sameSpot.ref;
    }
  });

  // Anything else is new.
  let nextNumber = existing.reduce((max, clause) => Math.max(max, refNumber(clause.ref)), 0);
  return drafts.map((draft, index) => {
    if (!refs[index]) {
      nextNumber += 1;
      refs[index] = `C${nextNumber}`;
    }
    return { ref: refs[index]!, category: draft.category, text: draft.text };
  });
}
