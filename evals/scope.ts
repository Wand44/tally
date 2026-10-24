import { offlineResponse } from '../lib/offline-provider';
import { assignClauseRefs, scopeToClauses } from '../lib/scope';
import type { ScopeExtraction } from '../lib/schemas';

/**
 * The clause list the verdict prompt sees for a case.
 *
 * The rules in lib/offline-provider.ts turn the agreed terms into the same
 * clause list the model produces, so every model is judged on the same input.
 */
export function buildScopeClauses(scopeText: string): {
  clauses: { ref: string; category: string; text: string }[];
  includedRevisions: number | null;
} {
  const extraction = JSON.parse(
    offlineResponse('scope', { agreedTerms: scopeText }),
  ) as ScopeExtraction;

  return {
    clauses: assignClauseRefs(scopeToClauses(extraction), []),
    includedRevisions: extraction.included_revisions,
  };
}
