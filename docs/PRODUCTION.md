# Production Runbook

## Scope and readiness gate

This document describes the deployment configuration; it is not evidence that a provider account or a live integration has been verified. The current automated suite uses mock Stripe and SMTP senders. PostgreSQL and Chromium browser E2E run in GitHub Actions. Before launch, run the end-to-end checklist below against the chosen production-like accounts using Stripe test mode and a controlled mailbox. Do not use live payments or send unsolicited email for acceptance testing.

Do not merge or deploy until the PR acceptance criteria pass and the remaining external integrations have been verified with authorized test credentials.

## Required environment

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL connection string; production startup fails if absent unless the explicit demo-only `ALLOW_MEMORY_STORAGE=true` override is set. Never use that override for customer data. |
| `ADMIN_KEY` | Random secret, at least 32 characters. Protect it as a credential. |
| `PUBLIC_APP_URL` | HTTPS origin only, e.g. `https://tryqpq.com`; no path, query, fragment, or credentials. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse-proxy hops. Set it to the hosting provider's actual topology; Render Blueprint defaults to `1`. |
| `SEED_DEMO_DATA` | Keep `false` for production unless demo data is intentionally wanted. |

`DATABASE_URL` is required for persistence. The application creates/updates its PostgreSQL schema transactionally on startup under an advisory lock. `npm run db:push` is available after `npm run build` as a one-off schema check/migration command; the same migrations run automatically when the service starts.

## Optional service configuration

### Stripe (required for paid packs)

Set both:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Configure the webhook endpoint `https://<your-domain>/api/stripe/webhook` for:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Each paid published pack version must reference a Stripe `price_...` Price ID. Checkout is bound to the immutable pack version and saved completed submission; the return/PDF endpoints re-retrieve the Checkout Session and verify its status, metadata, exact price, and submission association. Webhook signature is verified before payment state is stored. Use Stripe test mode for verification; never use a real payment in automated tests.

### Email (optional)

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and a verified `EMAIL_FROM`. Set `LEAD_NOTIFICATION_EMAIL` only to an authorized internal recipient; if omitted, notifications go to `EMAIL_FROM`. Free packs can email a PDF after a visitor submits an email. Paid packs do not email the report before payment; the PDF is unlocked for download only after Stripe verifies payment. Internal lead notifications may still be sent. There is no marketing subscription flow.

Email/PDF delivery is asynchronous and does not block result display. This implementation does not include a durable email queue or retry scheduler; monitor SMTP delivery and failed-send logs before relying on email as the only delivery channel.

## Build and deploy

```bash
npm ci --include=dev
npm run check
npm test
npm run build
npm run db:push   # optional preflight, using the production DATABASE_URL only when authorized
npm start
```

For the Dockerfile, the runtime stage installs production dependencies and serves the prebuilt `dist` output. Database schema migration also runs on startup. Use an HTTPS reverse proxy/load balancer, configure `TRUST_PROXY_HOPS` correctly, and do not expose admin credentials in frontend code or URLs.

The repository includes a Render Blueprint (`render.yaml`) as an example, not a verified or endorsed production plan. Before using any provider's free tier, confirm its data-retention, availability, backup, TLS, and resource limits meet the deployment's requirements.

## Health and smoke tests

After deployment:

```bash
curl -fsS https://<your-domain>/healthz
curl -fsSI https://<your-domain>/
```

`/healthz` returns storage type and boolean configuration flags only; it does not expose credentials. For a customer deployment, expect `storage: "postgres"` and `publicAppUrlConfigured: true`. `stripeConfigured` is true only when both Stripe secrets are configured. `emailConfigured` indicates SMTP variables are present, not that a live delivery succeeded.

Automated checks available in this repository:

```bash
npm run check
npm test
npm run build
npm run test:prod
npm run test:e2e
npm audit --audit-level=high
```

`npm run test:prod` deliberately opts into memory storage to exercise production startup/static serving without customer data. `npm test` skips the PostgreSQL migration test unless `TEST_DATABASE_URL` points to a disposable database. GitHub Actions supplies a disposable PostgreSQL service and installs Chromium for the browser E2E.

## Controlled pre-launch acceptance checklist

- [ ] Configure production-like PostgreSQL, apply the migration, and verify existing data is preserved.
- [ ] Confirm `/healthz` reports PostgreSQL and the configured HTTPS origin.
- [ ] Verify admin access with the production `ADMIN_KEY`; confirm unauthorized requests are rejected.
- [ ] Create/edit/publish a pack, including conditional visibility, scoring, and version pinning.
- [ ] Complete free public assessment, confirm server-recomputed score and saved lead, and download its PDF.
- [ ] In Stripe test mode only, complete checkout with a test Price and verify the webhook, return flow, and paid PDF association; also test cancellation/retry.
- [ ] In an authorized test mailbox, verify result PDF and internal lead notification, then test SMTP failure behavior.
- [ ] Confirm backups, retention, monitoring, rate-limit behavior behind the configured proxy, and provider recovery procedures.
- [ ] Review privacy policy, terms, data-retention schedule, consent language, and production domain/DNS/TLS.

## Operational limitations to assess

- Rate limiting is process-local; a multi-instance deployment needs a shared rate-limit store or edge protection.
- Admin access is a single shared key, not per-user authentication or role-based access.
- Email delivery has no durable queue/retry policy.
- Automated tests do not establish provider-level service availability, real Stripe account configuration, DNS/email deliverability, backup restoration, or load capacity.
