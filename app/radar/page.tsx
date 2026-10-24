import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { RadarBoard } from '@/components/radar-board';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { getWorkspace } from '@/lib/dashboard';
import type { RadarGig } from '@/lib/radar';

export const dynamic = 'force-dynamic';

export default async function RadarPage() {
  const db = getDb();
  const { gigs } = schema;
  const workspace = await getWorkspace();
  const skills = workspace?.profile
    ? (JSON.parse(workspace.profile.skills || '[]') as string[])
    : [];

  // The shortlist from the last run, so the page is never empty on a revisit.
  const rows = workspace?.profile
    ? await db
        .select()
        .from(gigs)
        .where(eq(gigs.profileId, workspace.profile.id))
        .orderBy(desc(gigs.score))
    : [];

  const initialGigs: (RadarGig & { id: string })[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    budgetMinCents: row.budgetMinCents,
    budgetMaxCents: row.budgetMaxCents,
    budgetCurrency: row.budgetCurrency,
    estHours: row.estHours,
    requirements: JSON.parse(row.requirements || '[]') as string[],
    redFlags: JSON.parse(row.redFlags || '[]') as string[],
    fitScore: row.fitScore,
    budgetScore: row.budgetScore,
    score: row.score,
    impliedHourlyCents: row.impliedHourlyCents,
  }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>Radar</h1>
          <p className="mt-1 text-sm text-muted">
            Public gig postings, ranked by fit to your skills and by whether the budget clears your
            floor. Every result links to the posting it came from.
          </p>
        </div>

        {!workspace?.rateCard ? (
          <div className="card mt-6">
            <p className="text-sm">Set up your rate card first, then Radar can rank gigs against it.</p>
            <Link href="/onboarding" className="btn btn-primary mt-3">
              Set up the rate card
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <RadarBoard
              defaultQuery={skills.join(' ')}
              initialGigs={initialGigs}
              currency={workspace.rateCard.currency}
              floorHourlyCents={workspace.rateCard.minHourlyRateCents}
            />
          </div>
        )}
      </main>
    </>
  );
}
