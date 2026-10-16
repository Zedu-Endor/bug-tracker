# Zedu Bugs

Team **Zendor** fork of [`zeduchat/bug-tracker`](https://github.com/zeduchat/bug-tracker).

Report bugs, filter the board, triage status/assignee, vote, and leave comments.

Brand mark: `public/zedu-mark.svg`.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind
- Auth.js v5 — Google OAuth; email/password for local dev only (off in production, see `AUTH_PASSWORD_LOGIN`)
- Prisma + PostgreSQL
- pnpm
- Docker / Coolify deploy (`basePath` `/bug-tracker`)

## Live (upstream)

https://contributors.zedu.chat/bug-tracker

## Roles (RBAC)

| Role | Capabilities |
| --- | --- |
| `user` | Report bugs, comment, vote |
| `admin` | Everything `user` can do, plus triage (status / severity / assignee) |
| `super_admin` | Everything `admin` can do, plus `/admin/users` management (promote users to admin) |

Super-admin credentials come from `SUPER_ADMIN_*` env vars (see below). The seeder is idempotent and does not overwrite an existing super admin unless `SUPER_ADMIN_FORCE_UPDATE=true`.

## Demo accounts (credentials seed)

Local development only. Password sign-in is **off in production** (`AUTH_PASSWORD_LOGIN`), and the seeder refuses to load demo data when `NODE_ENV=production`.

| Email | Password |
| --- | --- |
| `alice@zendor.dev` | `12345678` (admin) |
| `bob@zendor.dev` | `12345678` |
| `cara@zendor.dev` | `12345678` |

> Seed only on an **empty** database (or set `SEED_DEMO_DATA=true`). Never wipe a DB that already has real signups.

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose up -d          # Postgres on localhost:5433
pnpm db:migrate
pnpm db:seed                  # empty DB only
pnpm dev                      # http://localhost:3001/bug-tracker
```

App is served under **`/bug-tracker`** (see `next.config.ts` `basePath`), matching Coolify.

## Link previews (Open Graph / Twitter)

Bug detail URLs (`/bugs/[id]`) emit OG + Twitter Card metadata so Slack, Discord, X, WhatsApp, and similar clients can unfurl a card with **title**, **status**, **author**, a **description snippet**, the **zedu-mark.svg** thumbnail, and a **canonical URL** under `/bug-tracker`.

### Privacy (auth-gated pages)

All ticket pages require a session for normal browsers. Link-preview bots are allowlisted in middleware so they can fetch metadata without signing in. That path only exposes **safe public fields**: title, status label, reporter display name, and a short description snippet. It does **not** include emails, comments, proof links, votes, assignee details, or triage controls. Unauthenticated crawlers that reach the page see the same limited preview body plus a sign-in link — never the full ticket.

Platform unfurl caches are outside our control; metadata is generated on each request from current DB state (`generateMetadata`), so refreshed crawls pick up title/status edits.

### Env vars

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres URL |
| `AUTH_SECRET` | Session secret (`openssl rand -base64 32`) |
| `AUTH_URL` / `NEXTAUTH_URL` | Auth.js base path: origin + `/api/auth` (Next.js `basePath` is applied on top) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in (required in production) |
| `AUTH_PASSWORD_LOGIN` | `true`/`false` to force email/password sign-in and the reset flow on/off. Default: off in production, on elsewhere |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | Idempotent super-admin seed (optional; password min 12 chars) |
| `SUPER_ADMIN_FORCE_UPDATE` | Set `true` to rotate password / promote an existing account |
| `SEED_DEMO_DATA` | Set `true` to wipe and load demo users/bugs |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Optional SMTP for password-reset email (logs reset URL to console when unset) |
| `REPORT_FORM_URL` | Optional Google Form behind the floating "Report issue" button. Must be an `https://` link on a Google-owned host; when unset the button is not rendered |

Google redirect URI: `{AUTH_URL}/api/auth/callback/google`

## Deploy (Coolify)

- Build pack: **Dockerfile**. Container runs `prisma migrate deploy` on start.
- Set variables from `.env.example` in Coolify.
- GitHub secrets: `COOLIFY_WEBHOOK_URL` (and optionally `COOLIFY_TOKEN`).
- `Deploy (Coolify)` runs only after `Malware Scan (CI Gate)` passes on `main`.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Dev server (port 3001) |
| `pnpm build` / `pnpm start` | Production build / start (`PORT`) |
| `pnpm test` | Vitest |
| `pnpm db:migrate` | Prisma migrate (dev) |
| `pnpm db:seed` | Seed demo users/bugs (**empty DB only**) |

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`AGENTS.md`](./AGENTS.md).

PRs target **`main`** on `Zedu-Endor/bug-tracker` (this fork). Sync from `upstream` (`zeduchat/bug-tracker`) as needed.

## Archive

Earlier standalone MVP history/issues origin: [`Zedu-Endor/bug-tracker-mvp`](https://github.com/Zedu-Endor/bug-tracker-mvp) (issues transferred here).
