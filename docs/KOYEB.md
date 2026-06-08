# QPQ Koyeb Deployment

Koyeb is the recommended no-subscription path for QPQ while Render paid services are blocked.

## Why Koyeb

- Supports GitHub-driven Node.js web service deployments.
- Supports Dockerfile deployments, which gives QPQ a deterministic build.
- Provides a free web service option.
- Provides database services, or you can connect an external free Postgres provider such as Supabase or Neon.

## Recommended Setup

Use:

- Koyeb Web Service for the QPQ app.
- Koyeb Postgres if available in your account, otherwise Supabase Free Postgres.
- `tryqpq.com` as the custom domain.

## App Service

Create a new Koyeb service from GitHub:

- Repository: `BRecycledWood/quiz-pro-quo`
- Branch: `main`
- Builder: `Dockerfile`
- Exposed port: `3000`
- Route: `/`

The Dockerfile runs:

```bash
npm ci --include=dev
npm run build
npm ci --omit=dev
npm start
```

## Environment Variables

Required:

- `NODE_ENV=production`
- `PUBLIC_APP_URL=https://tryqpq.com`
- `DATABASE_URL=<postgres connection string>`
- `ADMIN_KEY=<long random secret>`
- `SEED_DEMO_DATA=false`

Optional:

- `STRIPE_SECRET_KEY=<stripe secret key>`
- `SMTP_HOST=<smtp host>`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<smtp username>`
- `SMTP_PASSWORD=<smtp password>`
- `EMAIL_FROM=<verified sender email>`
- `LEAD_NOTIFICATION_EMAIL=<internal lead recipient>`

Do not set `ALLOW_MEMORY_STORAGE=true` for first users. That flag is only for temporary non-persistent demos.

## Database

If using Koyeb Postgres, copy the provided Postgres connection string into the app service as `DATABASE_URL`.

If using Supabase Free:

1. Create a Supabase project.
2. Copy the direct Postgres connection string.
3. Use the pooled connection string if direct IPv6 access is a problem.
4. Set it as `DATABASE_URL` in Koyeb.

The QPQ server creates its required tables and indexes on startup when `DATABASE_URL` is present.

## Smoke Tests

After deploy:

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

## DNS

Add `tryqpq.com` as a custom domain in Koyeb, then create the DNS record Koyeb provides in the DNS manager for `tryqpq.com`.
