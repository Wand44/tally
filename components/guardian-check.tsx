'use client';

import { useState, useTransition } from 'react';
import { runGuardianAction, sendChangeOrderAction, sendReplyAction } from '@/app/actions';
import { VerdictBadge } from '@/components/verdict-badge';
import type { GuardianOutcome } from '@/lib/guardian';
import { formatMoney } from '@/lib/money';
import { CardSkeleton, Skeleton } from '@/components/skeleton';

export interface GuardianProject {
  id: string;
  title: string;
  client: string;
}

const tones = [
  { id: 'warm', label: 'Warm' },
  { id: 'firm', label: 'Firm' },
  { id: 'two_options', label: 'Two options' },
] as const;

export function GuardianCheck({
  projects,
  defaultProjectId,
  initialMessage = '',
  useStored = false,
  currency,
}: {
  projects: GuardianProject[];
  defaultProjectId?: string;
  initialMessage?: string;
  /** Reuse the stored verdict when this message was checked before. */
  useStored?: boolean;
  currency: string;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [message, setMessage] = useState(initialMessage);
  const [outcome, setOutcome] = useState<GuardianOutcome | null>(null);
  const [error, setError] = useState('');
  const [sentOrder, setSentOrder] = useState(false);
  const [sentReplies, setSentReplies] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function check() {
    setError('');
    setOutcome(null);
    setSentOrder(false);
    setSentReplies([]);
    startTransition(async () => {
      const result = await runGuardianAction(projectId, message, { useStored });
      if (result.ok && result.outcome) setOutcome(result.outcome);
      else setError(result.message ?? 'Something went wrong.');
    });
  }

  function markSent(orderId: string) {
    startTransition(async () => {
      await sendChangeOrderAction(orderId);
      setSentOrder(true);
    });
  }

  function sendReply(verdictId: string, tone: string) {
    startTransition(async () => {
      await sendReplyAction(verdictId, tone as 'warm' | 'firm' | 'two_options');
      setSentReplies((current) => [...current, tone]);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="card lg:col-span-2">
        <h2 className="font-semibold">Paste a client message</h2>
        <p className="hint mt-1">
          Tally triages it, checks it against the stored scope and prices the extra work.
        </p>

        <label className="label mt-4" htmlFor="guardian-project">
          Project
        </label>
        <select
          id="guardian-project"
          className="input"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title} - {project.client}
            </option>
          ))}
        </select>

        <label className="label mt-4" htmlFor="guardian-message">
          Client message
        </label>
        <textarea
          id="guardian-message"
          className="input min-h-40"
          placeholder="Hey! Can you also add a small animation to the hero?"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        <button type="button" className="btn btn-primary mt-4 w-full" onClick={check} disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Checking...
            </>
          ) : (
            'Check this message'
          )}
        </button>
        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      </div>

      <div className="lg:col-span-3">
        {pending ? (
          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
            </div>
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : !outcome ? (
          <div className="card h-full">
            <p className="text-sm text-muted">
              No message checked yet. The verdict, the clauses it cites and a priced change order appear
              here.
            </p>
          </div>
        ) : outcome.noAction ? (
          <div className="card h-full">
            <span className="badge bg-panel-2 text-muted">No action needed</span>
            <p className="mt-3 text-sm font-medium">{outcome.summary}</p>
            <p className="mt-1 text-sm text-muted">
              This message does not ask for work, so there is nothing to price.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <VerdictBadge verdict={outcome.verdict ?? 'GRAY'} />
                <span className="text-xs text-muted">
                  {outcome.provider === 'offline'
                    ? 'Offline rules (no model configured)'
                    : outcome.provider === 'stored'
                      ? 'Stored verdict (no credits used)'
                      : 'Model analysis'}
                </span>
              </div>
              <p className="mt-3 text-sm">{outcome.reasoning}</p>
              {outcome.validationNote ? (
                <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">
                  {outcome.validationNote}
                </p>
              ) : null}
            </div>

            {outcome.citedClauses.length > 0 ? (
              <div className="card">
                <h3 className="font-semibold">Cited scope</h3>
                <ul className="mt-3 space-y-3">
                  {outcome.citedClauses.map((clause) => (
                    <li key={clause.ref} className="rounded-xl border border-line p-3">
                      <div className="flex items-center gap-2">
                        <span className="badge bg-accent-soft text-accent">{clause.ref}</span>
                        <span className="text-xs text-muted">{clause.category.replace('_', ' ')}</span>
                      </div>
                      <p className="mt-2 text-sm">&ldquo;{clause.text}&rdquo;</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {outcome.changeOrder ? (
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Change order</h3>
                  <span className="badge bg-panel-2 text-muted">
                    {sentOrder ? 'sent' : outcome.changeOrder.status}
                  </span>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {outcome.extraWorkItems.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="flex justify-between gap-4">
                      <span>{item.name}</span>
                      <span className="shrink-0 text-muted">{item.est_hours}h</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Hours</dt>
                    <dd className="font-medium">{outcome.changeOrder.totalHours}h</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Bill the client</dt>
                    <dd className="font-medium">
                      {formatMoney(outcome.changeOrder.totalCents, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">You keep</dt>
                    <dd className="font-medium">{formatMoney(outcome.changeOrder.netCents, currency)}</dd>
                  </div>
                </dl>
                {!sentOrder ? (
                  <button
                    type="button"
                    className="btn btn-primary mt-4"
                    onClick={() => markSent(outcome.changeOrder!.id)}
                    disabled={pending}
                  >
                    Mark as sent
                  </button>
                ) : null}
              </div>
            ) : null}

            {outcome.replies ? (
              <div className="card">
                <h3 className="font-semibold">Reply drafts</h3>
                <p className="hint">Client-facing only. No internal notes go out.</p>
                <div className="mt-3 space-y-3">
                  {tones.map((tone) => {
                    const draft = outcome.replies![tone.id];
                    if (!draft) return null;
                    const sent = sentReplies.includes(tone.id);
                    return (
                      <div key={tone.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted">
                            {tone.label}
                          </span>
                          <span className="flex gap-2">
                            <button
                              type="button"
                              className="btn px-2 py-1 text-xs"
                              onClick={() => navigator.clipboard?.writeText(draft)}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              className="btn px-2 py-1 text-xs"
                              onClick={() => sendReply(outcome.verdictId, tone.id)}
                              disabled={sent || pending}
                            >
                              {sent ? 'Sent' : 'Send'}
                            </button>
                          </span>
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-line">{draft}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
