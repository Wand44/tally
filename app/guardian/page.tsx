import { eq } from 'drizzle-orm';
import { GuardianCheck } from '@/components/guardian-check';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { getWorkspace } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function GuardianPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; msg?: string }>;
}) {
  const { project, msg } = await searchParams;
  const db = getDb();
  const { clients, messages, projects } = schema;

  const rows = await db
    .select({ id: projects.id, title: projects.title, client: clients.name })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(projects.createdAt);

  // A sample message that was checked before: reuse the stored verdict instead of spending a credit.
  const [sample] = msg
    ? await db.select().from(messages).where(eq(messages.id, msg)).limit(1)
    : [undefined];

  const workspace = await getWorkspace();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>Guardian</h1>
          <p className="mt-1 text-sm text-muted">
            Paste what the client wrote. Tally says if it is in scope, which clause it breaks and what the
            extra work costs.
          </p>
        </div>
        <div className="mt-6">
          <GuardianCheck
            projects={rows}
            defaultProjectId={project ?? sample?.projectId}
            initialMessage={sample?.body ?? ''}
            useStored={Boolean(sample)}
            currency={workspace?.rateCard?.currency ?? 'USD'}
          />
        </div>
      </main>
    </>
  );
}
