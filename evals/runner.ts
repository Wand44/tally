/**
 * The eval runner (PRD section 8).
 *
 * Runs every labelled case through the verdict step with both model tiers and
 * prints an accuracy / citation / latency / token table.
 *
 *   npm run eval
 *
 * With NEBIUS_API_KEY, NEBIUS_BASE_URL, MODEL_FAST and MODEL_SMART set, the two
 * rows are the two real models. Without them both rows are the deterministic
 * rule set in lib/offline-provider.ts, which is not a model - the table says so.
 */
import { completeJson, isLlmConfigured } from '../lib/llm';
import { validateCitations } from '../lib/guardian';
import { verdictSystem, verdictUser } from '../lib/prompts/verdict';
import { verdictSchema } from '../lib/schemas';
import { cases, type EvalCase, type EvalVerdict } from './cases';
import { buildScopeClauses } from './scope';

interface Miss {
  id: string;
  kind: EvalCase['kind'];
  expected: EvalVerdict;
  got: string;
  note: string;
}

interface TierReport {
  tier: 'fast' | 'smart';
  model: string;
  provider: string;
  total: number;
  correct: number;
  citationValid: number;
  injectionSafe: number;
  injectionTotal: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  misses: Miss[];
}

async function runTier(tier: 'fast' | 'smart'): Promise<TierReport> {
  const report: TierReport = {
    tier,
    model: tier === 'fast' ? (process.env.MODEL_FAST ?? 'offline-rules') : (process.env.MODEL_SMART ?? 'offline-rules'),
    provider: 'offline',
    total: 0,
    correct: 0,
    citationValid: 0,
    injectionSafe: 0,
    injectionTotal: 0,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    misses: [],
  };

  for (const testCase of cases) {
    report.total += 1;
    const { clauses, includedRevisions } = buildScopeClauses(testCase.scope);

    try {
      const result = await completeJson({
        task: 'verdict',
        tier,
        schema: verdictSchema,
        system: verdictSystem,
        user: verdictUser({
          message: testCase.client_message,
          clauses,
          revisionsUsed: testCase.prior_revisions,
          includedRevisions,
        }),
        offline: {
          message: testCase.client_message,
          clauses,
          revisionsUsed: testCase.prior_revisions,
          includedRevisions,
        },
      });

      report.provider = result.provider;
      report.model = result.model;
      report.latencyMs += result.latencyMs;
      report.promptTokens += result.usage?.promptTokens ?? 0;
      report.completionTokens += result.usage?.completionTokens ?? 0;

      const got = result.data.verdict;
      if (got === testCase.expected_verdict) report.correct += 1;
      else {
        report.misses.push({
          id: testCase.id,
          kind: testCase.kind,
          expected: testCase.expected_verdict,
          got,
          note: testCase.note,
        });
      }

      if (validateCitations(result.data, clauses).ok) report.citationValid += 1;

      if (testCase.kind === 'injection') {
        report.injectionTotal += 1;
        if (got === testCase.expected_verdict) report.injectionSafe += 1;
      }
    } catch (error) {
      report.misses.push({
        id: testCase.id,
        kind: testCase.kind,
        expected: testCase.expected_verdict,
        got: `error: ${(error as Error).message}`,
        note: testCase.note,
      });
      if (testCase.kind === 'injection') report.injectionTotal += 1;
    }
  }

  return report;
}

function percent(part: number, total: number): string {
  if (total === 0) return 'n/a';
  return `${part}/${total} (${Math.round((part / total) * 100)}%)`;
}

function printTable(reports: TierReport[]): void {
  console.log('| Model | Verdict accuracy | Citation valid | Injection safe | Avg latency | Tokens (prompt+completion) |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const report of reports) {
    console.log(
      `| ${report.model} (${report.tier}) | ${percent(report.correct, report.total)} | ${percent(report.citationValid, report.total)} | ${percent(report.injectionSafe, report.injectionTotal)} | ${Math.round(report.latencyMs / report.total)} ms | ${report.promptTokens + report.completionTokens} (${report.promptTokens}+${report.completionTokens}) |`,
    );
  }
}

async function main(): Promise<void> {
  const configured = isLlmConfigured();
  if (!configured) {
    console.warn(
      'No NEBIUS_API_KEY / NEBIUS_BASE_URL / MODEL_FAST / MODEL_SMART found.\n' +
        'Both rows below are the deterministic rule set in lib/offline-provider.ts, not a model.\n',
    );
  }

  const reports: TierReport[] = [];
  for (const tier of ['fast', 'smart'] as const) {
    reports.push(await runTier(tier));
    process.stdout.write('.');
  }
  console.log('\n');

  console.log(`Tally eval - ${cases.length} labelled scope cases\n`);
  printTable(reports);

  const oneModel = new Set(reports.map((report) => report.model)).size === 1;
  for (const report of reports) {
    if (report.misses.length === 0) continue;
    // Without credentials both tiers are the same fallback rules, so the misses
    // would be printed twice.
    if (oneModel && report !== reports[0]) continue;
    console.log(`\nMisses for ${report.model}:`);
    for (const miss of report.misses) {
      console.log(`  - ${miss.id} [${miss.kind}] expected ${miss.expected}, got ${miss.got} (${miss.note})`);
    }
  }

  // PRD section 8: injection cases must not flip the verdict.
  const flipped = reports.flatMap((report) =>
    report.misses
      .filter((miss) => miss.kind === 'injection')
      .map((miss) => `${report.model}: ${miss.id} expected ${miss.expected}, got ${miss.got}`),
  );

  if (flipped.length > 0) {
    console.error(`\nInjection check FAILED:\n  ${flipped.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nInjection check passed: no injection case flipped a verdict.');
}

main();
