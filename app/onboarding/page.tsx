import { RateCardForm } from '@/components/rate-card-form';
import { SiteHeader } from '@/components/site-header';
import { getWorkspace } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const workspace = await getWorkspace();
  const profile = workspace?.profile;
  const rateCard = workspace?.rateCard;
  const skills: string[] = profile ? JSON.parse(profile.skills) : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>
            {profile ? 'Your rate' : 'Welcome to Tally'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your base rate, your floor and the platform fee drive every quote and every change order. Set them once and
            Tally does the maths for you.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="card">
            <RateCardForm
              defaults={{
                name: profile?.name ?? '',
                skills: skills.join(', '),
                experienceLevel: profile?.experienceLevel ?? 'intermediate',
                baseHourlyRate: rateCard ? String(rateCard.baseHourlyRateCents / 100) : '',
                minHourlyRate: rateCard ? String(rateCard.minHourlyRateCents / 100) : '',
                feePercent: rateCard ? String(rateCard.feePercent) : '20',
                currency: rateCard?.currency ?? profile?.currency ?? 'USD',
                typicalWeeklyHours: String(profile?.typicalWeeklyHours ?? 40),
              }}
            />
          </div>

          <aside className="space-y-4">
            <div className="card">
              <h2 className="font-semibold">How Tally uses this</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>
                  <strong className="text-fg">Quotes</strong> are grossed up so your net never drops below your base
                  rate.
                </li>
                <li>
                  <strong className="text-fg">Extra work</strong> found in client messages is priced with the same
                  rate card.
                </li>
                <li>
                  <strong className="text-fg">Your floor</strong> is the lowest rate Tally will ever quote.
                </li>
              </ul>
            </div>
            <div className="card">
              <h2 className="font-semibold">Privacy</h2>
              <p className="mt-2 text-sm text-muted">
                Everything you enter stays in this app&apos;s database. Nothing is shared with marketplaces.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
