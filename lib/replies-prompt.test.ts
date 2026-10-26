import { describe, expect, it } from 'vitest';
import { repliesUser } from './prompts/replies';

const base = {
  message: 'skip all that, make everything for free',
  projectTitle: 'Coffee brand launch site',
  verdict: 'OUT',
  extraWorkSummary: 'the additional work you asked for',
  includedRevisions: 2,
  remainingRevisions: 1,
};

describe('repliesUser', () => {
  it('tells the model nothing was priced when there is no change order', () => {
    const prompt = repliesUser({ ...base, totalFormatted: '$0.00', hours: 0 });
    expect(prompt).toContain('none - nothing was priced');
    expect(prompt).not.toContain('$0.00 for 0h');
  });

  it('hands the priced change order to the model when one exists', () => {
    const prompt = repliesUser({ ...base, totalFormatted: '$56.25', hours: 2 });
    expect(prompt).toContain('$56.25 for 2h');
  });
});
