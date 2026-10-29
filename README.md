# Quiz Pro Quo

Quiz Pro Quo is a multi-workspace quiz and assessment application with versioned pack definitions, conditional questions, server-side scoring, lead capture, PDF reports, analytics, and optional Stripe Checkout.

## Development

Requirements: Node.js 20–25 and npm.

```bash
npm ci
npm run dev
```

The local development server uses in-memory demo data unless `DATABASE_URL` is set. Its development-only admin key defaults to `local-dev-admin-key`; never use that value in production.

## Verification

```bash
npm run check       # TypeScript, including server tests, scripts, and Playwright tests
npm test            # Unit/API tests plus PostgreSQL migration tests when TEST_DATABASE_URL is set
npm run build       # Production client, server, and migration bundles
npm run test:prod   # Production-mode startup and static-serving smoke test (memory storage only)
npm run test:e2e    # Chromium browser flow; install with `npx playwright install chromium`
npm audit --audit-level=high
```

The API/Stripe tests use in-memory storage and a Stripe mock. They do not create real charges or send email. The PostgreSQL migration test is enabled by `TEST_DATABASE_URL` and is run against a PostgreSQL service in GitHub Actions. Browser E2E explicitly disables SMTP and uses the demo pack; it also does not create charges or send mail.

## Production

Production requires PostgreSQL and fails closed if `DATABASE_URL`, a 32-character `ADMIN_KEY`, or an HTTPS-origin `PUBLIC_APP_URL` is missing. Schema migrations run transactionally at server startup. `npm run db:push` runs the bundled migration command after `npm run build`.

Paid packs require both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, plus a valid Stripe `price_...` ID on the published version. Configure the Stripe webhook endpoint as `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Do not use live payment credentials for tests.

For deployment variables, provider setup, smoke tests, and operational limitations, see [docs/PRODUCTION.md](docs/PRODUCTION.md). The Render Blueprint is in `render.yaml`.
