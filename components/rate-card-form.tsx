'use client';

import { useActionState, useState } from 'react';
import { saveRateCard, type RateCardState } from '@/app/actions';
import { floorProtectedTargetPrice, formatMoney, netHourlyRate } from '@/lib/money';

const initialState: RateCardState = { ok: false };

const PREVIEW_HOURS = 10;

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
        <div>
          <label className="label" htmlFor="baseHourlyRate">
            Base hourly rate
          </label>
          <input
            id="baseHourlyRate"
            name="baseHourlyRate"
            className="input"
            type="number"
            step="any"
            min="0"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            required
          />
          <p className="hint">What you normally charge per hour.</p>
          {error('baseHourlyRate') ? <p className="hint text-bad">{error('baseHourlyRate')}</p> : null}
        </div>

        <div>
          <label className="label" htmlFor="minHourlyRate">
            Minimum acceptable rate
          </label>
          <input
            id="minHourlyRate"
            name="minHourlyRate"
            className="input"
            type="number"
            step="any"
            min="0"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            required
          />
          <p className="hint">Your floor. Tally never prices a job below it.</p>
          {error('minHourlyRate') ? <p className="hint text-bad">{error('minHourlyRate')}</p> : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="feePercent">
            Platform fee (%)
          </label>
          <input
            id="feePercent"
            name="feePercent"
            className="input"
            type="number"
            step="0.5"
            min="0"
            max="99"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            required
          />
          <p className="hint">20 is typical for marketplaces.</p>
          {error('feePercent') ? <p className="hint text-bad">{error('feePercent')}</p> : null}
        </div>

        <div>
          <label className="label" htmlFor="typicalWeeklyHours">
            Typical weekly hours
          </label>
          <input
            id="typicalWeeklyHours"
            name="typicalWeeklyHours"
            className="input"
            type="number"
            step="1"
            min="1"
            max="80"
            defaultValue={defaults.typicalWeeklyHours}
            required
          />
          {error('typicalWeeklyHours') ? <p className="hint text-bad">{error('typicalWeeklyHours')}</p> : null}
        </div>
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
