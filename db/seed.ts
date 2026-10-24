/**
 * Seed the demo workspace: 1 freelancer, 3 clients, 2 active projects and a
 * few weeks of Guardian history so the dashboard has something to show.
 *
 * Run with: npm run db:seed
 */
import { getDb, schema } from './index';
import { changeOrderTotal, feeAdjustedPrice, formatMoney } from '../lib/money';
import { offlineResponse } from '../lib/offline-provider';

const { changeOrders, clients, gigs, messages, profiles, projects, quotes, rateCards, scopeClauses, verdicts } = schema;

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const BASE_RATE_CENTS = 4_500; // $45/h
const MIN_RATE_CENTS = 3_000; // $30/h floor
const FEE_PERCENT = 20;

/**
 * The three reply drafts for a seeded verdict, so the demo shows a complete
 * Guardian run without spending a credit. They come from the offline rules,
 * the same ones the app uses when no model is configured.
 */
function seededReplyDrafts(input: {
  message: string;
  projectTitle: string;
  items: { name: string; est_hours: number }[];
  remainingRevisions: number | null;
}): string {
  const totals = changeOrderTotal(
    input.items.map((item) => ({ name: item.name, estHours: item.est_hours })),
    BASE_RATE_CENTS,
    FEE_PERCENT,
  );
  return offlineResponse('replies', {
    message: input.message,
    projectTitle: input.projectTitle,
    extraWorkSummary: input.items.map((item) => item.name).join('; '),
    totalFormatted: formatMoney(totals.totalCents, 'USD'),
    hours: totals.totalHours,
    remainingRevisions: input.remainingRevisions,
  });
}

export async function seedDemoWorkspace() {
  const db = getDb();

  // Fresh start so the seed is repeatable.
  await db.delete(quotes);
  await db.delete(gigs);
  await db.delete(changeOrders);
  await db.delete(verdicts);
  await db.delete(messages);
  await db.delete(scopeClauses);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(rateCards);
  await db.delete(profiles);

  await db.insert(profiles).values({
    id: 'profile_demo',
    name: 'Nika Beridze',
    skills: JSON.stringify(['3D modelling', 'Blender', 'Product rendering', 'Motion design']),
    experienceLevel: 'expert',
    currency: 'USD',
    typicalWeeklyHours: 35,
    createdAt: new Date(now - 40 * DAY),
  });

  await db.insert(rateCards).values({
    id: 'rate_demo',
    profileId: 'profile_demo',
    baseHourlyRateCents: BASE_RATE_CENTS,
    minHourlyRateCents: MIN_RATE_CENTS,
    feePercent: FEE_PERCENT,
    currency: 'USD',
    updatedAt: new Date(now - 40 * DAY),
  });

  await db.insert(clients).values([
    {
      id: 'client_maya',
      name: 'Maya Okafor',
      company: 'Kinto Coffee',
      contact: 'maya@kintocoffee.example',
      createdAt: new Date(now - 30 * DAY),
    },
    {
      id: 'client_sam',
      name: 'Sam Petrov',
      company: 'Northwind Tools',
      contact: 'sam@northwindtools.example',
      createdAt: new Date(now - 18 * DAY),
    },
    {
      id: 'client_lena',
      name: 'Lena Fischer',
      company: 'Studio Ost',
      contact: 'lena@studioost.example',
      createdAt: new Date(now - 6 * DAY),
    },
  ]);

  await db.insert(projects).values([
    {
      id: 'proj_kinto',
      clientId: 'client_maya',
      title: 'Coffee brand launch site',
      status: 'active',
      agreedPriceCents: feeAdjustedPrice(32 * BASE_RATE_CENTS, FEE_PERCENT),
      estimatedHours: 32,
      agreedTerms: [
        'Deliverables: landing site with hero section, menu page, contact page and about page (5 pages total).',
        'Included: 2 rounds of visual revisions.',
        'Not included: photography and copywriting.',
        'Deadline: 2026-11-05.',
        'Client provides logo files, brand colours and menu content.',
        'Price: $1800.',
      ].join('\n'),
      includedRevisions: 2,
      revisionsUsed: 1,
      deadline: '2026-11-05',
      createdAt: new Date(now - 21 * DAY),
    },
    {
      id: 'proj_northwind',
      clientId: 'client_sam',
      title: 'Product render pack - 12 SKUs',
      status: 'active',
      agreedPriceCents: feeAdjustedPrice(24 * BASE_RATE_CENTS, FEE_PERCENT),
      estimatedHours: 24,
      agreedTerms: [
        'Deliverables: 12 product renders at 2000x2000 px on a transparent background.',
        'Included: 1 round of revisions per render batch.',
        'Not included: motion previews, animation and 3D model delivery.',
        'Deadline: 2026-10-28.',
        'Client provides the product files and brand materials.',
        'Price: $1350.',
      ].join('\n'),
      includedRevisions: 1,
      revisionsUsed: 1,
      deadline: '2026-10-28',
      createdAt: new Date(now - 12 * DAY),
    },
  ]);

  await db.insert(scopeClauses).values([
    {
      id: 'clause_kinto_1',
      projectId: 'proj_kinto',
      ref: 'C1',
      category: 'deliverable',
      text: 'Landing site with hero section, menu page and contact form (5 pages total).',
      sortOrder: 1,
    },
    {
      id: 'clause_kinto_2',
      projectId: 'proj_kinto',
      ref: 'C2',
      category: 'revision_limit',
      text: 'Two rounds of visual revisions are included.',
      sortOrder: 2,
    },
    {
      id: 'clause_kinto_3',
      projectId: 'proj_kinto',
      ref: 'C3',
      category: 'exclusion',
      text: 'Photography and copywriting are not included.',
      sortOrder: 3,
    },
    {
      id: 'clause_kinto_4',
      projectId: 'proj_kinto',
      ref: 'C4',
      category: 'assumption',
      text: 'Client supplies logo files, brand colours and menu content.',
      sortOrder: 4,
    },
    {
      id: 'clause_northwind_1',
      projectId: 'proj_northwind',
      ref: 'C1',
      category: 'deliverable',
      text: '12 product renders, 2000x2000 px, on a transparent background.',
      sortOrder: 1,
    },
    {
      id: 'clause_northwind_2',
      projectId: 'proj_northwind',
      ref: 'C2',
      category: 'revision_limit',
      text: 'One round of revisions per render batch.',
      sortOrder: 2,
    },
    {
      id: 'clause_northwind_3',
      projectId: 'proj_northwind',
      ref: 'C3',
      category: 'exclusion',
      text: 'Motion previews, animation and 3D model delivery are not included.',
      sortOrder: 3,
    },
  ]);

  const messageRows = [
    {
      id: 'msg_kinto_1',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      direction: 'in',
      body: 'Can you also add a small animation to the hero? Would be great if it loops.',
      createdAt: new Date(now - 9 * DAY),
    },
    {
      id: 'msg_kinto_2',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      direction: 'out',
      body: 'Sent the hero loop as change order #1 - $168.75. It slots into the current scope, no rush.',
      createdAt: new Date(now - 9 * DAY + 3 * 60 * 60 * 1000),
    },
    {
      id: 'msg_kinto_3',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      direction: 'in',
      body: 'Quick one - could you swap all the menu photos for ones I send today? No rush at all.',
      createdAt: new Date(now - 6 * DAY),
    },
    {
      id: 'msg_kinto_4',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      direction: 'in',
      body: 'I love it. One tiny tweak: make the button slightly bigger and change the corner radius.',
      createdAt: new Date(now - 4 * DAY),
    },
    {
      id: 'msg_kinto_5',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      direction: 'in',
      body: 'Also can you set up a second menu for the winter season? Same template.',
      createdAt: new Date(now - 2 * DAY),
    },
    {
      id: 'msg_kinto_6',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      direction: 'in',
      body: 'Thanks! And one last thing - add an Instagram feed section at the bottom of the page.',
      createdAt: new Date(now - 1 * DAY),
    },
    {
      id: 'msg_northwind_1',
      projectId: 'proj_northwind',
      clientId: 'client_sam',
      direction: 'in',
      body: 'Could you render one of them on a marble slab instead of white?',
      createdAt: new Date(now - 3 * DAY),
    },
    {
      id: 'msg_northwind_2',
      projectId: 'proj_northwind',
      clientId: 'client_sam',
      direction: 'in',
      body: 'Can you also send a version from a different camera angle?',
      createdAt: new Date(now - 2 * DAY),
    },
    {
      id: 'msg_northwind_3',
      projectId: 'proj_northwind',
      clientId: 'client_sam',
      direction: 'out',
      body: 'Marble variant added as change order #2 - $56.25. Different angle is priced separately.',
      createdAt: new Date(now - 2 * DAY + 2 * 60 * 60 * 1000),
    },
  ] as const;

  await db.insert(messages).values([...messageRows]);

  const verdictRows = [
    {
      id: 'verdict_kinto_1',
      messageId: 'msg_kinto_1',
      projectId: 'proj_kinto',
      verdict: 'OUT',
      clauseRefs: JSON.stringify(['C1', 'C3']),
      quotedText: JSON.stringify([
        'Landing site with hero section, menu page and contact form (5 pages total).',
        'Photography and copywriting are not included.',
      ]),
      extraWorkItems: JSON.stringify([{ name: 'Hero loop animation', estHours: 3 }]),
      reasoning:
        'The agreed scope covers a static hero section; no animation was negotiated, and motion work is excluded from the deliverable list.',
      revisionsUsedAfter: 0,
      createdAt: new Date(now - 9 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'verdict_kinto_2',
      messageId: 'msg_kinto_3',
      projectId: 'proj_kinto',
      verdict: 'OUT',
      clauseRefs: JSON.stringify(['C3']),
      quotedText: JSON.stringify(['Photography and copywriting are not included.']),
      extraWorkItems: JSON.stringify([{ name: 'Swap menu imagery (6 photos)', estHours: 1.5 }]),
      reasoning: 'Image replacement is production work the client already excluded; the friendly tone does not change the scope.',
      revisionsUsedAfter: 0,
      createdAt: new Date(now - 6 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'verdict_kinto_3',
      messageId: 'msg_kinto_4',
      projectId: 'proj_kinto',
      verdict: 'GRAY',
      clauseRefs: JSON.stringify(['C2']),
      quotedText: JSON.stringify(['Two rounds of visual revisions are included.']),
      extraWorkItems: JSON.stringify([{ name: 'Button radius tweak', estHours: 0.5 }]),
      reasoning:
        'Looks like a small visual tweak, but one revision round is already used. Worth confirming before billing.',
      revisionsUsedAfter: 1,
      createdAt: new Date(now - 4 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'verdict_kinto_4',
      messageId: 'msg_kinto_5',
      projectId: 'proj_kinto',
      verdict: 'OUT',
      clauseRefs: JSON.stringify(['C1']),
      quotedText: JSON.stringify(['Landing site with hero section, menu page and contact form (5 pages total).']),
      extraWorkItems: JSON.stringify([{ name: 'Winter menu page', estHours: 4 }]),
      reasoning: 'A second menu is a new page, not a revision of the existing one.',
      revisionsUsedAfter: 1,
      createdAt: new Date(now - 2 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'verdict_kinto_5',
      messageId: 'msg_kinto_6',
      projectId: 'proj_kinto',
      verdict: 'OUT',
      clauseRefs: JSON.stringify(['C1']),
      quotedText: JSON.stringify(['Landing site with hero section, menu page and contact form (5 pages total).']),
      extraWorkItems: JSON.stringify([{ name: 'Instagram feed section', estHours: 2 }]),
      reasoning: 'An extra section adds pages and a third-party embed, which is outside the 5-page deliverable.',
      revisionsUsedAfter: 1,
      createdAt: new Date(now - 1 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'verdict_northwind_1',
      messageId: 'msg_northwind_1',
      projectId: 'proj_northwind',
      verdict: 'GRAY',
      clauseRefs: JSON.stringify(['C1']),
      quotedText: JSON.stringify(['12 product renders, 2000x2000 px, on a transparent background.']),
      extraWorkItems: JSON.stringify([{ name: 'Marble slab background variant', estHours: 1 }]),
      reasoning: 'A new background means new lighting and setup work; one variant may be absorbable, more is a change order.',
      revisionsUsedAfter: 0,
      createdAt: new Date(now - 3 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'verdict_northwind_2',
      messageId: 'msg_northwind_2',
      projectId: 'proj_northwind',
      verdict: 'GRAY',
      clauseRefs: JSON.stringify(['C1', 'C2']),
      quotedText: JSON.stringify([
        '12 product renders, 2000x2000 px, on a transparent background.',
        'One round of revisions per render batch.',
      ]),
      extraWorkItems: JSON.stringify([{ name: 'Alternate camera angle set', estHours: 1.5 }]),
      reasoning: 'A different angle is a new render rather than a revision of the delivered batch.',
      revisionsUsedAfter: 1,
      createdAt: new Date(now - 2 * DAY + 60 * 60 * 1000),
    },
  ];

  await db.insert(verdicts).values(
    verdictRows.map((verdict) => ({
      ...verdict,
      replyDrafts: seededReplyDrafts({
        message: messageRows.find((message) => message.id === verdict.messageId)?.body ?? '',
        projectTitle: verdict.projectId === 'proj_kinto' ? 'Coffee brand launch site' : 'Product render pack',
        items: JSON.parse(verdict.extraWorkItems),
        remainingRevisions: Math.max(
          0,
          (verdict.projectId === 'proj_kinto' ? 2 : 1) - (verdict.revisionsUsedAfter ?? 0),
        ),
      }),
    })),
  );

  const changeOrderRows = [
    {
      id: 'co_kinto_1',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      verdictId: 'verdict_kinto_1',
      title: 'Hero loop animation',
      items: JSON.stringify([{ name: 'Hero loop animation', estHours: 3 }]),
      status: 'accepted',
      sentAt: new Date(now - 9 * DAY + 4 * 60 * 60 * 1000),
      createdAt: new Date(now - 9 * DAY + 2 * 60 * 60 * 1000),
    },
    {
      id: 'co_kinto_2',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      verdictId: 'verdict_kinto_3',
      title: 'Button radius tweak',
      items: JSON.stringify([{ name: 'Button radius tweak', estHours: 0.5 }]),
      status: 'accepted',
      sentAt: new Date(now - 4 * DAY + 3 * 60 * 60 * 1000),
      createdAt: new Date(now - 4 * DAY + 2 * 60 * 60 * 1000),
    },
    {
      id: 'co_kinto_3',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      verdictId: 'verdict_kinto_4',
      title: 'Winter menu page',
      items: JSON.stringify([{ name: 'Winter menu page', estHours: 4 }]),
      status: 'sent',
      sentAt: new Date(now - 2 * DAY + 2 * 60 * 60 * 1000),
      createdAt: new Date(now - 2 * DAY + 60 * 60 * 1000),
    },
    {
      id: 'co_kinto_4',
      projectId: 'proj_kinto',
      clientId: 'client_maya',
      verdictId: 'verdict_kinto_5',
      title: 'Instagram feed section',
      items: JSON.stringify([{ name: 'Instagram feed section', estHours: 2 }]),
      status: 'draft',
      sentAt: null,
      createdAt: new Date(now - 1 * DAY + 90 * 60 * 1000),
    },
    {
      id: 'co_northwind_1',
      projectId: 'proj_northwind',
      clientId: 'client_sam',
      verdictId: 'verdict_northwind_1',
      title: 'Marble slab background variant',
      items: JSON.stringify([{ name: 'Marble slab background variant', estHours: 1 }]),
      status: 'accepted',
      sentAt: new Date(now - 3 * DAY + 3 * 60 * 60 * 1000),
      createdAt: new Date(now - 3 * DAY + 2 * 60 * 60 * 1000),
    },
    {
      id: 'co_northwind_2',
      projectId: 'proj_northwind',
      clientId: 'client_sam',
      verdictId: 'verdict_northwind_2',
      title: 'Alternate camera angle set',
      items: JSON.stringify([{ name: 'Alternate camera angle set', estHours: 1.5 }]),
      status: 'draft',
      sentAt: null,
      createdAt: new Date(now - 2 * DAY + 90 * 60 * 1000),
    },
  ].map((order) => {
    const items = JSON.parse(order.items) as { name: string; estHours: number }[];
    const totals = changeOrderTotal(items, BASE_RATE_CENTS, FEE_PERCENT);
    return {
      ...order,
      totalHours: totals.totalHours,
      totalCents: totals.totalCents,
      netCents: totals.netCents,
    };
  });

  await db.insert(changeOrders).values(changeOrderRows);

  console.log('Seeded: 1 freelancer, 3 clients, 2 projects, 9 messages, 7 verdicts, 6 change orders.');
}

// Only run as a script (`npm run db:seed`). The app imports the seed to load
// the demo workspace, so it must not run on import.
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDemoWorkspace()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
