# QPQ Production Runbook

## Recommended Host

Use Hostinger for the first-user MVP deployment if your existing plan supports Node.js web apps.

Why:

- QPQ is a long-running Node/Express app, not a static site.
- QPQ needs persistent PostgreSQL.
- You already have Hostinger available.
- Hostinger supports GitHub-driven Node.js app deployment on supported plans.
- QPQ can run as a single Node app with `npm run build` and `npm start`.
- Use Supabase or Neon for PostgreSQL, because Hostinger Web/Cloud plans do not include Postgres.

Important: Hostinger is acceptable for a first-user MVP if the Node.js app feature is available on your plan. The database must still be external unless you are using a Hostinger VPS.

Render, Koyeb, and Railway can also work, but they are blocked right now by subscription or pricing constraints.

## Required Services

- Node.js host that can run `npm start`
- PostgreSQL database
- DNS for `qproquo.howstud.io`
- Optional: Stripe for paid PDF unlocks
- Optional: Zoho SMTP credentials for emailed PDF reports and lead notifications

## Environment Variables

Required for first-user production:

- `NODE_ENV=production`
- `PUBLIC_APP_URL=https://qproquo.howstud.io`
- `DATABASE_URL=postgresql://...`
- `ADMIN_KEY=<long random secret>`

Optional:

- `STRIPE_SECRET_KEY=<stripe secret key>`
- `ZOHO_EMAIL=<sending mailbox>`
- `ZOHO_PASSWORD=<mailbox app password>`
- `SEED_DEMO_DATA=true` only when intentionally seeding demo data

Do not run first-user production without `DATABASE_URL`. The app now fails fast in production unless `ALLOW_MEMORY_STORAGE=true` is explicitly set for a non-persistent demo.

## Build And Start

```bash
npm install --include=dev
npm run build
npm start
```

## Render Free Blueprint Deployment

1. Commit and push the repo to GitHub.
2. In Render, create a new Blueprint from this repo.
3. Render should detect `render.yaml` at the repo root.
4. Confirm it will create:
   - `quiz-pro-quo` web service
   - `quiz-pro-quo-db` Postgres database
   - Both should show the `free` plan.
5. Enter the prompted secret values:
   - `STRIPE_SECRET_KEY` if paid PDFs are enabled
   - `ZOHO_EMAIL` and `ZOHO_PASSWORD` if emailed reports are enabled
6. Deploy the Blueprint.
7. Add the custom domain `qproquo.howstud.io` to the web service.
8. Create the DNS record Render provides.
9. Confirm `/healthz` reports `storage: "postgres"` and `publicAppUrlConfigured: true`.

The Blueprint sets `ADMIN_KEY` with `generateValue: true`. After deploy, copy that generated value from Render and store it securely. You need it to access admin API-backed workflows.

## Database Setup

The server creates its required Postgres tables and indexes on startup when `DATABASE_URL` is configured.

If you later want to manage schema through Drizzle directly, run:

```bash
npm run db:push
```

## Smoke Tests

```bash
curl -s https://qproquo.howstud.io/healthz
curl -I https://qproquo.howstud.io/
```

Expected `/healthz`:

- `ok: true`
- `storage: "postgres"`
- `publicAppUrlConfigured: true`

## First Launch Checklist

- DNS resolves for `qproquo.howstud.io`
- SSL is active
- `DATABASE_URL` is configured
- `ADMIN_KEY` is stored securely
- `PUBLIC_APP_URL` matches the live domain
- Admin can load `/admin`
- A public pack opens at `/w/<workspace>/<pack>`
- A test submission appears in the admin dashboard
- PDF download works
- Email delivery works if Zoho is configured
- Stripe checkout works if paid packs are enabled
