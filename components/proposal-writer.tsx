'use client';

import { useState, useTransition } from 'react';
import { generateProposalAction } from '@/app/actions';
import { formatMoney } from '@/lib/money';
import type { Proposal, ProposalTone } from '@/lib/proposals';

const tones: { id: ProposalTone; label: string }[] = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
];

export function ProposalWriter({
  quoteId,
  title,
  hours,
  priceCents,
  currency,
}: {
  quoteId: string;
  title: string;
  hours: number;
  priceCents: number;
  currency: string;
}) {
  const [tone, setTone] = useState<ProposalTone>('friendly');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [pending, startTransition] = useTransition();

  function write() {
    setError('');
    startTransition(async () => {
      const result = await generateProposalAction({ quoteId, tone });
      if (result.ok && result.proposal) setProposal(result.proposal);
      else setError(result.message ?? 'Something went wrong.');
    });
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card lg:col-span-2">
        <h2 className="font-semibold">The gig</h2>
        <p className="hint mt-1">{title}</p>

        <div className="mt-4 rounded-xl bg-panel-soft px-3 py-2 text-sm">
          <p className="font-medium">Price {formatMoney(priceCents, currency)}</p>
          <p className="mt-1 text-xs text-muted">
            {hours}h of work. The proposal repeats this price - the model never writes a number.
          </p>
        </div>

        <p className="label mt-5">Tone</p>
        <div className="mt-2 flex gap-2">
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

        <button type="button" className="btn btn-primary mt-5 w-full" onClick={write} disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Writing...
            </>
          ) : (
            'Write the proposal'
          )}
        </button>
        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      </div>

      <div className="lg:col-span-3">
        {!proposal ? (
          <div className="card h-full">
            <p className="text-sm text-muted">
              The proposal appears here: the intro, what is included, the explicit exclusions and the
              revision limit, plus the price and the delivery date.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="card-title">Price</p>
                  <p className="stat-value">{formatMoney(proposal.priceCents, proposal.currency)}</p>
                </div>
                <span className="badge bg-good-soft text-good">
                  {proposal.deliveryDays} working day{proposal.deliveryDays === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                Delivery by {proposal.deliveryDate} · {proposal.revisionsIncluded} round
                {proposal.revisionsIncluded === 1 ? '' : 's'} of revisions included
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold">{proposal.title}</h3>
              <p className="mt-2 text-sm">{proposal.intro}</p>

              <p className="card-title mt-4">What is included</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {proposal.included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <p className="card-title mt-4">What is not included</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {proposal.exclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <p className="mt-4 text-sm">{proposal.closing}</p>
            </div>

            <div className="card">
              <h3 className="font-semibold">Copy</h3>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-panel-soft p-3 text-xs">
                {proposal.text}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
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
              <p className="hint mt-2">
                The scope terms are what Tally reads when you paste them into a project.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
