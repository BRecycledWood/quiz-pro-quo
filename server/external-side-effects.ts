/**
 * Hard safety switch for isolated previews. It takes precedence over configured
 * provider credentials so an accidentally populated secret cannot activate a
 * payment or email integration in staging.
 */
export function externalSideEffectsDisabled(): boolean {
  return process.env.DISABLE_EXTERNAL_SIDE_EFFECTS === "true";
}

export function stripeIsConfigured(): boolean {
  return !externalSideEffectsDisabled() && Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  );
}

export function emailIsConfigured(): boolean {
  return !externalSideEffectsDisabled() && Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.EMAIL_FROM,
  );
}
