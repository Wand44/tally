import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { netHourlyRate } from './money';

const { changeOrders, clients, messages, profiles, projects, rateCards, scopeClauses, verdicts } = schema;

export type RiskLevel = 'high' | 'medium' | 'low' | 'none';

export interface ClientSignal {
  clientId: string;
  name: string;
  company: string | null;
  totalVerdicts: number;
  outVerdicts: number;
  grayVerdicts: number;
  changeOrdersSent: number;
  changeOrdersDraft: number;
  changeOrdersDeclined: number;
  /** Extra hours identified for this client, sent or still draft. */
  extraHoursCaught: number;
  /** Extra money billed (gross, fee included) for sent or accepted change orders. */
  extraCentsCaught: number;
  lastActivityAt: number | null;
}

export interface ClientRisk extends ClientSignal {
  score: number;
  level: RiskLevel;
  /** Share of requests that fell outside the agreed scope. */
  creepRate: number;
}

export interface DashboardStats {
  extraHoursCaught: number;
  extraCentsCaught: number;
  extraNetCentsCaught: number;
  changeOrdersSent: number;
  changeOrdersDraft: number;
  activeProjects: number;
  clientsTracked: number;
  /** Hours actually billed across active projects (scope + change orders). */
  totalHours: number;
  /** Weighted average net rate across active projects, in cents per hour. */
  avgNetHourlyCents: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  clientName: string;
  clientCompany: string | null;
  status: string;
  agreedPriceCents: number;
  estimatedHours: number;
  /** Cents per hour kept after the platform fee, change orders included. */
  netHourlyCents: number;
  deadline: string | null;
  clauseCount: number;
  changeOrderCount: number;
  extraCentsCaught: number;
  extraHoursCaught: number;
}

export interface ActivityItem {
  id: string;
  kind: 'verdict' | 'change_order' | 'reply';
  title: string;
  detail: string;
  at: number;
  verdict?: 'IN' | 'GRAY' | 'OUT';
  status?: string;
}

export interface DashboardData {
  stats: DashboardStats;
  clients: ClientRisk[];
  projects: ProjectSummary[];
  activity: ActivityItem[];
}

/** One client request (a message from the client) and the verdict on it. */
export interface ClientRequestRecord {
  id: string;
  body: string;
  projectTitle: string;
  createdAt: number;
  verdict: 'IN' | 'GRAY' | 'OUT' | null;
  reasoning: string;
  extraHours: number;
}

export interface ClientChangeOrderRecord {
  id: string;
  title: string;
  totalHours: number;
  totalCents: number;
  status: string;
  createdAt: number;
}

/** The client memory (PRD F7): everything Tally knows about one client. */
export interface ClientDetail {
  id: string;
  name: string;
  company: string | null;
  contact: string | null;
  risk: ClientRisk;
  projects: { id: string; title: string; status: string; agreedPriceCents: number; deadline: string | null }[];
  requests: ClientRequestRecord[];
  changeOrders: ClientChangeOrderRecord[];
}

/**
 * Risk score for a client: how often they push past the agreed scope, how
 * much extra work that adds up to, and whether they refuse to pay for it.
 * OUT counts fully, GRAY counts half.
 */
export function computeClientRisk(signal: ClientSignal): ClientRisk {
  const weightedCreep = signal.outVerdicts + signal.grayVerdicts * 0.5;
  const creepRate = signal.totalVerdicts > 0 ? weightedCreep / signal.totalVerdicts : 0;
  const volume = Math.min(1, signal.extraHoursCaught / 10);
  const score = Math.round(
    creepRate * 55 + volume * 25 + (signal.changeOrdersDeclined > 0 ? 20 : 0),
  );
  const level: RiskLevel =
    signal.totalVerdicts === 0 ? 'none' : score >= 60 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { ...signal, score, level, creepRate: Math.round(creepRate * 100) / 100 };
}

/** Highest risk first. */
export function rankClientsByRisk(signals: ClientSignal[]): ClientRisk[] {
  return signals
    .map(computeClientRisk)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

const SENT_STATUSES = ['sent', 'accepted'] as const;

export async function getWorkspace() {
  const db = getDb();
  const [profile] = await db.select().from(profiles).limit(1);
  if (!profile) return null;
  const [rateCard] = await db.select().from(rateCards).limit(1);
  return { profile, rateCard: rateCard ?? null };
}

export async function getDashboardData(): Promise<DashboardData> {
  const db = getDb();
  const [rateCard] = await db.select().from(rateCards).limit(1);
  const feePercent = rateCard?.feePercent ?? 0;

  const [verdictStats, changeOrderStats, projectRows, changeOrderRows, verdictRows, messageRows, clauseCounts] =
    await Promise.all([
      db
        .select({
          clientId: clients.id,
          name: clients.name,
          company: clients.company,
          totalVerdicts: sql<number>`count(${verdicts.id})`,
          outVerdicts: sql<number>`sum(case when ${verdicts.verdict} = 'OUT' then 1 else 0 end)`,
          grayVerdicts: sql<number>`sum(case when ${verdicts.verdict} = 'GRAY' then 1 else 0 end)`,
          lastActivityAt: sql<number | null>`max(${verdicts.createdAt})`,
        })
        .from(clients)
        .leftJoin(messages, eq(messages.clientId, clients.id))
        .leftJoin(verdicts, eq(verdicts.messageId, messages.id))
        .groupBy(clients.id),
      db
        .select({
          clientId: changeOrders.clientId,
          sent: sql<number>`sum(case when ${changeOrders.status} in ('sent','accepted') then 1 else 0 end)`,
          draft: sql<number>`sum(case when ${changeOrders.status} = 'draft' then 1 else 0 end)`,
          declined: sql<number>`sum(case when ${changeOrders.status} = 'declined' then 1 else 0 end)`,
          extraHours: sql<number>`sum(${changeOrders.totalHours})`,
          sentCents: sql<number>`sum(case when ${changeOrders.status} in ('sent','accepted') then ${changeOrders.totalCents} else 0 end)`,
        })
        .from(changeOrders)
        .groupBy(changeOrders.clientId),
      db
        .select({
          id: projects.id,
          title: projects.title,
          clientName: clients.name,
          clientCompany: clients.company,
          status: projects.status,
          agreedPriceCents: projects.agreedPriceCents,
          estimatedHours: projects.estimatedHours,
          deadline: projects.deadline,
        })
        .from(projects)
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .orderBy(desc(projects.createdAt)),
      db.select().from(changeOrders),
      db
        .select({
          id: verdicts.id,
          verdict: verdicts.verdict,
          reasoning: verdicts.reasoning,
          extraWorkItems: verdicts.extraWorkItems,
          createdAt: verdicts.createdAt,
          messageBody: messages.body,
          projectTitle: projects.title,
        })
        .from(verdicts)
        .innerJoin(messages, eq(verdicts.messageId, messages.id))
        .innerJoin(projects, eq(verdicts.projectId, projects.id))
        .orderBy(desc(verdicts.createdAt))
        .limit(8),
      db
        .select({
          id: messages.id,
          direction: messages.direction,
          body: messages.body,
          createdAt: messages.createdAt,
          projectTitle: projects.title,
        })
        .from(messages)
        .innerJoin(projects, eq(messages.projectId, projects.id))
        .orderBy(desc(messages.createdAt))
        .limit(8),
      db.select({ projectId: scopeClauses.projectId, count: sql<number>`count(*)` }).from(scopeClauses).groupBy(scopeClauses.projectId),
    ]);

  const clientSignals: ClientSignal[] = verdictStats.map((row) => {
    const co = changeOrderStats.find((c) => c.clientId === row.clientId);
    return {
      clientId: row.clientId,
      name: row.name,
      company: row.company,
      totalVerdicts: Number(row.totalVerdicts ?? 0),
      outVerdicts: Number(row.outVerdicts ?? 0),
      grayVerdicts: Number(row.grayVerdicts ?? 0),
      changeOrdersSent: Number(co?.sent ?? 0),
      changeOrdersDraft: Number(co?.draft ?? 0),
      changeOrdersDeclined: Number(co?.declined ?? 0),
      extraHoursCaught: Number(co?.extraHours ?? 0),
      extraCentsCaught: Number(co?.sentCents ?? 0),
      lastActivityAt: row.lastActivityAt ? Number(row.lastActivityAt) : null,
    };
  });

  const rankedClients = rankClientsByRisk(clientSignals);

  const sentOrders = changeOrderRows.filter((order) => SENT_STATUSES.includes(order.status as (typeof SENT_STATUSES)[number]));

  const projectSummaries: ProjectSummary[] = projectRows.map((project) => {
    const orders = changeOrderRows.filter((order) => order.projectId === project.id);
    const sentForProject = orders.filter((order) => SENT_STATUSES.includes(order.status as (typeof SENT_STATUSES)[number]));
    const extraCentsCaught = sentForProject.reduce((sum, order) => sum + order.totalCents, 0);
    const extraHoursCaught = sentForProject.reduce((sum, order) => sum + order.totalHours, 0);
    const gross = project.agreedPriceCents + extraCentsCaught;
    const hours = project.estimatedHours + extraHoursCaught;
    return {
      ...project,
      netHourlyCents: hours > 0 ? netHourlyRate(gross, hours, feePercent) : 0,
      clauseCount: Number(clauseCounts.find((c) => c.projectId === project.id)?.count ?? 0),
      changeOrderCount: orders.length,
      extraCentsCaught,
      extraHoursCaught,
    };
  });

  const activeProjects = projectSummaries.filter((project) => project.status === 'active');
  const totalHours = activeProjects.reduce((sum, project) => sum + project.estimatedHours + project.extraHoursCaught, 0);
  const totalGross = activeProjects.reduce((sum, project) => sum + project.agreedPriceCents + project.extraCentsCaught, 0);
  const avgNetHourlyCents = totalHours > 0 ? netHourlyRate(totalGross, totalHours, feePercent) : 0;

  const stats: DashboardStats = {
    extraHoursCaught: Math.round(sentOrders.reduce((sum, o) => sum + o.totalHours, 0) * 100) / 100,
    extraCentsCaught: sentOrders.reduce((sum, o) => sum + o.totalCents, 0),
    extraNetCentsCaught: sentOrders.reduce((sum, o) => sum + o.netCents, 0),
    changeOrdersSent: sentOrders.length,
    changeOrdersDraft: changeOrderRows.filter((order) => order.status === 'draft').length,
    activeProjects: activeProjects.length,
    clientsTracked: clientSignals.length,
    totalHours: Math.round(totalHours * 100) / 100,
    avgNetHourlyCents,
  };

  const activity: ActivityItem[] = [
    ...verdictRows.map((row) => ({
      id: row.id,
      kind: 'verdict' as const,
      title: `${row.projectTitle}: ${row.verdict} verdict`,
      detail: row.messageBody.length > 120 ? `${row.messageBody.slice(0, 117)}...` : row.messageBody,
      at: Number(row.createdAt),
      verdict: row.verdict as 'IN' | 'GRAY' | 'OUT',
    })),
    ...changeOrderRows.map((row) => ({
      id: row.id,
      kind: 'change_order' as const,
      title: `Change order: ${row.title}`,
      detail: `${row.totalHours}h · ${row.status}`,
      at: Number(row.sentAt ?? row.createdAt),
      status: row.status,
    })),
    ...messageRows
      .filter((row) => row.direction === 'out')
      .map((row) => ({
        id: row.id,
        kind: 'reply' as const,
        title: `Reply sent on ${row.projectTitle}`,
        detail: row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body,
        at: Number(row.createdAt),
      })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);

  return { stats, clients: rankedClients, projects: projectSummaries, activity };
}

/** Everything Tally knows about one client: their projects, their requests,
 * the verdicts on those requests and the change orders that came out of it. */
export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  const [projectRows, requestRows, changeOrderRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        agreedPriceCents: projects.agreedPriceCents,
        deadline: projects.deadline,
      })
      .from(projects)
      .where(eq(projects.clientId, clientId))
      .orderBy(desc(projects.createdAt)),
    db
      .select({
        id: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        projectTitle: projects.title,
        verdict: verdicts.verdict,
        reasoning: verdicts.reasoning,
        extraWorkItems: verdicts.extraWorkItems,
      })
      .from(messages)
      .innerJoin(projects, eq(messages.projectId, projects.id))
      .leftJoin(verdicts, eq(verdicts.messageId, messages.id))
      .where(and(eq(messages.clientId, clientId), eq(messages.direction, 'in')))
      .orderBy(desc(messages.createdAt)),
    db
      .select({
        id: changeOrders.id,
        title: changeOrders.title,
        totalHours: changeOrders.totalHours,
        totalCents: changeOrders.totalCents,
        status: changeOrders.status,
        createdAt: changeOrders.createdAt,
      })
      .from(changeOrders)
      .where(eq(changeOrders.clientId, clientId))
      .orderBy(desc(changeOrders.createdAt)),
  ]);

  const requests: ClientRequestRecord[] = requestRows.map((row) => ({
    id: row.id,
    body: row.body,
    projectTitle: row.projectTitle,
    createdAt: Number(row.createdAt),
    verdict: (row.verdict as 'IN' | 'GRAY' | 'OUT' | null) ?? null,
    reasoning: row.reasoning ?? '',
    extraHours: extraWorkHours(row.extraWorkItems),
  }));

  const changeOrdersForClient: ClientChangeOrderRecord[] = changeOrderRows.map((row) => ({
    id: row.id,
    title: row.title,
    totalHours: row.totalHours,
    totalCents: row.totalCents,
    status: row.status,
    createdAt: Number(row.createdAt),
  }));

  const judged = requests.filter((request) => request.verdict !== null);
  const signal: ClientSignal = {
    clientId: client.id,
    name: client.name,
    company: client.company,
    totalVerdicts: judged.length,
    outVerdicts: judged.filter((request) => request.verdict === 'OUT').length,
    grayVerdicts: judged.filter((request) => request.verdict === 'GRAY').length,
    changeOrdersSent: changeOrdersForClient.filter((order) => SENT_STATUSES.includes(order.status as (typeof SENT_STATUSES)[number])).length,
    changeOrdersDraft: changeOrdersForClient.filter((order) => order.status === 'draft').length,
    changeOrdersDeclined: changeOrdersForClient.filter((order) => order.status === 'declined').length,
    extraHoursCaught: changeOrdersForClient.reduce((sum, order) => sum + order.totalHours, 0),
    extraCentsCaught: changeOrdersForClient
      .filter((order) => SENT_STATUSES.includes(order.status as (typeof SENT_STATUSES)[number]))
      .reduce((sum, order) => sum + order.totalCents, 0),
    lastActivityAt: requests.length > 0 ? requests[0].createdAt : null,
  };

  return {
    id: client.id,
    name: client.name,
    company: client.company,
    contact: client.contact,
    risk: computeClientRisk(signal),
    projects: projectRows,
    requests,
    changeOrders: changeOrdersForClient,
  };
}

/** Sum of the estimated hours in a verdict's extra work items. */
function extraWorkHours(items: string | null): number {
  if (!items) return 0;
  try {
    const parsed = JSON.parse(items) as { est_hours?: number }[];
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((sum, item) => sum + (Number(item.est_hours) || 0), 0);
  } catch {
    return 0;
  }
}
