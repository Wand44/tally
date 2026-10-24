import type { RiskLevel } from '@/lib/dashboard';

const styles: Record<RiskLevel, string> = {
  high: 'border-bad/60 text-bad',
  medium: 'border-warn/60 text-warn',
  low: 'border-good/60 text-good',
  none: 'border-line text-muted',
};

const labels: Record<RiskLevel, string> = {
  high: 'High risk',
  medium: 'Watch',
  low: 'Low risk',
  none: 'No history',
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`badge ${styles[level]}`}>{labels[level]}</span>;
}
