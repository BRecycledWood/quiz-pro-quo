# QPQ Hostinger Deployment

Use this path if you already have a Hostinger plan that supports Node.js web apps.

## Architecture

- Hostinger: Node.js web app hosting for QPQ.
- Supabase or Neon: external PostgreSQL database.
- Hostinger DNS/domain: `tryqpq.com`.

Hostinger Web/Cloud plans do not include PostgreSQL. Hostinger's documented PostgreSQL path is VPS. For the fastest first-user launch, keep the app on Hostinger and use an external managed Postgres database.

## Hostinger Node.js App Settings

Create a new Node.js web app from GitHub:

- Repository: `BRecycledWood/quiz-pro-quo`
- Branch: `main`
- Framework/preset: Express.js or Node.js
- Node.js version: `20.x`
- Package manager: npm
- Build command: `npm run build`
- Start command: `npm start`

The app listens on `process.env.PORT` when Hostinger provides it, otherwise it falls back to `3000`.

## Required Environment Variables

Add these in Hostinger during deployment or in the app's Environment Variables screen:

```bash
NODE_ENV=production
PUBLIC_APP_URL=https://tryqpq.com
DATABASE_URL=<supabase-or-neon-postgres-connection-string>
ADMIN_KEY=<long-random-secret>
SEED_DEMO_DATA=false
```

Optional:

```bash
STRIPE_SECRET_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
LEAD_NOTIFICATION_EMAIL=
```

Do not set `ALLOW_MEMORY_STORAGE=true` for first users.

## Database Setup

Recommended free database options:

- Supabase Free Postgres
- Neon Free Postgres

If using Supabase:

1. Create a Supabase project.
2. Copy the Postgres connection string.
3. If the direct connection has network/IP issues, use the pooled connection string.
4. Paste it into Hostinger as `DATABASE_URL`.

The QPQ server creates its required tables and indexes on startup when `DATABASE_URL` is present.

## Deploy Flow

1. In Hostinger hPanel, add a Node.js web app.
2. Connect the GitHub repo.
3. Confirm build/start commands.
4. Add environment variables.
5. Deploy.
6. Open the temporary Hostinger URL first.
7. Check `/healthz`.
8. Point `tryqpq.com` to the deployed app.

## Smoke Tests

Temporary Hostinger URL:

```bash
curl -s https://<temporary-hostinger-domain>/healthz
curl -I https://<temporary-hostinger-domain>/
```

Production domain:

```bash
curl -s https://tryqpq.com/healthz
curl -I https://tryqpq.com/
```

Expected `/healthz`:

```json
{
  "ok": true,
  "storage": "postgres",
  "publicAppUrlConfigured": true,
  "emailConfigured": true
}
```

## Common Issues

- `storage` shows `memory`: `DATABASE_URL` is missing or unavailable.
- App fails on startup with `DATABASE_URL is required in production`: add the database connection string.
- Hostinger cannot find an entry file: use Start command `npm start`.
- Env vars do not appear after editing: use Hostinger's redeploy flow after saving environment variables.
- Emails are not sending: make sure all SMTP variables are configured and `/healthz` shows `emailConfigured: true`.
