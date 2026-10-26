'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { radarExtractGigAction, radarSearchAction } from '@/app/actions';
import { Skeleton } from '@/components/skeleton';
import { formatMoney } from '@/lib/money';
import type { RadarGig } from '@/lib/radar';

const RED_FLAG_LABELS: Record<string, string> = {
  vague_scope: 'Vague scope',
  free_work: 'Wants free work',
  no_budget: 'No budget',
};

/** Postings read per batch. Small batches = short waits and real progress. */
const BATCH_SIZE = 3;

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

type QueueItem = { title: string; url: string; content: string };

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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [provider, setProvider] = useState('');
  const [searchProvider, setSearchProvider] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const runId = useRef(0);

  // "This is taking longer than usual" once a run passes 10s.
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [pending]);

  async function readBatch(items: QueueItem[], myRun: number) {
    for (let index = 0; index < items.length; index++) {
      setProgress({ done: index, total: items.length, phase: 'Reading posting' });
      const result = await radarExtractGigAction(items[index]);
      if (runId.current !== myRun) return false; // a newer search started
      if (!result.ok) {
        setError(result.message ?? 'Something went wrong.');
        return false;
      }
      if (result.gig) {
        const gig = result.gig;
        setGigs((current) => [...current, gig].sort((a, b) => b.score - a.score));
        if (result.provider) setProvider(result.provider);
      }
    }
    setProgress({ done: items.length, total: items.length, phase: 'Reading posting' });
    return true;
  }

  async function run() {
    const myRun = ++runId.current;
    setPending(true);
    setError('');
    setQueue([]);
    setProgress({ done: 0, total: BATCH_SIZE, phase: 'Searching the web' });
    try {
      const search = await radarSearchAction(query);
      if (!search.ok || !search.results) {
        setError(search.message ?? 'Something went wrong.');
        setProgress(null);
        return;
      }
      setSearchProvider(search.searchProvider ?? '');
      setGigs([]);
      const firstBatch = search.results.slice(0, BATCH_SIZE);
      setQueue(search.results.slice(BATCH_SIZE));
      await readBatch(firstBatch, myRun);
    } finally {
      if (runId.current === myRun) {
        setPending(false);
        setProgress(null);
      }
    }
  }

  async function more() {
    const myRun = ++runId.current;
    setPending(true);
    setError('');
    try {
      const batch = queue.slice(0, BATCH_SIZE);
      setQueue(queue.slice(BATCH_SIZE));
      await readBatch(batch, myRun);
    } finally {
      if (runId.current === myRun) {
        setPending(false);
        setProgress(null);
      }
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card lg:col-span-2">
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

        {progress ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {progress.phase}
                {progress.phase === 'Reading posting'
                  ? ` ${Math.min(progress.done + 1, progress.total)}/${progress.total}`
                  : ''}
              </span>
              <span>{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
              <div
                className="h-full bg-accent transition-[width] duration-500"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : null}

        {slow && pending ? (
          <p className="mt-3 text-xs text-warn">
            This is taking longer than usual - the postings are still being read.
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      </div>

      <div className="lg:col-span-3">
        {pending && gigs.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-48" />
            <div className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="mt-4 h-3 w-3/4" />
            </div>
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
              {searchProvider
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
                      <p className="font-medium">{gig.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        <a
                          href={gig.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {host(gig.url)}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="View the posting">
                            <path d="M7 17L17 7" />
                            <path d="M8 7h9v9" />
                          </svg>
                        </a>
                      </p>
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

                  <div className="mt-4 flex items-center justify-end gap-3">
                    <Link href={`/price?gig=${gig.id}`} className="btn btn-primary">
                      Quote this
                    </Link>
                  </div>
                </article>
              );
            })}

            {queue.length > 0 ? (
              <button
                type="button"
                className="btn w-full"
                onClick={more}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Reading more...
                  </>
                ) : (
                  `Search more (${queue.length} more posting${queue.length === 1 ? '' : 's'} found)`
                )}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
