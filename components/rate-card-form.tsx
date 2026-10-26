'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { saveRateCard, type RateCardState } from '@/app/actions';
import { floorProtectedTargetPrice, formatMoney, netHourlyRate } from '@/lib/money';

const initialState: RateCardState = { ok: false };

const PREVIEW_HOURS = 10;

function StepNumberInput({
  id,
  name,
  label,
  hint,
  error,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const bump = (delta: number) => {
    const next = Math.max(0, Math.round(((Number(value) || 0) + delta) * 100) / 100);
    onChange(String(next));
  };

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          className="input pr-9"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <div className="absolute inset-y-1 right-1.5 flex flex-col justify-center gap-0.5">
          <button type="button" className="step-btn" aria-label={`Increase ${label}`} onClick={() => bump(1)}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <button type="button" className="step-btn" aria-label={`Decrease ${label}`} onClick={() => bump(-1)}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="hint text-bad">{error}</p> : null}
    </div>
  );
}

export function RateCardForm({
  defaults,
}: {
  defaults: {
    name: string;
    skills: string;
    experienceLevel: string;
    baseHourlyRate: string;
    minHourlyRate: string;
    feePercent: string;
    currency: string;
    typicalWeeklyHours: string;
  };
}) {
  const [state, formAction, pending] = useActionState(saveRateCard, initialState);
  const [base, setBase] = useState(defaults.baseHourlyRate);
  const [min, setMin] = useState(defaults.minHourlyRate);
  const [fee, setFee] = useState(defaults.feePercent);
  const [weekly, setWeekly] = useState(defaults.typicalWeeklyHours);
  const [currency, setCurrency] = useState(defaults.currency || 'USD');

  const baseCents = Math.round(Number(base || 0) * 100);
  const minCents = Math.round(Number(min || 0) * 100);
  const feePercent = Number(fee || 0);
  const floorApplies = baseCents > 0 && minCents > baseCents;
  const preview = (() => {
    if (!baseCents || !minCents || feePercent >= 100) return null;
    try {
      const target = floorProtectedTargetPrice(PREVIEW_HOURS, baseCents, minCents, feePercent);
      return { target, hourly: netHourlyRate(target, PREVIEW_HOURS, feePercent) };
    } catch {
      return null;
    }
  })();

  const error = (field: string) => state.errors?.[field];

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          className="input"
          defaultValue={defaults.name}
          placeholder="Nika Beridze"
          required
        />
        {error('name') ? <p className="hint text-bad">{error('name')}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="skills">
          Skills
        </label>
        <input
          id="skills"
          name="skills"
          className="input"
          defaultValue={defaults.skills}
          placeholder="3D modelling, Blender, Product rendering"
          required
        />
        <p className="hint">Comma separated. Used to match gigs and to write proposals.</p>
        {error('skills') ? <p className="hint text-bad">{error('skills')}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="experienceLevel">
            Experience level
          </label>
          <select
            id="experienceLevel"
            name="experienceLevel"
            className="input"
            defaultValue={defaults.experienceLevel || 'intermediate'}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
          {error('experienceLevel') ? <p className="hint text-bad">{error('experienceLevel')}</p> : null}
        </div>

        <div>
          <label className="label" htmlFor="currency">
            Currency
          </label>
          <select id="currency" name="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="USD">USD - $</option>
            <option value="EUR">EUR - €</option>
            <option value="GBP">GBP - £</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <StepNumberInput
          id="baseHourlyRate"
          name="baseHourlyRate"
          label="Base hourly rate"
          hint="What you normally charge per hour."
          error={error('baseHourlyRate')}
          value={base}
          onChange={setBase}
        />

        <StepNumberInput
          id="minHourlyRate"
          name="minHourlyRate"
          label="Minimum acceptable rate"
          hint="Your floor. Tally never prices a job below it."
          error={error('minHourlyRate')}
          value={min}
          onChange={setMin}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <StepNumberInput
          id="feePercent"
          name="feePercent"
          label="Platform fee (%)"
          hint="20 is typical for marketplaces."
          error={error('feePercent')}
          value={fee}
          onChange={setFee}
        />

        <StepNumberInput
          id="typicalWeeklyHours"
          name="typicalWeeklyHours"
          label="Typical weekly hours"
          error={error('typicalWeeklyHours')}
          value={weekly}
          onChange={setWeekly}
        />
      </div>

      {preview ? (
        <div className="rounded-xl border border-line bg-panel-2 p-4">
          <p className="text-xs font-medium text-muted">Preview</p>
          <p className="mt-1 text-sm">
            A {PREVIEW_HOURS}h job: quote{' '}
            <strong>{formatMoney(preview.target, currency)}</strong> to keep{' '}
            <strong>{formatMoney(preview.hourly, currency)}/h</strong> after the {feePercent}% fee.
          </p>
          {floorApplies ? (
            <p className="mt-1 text-xs text-warn">
              Your floor of {formatMoney(minCents, currency)}/h is above your base rate, so Tally will price at the
              floor.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.message ? <p className="text-sm text-bad">{state.message}</p> : null}

      <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? 'Saving...' : 'Save rate card'}
      </button>
    </form>
  );
}
