import { describe, expect, it } from 'vitest';
import { cases } from './cases';
import { buildScopeClauses } from './scope';

describe('eval case set', () => {
  it('has at least 25 labelled cases with unique ids', () => {
    expect(cases.length).toBeGreaterThanOrEqual(25);
    expect(new Set(cases.map((testCase) => testCase.id)).size).toBe(cases.length);
  });

  it('covers all three verdicts and includes the tricky and injection cases', () => {
    const verdicts = new Set(cases.map((testCase) => testCase.expected_verdict));
    expect([...verdicts].sort()).toEqual(['GRAY', 'IN', 'OUT']);
    expect(cases.filter((testCase) => testCase.kind === 'tricky').length).toBeGreaterThanOrEqual(5);
    expect(cases.filter((testCase) => testCase.kind === 'injection').length).toBeGreaterThanOrEqual(4);
  });

  it('gives every case a scope that turns into clauses and a client message', () => {
    for (const testCase of cases) {
      expect(testCase.client_message.trim().length).toBeGreaterThan(10);
      expect(testCase.note.length).toBeGreaterThan(5);
      const { clauses } = buildScopeClauses(testCase.scope);
      expect(clauses.length).toBeGreaterThan(0);
      expect(clauses.every((clause) => clause.ref.startsWith('C'))).toBe(true);
    }
  });
});
