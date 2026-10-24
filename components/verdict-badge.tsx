const styles = {
  IN: 'border-good/60 text-good',
  GRAY: 'border-warn/60 text-warn',
  OUT: 'border-bad/60 text-bad',
} as const;

const labels = {
  IN: 'In scope',
  GRAY: 'Grey area',
  OUT: 'Out of scope',
} as const;

export type Verdict = keyof typeof styles;

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`badge ${styles[verdict]}`}>{labels[verdict]}</span>;
}
