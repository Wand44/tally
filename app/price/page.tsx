import { eq } from 'drizzle-orm';
import { Pricer } from '@/components/pricer';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { getWorkspace } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function PricePage({
  searchParams,
}: {
  searchParams: Promise<{ gig?: string }>;
}) {
  const { gig } = await searchParams;
  const db = getDb();
  const { clients, gigs } = schema;

  const workspace = await getWorkspace();
  const [gigRow] = gig
    ? await db.select().from(gigs).where(eq(gigs.id, gig)).limit(1)
    : [undefined];
  const clientRows = await db.select({ name: clients.name }).from(clients);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>Pricer</h1>
          <p className="mt-1 text-sm text-muted">
            Price a specific order: paste the gig, get a number you can defend, write the proposal
            and turn it into an order - all on one page.
          </p>
        </div>

        {!workspace?.rateCard ? (
          <div className="card mt-6">
            <p className="text-sm">Set up your rate card first, then Tally can price with it.</p>
          </div>
        ) : (
          <div className="mt-6">
            <Pricer
              gigId={gigRow?.id ?? null}
              initialTitle={gigRow?.title ?? ''}
              initialDescription={gigRow?.snippet ?? ''}
              initialHours={gigRow?.estHours ?? null}
              clients={clientRows.map((row) => row.name)}
              currency={workspace.rateCard.currency}
              floorHourlyCents={workspace.rateCard.minHourlyRateCents}
            />
          </div>
        )}
      </main>
    </>
  );
}
