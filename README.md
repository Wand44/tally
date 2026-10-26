# Tally — the AI chief of staff for freelancers

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-24292f?style=flat" alt="MIT License" /></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16.4-black?logo=next.js" alt="Next.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://orm.drizzle.team/"><img src="https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle ORM" /></a>
  <a href="https://github.com/tursodatabase/libsql"><img src="https://img.shields.io/badge/libSQL-SQLite-3C9CD0" alt="libSQL" /></a>
  <a href="https://zod.dev/"><img src="https://img.shields.io/badge/Zod-4.x-3068B7" alt="Zod" /></a>
  <a href="https://platform.openai.com/"><img src="https://img.shields.io/badge/OpenAI_SDK-compatible-412991?logo=openai&logoColor=white" alt="OpenAI SDK" /></a>
</p>

> Win the gig. Price it right. Protect the scope.

Tally keeps one shared memory across a freelance job: your rate card prices the
quote *and* the change order, the agreed terms become the scope you defend, and
every client message is checked against that scope. All money math runs in code
— the models only extract and explain, never calculate.

## Run it

```bash
npm install
cp .env.example .env        # DATABASE_URL defaults to file:./local.db
npm run db:push             # create the tables
npm run db:seed             # sample workspace: 1 freelancer, 3 clients, 2 projects
npm run dev                 # http://localhost:3000
```

```bash
npm test            # vitest: money maths, risk scoring, scope ids, citations
npm run eval        # compares the two models on 25 labelled scope cases
npm run build       # production build
```

Without API keys everything still works: Tally falls back to deterministic
offline rules and a small sample search set, and the UI says so.

## The tools

| Page | What it does |
| --- | --- |
| `/` | Dashboard: extra work caught, change orders, net rate, clients ranked by scope-creep risk, recent activity. |
| `/radar` | Searches the marketplaces (Upwork, Fiverr, Freelancer, Guru via Tavily `include_domains`), reads 3 postings at a time with live progress, ranks them by skill fit and whether the budget clears your floor. Every gig links to its real source; an invented URL is dropped. |
| `/price` | The full flow on one page: paste the gig → price it (your hours or the model's, floor never broken, fee grossed up, risk padding for known creep clients) → write the proposal in a chosen tone → **Add as order**. |
| `/guardian` | Paste a client message. Triage first, then a verdict of IN / GRAY / OUT with cited clauses (quotes must be exact substrings, or the verdict is retried once and downgraded), the extra work priced in code, and three short reply drafts (warm, firm, two options). |
| `/orders` | Every project with its change orders, newest first; completed ones fold away collapsed. Add orders by hand, mark complete, reopen or remove. |
| `/onboarding` | Your rate: base rate, floor, platform fee, skills, currency. The single source of truth for all pricing. |

## Environment

| Variable | Meaning |
| --- | --- |
| `NEBIUS_API_KEY` / `NEBIUS_BASE_URL` | LLM provider (server-only). Without it: offline rules. |
| `MODEL_FAST` / `MODEL_SMART` | Model ids for the fast (triage, Radar reads) and smart (verdicts, replies, pricing, proposals) tiers. |
| `TAVILY_API_KEY` | Web search behind Radar and the market range. Without it: offline sample set. |
| `AI_RUNS_PER_HOUR` | Rate limit per client, default 20 (safe demo cap; raise for your own key). A Radar search costs 1 + 1 per posting read. |

Client text and web results are wrapped in delimiters as untrusted data; the
system prompts say so. Injection resistance is part of the eval set.

## Money rules (`lib/money.ts`)

All amounts are integer cents; the LLM never does arithmetic. Floor rate always
wins, the platform fee is grossed up, and `money.test.ts` runs every quote over
a grid of hours, fees and rates to prove the net never drops below the floor.
Example: 10 h at $45/h with a 20% platform fee → bill **$562.50**, keep $45/h.

Not legal advice. Applies the terms you entered. Your data stays in this app's
database.

## License

MIT — see [LICENSE](LICENSE).
