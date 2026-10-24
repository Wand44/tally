import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RiskBadge } from '@/components/risk-badge';
import { SiteHeader } from '@/components/site-header';
import { VerdictBadge } from '@/components/verdict-badge';
import { getDb, schema } from '@/db';
import { getClientDetail } from '@/lib/dashboard';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientDetail(id);
  if (!client) notFound();

  const db = getDb();
  const [rateCard] = await db.select().from(schema.rateCards).limit(1);
  const currency = rateCard?.currency ?? 'USD';

  const sent = client.changeOrders.filter((order) => order.status === 'sent' || order.status === 'accepted');
  const declined = client.changeOrders.filter((order) => order.status === 'declined');
  const draft = client.changeOrders.filter((order) => order.status === 'draft');
  const extraCents = sent.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{client.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {client.company ?? 'Independent'}
              {client.contact ? ` · ${client.contact}` : ''}
            </p>
          </div>
          <RiskBadge level={client.risk.level} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card py-3">
            <dt className="card-title">Risk score</dt>
            <dd className="mt-1 font-semibold">{client.risk.score}</dd>
          </div>
          <div className="card py-3">
            <dt className="card-title">Creep rate</dt>
            <dd className="mt-1 font-semibold">{Math.round(client.risk.creepRate * 100)}%</dd>
          </div>
          <div className="card py-3">
            <dt className="card-title">Extra work billed</dt>
            <dd className="mt-1 font-semibold">{formatMoney(extraCents, currency)}</dd>
          </div>
          <div className="card py-3">
            <dt className="card-title">Change orders</dt>
            <dd className="mt-1 font-semibold">
              {sent.length} sent · {declined.length} declined
            </dd>
          </div>
        </dl>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Projects</h2>
          {client.projects.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No projects yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {client.projects.map((project) => (
                <li key={project.id} className="card flex flex-wrap items-center justify-between gap-2 py-3">
                  <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                    {project.title}
                  </Link>
                  <span className="text-sm text-muted">
                    {project.status} · {formatMoney(project.agreedPriceCents, currency)}
                    {project.deadline ? ` · due ${project.deadline}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Requests</h2>
          {client.requests.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No client messages checked yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {client.requests.map((request) => (
                <li key={request.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm">{request.body}</p>
                    {request.verdict ? <VerdictBadge verdict={request.verdict} /> : null}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {request.projectTitle}
                    {request.extraHours > 0 ? ` · ${request.extraHours}h outside the scope` : ''}
                    {request.reasoning ? ` · ${request.reasoning}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Change orders</h2>
          {client.changeOrders.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No change orders raised.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {client.changeOrders.map((order) => (
                <li key={order.id} className="card flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">{order.title}</span>
                  <span className="text-sm text-muted">
                    {order.totalHours}h · {formatMoney(order.totalCents, currency)} · {order.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {draft.length > 0 ? (
            <p className="mt-2 text-xs text-muted">{draft.length} change order(s) still draft.</p>
          ) : null}
        </section>
      </main>
    </>
  );
}
