# Deploying Tally (hackathon)

Rules that matter: the submission **must run on Nebius Token Factory or Nebius
AI Cloud** and **use at least one NVIDIA open source model** (deadline Oct 30,
2026 10:00 AM PDT).

What we already satisfy in code:

- **Inference runs on Nebius Token Factory** — every LLM call goes through
  `lib/llm.ts` against `https://api.tokenfactory.nebius.com`.
- **NVIDIA model** — the fast tier is `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
  (triage + Radar reads). Keep at least one NVIDIA model in the pipeline; it is
  named in the README and appears in live logs.

API keys stay **server-side env vars**, never in the client bundle — judges
click the app without seeing them, and `AI_RUNS_PER_HOUR` caps the damage a
curious IP can do to the $50 balance. Never commit `.env` (already git-ignored).

---

## Option A — Nebius AI Cloud VM (safest for the rules)

Everything runs on Nebius infra: inference on Token Factory, app on AI Cloud.

1. **Create a VM** in the Nebius AI Cloud console: Ubuntu 24.04, 2 vCPU / 4 GB,
   public IP, your SSH key.
2. **On the VM**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   git clone https://github.com/Wand44/tally.git && cd tally
   npm ci
   ```
3. **Environment** (`/home/ubuntu/tally/.env`):
   ```bash
   DATABASE_URL="file:./local.db"
   NEBIUS_API_KEY=...
   NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
   MODEL_FAST=nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
   MODEL_SMART=moonshotai/Kimi-K3
   TAVILY_API_KEY=...
   AI_RUNS_PER_HOUR=200
   ```
4. **Build + seed + run**:
   ```bash
   npm run db:push && npm run db:seed
   npm run build
   npx next start -H 0.0.0.0 -p 3000
   ```
   The SQLite file lives on the VM disk — no Turso needed. Use `pm2` or a
   systemd unit to keep it running.

## Option B — Vercel + Turso (fastest to ship)

If you read "run on" as "the AI runs on Token Factory", this also qualifies —
inference is exactly that. Hosting is the only non-Nebius piece.

1. **Turso** (free): `turso db create tally` → copy URL + token.
2. Seed the hosted DB once, from your laptop:
   ```bash
   export DATABASE_URL="libsql://tally-<you>.turso.io"
   export DATABASE_AUTH_TOKEN="<token>"
   npm run db:push && npm run db:seed
   ```
3. **Vercel**: import the GitHub repo, set the same env vars as option A plus
   `DATABASE_URL`/`DATABASE_AUTH_TOKEN` pointing at Turso, deploy.

## After deploy (either option)

- Judge-walkthrough: dashboard loads Nika's workspace → Radar finds real
  Fiverr/Upwork postings → Pricer writes the proposal → Add as order →
  Guardian checks a sample message.
- If the workspace gets wrecked during demo day: re-run `npm run db:seed`
  with the production `DATABASE_URL` exported. 30 seconds back to clean.
