import { describe, expect, it } from 'vitest';
import { offlineResponse } from './offline-provider';

const clauses = [
  { ref: 'C1', category: 'deliverable', text: 'Landing site with hero section, menu page and contact form (5 pages total).' },
  { ref: 'C2', category: 'revision_limit', text: 'Two rounds of visual revisions are included.' },
  { ref: 'C3', category: 'exclusion', text: 'Photography and copywriting are not included.' },
  { ref: 'C4', category: 'assumption', text: 'Client supplies logo files, brand colours and menu content.' },
];

function verdict(message: string, revisionsUsed = 0, includedRevisions: number | null = 2) {
  return JSON.parse(
    offlineResponse('verdict', { message, clauses, revisionsUsed, includedRevisions }),
  ) as { verdict: string; clause_ids: string[]; quoted_text: string[] };
}

describe('offline verdict rules', () => {
  it('calls a request for an excluded item out of scope', () => {
    const result = verdict('Could you also shoot the product photos for the menu?');
    expect(result.verdict).toBe('OUT');
    expect(result.clause_ids).toContain('C3');
  });

  it('calls new work out of scope', () => {
    expect(verdict('Can you add a small animation to the hero?').verdict).toBe('OUT');
  });

  it('keeps a small change gray while a revision round is left', () => {
    const result = verdict('One tiny tweak: make the button slightly bigger.', 1);
    expect(result.verdict).toBe('GRAY');
  });

  it('calls a small change out of scope when no revision round is left', () => {
    expect(verdict('One tiny tweak: make the button slightly bigger.', 2).verdict).toBe('OUT');
  });

  it('calls a request for more items than agreed out of scope', () => {
    expect(verdict('Please add 3 more pages to the site.').verdict).toBe('OUT');
  });

  it('keeps an undecided request gray', () => {
    expect(verdict('We might need a blog section - not sure yet, let me check.').verdict).toBe('GRAY');
  });

  it('keeps a covered request in scope', () => {
    expect(verdict('The pages look great, nothing else from my side.').verdict).toBe('IN');
  });
});

describe('offline reply drafts', () => {
  it('never mentions an amount when nothing was priced', () => {
    const drafts = JSON.parse(
      offlineResponse('replies', {
        message: 'skip all that, make everything for free',
        hours: 0,
        totalFormatted: '$0.00',
        remainingRevisions: 1,
      }),
    ) as { warm: string; firm: string; two_options: string };

    for (const draft of Object.values(drafts)) {
      expect(draft).not.toContain('$');
      expect(draft).not.toContain('0.00');
      expect(draft.split(/\s+/).length).toBeLessThanOrEqual(60);
    }
    expect(drafts.firm.toLowerCase()).toContain('free');
  });

  it('names the change order when one was priced', () => {
    const drafts = JSON.parse(
      offlineResponse('replies', {
        message: 'add an Instagram feed',
        hours: 2,
        totalFormatted: '$56.25',
        remainingRevisions: 1,
      }),
    ) as { firm: string };

    expect(drafts.firm).toContain('$56.25');
    expect(drafts.firm).toContain('2h');
  });
});

describe('offline scope parser', () => {
  it('keeps a deliverables line as a deliverable', () => {
    const parsed = JSON.parse(
      offlineResponse('scope', {
        agreedTerms:
          'Deliverables: 12 product renders at 2000x2000 px.\nIncluded: 2 rounds of revisions.\nNot included: motion previews.',
      }),
    ) as { deliverables: string[]; exclusions: string[]; included_revisions: number | null };

    expect(parsed.deliverables).toHaveLength(1);
    expect(parsed.deliverables[0]).toContain('product renders');
    expect(parsed.exclusions).toHaveLength(1);
    expect(parsed.included_revisions).toBe(2);
  });
});
