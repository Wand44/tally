import { describe, expect, it } from 'vitest';
import { computeClientRisk, rankClientsByRisk, type ClientSignal } from './dashboard';

function signal(overrides: Partial<ClientSignal> = {}): ClientSignal {
  return {
    clientId: 'client_1',
    name: 'Test Client',
    company: null,
    totalVerdicts: 0,
    outVerdicts: 0,
    grayVerdicts: 0,
    changeOrdersSent: 0,
    changeOrdersDraft: 0,
    changeOrdersDeclined: 0,
    extraHoursCaught: 0,
    extraCentsCaught: 0,
    lastActivityAt: null,
    ...overrides,
  };
}

describe('computeClientRisk', () => {
  it('has no risk signal for a client without any checks', () => {
    const risk = computeClientRisk(signal());
    expect(risk.level).toBe('none');
    expect(risk.score).toBe(0);
    expect(risk.creepRate).toBe(0);
  });

  it('flags a repeat-creep client as high risk', () => {
    const risk = computeClientRisk(
      signal({ totalVerdicts: 5, outVerdicts: 4, grayVerdicts: 1, extraHoursCaught: 9.5, changeOrdersSent: 3 }),
    );
    expect(risk.level).toBe('high');
    expect(risk.score).toBeGreaterThanOrEqual(60);
  });

  it('counts a gray verdict as half a creep', () => {
    const risk = computeClientRisk(signal({ totalVerdicts: 2, outVerdicts: 0, grayVerdicts: 1 }));
    expect(risk.creepRate).toBe(0.25);
  });

  it('keeps a client who stays inside the scope low risk', () => {
    const risk = computeClientRisk(signal({ totalVerdicts: 4, outVerdicts: 0, grayVerdicts: 0 }));
    expect(risk.level).toBe('low');
    expect(risk.creepRate).toBe(0);
  });

  it('raises the risk when a client refuses to pay for extra work', () => {
    const base = computeClientRisk(signal({ totalVerdicts: 2, outVerdicts: 1, extraHoursCaught: 2 }));
    const declined = computeClientRisk(
      signal({ totalVerdicts: 2, outVerdicts: 1, extraHoursCaught: 2, changeOrdersDeclined: 1 }),
    );
    expect(declined.score).toBeGreaterThan(base.score);
  });
});

describe('rankClientsByRisk', () => {
  it('puts the riskiest client first', () => {
    const ranked = rankClientsByRisk([
      signal({ clientId: 'a', name: 'Calm', totalVerdicts: 3, outVerdicts: 0 }),
      signal({ clientId: 'b', name: 'Repeat', totalVerdicts: 5, outVerdicts: 4, extraHoursCaught: 9 }),
      signal({ clientId: 'c', name: 'Mixed', totalVerdicts: 3, outVerdicts: 1, grayVerdicts: 1 }),
    ]);
    expect(ranked.map((client) => client.name)).toEqual(['Repeat', 'Mixed', 'Calm']);
  });

  it('keeps every client in the list', () => {
    const ranked = rankClientsByRisk([signal({ clientId: 'a' }), signal({ clientId: 'b' })]);
    expect(ranked).toHaveLength(2);
  });
});
