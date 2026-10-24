import Link from 'next/link';
import { AnimatedNumber } from '@/components/animated-number';
import { RiskBadge } from '@/components/risk-badge';
import { SiteHeader } from '@/components/site-header';
import { StatCard } from '@/components/stat-card';
import { getDashboardData, getWorkspace } from '@/lib/dashboard';
import { formatMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

function timeAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const workspace = await getWorkspace();

  if (!workspace) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="card mx-auto max-w-xl text-center">
            <h1 className="text-2xl font-semibold">Set your rate card first</h1>
            <p className="mt-2 text-sm text-muted">
              Tally needs your base rate, your minimum acceptable rate and your platform fee before it can price anything.
            </p>
            <Link href="/onboarding" className="btn btn-primary mt-6">
              Set up my rate card
            </Link>
          </div>
        </main>
      </>
    );
  }

  const { profile, rateCard } = workspace;
  const data = await getDashboardData();
  const currency = rateCard?.currency ?? 'USD';
  const skills: string[] = JSON.parse(profile.skills);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-serif)' }}>
              Hey {profile.name.split(' ')[0]}, here&apos;s your week
            </h1>
            <p className="mt-2 text-sm text-muted">
              {skills.length > 0 ? skills.join(' · ') : profile.experienceLevel}
            </p>
          </div>
        </div>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Extra work caught"
            value={<AnimatedNumber value={data.stats.extraHoursCaught} suffix="h" />}
            hint={`${formatMoney(data.stats.extraCentsCaught, currency)} billed · ${formatMoney(data.stats.extraNetCentsCaught, currency)} kept after fee`}
          />
          <StatCard
            label="Change orders sent"
            value={<AnimatedNumber value={data.stats.changeOrdersSent} />}
            hint={`${data.stats.changeOrdersDraft} still draft`}
          />
          <StatCard
            label="Net hourly rate"
            value={<AnimatedNumber value={Math.round(data.stats.avgNetHourlyCents / 100)} prefix={currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''} suffix="/h" />}
            hint={`Across ${data.stats.activeProjects} active project${data.stats.activeProjects === 1 ? '' : 's'}`}
          />
          <StatCard
            label="Your rate"
            value={rateCard ? `${formatMoney(rateCard.baseHourlyRateCents, currency)}/h` : 'Not set'}
            hint={
              rateCard
                ? `Floor ${formatMoney(rateCard.minHourlyRateCents, currency)}/h · ${rateCard.feePercent}% platform fee`
                : undefined
            }
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Clients by risk</h2>
              <span className="text-xs text-muted">{data.stats.clientsTracked} tracked</span>
            </div>
            {data.clients.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No clients yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {data.clients.map((client) => (
                  <li key={client.clientId}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/clients/${client.clientId}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {client.name}
                        </Link>
                        <p className="truncate text-xs text-muted">{client.company ?? 'Independent'}</p>
                      </div>
                      <RiskBadge level={client.level} />
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                      <div
                        className={
                          client.level === 'high'
                            ? 'h-full bg-bad'
                            : client.level === 'medium'
                              ? 'h-full bg-warn'
                              : 'h-full bg-good'
                        }
                        style={{ width: `${Math.max(3, client.score)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      {client.totalVerdicts === 0
                        ? 'No scope checks yet'
                        : `${Math.round(client.creepRate * 100)}% of requests outside scope · ${client.extraHoursCaught}h caught · ${client.changeOrdersSent} change order${client.changeOrdersSent === 1 ? '' : 's'}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Active projects</h2>
              <span className="text-xs text-muted">{data.stats.activeProjects} active</span>
            </div>
            {data.projects.filter((project) => project.status === 'active').length === 0 ? (
              <p className="mt-4 text-sm text-muted">No active projects.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {data.projects
                  .filter((project) => project.status === 'active')
                  .map((project) => (
                    <li key={project.id} className="rounded-xl border border-line p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${project.id}`}
                            className="truncate text-sm font-medium hover:underline"
                          >
                            {project.title}
                          </Link>
                          <p className="truncate text-xs text-muted">
                            {project.clientName}
                            {project.clientCompany ? ` · ${project.clientCompany}` : ''}
                          </p>
                        </div>
                        <span className="badge bg-accent-soft text-accent">
                          {formatMoney(project.netHourlyCents, currency)}/h net
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="text-muted">Agreed</dt>
                          <dd className="font-medium">{formatMoney(project.agreedPriceCents, currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Hours</dt>
                          <dd className="font-medium">{project.estimatedHours}h</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Clauses</dt>
                          <dd className="font-medium">{project.clauseCount}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Deadline</dt>
                          <dd className="font-medium">{project.deadline ?? '—'}</dd>
                        </div>
                      </dl>
                      {project.changeOrderCount > 0 ? (
                        <p className="mt-3 text-xs text-muted">
                          {project.changeOrderCount} change order{project.changeOrderCount === 1 ? '' : 's'} ·{' '}
                          {formatMoney(project.extraCentsCaught, currency)} extra billed
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-4">
          <div className="card">
            <h2 className="font-semibold">Recent activity</h2>
            {data.activity.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Nothing yet. Paste a client message to start.</p>
            ) : (
              <ol className="mt-4 divide-y divide-line">
                {data.activity.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                    <span
                      className={
                        item.kind === 'verdict'
                          ? 'badge bg-panel-2 text-muted'
                          : item.kind === 'change_order'
                            ? 'badge bg-accent-soft text-accent'
                            : 'badge bg-good-soft text-good'
                      }
                    >
                      {item.kind === 'verdict' ? item.verdict : item.kind === 'change_order' ? 'Order' : 'Reply'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(item.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
