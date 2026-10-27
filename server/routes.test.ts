import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { createServer, type Server } from "node:http";
import Stripe from "stripe";
import { MemStorage } from "./storage";
import { registerRoutes } from "./routes";

const ADMIN_KEY = "test-admin-secret-with-at-least-32-chars";
const DEMO_WORKSPACE = "demo";
const FREE_PACK = "insurance-eligibility";
const PAID_PACK = "property-readiness";
const PAID_PRICE_ID = "price_1Stom3IxvVaQKv3AefT04dyg";

let originalEnv: NodeJS.ProcessEnv;

before(() => {
  originalEnv = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.ADMIN_KEY = ADMIN_KEY;
  process.env.PUBLIC_APP_URL = "https://qpp.test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.EMAIL_FROM;
  delete process.env.LEAD_NOTIFICATION_EMAIL;
});

after(() => {
  process.env = originalEnv;
});

type MockCheckoutSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  mode: "payment";
  amount_total: number | null;
  metadata: Record<string, string>;
  client_reference_id: string | null;
};

function makeStripeMock() {
  let session: MockCheckoutSession | null = null;
  let createCalls = 0;
  let listLineItemsCalls = 0;
  let lineItemPriceId = PAID_PRICE_ID;
  let forceInvalidSignature = false;

  const stripe = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          createCalls += 1;
          session = {
            id: "cs_test_qpp_123",
            url: "https://checkout.stripe.test/cs_test_qpp_123",
            status: "open",
            payment_status: "unpaid",
            mode: "payment",
            amount_total: 2900,
            metadata: { ...(params.metadata ?? {}) } as Record<string, string>,
            client_reference_id: params.client_reference_id ?? null,
          };
          return session as unknown as Stripe.Checkout.Session;
        },
        retrieve: async () => {
          if (!session) throw new Error("Unknown test session");
          return session as unknown as Stripe.Checkout.Session;
        },
        listLineItems: async () => {
          listLineItemsCalls += 1;
          return {
            data: [{ price: { id: lineItemPriceId }, quantity: 1 }],
            has_more: false,
          } as unknown as Stripe.ApiList<Stripe.LineItem>;
        },
      },
    },
    webhooks: {
      constructEvent: (_body: Buffer, signature: string, secret: string) => {
        if (forceInvalidSignature || signature !== "sig_valid" || secret !== "whsec_test") {
          throw new Error("Invalid test signature");
        }
        return {
          id: "evt_test_qpp",
          object: "event",
          type: "checkout.session.completed",
          data: { object: session as unknown as Stripe.Checkout.Session },
        } as Stripe.Event;
      },
    },
  } as unknown as Stripe;

  return {
    stripe,
    setPaid() {
      assert.ok(session, "a checkout session must exist before marking it paid");
      session.status = "complete";
      session.payment_status = "paid";
    },
    setMetadata(metadata: Record<string, string>) {
      assert.ok(session);
      session.metadata = metadata;
    },
    setLineItemPriceId(priceId: string) {
      lineItemPriceId = priceId;
    },
    setInvalidSignature(value: boolean) {
      forceInvalidSignature = value;
    },
    getSession() {
      return session;
    },
    getCreateCalls() {
      return createCalls;
    },
    getListLineItemsCalls() {
      return listLineItemsCalls;
    },
  };
}

async function createHarness(options: { withStripe?: boolean } = {}) {
  const storage = new MemStorage();
  const workspace = await storage.getWorkspaceBySlug(DEMO_WORKSPACE);
  assert.ok(workspace);
  await storage.updateWorkspace(workspace.id, { logoUrl: null });
  const stripeMock = options.withStripe ? makeStripeMock() : null;
  let resultEmails = 0;
  let leadNotifications = 0;

  const app = express();
  app.use(express.json({
    verify: (req, _res, body) => {
      (req as typeof req & { rawBody?: unknown }).rawBody = Buffer.from(body);
    },
  }));
  const server = createServer(app);
  await registerRoutes(server, app, {
    storage,
    getStripeClient: () => stripeMock?.stripe ?? null,
    sendResultsEmail: async () => {
      resultEmails += 1;
      return true;
    },
    sendLeadNotification: async () => {
      leadNotifications += 1;
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    storage,
    workspace,
    stripeMock,
    server,
    baseUrl,
    getResultEmails: () => resultEmails,
    getLeadNotifications: () => leadNotifications,
  };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function requestJson<T = Record<string, unknown>>(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; admin?: boolean; headers?: Record<string, string> } = {},
): Promise<{ response: Response; body: T }> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.admin) headers["x-admin-key"] = ADMIN_KEY;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => ({})) as T;
  return { response, body };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(predicate(), "timed out waiting for background task");
}

const freeAnswers = { age: 30, coverage: true, region: "west" };
const paidAnswers = { units: 15, compliance: true, category: "commercial" };

async function startAndSubmit(
  harness: Awaited<ReturnType<typeof createHarness>>,
  packSlug: string,
  answers: Record<string, unknown>,
) {
  const start = await requestJson<{ submissionId?: string }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${packSlug}/start`,
    { method: "POST" },
  );
  assert.equal(start.response.status, 201);
  assert.ok(start.body.submissionId);
  const submissionId = start.body.submissionId;
  const submit = await requestJson<{ id?: string; success?: boolean; evaluation?: { score: number } }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${packSlug}/submit`,
    { body: { submissionId, email: "person@example.com", answers } },
  );
  assert.equal(submit.response.status, 200);
  assert.equal(submit.body.success, true);
  return { submissionId, submit: submit.body };
}

test("public submit requires a started assessment and server-valid answers; score and payment flags are not trusted", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));

  const missingSession = await requestJson(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/submit`, {
    body: { email: "person@example.com", answers: freeAnswers },
  });
  assert.equal(missingSession.response.status, 400);

  const started = await requestJson<{ submissionId: string }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/start`,
    { method: "POST" },
  );
  assert.equal(started.response.status, 201);

  const invalidAnswers = await requestJson(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/submit`, {
    body: { submissionId: started.body.submissionId, email: "person@example.com", answers: { ...freeAnswers, age: "30" } },
  });
  assert.equal(invalidAnswers.response.status, 400);

  const submitted = await requestJson<{
    id: string;
    success: boolean;
    evaluation: { score: number; outcome: { id: string } | null };
  }>(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/submit`, {
    body: {
      submissionId: started.body.submissionId,
      email: "person@example.com",
      firstName: "Avery",
      answers: freeAnswers,
      score: 999_999,
      paid: true,
      amountPaidCents: 99_999,
    },
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.evaluation.score, 3);
  assert.equal(submitted.body.evaluation.outcome?.id, "eligible");

  const saved = await harness.storage.getSubmission(submitted.body.id);
  assert.ok(saved);
  assert.equal(saved.score, 3);
  assert.equal(saved.paid, false);
  assert.equal(saved.amountPaidCents, 0);
  assert.deepEqual(saved.answers, freeAnswers);
});

test("submission completion is immutable and only the first concurrent completion triggers delivery", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));

  const start = await requestJson<{ submissionId: string }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/start`,
    { method: "POST" },
  );
  const submissionId = start.body.submissionId;
  const [first, second] = await Promise.all([
    requestJson<{ id: string; evaluation: { score: number } }>(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/submit`, {
      body: { submissionId, email: "first@example.com", answers: freeAnswers },
    }),
    requestJson<{ id: string; evaluation: { score: number } }>(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/submit`, {
      body: { submissionId, email: "second@example.com", answers: { ...freeAnswers, age: 18 } },
    }),
  ]);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.body.id, second.body.id);
  assert.equal(first.body.evaluation.score, second.body.evaluation.score);

  const saved = await harness.storage.getSubmission(submissionId);
  assert.ok(saved);
  assert.ok(saved.email === "first@example.com" || saved.email === "second@example.com");
  assert.deepEqual(saved.answers, saved.email === "first@example.com" ? freeAnswers : { ...freeAnswers, age: 18 });
  await waitFor(() => harness.getResultEmails() === 1 && harness.getLeadNotifications() === 1);
});

test("assessment submissions remain pinned to their starting pack version", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));
  const pack = await harness.storage.getPackBySlug(harness.workspace.id, FREE_PACK);
  assert.ok(pack?.publishedVersionId);
  const start = await requestJson<{ submissionId: string }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/start`,
    { method: "POST" },
  );
  const oldVersion = await harness.storage.getPackVersion(pack.publishedVersionId);
  assert.ok(oldVersion);
  const newerVersion = await harness.storage.createPackVersion({
    packId: pack.id,
    version: oldVersion.version + 1,
    definition: { ...oldVersion.definition, name: "Updated Insurance Eligibility" },
  });
  await harness.storage.publishVersion(pack.id, newerVersion.id);

  const submitted = await requestJson<{ evaluation: { outcome: { title: string } | null } }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/submit`,
    { body: { submissionId: start.body.submissionId, email: "pin@example.com", answers: freeAnswers } },
  );
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.evaluation.outcome?.title, "Eligible");
});

test("checkout-cancel restoration reads a completed assessment from server storage and is scoped to its pack", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));
  const { submissionId } = await startAndSubmit(harness, FREE_PACK, freeAnswers);

  const restored = await requestJson<{
    success: boolean;
    submissionId: string;
    email: string;
    answers: Record<string, unknown>;
    evaluation: { outcome: { id: string } | null };
  }>(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/restore?submission_id=${submissionId}`);
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.success, true);
  assert.equal(restored.body.submissionId, submissionId);
  assert.equal(restored.body.email, "person@example.com");
  assert.deepEqual(restored.body.answers, freeAnswers);
  assert.equal(restored.body.evaluation.outcome?.id, "eligible");
  assert.match(restored.response.headers.get("cache-control") ?? "", /no-store/);

  const wrongPack = await requestJson(harness.baseUrl, `/api/public/w/${DEMO_WORKSPACE}/${PAID_PACK}/restore?submission_id=${submissionId}`);
  assert.equal(wrongPack.response.status, 404);
});

test("free PDF endpoint revalidates answers and streams a non-cacheable PDF", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));

  const invalid = await fetch(
    `${harness.baseUrl}/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/pdf?answers=${encodeURIComponent(btoa(JSON.stringify({ age: 30 })))}`,
  );
  assert.equal(invalid.status, 400);

  const valid = await fetch(
    `${harness.baseUrl}/api/public/w/${DEMO_WORKSPACE}/${FREE_PACK}/pdf?answers=${encodeURIComponent(btoa(JSON.stringify(freeAnswers)))}`,
  );
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get("content-type") ?? "", /application\/pdf/);
  assert.match(valid.headers.get("cache-control") ?? "", /no-store/);
  const pdf = Buffer.from(await valid.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
});

test("admin authoring rejects invalid definitions and supports clearing optional customization", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));
  const pack = await harness.storage.getPackBySlug(harness.workspace.id, FREE_PACK);
  const version = pack?.publishedVersionId ? await harness.storage.getPackVersion(pack.publishedVersionId) : undefined;
  assert.ok(pack && version);

  const invalid = await requestJson(harness.baseUrl, `/api/admin/packs/${pack.id}/versions`, {
    admin: true,
    body: {
      version: 2,
      definition: {
        ...version.definition,
        showIf: [{ questionId: "does-not-exist", when: { all: [{ questionId: "age", operator: "gte", value: 18 }] } }],
      },
    },
  });
  assert.equal(invalid.response.status, 400);

  const clearLogo = await requestJson<{ workspace: { logoUrl: string | null } }>(
    harness.baseUrl,
    `/api/admin/workspaces/${harness.workspace.id}`,
    { method: "PUT", admin: true, body: { logoUrl: null } },
  );
  assert.equal(clearLogo.response.status, 200);
  assert.equal(clearLogo.body.workspace.logoUrl, null);

  const noAuth = await requestJson(harness.baseUrl, "/api/admin/workspaces");
  assert.equal(noAuth.response.status, 401);
});

async function checkoutFixture(harness: Awaited<ReturnType<typeof createHarness>>) {
  const { submissionId } = await startAndSubmit(harness, PAID_PACK, paidAnswers);
  const checkout = await requestJson<{ url?: string; sessionId?: string }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${PAID_PACK}/checkout`,
    { body: { submissionId } },
  );
  assert.equal(checkout.response.status, 200);
  assert.ok(checkout.body.url);
  return { submissionId, checkout: checkout.body };
}

test("Stripe checkout is bound to the exact completed assessment, price, and idempotent session", async (t) => {
  const harness = await createHarness({ withStripe: true });
  t.after(() => closeServer(harness.server));
  assert.ok(harness.stripeMock);
  const { submissionId, checkout } = await checkoutFixture(harness);
  await waitFor(() => harness.getLeadNotifications() === 1);
  assert.equal(harness.getResultEmails(), 0, "paid reports must not be emailed before payment");
  assert.equal(checkout.sessionId, "cs_test_qpp_123");
  assert.equal(harness.stripeMock.getCreateCalls(), 1);

  const repeated = await requestJson<{ url?: string; reused?: boolean }>(
    harness.baseUrl,
    `/api/public/w/${DEMO_WORKSPACE}/${PAID_PACK}/checkout`,
    { body: { submissionId } },
  );
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.reused, true);
  assert.equal(harness.stripeMock.getCreateCalls(), 1);

  const submission = await harness.storage.getSubmission(submissionId);
  assert.equal(submission?.stripeSessionId, "cs_test_qpp_123");
  assert.equal(submission?.paid, false);
});

test("paid results and PDF stay locked until Stripe confirms the matching paid price", async (t) => {
  const harness = await createHarness({ withStripe: true });
  t.after(() => closeServer(harness.server));
  assert.ok(harness.stripeMock);
  const { submissionId } = await checkoutFixture(harness);
  const path = `/api/public/w/${DEMO_WORKSPACE}/${PAID_PACK}`;

  const unpaid = await requestJson(harness.baseUrl, `${path}/payment-return?session_id=cs_test_qpp_123&submission_id=${submissionId}`);
  assert.equal(unpaid.response.status, 402);
  assert.equal(harness.stripeMock.getListLineItemsCalls(), 0);

  harness.stripeMock.setPaid();
  harness.stripeMock.setLineItemPriceId("price_wrong");
  const wrongPrice = await requestJson(harness.baseUrl, `${path}/payment-return?session_id=cs_test_qpp_123&submission_id=${submissionId}`);
  assert.equal(wrongPrice.response.status, 402);

  harness.stripeMock.setLineItemPriceId(PAID_PRICE_ID);
  const verified = await requestJson<{ success: boolean; paid: boolean; submissionId: string; evaluation: { outcome: { id: string } | null } }>(
    harness.baseUrl,
    `${path}/payment-return?session_id=cs_test_qpp_123&submission_id=${submissionId}`,
  );
  assert.equal(verified.response.status, 200);
  assert.equal(verified.body.success, true);
  assert.equal(verified.body.paid, true);
  assert.equal(verified.body.submissionId, submissionId);
  assert.equal(verified.body.evaluation.outcome?.id, "ready");
  assert.equal((await harness.storage.getSubmission(submissionId))?.paid, true);

  const paidRetry = await requestJson<{ url?: string; alreadyPaid?: boolean }>(
    harness.baseUrl,
    `${path}/checkout`,
    { body: { submissionId } },
  );
  assert.equal(paidRetry.response.status, 200);
  assert.equal(paidRetry.body.alreadyPaid, true);
  assert.match(paidRetry.body.url ?? "", /paid=1/);

  const pdf = await fetch(`${harness.baseUrl}${path}/pdf?session_id=cs_test_qpp_123&submission_id=${submissionId}`);
  assert.equal(pdf.status, 200);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString("ascii"), "%PDF-");

  const changedMetadata = { ...(harness.stripeMock.getSession()?.metadata ?? {}), submissionId: "another-submission" };
  harness.stripeMock.setMetadata(changedMetadata);
  const forged = await requestJson(harness.baseUrl, `${path}/payment-return?session_id=cs_test_qpp_123&submission_id=${submissionId}`);
  assert.equal(forged.response.status, 402);
});

test("Stripe webhook signature verification and duplicate delivery are safe", async (t) => {
  const harness = await createHarness({ withStripe: true });
  t.after(() => closeServer(harness.server));
  assert.ok(harness.stripeMock);
  const { submissionId } = await checkoutFixture(harness);
  harness.stripeMock.setPaid();

  const invalidSignature = await requestJson(harness.baseUrl, "/api/stripe/webhook", {
    headers: { "stripe-signature": "invalid" },
    body: { id: "evt_test_qpp" },
  });
  assert.equal(invalidSignature.response.status, 400);
  assert.equal((await harness.storage.getSubmission(submissionId))?.paid, false);

  const validWebhook = () => requestJson<{ received: boolean }>(harness.baseUrl, "/api/stripe/webhook", {
    headers: { "stripe-signature": "sig_valid" },
    body: { id: "evt_test_qpp" },
  });
  const [first, second] = await Promise.all([validWebhook(), validWebhook()]);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.body.received, true);
  assert.equal((await harness.storage.getSubmission(submissionId))?.paid, true);
});

test("advanced logic stays available on free workspaces while branded entitlements are enforced server-side", async (t) => {
  const harness = await createHarness();
  t.after(() => closeServer(harness.server));
  const workspace = await harness.storage.createWorkspace({ name: "Studio Test", slug: "studio-test" });
  const pack = await harness.storage.createPack({ workspaceId: workspace.id, name: "Logic Test", slug: "logic-test" });
  const definition = {
    name: "Logic Test",
    logicVersion: 2,
    questions: [
      { id: "consent", prompt: "Continue?", type: "yesno", required: true },
      { id: "amount", prompt: "Amount", type: "number", required: false, requiredWhen: { all: [{ questionId: "consent", operator: "equals", value: true }] } },
    ],
    outcomes: [{ id: "result", title: "Result" }],
    calculations: [{ id: "twice", label: "Twice", expression: { op: "multiply", args: [{ op: "answer", questionId: "amount" }, { op: "literal", value: 2 }] } }],
    scoringCategories: [{ id: "readiness", label: "Readiness" }],
    scoring: [{ id: "weighted", label: "Weighted amount", points: 0, pointsFormula: { op: "variable", variableId: "twice" }, categoryId: "readiness", when: { all: [{ variableId: "twice", operator: "gte", value: 2 }] } }],
    reusableConditions: [{ id: "consent-template", label: "Consent is yes", when: { all: [{ questionId: "consent", operator: "equals", value: true }] } }],
    routing: [{ id: "finish-on-no", fromQuestionId: "consent", targetQuestionId: null, when: { all: [{ questionId: "consent", operator: "equals", value: false }] }, priority: 10 }],
    thresholds: [],
  };
  const createVersion = (payload: unknown) => requestJson<{ version?: { id: string }; message?: string }>(
    harness.baseUrl,
    `/api/admin/packs/${pack.id}/versions`,
    { admin: true, body: { definition: payload } },
  );

  const freeLogic = await createVersion(definition);
  assert.equal(freeLogic.response.status, 201, freeLogic.body.message);
  assert.ok(freeLogic.body.version?.id);

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
  const lockedBrand = await createVersion({ ...definition, branding: { logoDataUrl: `data:image/png;base64,${pngSignature}` } });
  assert.equal(lockedBrand.response.status, 403);
  assert.equal((lockedBrand.body as { code?: string }).code, "branding_entitlement_required");

  const freeWorkspaceUpdate = await requestJson(harness.baseUrl, `/api/admin/workspaces/${workspace.id}`, {
    method: "PUT", admin: true, body: { secondaryColor: "#123456" },
  });
  assert.equal(freeWorkspaceUpdate.response.status, 403);

  const plan = await requestJson<{ brandPlan?: string }>(harness.baseUrl, `/api/admin/workspaces/${workspace.id}/entitlements`, {
    method: "PUT", admin: true, body: { brandPlan: "pro" },
  });
  assert.equal(plan.response.status, 200);
  assert.equal(plan.body.brandPlan, "pro");

  const workspaceBranding = await requestJson<{ workspace?: { brandSettings?: { themePreset?: string } }; message?: string }>(harness.baseUrl, `/api/admin/workspaces/${workspace.id}`, {
    method: "PUT", admin: true, body: { brandSettings: { logoDataUrl: `data:image/png;base64,${pngSignature}`, themePreset: "ocean", primaryColor: "#087e8b", secondaryColor: "#35a7a0", backgroundColor: "#f1fbfb" } },
  });
  assert.equal(workspaceBranding.response.status, 200, workspaceBranding.body.message);
  assert.equal(workspaceBranding.body.workspace?.brandSettings?.themePreset, "ocean");

  const proDefinition = { ...definition, branding: { brandName: "Studio Brand", themePreset: "grove", secondaryColor: "#7aaa72", backgroundColor: "#f5faf5", textColor: "#1f3328" } };
  const proVersion = await createVersion(proDefinition);
  assert.equal(proVersion.response.status, 201, proVersion.body.message);
  assert.ok(proVersion.body.version?.id);

  const downgrade = await requestJson<{ message?: string }>(harness.baseUrl, `/api/admin/workspaces/${workspace.id}/entitlements`, {
    method: "PUT", admin: true, body: { brandPlan: "free" },
  });
  assert.equal(downgrade.response.status, 409);
  assert.match(downgrade.body.message ?? "", /gated features/i);

  const published = await requestJson(harness.baseUrl, `/api/admin/packs/${pack.id}/publish/${proVersion.body.version?.id}`, { method: "POST", admin: true });
  assert.equal(published.response.status, 200);
  const publicPayload = await requestJson<{ workspace?: Record<string, unknown> }>(harness.baseUrl, `/api/public/w/${workspace.slug}/${pack.slug}`);
  assert.equal(publicPayload.response.status, 200);
  assert.equal(publicPayload.body.workspace?.brandPlan, undefined, "internal entitlement tier is not exposed publicly");
  assert.equal((publicPayload.body.workspace?.brandSettings as Record<string, unknown> | undefined)?.themePreset, "ocean");
});

test("the staging external-side-effects kill switch blocks Stripe even when secrets are present", async (t) => {
  const sideEffectKeys = ["DISABLE_EXTERNAL_SIDE_EFFECTS", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;
  const original = new Map(sideEffectKeys.map((key) => [key, process.env[key]]));
  for (const [key, value] of [
    ["DISABLE_EXTERNAL_SIDE_EFFECTS", "true"],
    ["STRIPE_SECRET_KEY", "test-placeholder-stripe-secret"],
    ["STRIPE_WEBHOOK_SECRET", "test-placeholder-webhook-secret"],
  ] as const) process.env[key] = value;

  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app, { storage: new MemStorage() });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    await closeServer(server);
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const { response, body } = await requestJson<{ message?: string }>(
    `http://127.0.0.1:${address.port}`,
    "/api/stripe/webhook",
    { headers: { "stripe-signature": "test-placeholder-signature" }, body: {} },
  );
  assert.equal(response.status, 503);
  assert.match(body.message ?? "", /not configured/i);
});
