/**
 * All money math for Tally lives here (PRD section 7).
 *
 * Amounts are integer cents so no float drift creeps into quotes or change
 * orders. Rates are cents per hour; hours may be fractional.
 *
 * The LLM never does arithmetic - it only extracts numbers and explains.
 */

export interface ChangeOrderItem {
  name?: string;
  /** Estimated hours of extra work for this line item. */
  estHours: number;
}

export interface ChangeOrderTotals {
  totalHours: number;
  /** What to bill the client (gross - the platform fee is already included). */
  totalCents: number;
  /** What the freelancer keeps after the platform fee. */
  netCents: number;
  /** Effective net rate in cents per hour. */
  netHourlyCents: number;
}

function assertFeePercent(feePercent: number): void {
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent >= 100) {
    throw new RangeError(`feePercent must be between 0 and 99.99, got ${feePercent}`);
  }
}

function assertHours(hours: number): void {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new RangeError(`hours must be greater than 0, got ${hours}`);
  }
}

function assertNonNegativeCents(cents: number, label: string): void {
  if (!Number.isFinite(cents) || cents < 0) {
    throw new RangeError(`${label} must be a non-negative number of cents, got ${cents}`);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Gross price to charge so the freelancer keeps `netCents` after the platform
 * fee. Rounded up, so the fee can never eat into the net.
 */
export function feeAdjustedPrice(netCents: number, feePercent: number): number {
  assertFeePercent(feePercent);
  assertNonNegativeCents(netCents, 'netCents');
  if (feePercent === 0) return Math.round(netCents);
  return Math.ceil(netCents / (1 - feePercent / 100) - 1e-9);
}

/** What the freelancer actually keeps per hour, in cents. */
export function netHourlyRate(grossCents: number, hours: number, feePercent: number): number {
  assertFeePercent(feePercent);
  assertHours(hours);
  assertNonNegativeCents(grossCents, 'grossCents');
  return round2((grossCents * (1 - feePercent / 100)) / hours);
}

/**
 * Target gross price for `hours` of work at the freelancer's rate, never
 * priced below their floor (minimum acceptable rate), fee included.
 */
export function floorProtectedTargetPrice(
  hours: number,
  hourlyRateCents: number,
  minHourlyRateCents: number,
  feePercent: number,
): number {
  assertFeePercent(feePercent);
  assertHours(hours);
  assertNonNegativeCents(hourlyRateCents, 'hourlyRateCents');
  assertNonNegativeCents(minHourlyRateCents, 'minHourlyRateCents');
  const effectiveRate = Math.max(hourlyRateCents, minHourlyRateCents);
  return feeAdjustedPrice(Math.ceil(hours * effectiveRate), feePercent);
}

/** Total for a priced change order: hours x rate, then fee-adjusted. */
export function changeOrderTotal(
  items: ChangeOrderItem[],
  hourlyRateCents: number,
  feePercent: number,
): ChangeOrderTotals {
  assertFeePercent(feePercent);
  assertNonNegativeCents(hourlyRateCents, 'hourlyRateCents');
  const totalHours = round2(items.reduce((sum, item) => sum + (item.estHours ?? 0), 0));
  if (totalHours <= 0) {
    return { totalHours: 0, totalCents: 0, netCents: 0, netHourlyCents: 0 };
  }
  const netCents = Math.ceil(totalHours * hourlyRateCents);
  const totalCents = feeAdjustedPrice(netCents, feePercent);
  return { totalHours, totalCents, netCents, netHourlyCents: netHourlyRate(totalCents, totalHours, feePercent) };
}

export interface QuoteInput {
  hours: number;
  baseHourlyRateCents: number;
  minHourlyRateCents: number;
  feePercent: number;
  /** Extra percent added because this client keeps pushing the scope. */
  riskPaddingPercent?: number;
  /** Market hourly rate from the sources, already in the rate card currency. */
  marketLowHourlyCents?: number | null;
  marketHighHourlyCents?: number | null;
}

export interface QuoteTotals {
  hours: number;
  /** The lowest acceptable price: the floor rate with the fee included. */
  floorCents: number;
  lowCents: number;
  /** The recommended price. */
  targetCents: number;
  highCents: number;
  /** What the freelancer keeps from the recommended price. */
  netCents: number;
  /** The effective net hourly rate of the recommended price. */
  netHourlyCents: number;
  /** True when the recommended price keeps the net rate at or above the floor. */
  floorRespected: boolean;
  /** The cents the risk padding added on top of the plain rate. */
  riskPaddingCents: number;
}

/**
 * Price a gig (PRD F3). The rate card decides the number, the floor is never
 * broken and the market range only widens the band around it.
 */
export function quotePricing(input: QuoteInput): QuoteTotals {
  assertFeePercent(input.feePercent);
  assertHours(input.hours);
  assertNonNegativeCents(input.baseHourlyRateCents, 'baseHourlyRateCents');
  assertNonNegativeCents(input.minHourlyRateCents, 'minHourlyRateCents');

  const padding = Math.max(0, input.riskPaddingPercent ?? 0);
  const effectiveRate = Math.max(input.baseHourlyRateCents, input.minHourlyRateCents);

  const floorNet = Math.ceil(input.hours * input.minHourlyRateCents);
  const floorCents = feeAdjustedPrice(floorNet, input.feePercent);

  const baseNet = Math.ceil(input.hours * effectiveRate);
  const paddedNet = Math.ceil(baseNet * (1 + padding / 100));
  const targetCents = feeAdjustedPrice(paddedNet, input.feePercent);

  const marketLow = input.marketLowHourlyCents
    ? Math.round(input.hours * input.marketLowHourlyCents)
    : 0;
  const marketHigh = input.marketHighHourlyCents
    ? Math.round(input.hours * input.marketHighHourlyCents)
    : 0;

  const lowCents = Math.max(floorCents, marketLow);
  const highCents = Math.max(targetCents, marketHigh);

  return {
    hours: input.hours,
    floorCents,
    lowCents,
    targetCents,
    highCents,
    netCents: paddedNet,
    netHourlyCents: netHourlyRate(targetCents, input.hours, input.feePercent),
    floorRespected: netHourlyRate(targetCents, input.hours, input.feePercent) >= input.minHourlyRateCents,
    riskPaddingCents: targetCents - feeAdjustedPrice(baseNet, input.feePercent),
  };
}

/** Extra percent added to a quote for a client with a bad track record. */
export function riskPaddingPercent(level: 'none' | 'low' | 'medium' | 'high'): number {
  if (level === 'high') return 15;
  if (level === 'medium') return 8;
  return 0;
}

/** Human-readable amount, e.g. 125000 cents -> "$1,250.00". */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
