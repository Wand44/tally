import { describe, expect, it } from 'vitest';
import { assignClauseRefs, revisionLimit, scopeToClauses } from './scope';

describe('scopeToClauses', () => {
  it('turns an extracted scope into editable clauses', () => {
    const clauses = scopeToClauses({
      deliverables: ['Hero section', 'Menu page'],
      exclusions: ['Photography'],
      assumptions: ['Client supplies the logo'],
      included_revisions: 2,
      deadline: '2026-11-05',
      price: 1800,
    });

    expect(clauses.map((clause) => clause.category)).toEqual([
      'deliverable',
      'deliverable',
      'revision_limit',
      'exclusion',
      'assumption',
    ]);
    expect(clauses[2].text).toContain('2 rounds');
  });

  it('skips the revision clause when the terms do not state a limit', () => {
    const clauses = scopeToClauses({
      deliverables: ['Hero section'],
      exclusions: [],
      assumptions: [],
      included_revisions: null,
      deadline: null,
      price: null,
    });
    expect(clauses).toHaveLength(1);
  });
});

describe('assignClauseRefs', () => {
  const existing = [
    { ref: 'C1', category: 'deliverable', text: 'Hero section' },
    { ref: 'C2', category: 'exclusion', text: 'Photography' },
  ];

  it('keeps the id of a clause that was not edited', () => {
    const result = assignClauseRefs([{ category: 'deliverable', text: 'Hero section' }], existing);
    expect(result[0].ref).toBe('C1');
  });

  it('keeps the id of a clause that was edited in place', () => {
    const result = assignClauseRefs(
      [
        { category: 'deliverable', text: 'Hero section' },
        { category: 'exclusion', text: 'Photography and video' },
      ],
      existing,
    );
    expect(result.map((clause) => clause.ref)).toEqual(['C1', 'C2']);
  });

  it('gives a new clause the next free id', () => {
    const result = assignClauseRefs(
      [
        { category: 'deliverable', text: 'Hero section' },
        { category: 'exclusion', text: 'Photography' },
        { category: 'deliverable', text: 'New page' },
      ],
      existing,
    );
    expect(result.map((clause) => clause.ref)).toEqual(['C1', 'C2', 'C3']);
  });

  it('does not renumber the clauses after a removed one', () => {
    const result = assignClauseRefs(
      [
        { category: 'deliverable', text: 'Hero section' },
        { category: 'exclusion', text: 'Photography' },
      ],
      [
        { ref: 'C1', category: 'deliverable', text: 'Hero section' },
        { ref: 'C2', category: 'deliverable', text: 'Menu page' },
        { ref: 'C3', category: 'exclusion', text: 'Photography' },
      ],
    );
    expect(result.map((clause) => clause.ref)).toEqual(['C1', 'C3']);
  });
});

describe('revisionLimit', () => {
  it('reads the number of revision rounds', () => {
    expect(revisionLimit([{ category: 'revision_limit', text: '2 rounds of revisions included.' }])).toBe(2);
    expect(revisionLimit([{ category: 'revision_limit', text: 'Two rounds of visual revisions are included.' }])).toBe(2);
  });

  it('is null without a revision clause', () => {
    expect(revisionLimit([{ category: 'deliverable', text: 'Hero section' }])).toBeNull();
  });
});
