'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { runRadarAction } from '@/app/actions';
import { formatMoney } from '@/lib/money';
import type { RadarGig } from '@/lib/radar';
import { ListSkeleton, Skeleton } from '@/components/skeleton';

const RED_FLAG_LABELS: Record<string, string> = {
  vague_scope: 'Vague scope',
  free_work: 'Wants free work',
  no_budget: 'No budget',
};

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function RadarBoard({
  defaultQuery,
  initialGigs,
  currency,
  floorHourlyCents,
}: {
  defaultQuery: string;
  initialGigs: (RadarGig & { id: string })[];
  currency: string;
  floorHourlyCents: number;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [gigs, setGigs] = useState<(RadarGig & { id: string })[]>(initialGigs);
  const [provider, setProvider] = useState('');
  const [searchProvider, setSearchProvider] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function run() {
    setError('');
    startTransition(async () => {
      const result = await runRadarAction(query);
      if (result.ok && result.gigs) {
        setGigs(result.gigs);
        setProvider(result.provider ?? '');
        setSearchProvider(result.searchProvider ?? '');
      } else {
        setError(result.message ?? 'Something went wrong.');
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="card lg:col-span-4">
        <h2 className="font-semibold">What should we look for?</h2>
        <p className="hint mt-1">
          Tally searches public postings, reads each one and ranks it by fit to your skills and by
          whether the budget clears your floor of {formatMoney(floorHourlyCents, currency)}/h.
        </p>

        <label className="label mt-4" htmlFor="radar-query">
          Search
        </label>
        <input
          id="radar-query"
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="3D product rendering"
        />

        <button type="button" className="btn btn-primary mt-4 w-full" onClick={run} disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Searching...
            </>
          ) : (
            'Find gigs'
          )}
        </button>
        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      </div>

      <div className="lg:col-span-8">
        {pending ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-48" />
            <ListSkeleton count={3} />
          </div>
        ) : gigs.length === 0 ? (
          <div className="card h-full">
            <p className="text-sm text-muted">
              No shortlist yet. Run a search and the ranked gigs show up here, each with the source
              it came from.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              {gigs.length} gigs ·{' '}
              {provider
                ? `${searchProvider === 'tavily' ? 'Tavily search' : 'offline sample search'} · ${
                    provider === 'nebius' ? 'model extraction' : 'offline extraction'
                  }`
                : 'from the last search'}
            </p>
            {gigs.map((gig) => {
              const budget =
                gig.budgetMinCents === null
                  ? null
                  : gig.budgetMaxCents && gig.budgetMaxCents !== gig.budgetMinCents
                    ? `${formatMoney(gig.budgetMinCents, gig.budgetCurrency)} - ${formatMoney(gig.budgetMaxCents, gig.budgetCurrency)}`
                    : formatMoney(gig.budgetMinCents, gig.budgetCurrency);

              return (
                <article key={gig.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <a
                        href={gig.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {gig.title}
                      </a>
                      <p className="mt-0.5 text-xs text-muted">{host(gig.url)}</p>
                    </div>
                    <span className="badge bg-accent-soft text-accent">Score {gig.score}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {budget ? (
                      <span className="badge bg-panel-2 text-muted">Budget {budget}</span>
                    ) : (
                      <span className="badge bg-warn-soft text-warn">No budget stated</span>
                    )}
                    {gig.impliedHourlyCents !== null ? (
                      <span className="badge bg-panel-2 text-muted">
                        ≈ {formatMoney(gig.impliedHourlyCents, gig.budgetCurrency)}/h
                        {gig.impliedHourlyCents >= floorHourlyCents ? ' - clears your floor' : ' - under your floor'}
                      </span>
                    ) : null}
                    <span className="badge bg-panel-2 text-muted">
                      {Math.round(gig.fitScore * 100)}% skill fit
                    </span>
                    {gig.redFlags.map((flag) => (
                      <span key={flag} className="badge bg-bad-soft text-bad">
                        {RED_FLAG_LABELS[flag] ?? flag}
                      </span>
                    ))}
                  </div>

                  {gig.requirements.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-sm text-muted">
                      {gig.requirements.slice(0, 3).map((requirement) => (
                        <li key={requirement}>{requirement}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <a
                      href={gig.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted hover:underline"
                    >
                      View the posting
                    </a>
                    <Link href={`/price?gig=${gig.id}`} className="btn btn-primary">
                      Quote this
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
