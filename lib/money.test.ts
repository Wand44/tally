import { describe, expect, it } from 'vitest';
import {
  changeOrderTotal,
  feeAdjustedPrice,
  floorProtectedTargetPrice,
  formatMoney,
  netHourlyRate,
  quotePricing,
  riskPaddingPercent,
} from './money';

describe('feeAdjustedPrice', () => {
  it('returns the same amount when there is no fee', () => {
    expect(feeAdjustedPrice(10_000, 0)).toBe(10_000);
  });

  it(' grosses up so the freelancer keeps the net after the fee', () => {
    // $100 net with a 20% fee -> bill $125.
    expect(feeAdjustedPrice(10_000, 20)).toBe(12_500);
    expect(feeAdjustedPrice(10_000, 30)).toBe(14_286);
  });

  it('rounds up so the fee never eats into the net', () => {
    const gross = feeAdjustedPrice(10_000, 15);
    expect(gross).toBe(11_765);
    expect(gross * (1 - 0.15)).toBeGreaterThanOrEqual(10_000);
  });

  it('rejects a fee that would leave nothing (>= 100%)', () => {
    expect(() => feeAdjustedPrice(10_000, 100)).toThrow(RangeError);
    expect(() => feeAdjustedPrice(10_000, -1)).toThrow(RangeError);
  });

  it('rejects negative amounts', () => {
    expect(() => feeAdjustedPrice(-1, 20)).toThrow(RangeError);
  });
});

describe('netHourlyRate', () => {
  it('returns the gross rate when there is no fee', () => {
    expect(netHourlyRate(20_000, 4, 0)).toBe(5_000);
  });

  it('keeps only the part left after the fee', () => {
    // Bill $125 for 2h with a 20% fee -> $50/h kept.
    expect(netHourlyRate(12_500, 2, 20)).toBe(5_000);
  });

  it('handles fractional hours', () => {
    expect(netHourlyRate(12_500, 2.5, 20)).toBe(4_000);
  });

  it('rejects zero or negative hours instead of dividing by zero', () => {
    expect(() => netHourlyRate(12_500, 0, 20)).toThrow(RangeError);
    expect(() => netHourlyRate(12_500, -1, 20)).toThrow(RangeError);
  });
});

describe('floorProtectedTargetPrice', () => {
  it('prices at the base rate when the rate is above the floor', () => {
    // 10h at $45/h = $450 net -> bill $562.50 with a 20% fee.
    expect(floorProtectedTargetPrice(10, 4_500, 3_000, 20)).toBe(56_250);
  });

  it('raises the price to the floor when the base rate is below it', () => {
    // Base rate $20/h is under the $30/h floor -> price at $30/h.
    const target = floorProtectedTargetPrice(10, 2_000, 3_000, 20);
    expect(target).toBe(feeAdjustedPrice(30_000, 20));
    expect(target).toBe(37_500);
  });

  it('is a no-op on the floor when there is no fee', () => {
    expect(floorProtectedTargetPrice(10, 4_500, 3_000, 0)).toBe(45_000);
    expect(floorProtectedTargetPrice(10, 2_000, 3_000, 0)).toBe(30_000);
  });

  it('never nets below the minimum rate, whatever the inputs', () => {
    const cases: Array<[number, number, number, number]> = [
      [1, 4_500, 3_000, 20],
      [7.5, 4_500, 3_000, 15],
      [3, 2_000, 3_000, 30],
      [12.25, 3_333, 3_000, 7.5],
      [40, 1_000, 2_500, 25],
    ];
    for (const [hours, rate, floor, fee] of cases) {
      const target = floorProtectedTargetPrice(hours, rate, floor, fee);
      expect(netHourlyRate(target, hours, fee)).toBeGreaterThanOrEqual(floor - 0.01);
    }
  });

  it('rejects invalid hours', () => {
    expect(() => floorProtectedTargetPrice(0, 4_500, 3_000, 20)).toThrow(RangeError);
  });
});

describe('changeOrderTotal', () => {
  it('totals the items, then grosses up for the fee', () => {
    const totals = changeOrderTotal(
      [
        { name: 'Extra hero section', estHours: 2 },
        { name: 'Two extra exports', estHours: 1.5 },
      ],
      4_500,
      20,
    );
    expect(totals.totalHours).toBe(3.5);
    expect(totals.netCents).toBe(15_750);
    expect(totals.totalCents).toBe(feeAdjustedPrice(15_750, 20));
    expect(totals.netHourlyCents).toBeGreaterThanOrEqual(4_500);
  });

  it('bills the same as net when there is no fee', () => {
    const totals = changeOrderTotal([{ estHours: 2 }], 4_500, 0);
    expect(totals.totalCents).toBe(9_000);
    expect(totals.netCents).toBe(9_000);
    expect(totals.netHourlyCents).toBe(4_500);
  });

  it('returns zeroes for an empty change order', () => {
    expect(changeOrderTotal([], 4_500, 20)).toEqual({
      totalHours: 0,
      totalCents: 0,
      netCents: 0,
      netHourlyCents: 0,
    });
  });

  it('rejects a fee that would leave nothing', () => {
    expect(() => changeOrderTotal([{ estHours: 1 }], 4_500, 100)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats cents as currency', () => {
    expect(formatMoney(125_000)).toBe('$1,250.00');
    expect(formatMoney(12_500, 'EUR')).toBe('€125.00');
  });
});

describe('quotePricing', () => {
  it('prices at the base rate and grosses up for the fee', () => {
    // 10h at $45/h = $450 net -> bill $562.50 with a 20% fee.
    const totals = quotePricing({
      hours: 10,
      baseHourlyRateCents: 4_500,
      minHourlyRateCents: 3_000,
      feePercent: 20,
    });
    expect(totals.targetCents).toBe(56_250);
    expect(totals.netCents).toBe(45_000);
    expect(totals.netHourlyCents).toBe(4_500);
    expect(totals.floorCents).toBe(37_500);
    expect(totals.floorRespected).toBe(true);
    expect(totals.riskPaddingCents).toBe(0);
  });

  it('raises the price to the floor when the base rate is under it', () => {
    const totals = quotePricing({
      hours: 10,
      baseHourlyRateCents: 2_000,
      minHourlyRateCents: 3_000,
      feePercent: 20,
    });
    expect(totals.netHourlyCents).toBeGreaterThanOrEqual(3_000);
    expect(totals.floorRespected).toBe(true);
  });

  it('never nets below the minimum rate, whatever the inputs', () => {
    const hours = [1, 2.5, 7, 13.25, 40];
    const fees = [0, 5, 20, 35];
    const rates: Array<[number, number]> = [
      [4_500, 3_000],
      [2_000, 3_000],
      [12_000, 3_000],
      [3_333, 3_333],
      [1_000, 2_500],
    ];

    for (const h of hours) {
      for (const fee of fees) {
        for (const [base, min] of rates) {
          const totals = quotePricing({
            hours: h,
            baseHourlyRateCents: base,
            minHourlyRateCents: min,
            feePercent: fee,
          });
          expect(totals.netHourlyCents).toBeGreaterThanOrEqual(min);
          expect(totals.floorRespected).toBe(true);
        }
      }
    }
  });

  it('keeps the range ordered: low, target, high', () => {
    const totals = quotePricing({
      hours: 8,
      baseHourlyRateCents: 4_500,
      minHourlyRateCents: 3_000,
      feePercent: 20,
      marketLowHourlyCents: 2_000,
      marketHighHourlyCents: 9_000,
    });
    expect(totals.lowCents).toBeLessThanOrEqual(totals.targetCents);
    expect(totals.targetCents).toBeLessThanOrEqual(totals.highCents);
  });

  it('never lets a cheap market rate pull the low below the floor', () => {
    const totals = quotePricing({
      hours: 10,
      baseHourlyRateCents: 4_500,
      minHourlyRateCents: 3_000,
      feePercent: 20,
      marketLowHourlyCents: 1_000,
      marketHighHourlyCents: 9_000,
    });
    expect(totals.lowCents).toBe(totals.floorCents);
    expect(totals.highCents).toBe(90_000);
  });

  it('adds the risk padding on top of the plain rate', () => {
    const plain = quotePricing({
      hours: 10,
      baseHourlyRateCents: 4_500,
      minHourlyRateCents: 3_000,
      feePercent: 20,
    });
    const risky = quotePricing({
      hours: 10,
      baseHourlyRateCents: 4_500,
      minHourlyRateCents: 3_000,
      feePercent: 20,
      riskPaddingPercent: 15,
    });
    expect(risky.targetCents).toBeGreaterThan(plain.targetCents);
    expect(risky.riskPaddingCents).toBeGreaterThan(0);
    expect(risky.netHourlyCents).toBeGreaterThanOrEqual(3_000);
  });

  it('rejects invalid input', () => {
    expect(() =>
      quotePricing({
        hours: 0,
        baseHourlyRateCents: 4_500,
        minHourlyRateCents: 3_000,
        feePercent: 20,
      }),
    ).toThrow(RangeError);
    expect(() =>
      quotePricing({
        hours: 2,
        baseHourlyRateCents: 4_500,
        minHourlyRateCents: 3_000,
        feePercent: 100,
      }),
    ).toThrow(RangeError);
  });
});

describe('riskPaddingPercent', () => {
  it('pads more the riskier the client is', () => {
    expect(riskPaddingPercent('high')).toBeGreaterThan(riskPaddingPercent('medium'));
    expect(riskPaddingPercent('medium')).toBeGreaterThan(riskPaddingPercent('low'));
    expect(riskPaddingPercent('low')).toBe(0);
    expect(riskPaddingPercent('none')).toBe(0);
  });
});
