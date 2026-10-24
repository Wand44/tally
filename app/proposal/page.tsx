import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { ProposalWriter } from '@/components/proposal-writer';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { getWorkspace } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function ProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string }>;
}) {
  const { quote: quoteId } = await searchParams;
  const db = getDb();
  const { quotes } = schema;

  const workspace = await getWorkspace();
  const [quote] = quoteId
    ? await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1)
    : [undefined];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Proposal</h1>
        <p className="mt-1 text-sm text-muted">
          A tailored proposal with the price, the timeline, what is included and what is not.
        </p>

        {!quote ? (
          <div className="card mt-6">
            <p className="text-sm">No quote selected.</p>
            <p className="mt-2 text-sm text-muted">
              Price a gig first, then Tally writes the proposal from that quote.
            </p>
            <Link href="/price" className="btn btn-primary mt-4">
              Go to the Pricer
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <ProposalWriter
              quoteId={quote.id}
              title={quote.title}
              hours={quote.hours}
              priceCents={quote.targetCents}
              currency={workspace?.rateCard?.currency ?? 'USD'}
            />
          </div>
        )}
      </main>
    </>
  );
}
