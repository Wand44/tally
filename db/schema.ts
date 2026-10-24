import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = integer('created_at', { mode: 'timestamp_ms' }).notNull();

/** The freelancer. One row for the demo workspace. */
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** JSON array of skill tags. */
  skills: text('skills').notNull().default('[]'),
  /** beginner | intermediate | expert */
  experienceLevel: text('experience_level').notNull(),
  currency: text('currency').notNull().default('USD'),
  typicalWeeklyHours: integer('typical_weekly_hours').notNull().default(40),
  createdAt,
});

/**
 * Single source of truth for all money math (PRD F1).
 * One card per profile: editing it changes every later quote.
 */
export const rateCards = sqliteTable(
  'rate_cards',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Cents per hour. */
    baseHourlyRateCents: integer('base_hourly_rate_cents').notNull(),
    /** Floor: the lowest rate the freelancer accepts. */
    minHourlyRateCents: integer('min_hourly_rate_cents').notNull(),
    /** Platform fee percentage, e.g. 20. */
    feePercent: real('fee_percent').notNull(),
    currency: text('currency').notNull().default('USD'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('rate_cards_profile_unique').on(table.profileId)],
);

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  company: text('company'),
  contact: text('contact'),
  createdAt,
});

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** active | completed | paused */
  status: text('status').notNull().default('active'),
  /** Agreed price the client pays (fee included). */
  agreedPriceCents: integer('agreed_price_cents').notNull(),
  /** Hours in the agreed scope. */
  estimatedHours: real('estimated_hours').notNull(),
  /** Raw agreed terms as the client wrote them (F5 input for scope extraction). */
  agreedTerms: text('agreed_terms').notNull().default(''),
  /** Revision rounds included in the agreed scope. */
  includedRevisions: integer('included_revisions'),
  /** Revision rounds already used. */
  revisionsUsed: integer('revisions_used').notNull().default(0),
  deadline: text('deadline'),
  createdAt,
});

/** Structured scope extracted from the agreed terms. `ref` is the citation id (C1, C2...). */
export const scopeClauses = sqliteTable('scope_clauses', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  ref: text('ref').notNull(),
  /** deliverable | exclusion | revision_limit | assumption | deadline */
  category: text('category').notNull(),
  text: text('text').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

/** Client (or freelancer) messages. */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  /** in (from client) | out (from freelancer) */
  direction: text('direction').notNull(),
  body: text('body').notNull(),
  createdAt,
});

/** Guardian verdicts on client messages. */
export const verdicts = sqliteTable('verdicts', {
  id: text('id').primaryKey(),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** IN | GRAY | OUT */
  verdict: text('verdict').notNull(),
  /** JSON array of clause refs cited (C1, C2...). */
  clauseRefs: text('clause_refs').notNull().default('[]'),
  /** JSON array of exact quotes taken from the scope. */
  quotedText: text('quoted_text').notNull().default('[]'),
  /** JSON array of { name, estHours }. */
  extraWorkItems: text('extra_work_items').notNull().default('[]'),
  reasoning: text('reasoning').notNull(),
  revisionsUsedAfter: integer('revisions_used_after'),
  /** Triage summary from the cheap model. */
  triageSummary: text('triage_summary').notNull().default(''),
  /** JSON object of { warm, firm, two_options } reply drafts. */
  replyDrafts: text('reply_drafts').notNull().default('{}'),
  /** Why the verdict was downgraded, if the citations failed validation. */
  validationNote: text('validation_note').notNull().default(''),
  createdAt,
});

/** Priced change orders raised from OUT/GRAY verdicts. */
export const changeOrders = sqliteTable('change_orders', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  verdictId: text('verdict_id').references(() => verdicts.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  /** JSON array of { name, estHours }. */
  items: text('items').notNull().default('[]'),
  totalHours: real('total_hours').notNull(),
  /** What the client is billed (fee included). */
  totalCents: integer('total_cents').notNull(),
  /** What the freelancer keeps after the fee. */
  netCents: integer('net_cents').notNull(),
  /** draft | sent | accepted | declined */
  status: text('status').notNull().default('draft'),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  createdAt,
});

/** Gigs found by Radar (PRD F2). */
export const gigs = sqliteTable('gigs', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  query: text('query').notNull().default(''),
  title: text('title').notNull(),
  /** The posting the gig was found at. Always a real source link. */
  url: text('url').notNull(),
  snippet: text('snippet').notNull().default(''),
  /** Budget in cents, when the posting states one. */
  budgetMinCents: integer('budget_min_cents'),
  budgetMaxCents: integer('budget_max_cents'),
  budgetCurrency: text('budget_currency').notNull().default('USD'),
  estHours: real('est_hours'),
  /** JSON array of requirement phrases. */
  requirements: text('requirements').notNull().default('[]'),
  /** JSON array of red flag keys. */
  redFlags: text('red_flags').notNull().default('[]'),
  /** Rank score 0-100 (math in code). */
  score: integer('score').notNull().default(0),
  fitScore: real('fit_score').notNull().default(0),
  budgetScore: real('budget_score').notNull().default(0),
  /** The hourly rate the budget implies, in cents. */
  impliedHourlyCents: integer('implied_hourly_cents'),
  createdAt,
});

/** Quotes produced by the Pricer (PRD F3). */
export const quotes = sqliteTable('quotes', {
  id: text('id').primaryKey(),
  gigId: text('gig_id').references(() => gigs.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  hours: real('hours').notNull(),
  lowCents: integer('low_cents').notNull(),
  /** The recommended price. */
  targetCents: integer('target_cents').notNull(),
  highCents: integer('high_cents').notNull(),
  /** What the freelancer keeps from the recommended price. */
  netCents: integer('net_cents').notNull(),
  netHourlyCents: integer('net_hourly_cents').notNull(),
  /** The lowest acceptable price: the floor rate with the fee included. */
  floorCents: integer('floor_cents').notNull(),
  riskPaddingPercent: real('risk_padding_percent').notNull().default(0),
  rationale: text('rationale').notNull().default(''),
  /** JSON array of { url, claim, title }. */
  sources: text('sources').notNull().default('[]'),
  createdAt,
});

/** Rate limit counters (PRD F8). One row per key and hour window. */
export const rateLimits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(),
  /** Who is counted, e.g. the IP address. */
  key: text('key').notNull(),
  /** The start of the window, in epoch milliseconds. */
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull().default(0),
});

export const profileRelations = relations(profiles, ({ one }) => ({
  rateCard: one(rateCards, { fields: [profiles.id], references: [rateCards.profileId] }),
}));

export const clientRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
}));

export const projectRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  clauses: many(scopeClauses),
  messages: many(messages),
  verdicts: many(verdicts),
  changeOrders: many(changeOrders),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  client: one(clients, { fields: [messages.clientId], references: [clients.id] }),
  project: one(projects, { fields: [messages.projectId], references: [projects.id] }),
}));

export const verdictRelations = relations(verdicts, ({ one }) => ({
  message: one(messages, { fields: [verdicts.messageId], references: [messages.id] }),
}));

export const changeOrderRelations = relations(changeOrders, ({ one }) => ({
  project: one(projects, { fields: [changeOrders.projectId], references: [projects.id] }),
  client: one(clients, { fields: [changeOrders.clientId], references: [clients.id] }),
}));
