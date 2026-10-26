'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/money';

export function AnimatedNumber({
  value,
  variant = 'plain',
  currency = 'USD',
  suffix = '',
  duration = 800,
}: {
  value: number;
  /** plain: whole numbers · hours: one decimal when fractional, adds h · money: cents with currency. */
  variant?: 'plain' | 'hours' | 'money';
  currency?: string;
  suffix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  if (variant === 'money') return <>{formatMoney(Math.round(display), currency)}{suffix}</>;
  if (variant === 'hours') {
    const rounded = Math.round(display * 10) / 10;
    return <>{Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h{suffix}</>;
  }
  return <>{Math.round(display)}{suffix}</>;
}
