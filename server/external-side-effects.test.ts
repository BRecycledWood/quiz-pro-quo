import assert from "node:assert/strict";
import { test } from "node:test";
import { emailIsConfigured, externalSideEffectsDisabled, stripeIsConfigured } from "./external-side-effects";

const SIDE_EFFECT_KEYS = [
  "DISABLE_EXTERNAL_SIDE_EFFECTS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
] as const;

test("the staging kill switch wins even when payment and SMTP credentials exist", (t) => {
  const original = new Map(SIDE_EFFECT_KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
  process.env.STRIPE_SECRET_KEY = "test-placeholder-stripe-key";
  process.env.STRIPE_WEBHOOK_SECRET = "test-placeholder-webhook-key";
  process.env.SMTP_HOST = "smtp.example.invalid";
  process.env.SMTP_USER = "preview@example.invalid";
  process.env.SMTP_PASSWORD = "test-placeholder-password";
  process.env.EMAIL_FROM = "preview@example.invalid";

  assert.equal(externalSideEffectsDisabled(), true);
  assert.equal(stripeIsConfigured(), false);
  assert.equal(emailIsConfigured(), false);
});
