import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { formatMoney } from '@/lib/money';
import { getWorkspace } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const db = getDb();
  const { projects, clients, changeOrders } = schema;
  const workspace = await getWorkspace();
  const currency = workspace?.rateCard?.currency ?? 'USD';

  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      clientName: clients.name,
      clientId: clients.id,
      agreedPriceCents: projects.agreedPriceCents,
      estimatedHours: projects.estimatedHours,
      deadline: projects.deadline,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(projects.createdAt);

  const orderCounts = await db
    .select({
      projectId: changeOrders.projectId,
      id: changeOrders.id,
      status: changeOrders.status,
      totalCents: changeOrders.totalCents,
      netCents: changeOrders.netCents,
    })
    .from(changeOrders);

  const counts = new Map<string, { total: number; sent: number; draft: number; sum: number }>();
  for (const o of orderCounts) {
    const cur = counts.get(o.projectId) ?? { total: 0, sent: 0, draft: 0, sum: 0 };
    cur.total += 1;
    if (o.status === 'sent' || o.status === 'accepted') cur.sent += 1;
    else cur.draft += 1;
    cur.sum += o.totalCents;
    counts.set(o.projectId, cur);
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: 'var(--font-serif)' }}>
              Orders
            </h1>
            <p className="mt-1 text-sm text-muted">
              All projects and their change orders in one place.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="card mt-6">
            <p className="text-sm text-muted">No projects yet.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {rows.map((row) => {
              const c = counts.get(row.id) ?? { total: 0, sent: 0, draft: 0, sum: 0 };
              return (
                <article key={row.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/projects/${row.id}`} className="text-lg font-medium hover:underline">
                        {row.title}
                      </Link>
                      <p className="mt-1 text-sm text-muted">
                        <Link href={`/clients/${row.clientId}`} className="hover:underline">
                          {row.clientName}
                        </Link>
                        {row.deadline ? ` · Due ${row.deadline}` : ''}
                      </p>
                    </div>
                    <span className="badge border-line text-muted">
                      {row.status === 'active' ? 'Active' : row.status}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="card-title">Agreed</p>
                      <p className="mt-2 font-medium">{formatMoney(row.agreedPriceCents, currency)}</p>
                    </div>
                    <div>
                      <p className="card-title">Hours</p>
                      <p className="mt-2 font-medium">{row.estimatedHours}h</p>
                    </div>
                    <div>
                      <p className="card-title">Change orders</p>
                      <p className="mt-2 font-medium">
                        {c.total} ({c.sent} sent / {c.draft} draft)
                      </p>
                    </div>
                    <div>
                      <p className="card-title">Extra billed</p>
                      <p className="mt-2 font-medium">{formatMoney(c.sum, currency)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/projects/${row.id}`} className="btn">
                      View project
                    </Link>
                    <Link href={`/guardian?project=${row.id}`} className="btn">
                      Check message
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
