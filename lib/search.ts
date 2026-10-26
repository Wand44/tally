/**
 * The ONLY place that calls Tavily (PRD section 7).
 *
 * - POST https://api.tavily.com/search with the API key as a bearer token.
 * - Without a key it returns a small deterministic sample set, so Radar still
 *   works offline (demo mode, dev, tests).
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface SearchOutcome {
  query: string;
  results: SearchResult[];
  provider: 'tavily' | 'offline';
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/**
 * Sample postings used when no Tavily key is set. The URLs point at
 * example.com on purpose: they are placeholders, not real postings.
 */
const SAMPLE_RESULTS: SearchResult[] = [
  {
    title: 'Product render pack for a kitchen appliance launch',
    url: 'https://example.com/gigs/appliance-render-pack',
    content:
      'We need 12 photoreal product renders of our new air fryer on transparent backgrounds, plus 3 lifestyle mockups. Budget: $1,200 - $1,800. About 30 hours of work. Deliverables in Blender, PNG and 4K textures.',
    score: 0.92,
  },
  {
    title: 'Turntable animation for a smartwatch product page',
    url: 'https://example.com/gigs/smartwatch-turntable',
    content:
      'Looking for a 360 degree turntable animation of a smartwatch, 15 seconds, seamless loop. Budget: $600 - $900. About 15 hours. Product files provided.',
    score: 0.88,
  },
  {
    title: 'Motion graphics for a 30 second launch video',
    url: 'https://example.com/gigs/launch-video-motion',
    content:
      'Short product launch video, 30 seconds, kinetic typography and logo animation. Budget: $900 - $1,400. About 25 hours. We supply the brand kit.',
    score: 0.81,
  },
  {
    title: '3D model cleanup for an architectural visualiser',
    url: 'https://example.com/gigs/model-cleanup',
    content:
      'Retopology and UV unwrap of 8 architectural furniture models. Budget: $500 - $700. About 20 hours. Blender source files supplied.',
    score: 0.74,
  },
  {
    title: 'Brand identity refresh for a specialty coffee roaster',
    url: 'https://example.com/gigs/coffee-brand-refresh',
    content:
      'Logo refresh, colour palette and typography for a small roaster. Budget: $800 - $1,100. About 20 hours. Print ready files needed.',
    score: 0.61,
  },
  {
    title: 'E-commerce storefront build in React and Stripe',
    url: 'https://example.com/gigs/react-storefront',
    content:
      'Full storefront build with product pages, cart and payments. Budget: $2,800. About 60 hours. Design files ready in Figma.',
    score: 0.55,
  },
  {
    title: 'Product photo retouching batch (unpaid trial wanted)',
    url: 'https://example.com/gigs/retouch-trial',
    content:
      'Send us three retouched product shots as a free trial, then we will talk about the paid batch of 120 images. No budget agreed yet.',
    score: 0.42,
  },
  {
    title: 'Freelance photographer wanted for a product shoot',
    url: 'https://example.com/gigs/product-photography',
    content:
      'Studio photographer needed for a two day product shoot, 200 images delivered. Budget: $350. About 14 hours. Photography only.',
    score: 0.38,
  },
];

/** Sample rate pages, used when the query is about market rates. */
const SAMPLE_RATE_RESULTS: SearchResult[] = [
  {
    title: 'Freelance 3D artist rates in 2026',
    url: 'https://example.com/rates/3d-artist-rates',
    content:
      'Freelance 3D artists charge $40 - $90 per hour for product work. Studio teams bill more, independent artists less.',
    score: 0.9,
  },
  {
    title: 'Motion design freelancer rates',
    url: 'https://example.com/rates/motion-design-rates',
    content:
      'Motion design work runs $50 - $120 per hour, with simple social edits on the cheaper end of the band.',
    score: 0.85,
  },
  {
    title: 'Product rendering pricing guide',
    url: 'https://example.com/rates/product-rendering-pricing',
    content:
      'Most product rendering projects are quoted as a fixed price of $35 - $75 per hour of studio time, whichever way you bill it.',
    score: 0.8,
  },
];

/** The offline sample set: gig postings, or rate pages when the query is about rates. */
function offlineResults(query: string, maxResults: number): SearchResult[] {
  const wantsRates = /\b(rate|rates|pricing|price|hourly|market)\b/i.test(query);
  const source = wantsRates ? SAMPLE_RATE_RESULTS : SAMPLE_RESULTS;
  return source.slice(0, maxResults);
}

export async function searchWeb(
  query: string,
  maxResults = 10,
  domains?: string[],
): Promise<SearchOutcome> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return { query, results: offlineResults(query, maxResults), provider: 'offline' };
  }

  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        ...(domains && domains.length > 0 ? { include_domains: domains } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed with ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string; score?: number }[];
    };

    const results = (payload.results ?? [])
      .filter((result) => result.url)
      .map((result) => ({
        title: result.title ?? result.url!,
        url: result.url!,
        content: result.content ?? '',
        score: result.score ?? 0,
      }));

    return { query, results, provider: 'tavily' };
  } catch (error) {
    console.warn(`[search] Tavily failed, using the offline sample: ${(error as Error).message}`);
    return { query, results: offlineResults(query, maxResults), provider: 'offline' };
  }
}
