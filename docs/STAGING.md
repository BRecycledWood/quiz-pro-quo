# Free staging runbook

This runbook describes the isolated Builder Studio staging path for PR #1. It
does not create, modify, or point at the production Render service or database.

## Cost and limits

- Render: one Free web service. It can sleep after inactivity, so the first
  request after idle may be slow.
- Neon: one isolated Free Postgres project/database. Neon free-tier limits,
  compute suspension, storage, retention, and usage policies apply. Confirm
  the current limits in the Neon console before relying on this environment.
- No paid Render service, Render database, Stripe account, SMTP account, or
  production credential is required for this staging path.

## Provisioning steps

1. In Neon, create a new Free project for staging. Use a separate project and
   database from production; do not reuse a production connection string.
2. Copy the Neon connection string using the provider's recommended pooled or
   direct format. Keep it private and do not commit it or paste it into chat.
3. In Render, choose **New → Blueprint** for
   `BRecycledWood/quiz-pro-quo`, branch
   `arena/686d76f2-quiz-pro-quo`, and set the Blueprint path to
   `render.staging.yaml`.
4. Before applying, confirm Render shows exactly one Free web service named
   `quiz-pro-quo-builder-staging` and no Render database.
5. Apply the Blueprint. In the service Environment settings, add the Neon
   connection string as `DATABASE_URL`. Render generates `ADMIN_KEY`; do not
   replace it with a production key or expose it.
6. Redeploy after saving the environment variable, then open the generated
   Render service URL at `/admin/studio`.
7. Copy the generated `ADMIN_KEY` from Render directly into Builder Studio.
   It is used by the browser session and must not be committed, logged, or
   shared.

## Safety switches

The staging Blueprint sets `DISABLE_EXTERNAL_SIDE_EFFECTS=true` and leaves
Stripe and SMTP variables empty. The server-side kill switch wins even if
credentials are accidentally added later. `SEED_DEMO_DATA=false` keeps the
staging database free of implicit demo data.

## Verification

After deployment, check:

```bash
curl -fsS https://<render-service-url>/healthz
```

Expected properties include `ok: true`, `storage: "postgres"`, and
`publicAppUrlConfigured: true`. `stripeConfigured` and `emailConfigured`
should remain false. Then verify Builder Studio can authenticate, create/edit,
preview, save, and publish staging content without touching production.

This checklist is provider-account setup guidance, not proof that a live
service or Neon database has been provisioned.
