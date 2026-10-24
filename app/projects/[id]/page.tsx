import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ScopeEditor } from '@/components/scope-editor';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const { clients, projects, rateCards, scopeClauses } = schema;

  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      client: clients.name,
      company: clients.company,
      agreedPriceCents: projects.agreedPriceCents,
      estimatedHours: projects.estimatedHours,
      agreedTerms: projects.agreedTerms,
      includedRevisions: projects.includedRevisions,
      revisionsUsed: projects.revisionsUsed,
      deadline: projects.deadline,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) notFound();

  const clauses = await db
    .select()
    .from(scopeClauses)
    .where(eq(scopeClauses.projectId, id))
    .orderBy(scopeClauses.sortOrder);

  const [rateCard] = await db.select().from(rateCards).limit(1);
  const currency = rateCard?.currency ?? 'USD';

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {project.client}
              {project.company ? ` · ${project.company}` : ''}
            </p>
          </div>
          <Link href={`/guardian?project=${project.id}`} className="btn btn-primary">
            Check a client message
          </Link>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card py-3">
            <dt className="card-title">Agreed price</dt>
            <dd className="mt-1 font-semibold">{formatMoney(project.agreedPriceCents, currency)}</dd>
          </div>
          <div className="card py-3">
            <dt className="card-title">Hours</dt>
            <dd className="mt-1 font-semibold">{project.estimatedHours}h</dd>
          </div>
          <div className="card py-3">
            <dt className="card-title">Revisions</dt>
            <dd className="mt-1 font-semibold">
              {project.revisionsUsed} used
              {project.includedRevisions != null ? ` of ${project.includedRevisions}` : ''}
            </dd>
          </div>
          <div className="card py-3">
            <dt className="card-title">Deadline</dt>
            <dd className="mt-1 font-semibold">{project.deadline ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <ScopeEditor
            projectId={project.id}
            agreedTerms={project.agreedTerms}
            clauses={clauses.map((clause) => ({
              ref: clause.ref,
              category: clause.category as 'deliverable' | 'exclusion' | 'revision_limit' | 'assumption' | 'deadline',
              text: clause.text,
            }))}
          />
        </div>
      </main>
    </>
  );
}
