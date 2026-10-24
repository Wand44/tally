'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { priceGigAction } from '@/app/actions';
import { formatMoney } from '@/lib/money';
import type { QuoteOutcome } from '@/lib/pricing';
import { CardSkeleton, Skeleton } from '@/components/skeleton';

export function Pricer({
  gigId,
  initialTitle,
  initialDescription,
  initialHours,
  clients,
  currency,
  floorHourlyCents,
}: {
  gigId: string | null;
  initialTitle: string;
  initialDescription: string;
  initialHours: number | null;
  clients: string[];
  currency: string;
  floorHourlyCents: number;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [hours, setHours] = useState(initialHours ? String(initialHours) : '');
  const [clientName, setClientName] = useState('');
  const [quote, setQuote] = useState<QuoteOutcome | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function price() {
    setError('');
    startTransition(async () => {
      const result = await priceGigAction({
        gigId,
        title,
        description,
        hours: hours.trim() ? Number(hours) : null,
        clientName: clientName.trim() || undefined,
      });
      if (result.ok && result.quote) setQuote(result.quote);
      else setError(result.message ?? 'Something went wrong.');
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card lg:col-span-2">
        <h2 className="font-semibold">The gig</h2>
        <p className="hint mt-1">
          From Radar, or paste the posting yourself. Tally prices it with your rate card and never
          below your floor of {formatMoney(floorHourlyCents, currency)}/h.
        </p>

        <label className="label mt-4" htmlFor="pricer-title">
          Title
        </label>
        <input
          id="pricer-title"
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Product render pack"
        />

        <label className="label mt-4" htmlFor="pricer-description">
          Description
        </label>
        <textarea
          id="pricer-description"
          className="input min-h-40"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="12 photoreal product renders, 3 lifestyle mockups, 4K textures..."
        />

        <label className="label mt-4" htmlFor="pricer-hours">
          Estimated hours
        </label>
        <input
          id="pricer-hours"
          className="input"
          inputMode="decimal"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          placeholder="leave empty and Tally estimates"
        />
        <p className="hint">Tally suggests an estimate, but your number wins.</p>

        {clients.length > 0 ? (
          <>
            <label className="label mt-4" htmlFor="pricer-client">
              Client
            </label>
            <select
              id="pricer-client"
              className="input"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
            >
              <option value="">New client, no history</option>
              {clients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
            <p className="hint">Known clients who push the scope get a risk padding on the quote.</p>
          </>
        ) : null}

        <button type="button" className="btn btn-primary mt-4 w-full" onClick={price} disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Pricing...
            </>
          ) : (
            'Price this gig'
          )}
        </button>
        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      </div>

      <div className="lg:col-span-3">
        {pending ? (
          <div className="space-y-4">
            <div className="card">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-3 h-10 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
              <Skeleton className="mt-6 h-9 w-36" />
            </div>
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !quote ? (
          <div className="card h-full">
            <p className="text-sm text-muted">
              The recommended price, the range, what you keep after the fee and the sources behind
              the market range appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="card-title">Recommended price</p>
                  <p className="stat-value">{formatMoney(quote.totals.targetCents, quote.currency)}</p>
                </div>
                <span className="badge bg-good-soft text-good">Floor respected</span>
              </div>

              <p className="mt-2 text-sm text-muted">
                {quote.hours}h job · you keep {formatMoney(quote.totals.netCents, quote.currency)} after
                the platform fee · {formatMoney(quote.totals.netHourlyCents, quote.currency)}/h net
              </p>

              <Link href={`/proposal?quote=${quote.quoteId}`} className="btn btn-primary mt-4">
                Write the proposal
              </Link>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <p className="card-title">Low</p>
                  <p className="font-medium">{formatMoney(quote.totals.lowCents, quote.currency)}</p>
                </div>
                <div>
                  <p className="card-title">Target</p>
                  <p className="font-medium">{formatMoney(quote.totals.targetCents, quote.currency)}</p>
                </div>
                <div>
                  <p className="card-title">High</p>
                  <p className="font-medium">{formatMoney(quote.totals.highCents, quote.currency)}</p>
                </div>
              </div>

              <p className="mt-3 rounded-xl bg-good-soft px-3 py-2 text-xs text-good">
                Floor {formatMoney(quote.totals.floorCents, quote.currency)}: your{' '}
                {formatMoney(floorHourlyCents, quote.currency)}/h minimum, with the fee included.
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold">Why this price</h3>
              <p className="mt-2 text-sm">{quote.rationale}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>{quote.rateNote}</li>
                <li>{quote.riskNote}</li>
                <li>{quote.marketNote}</li>
              </ul>
            </div>

            <div className="card">
              <h3 className="font-semibold">Sources</h3>
              {quote.sources.length === 0 ? (
                <p className="mt-2 text-sm text-muted">
                  No market source was kept for this quote, so the price rests on your rate card alone.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {quote.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium hover:underline"
                      >
                        {source.title}
                      </a>
                      <p className="text-xs text-muted">{source.claim}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
