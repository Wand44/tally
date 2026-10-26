import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { SiteHeader } from '@/components/site-header';
import { getDb, schema } from '@/db';
import { formatMoney, formatMoneyRounded } from '@/lib/money';
import { getWorkspace } from '@/lib/dashboard';
import { OrdersActions } from './orders-actions';
import { OrdersAdd } from './orders-add';

export const dynamic = 'force-dynamic';

interface OrderRow {
  id: string;
  title: string;
  status: string;
  clientName: string;
  clientId: string;
  agreedPriceCents: number;
  estimatedHours: number;
  deadline: string | null;
  createdAt: Date;
}

interface OrderCounts {
  total: number;
  sent: number;
  draft: number;
  sum: number;
}

function OrderCard({
  row,
  counts,
  currency,
}: {
  row: OrderRow;
  counts: OrderCounts;
  currency: string;
}) {
  const completed = row.status === 'completed';
  const added = new Date(row.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projects/${row.id}`} className="group inline-flex items-center gap-1.5 text-lg font-medium">
            <span className="group-hover:underline">{row.title}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="View project" className="text-muted">
              <path d="M7 17L17 7" />
              <path d="M8 7h9v9" />
            </svg>
          </Link>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/clients/${row.clientId}`} className="hover:underline">
              {row.clientName}
            </Link>
            {` · Added ${added}`}
            {row.deadline ? ` · Due ${row.deadline}` : ''}
          </p>
        </div>
        <span
          className={
            completed ? 'badge border-line text-muted' : 'badge border-good/60 text-good'
          }
        >
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
            {counts.total} ({counts.sent} sent / {counts.draft} draft)
          </p>
        </div>
        <div>
          <p className="card-title">Extra billed</p>
          <p className="mt-2 font-medium">{formatMoneyRounded(counts.sum, currency)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!completed ? (
          <Link href={`/guardian?project=${row.id}`} className="btn">
            Check message
          </Link>
        ) : null}
        <OrdersActions projectId={row.id} status={row.status} />
      </div>
    </article>
  );
}

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
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(desc(projects.createdAt));

  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);

  const orderCounts = await db
    .select({
      projectId: changeOrders.projectId,
      status: changeOrders.status,
      totalCents: changeOrders.totalCents,
    })
    .from(changeOrders);

  const counts = new Map<string, OrderCounts>();
  for (const o of orderCounts) {
    const cur = counts.get(o.projectId) ?? { total: 0, sent: 0, draft: 0, sum: 0 };
    cur.total += 1;
    if (o.status === 'sent' || o.status === 'accepted') {
      cur.sent += 1;
      cur.sum += o.totalCents;
    } else {
      cur.draft += 1;
    }
    counts.set(o.projectId, cur);
  }

  const countFor = (id: string) => counts.get(id) ?? { total: 0, sent: 0, draft: 0, sum: 0 };
  const activeRows = rows.filter((row) => row.status !== 'completed');
  const completedRows = rows.filter((row) => row.status === 'completed');

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

        <div className="mt-4">
          <OrdersAdd clients={clientRows} />
        </div>

        {rows.length === 0 ? (
          <div className="card mt-6">
            <p className="text-sm text-muted">No projects yet.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-3">
              {activeRows.map((row) => (
                <OrderCard key={row.id} row={row} counts={countFor(row.id)} currency={currency} />
              ))}
            </div>

            {completedRows.length > 0 ? (
              <details className="group mt-6">
                <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-muted hover:text-fg">
                  <svg
                    className="transition group-open:rotate-90"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  Completed ({completedRows.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {completedRows.map((row) => (
                    <OrderCard key={row.id} row={row} counts={countFor(row.id)} currency={currency} />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
