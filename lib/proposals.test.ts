import { describe, expect, it } from 'vitest';
import { deliveryDate, deliveryEstimate, proposalScopeTerms, proposalText } from './proposals';

describe('deliveryEstimate', () => {
  it('turns hours into working days', () => {
    expect(deliveryEstimate(4)).toBe(1);
    expect(deliveryEstimate(12)).toBe(3);
    expect(deliveryEstimate(13)).toBe(4);
  });

  it('never returns less than a day', () => {
    expect(deliveryEstimate(0.5)).toBe(1);
  });

  it('rejects hours that make no sense', () => {
    expect(() => deliveryEstimate(0)).toThrow(RangeError);
    expect(() => deliveryEstimate(-3)).toThrow(RangeError);
  });
});

describe('deliveryDate', () => {
  it('skips weekends', () => {
    // Friday + 1 working day is Monday.
    expect(deliveryDate(1, new Date('2026-10-23T09:00:00Z'))).toBe('2026-10-26');
  });

  it('counts working days, not calendar days', () => {
    // Friday + 2 working days is Tuesday.
    expect(deliveryDate(2, new Date('2026-10-23T09:00:00Z'))).toBe('2026-10-27');
  });
});

describe('proposalScopeTerms', () => {
  const terms = proposalScopeTerms({
    included: ['12 product renders', '4K textures'],
    exclusions: ['photography'],
    revisionsIncluded: 2,
    deliveryDate: '2026-11-02',
    priceCents: 112_500,
    currency: 'USD',
  });

  it('states what is included, what is not, the deadline and the price', () => {
    expect(terms).toContain('Deliverables: 12 product renders; 4K textures.');
    expect(terms).toContain('Included: 2 rounds of revisions.');
    expect(terms).toContain('Not included: photography.');
    expect(terms).toContain('Deadline: 2026-11-02.');
    expect(terms).toContain('Price: $1,125.00.');
  });
});

describe('proposalText', () => {
  const text = proposalText({
    included: ['12 product renders'],
    exclusions: ['photography', 'copywriting'],
    revisionsIncluded: 2,
    hours: 12,
    priceCents: 112_500,
    hourlyRateCents: 4_500,
    currency: 'USD',
    deliveryDays: 3,
    deliveryDate: '2026-11-02',
  });

  it('is a few conversational sentences carrying every term', () => {
    expect(text).toContain("For $1,125.00 (12 hours at $45.00/h");
    expect(text).toContain("I'll deliver 12 product renders.");
    expect(text).toContain('Photography and copywriting are not part of this price.');
    expect(text).toContain('Delivery by 2026-11-02 (within 3 working days), with 2 rounds of revisions included.');
    expect(text.split(/(?<=[.!?])\s+/)).toHaveLength(3);
  });

  it('has no greeting, no sign-off, no headers', () => {
    expect(text).not.toContain('Hi,');
    expect(text).not.toContain('included:');
  });
});
