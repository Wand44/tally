'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { createOrderFromQuoteAction, generateProposalAction, priceGigAction } from '@/app/actions';
import { CardSkeleton, Skeleton } from '@/components/skeleton';
import { formatMoney } from '@/lib/money';
import type { QuoteOutcome } from '@/lib/pricing';
import type { Proposal, ProposalTone } from '@/lib/proposals';

const tones: { id: ProposalTone; label: string }[] = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
];

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
  const [tone, setTone] = useState<ProposalTone>('friendly');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [copied, setCopied] = useState('');
  const [orderProjectId, setOrderProjectId] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'price' | 'proposal' | 'order' | null>(null);

  function price() {
    setError('');
    setBusy('price');
    startTransition(async () => {
      const result = await priceGigAction({
        gigId,
        title,
        description,
        hours: hours.trim() ? Number(hours) : null,
        clientName: clientName.trim() || undefined,
      });
      if (result.ok && result.quote) {
        setQuote(result.quote);
        setProposal(null);
        setOrderProjectId('');
      } else {
        setError(result.message ?? 'Something went wrong.');
      }
      setBusy(null);
    });
  }

  function write() {
    if (!quote) return;
    setError('');
    setBusy('proposal');
    startTransition(async () => {
      const result = await generateProposalAction({ quoteId: quote.quoteId, tone });
      if (result.ok && result.proposal) setProposal(result.proposal);
      else setError(result.message ?? 'Something went wrong.');
      setBusy(null);
    });
  }

  function addAsOrder() {
    if (!quote) return;
    setError('');
    setBusy('order');
    startTransition(async () => {
      const result = await createOrderFromQuoteAction({
        quoteId: quote.quoteId,
        clientName,
        terms: proposal?.scopeTerms,
      });
      if (result.ok && result.projectId) setOrderProjectId(result.projectId);
      else setError(result.message ?? 'Something went wrong.');
      setBusy(null);
    });
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card lg:col-span-2">
        <label className="label" htmlFor="pricer-title">
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

        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          onClick={price}
          disabled={pending}
        >
          {busy === 'price' ? (
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
        {busy === 'price' && !quote ? (
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
              The recommended price, the proposal and the order appear here. One flow: price it,
              write the proposal, send it, then add the order.
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
              <h3 className="font-semibold">Write the proposal</h3>
              <p className="hint mt-1">
                The one message the client gets. The model writes the words; the price, the timeline
                and the revision limit are added in code.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {tones.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={option.id === tone ? 'btn btn-primary' : 'btn'}
                      onClick={() => setTone(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn btn-primary" onClick={write} disabled={pending}>
                  {busy === 'proposal' ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Writing...
                    </>
                  ) : (
                    'Write the proposal'
                  )}
                </button>
              </div>

              {proposal ? (
                <div className="mt-4 space-y-4">
                  <p className="text-xs text-muted">
                    Delivery by {proposal.deliveryDate} · {proposal.deliveryDays} working day
                    {proposal.deliveryDays === 1 ? '' : 's'} · {proposal.revisionsIncluded} round
                    {proposal.revisionsIncluded === 1 ? '' : 's'} of revisions included
                  </p>
                  <div>
                    <p className="card-title">What is included</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      {proposal.included.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="card-title">What is not included</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                      {proposal.exclusions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-panel-2 p-3 text-xs">
                    {proposal.text}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => copy('proposal', proposal.text)}
                    >
                      {copied === 'proposal' ? 'Copied' : 'Copy proposal'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => copy('terms', proposal.scopeTerms)}
                    >
                      {copied === 'terms' ? 'Copied' : 'Copy scope terms'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="card">
              <h3 className="font-semibold">Make it an order</h3>
              <p className="hint mt-1">
                {proposal
                  ? 'Creates a project at this price with the proposal terms, ready for scope extraction.'
                  : 'Creates a project at this price. Write the proposal first and its terms come along.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="input w-56"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Client name"
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={addAsOrder}
                  disabled={pending || Boolean(orderProjectId)}
                >
                  {busy === 'order' ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Adding...
                    </>
                  ) : orderProjectId ? (
                    'Added'
                  ) : (
                    'Add as order'
                  )}
                </button>
                {orderProjectId ? (
                  <Link href="/orders" className="text-sm text-accent hover:underline">
                    See it in Orders →
                  </Link>
                ) : null}
              </div>
            </div>

            <details className="card group">
              <summary className="flex cursor-pointer select-none items-center gap-2 font-semibold">
                <svg
                  className="transition group-open:rotate-90"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
                Why this price
              </summary>
              <p className="mt-2 text-sm">{quote.rationale}</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>{quote.rateNote}</li>
                <li>{quote.riskNote}</li>
                <li>{quote.marketNote}</li>
              </ul>
            </details>

            <details className="card group">
              <summary className="flex cursor-pointer select-none items-center gap-2 font-semibold">
                <svg
                  className="transition group-open:rotate-90"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
                Sources
              </summary>
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
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
