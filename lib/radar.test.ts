import { describe, expect, it } from 'vitest';
import { keepVerified, rankGigs, skillFit, type GigCandidate } from './radar';

const skills = ['3D modelling', 'Blender', 'Product rendering', 'Motion design'];

function candidate(overrides: Partial<GigCandidate> = {}): GigCandidate {
  return {
    title: 'Product render pack',
    url: 'https://example.com/gigs/render-pack',
    snippet: '12 photoreal product renders in Blender.',
    budgetMinCents: 120_000,
    budgetMaxCents: 180_000,
    budgetCurrency: 'USD',
    estHours: 30,
    requirements: ['12 product renders'],
    redFlags: [],
    ...overrides,
  };
}

describe('skillFit', () => {
  it('counts the skills the posting mentions, the title counts more', () => {
    // "Blender" in the title, "product" only in the text.
    expect(skillFit('Blender render', 'a product render', skills)).toBeCloseTo(0.375);
    expect(skillFit('Blender and motion design', 'for a product rendering', skills)).toBeCloseTo(0.625);
    expect(skillFit('React storefront build', 'with payments', skills)).toBe(0);
  });

  it('is zero without skills', () => {
    expect(skillFit('anything', 'anything', [])).toBe(0);
  });
});

describe('rankGigs', () => {
  it('ranks a good fit with a budget above the floor first', () => {
    const good = candidate();
    const bad = candidate({
      title: 'React storefront build',
      url: 'https://example.com/gigs/storefront',
      snippet: 'Full storefront build with payments.',
      budgetMinCents: 280_000,
      budgetMaxCents: 280_000,
      estHours: 60,
      requirements: ['React storefront'],
    });

    const ranked = rankGigs([bad, good], skills, 3_000, 'USD');
    expect(ranked[0].url).toBe(good.url);
    expect(ranked[0].fitScore).toBeGreaterThan(ranked[1].fitScore);
  });

  it('scores a budget that clears the floor at full marks', () => {
    const [gig] = rankGigs([candidate()], skills, 3_000, 'USD');
    // $180,000 over 30h = $60/h, above the $30/h floor.
    expect(gig.impliedHourlyCents).toBe(6_000);
    expect(gig.budgetScore).toBe(1);
  });

  it('penalises a budget under the floor', () => {
    const cheap = candidate({
      budgetMinCents: 30_000,
      budgetMaxCents: 30_000,
      estHours: 10,
    });
    const [gig] = rankGigs([cheap], skills, 3_000, 'USD');
    expect(gig.impliedHourlyCents).toBe(3_000);
    expect(gig.budgetScore).toBe(1);
  });

  it('penalises red flags', () => {
    const clean = rankGigs([candidate()], skills, 3_000, 'USD')[0];
    const flagged = rankGigs(
      [candidate({ redFlags: ['free_work', 'vague_scope'] })],
      skills,
      3_000,
      'USD',
    )[0];
    expect(flagged.score).toBeLessThan(clean.score);
  });

  it('does not compare a budget in another currency', () => {
    const euros = candidate({ budgetCurrency: 'EUR' });
    const [gig] = rankGigs([euros], skills, 3_000, 'USD');
    expect(gig.impliedHourlyCents).toBeNull();
    expect(gig.budgetScore).toBe(0.5);
  });
});

describe('keepVerified', () => {
  const searchResults = [
    {
      title: 'Product render pack',
      url: 'https://example.com/gigs/render-pack',
      content: '12 photoreal product renders in Blender.',
      score: 0.9,
    },
  ];

  it('drops a URL the model invented', () => {
    const kept = keepVerified(
      [
        {
          title: 'Product render pack',
          url: 'https://example.com/gigs/render-pack',
          est_hours: 30,
          budget_min: 1_200,
          budget_max: 1_800,
          budget_currency: 'USD',
          requirements: ['12 renders'],
          red_flags: [],
        },
        {
          title: 'Made up gig',
          url: 'https://not-real.example/gig',
          est_hours: 10,
          budget_min: 500,
          budget_max: null,
          budget_currency: 'USD',
          requirements: [],
          red_flags: [],
        },
      ],
      searchResults,
    );

    expect(kept).toHaveLength(1);
    expect(kept[0].url).toBe('https://example.com/gigs/render-pack');
  });

  it('takes the title and text from the posting, not from the model', () => {
    const kept = keepVerified(
      [
        {
          title: 'A rewritten title',
          url: 'https://example.com/gigs/render-pack',
          est_hours: 30,
          budget_min: 1_200,
          budget_max: 1_800,
          budget_currency: 'usd',
          requirements: ['12 renders'],
          red_flags: [],
        },
      ],
      searchResults,
    );

    expect(kept[0].title).toBe('Product render pack');
    expect(kept[0].snippet).toBe('12 photoreal product renders in Blender.');
    expect(kept[0].budgetMinCents).toBe(120_000);
    expect(kept[0].budgetMaxCents).toBe(180_000);
    expect(kept[0].budgetCurrency).toBe('USD');
  });
});
