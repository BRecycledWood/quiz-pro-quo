import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { evaluatePack, getVisibleQuestionIds } from "@shared/engine/interpreter";
import type { Answers, PackDefinition, Question } from "@shared/pack";
import { renderAssessmentPdf } from "./pdf";
import PDFDocument from "pdfkit";
import Stripe from "stripe";

function requireAdmin(adminKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!adminKey) {
      return res.status(500).json({ message: "ADMIN_KEY not configured" });
    }

    const headerKey = req.header("x-admin-key");
    const authHeader = req.header("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const provided = headerKey ?? bearerToken;
    if (!provided || provided !== adminKey) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return next();
  };
}

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
    const buffer = Buffer.from(`${normalized}${padding}`, "base64");
    return buffer.toString("utf8");
  } catch (error) {
    return null;
  }
}

function parseAnswers(raw: unknown): Answers | null {
  if (raw === undefined || raw === null) return null;
  const encoded = Array.isArray(raw)
    ? raw.find((entry) => typeof entry === "string")
    : typeof raw === "string"
      ? raw
      : null;
  if (!encoded || encoded.trim().length === 0) return null;
  const decoded = decodeBase64Url(encoded);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Answers;
  } catch (error) {
    return null;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

const QUESTION_TYPES = new Set<Question["type"]>([
  "single", "multi", "number", "text", "short_text", "long_text", "date",
  "boolean", "yesno", "yes_no", "true_false", "select", "dropdown",
  "percent", "scale_1_5", "scale_1_10",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatePackDefinition(value: unknown): { definition?: PackDefinition; error?: string } {
  if (!isRecord(value) || !Array.isArray(value.questions) || !Array.isArray(value.outcomes)) {
    return { error: "A pack definition must include questions and outcomes arrays." };
  }
  const definition = value as unknown as PackDefinition;
  const questionIds = new Set<string>();
  const outcomeIds = new Set<string>();

  for (const outcome of definition.outcomes) {
    if (!outcome || typeof outcome.id !== "string" || !outcome.id.trim()) {
      return { error: "Every outcome needs an id." };
    }
    if (outcomeIds.has(outcome.id)) return { error: `Duplicate outcome id: ${outcome.id}` };
    outcomeIds.add(outcome.id);
    if (typeof outcome.title !== "string" || !outcome.title.trim()) {
      return { error: `Outcome ${outcome.id} needs a title.` };
    }
  }

  for (const question of definition.questions) {
    if (!question || typeof question.id !== "string" || !question.id.trim()) {
      return { error: "Every question needs an id." };
    }
    if (questionIds.has(question.id)) return { error: `Duplicate question id: ${question.id}` };
    questionIds.add(question.id);
    if (typeof question.prompt !== "string" || !question.prompt.trim()) {
      return { error: `Question ${question.id} needs prompt text.` };
    }
    if (!QUESTION_TYPES.has(question.type)) return { error: `Question ${question.id} has an unsupported type.` };
    if (["single", "select", "dropdown", "multi"].includes(question.type)) {
      if (!Array.isArray(question.options) || question.options.length === 0) {
        return { error: `Question ${question.id} needs at least one answer option.` };
      }
    }
  }

  for (const threshold of definition.thresholds ?? []) {
    if (!Number.isFinite(threshold.minScore) || (threshold.maxScore !== undefined && !Number.isFinite(threshold.maxScore))) {
      return { error: `Threshold ${threshold.id} must use numeric score limits.` };
    }
    if (!outcomeIds.has(threshold.outcomeId)) return { error: `Threshold ${threshold.id} points to a missing outcome.` };
  }

  if (definition.pricing?.isPaid && !definition.pricing.stripePriceId?.trim()) {
    return { error: "Add a Stripe price id before saving a paid pack." };
  }
  return { definition };
}

function isAnswered(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function validateQuestionAnswer(question: Question, value: unknown): string | null {
  const type = question.type;
  if (["boolean", "yesno", "yes_no", "true_false"].includes(type)) {
    return typeof value === "boolean" ? null : "Choose yes or no.";
  }
  if (["single", "select", "dropdown"].includes(type)) {
    if (typeof value !== "string" && typeof value !== "number") return "Choose one of the available options.";
    const allowed = (question.options ?? []).map((option) => String(option.value ?? option.id));
    return allowed.includes(String(value)) ? null : "Choose one of the available options.";
  }
  if (type === "multi") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" && typeof item !== "number")) {
      return "Choose valid options.";
    }
    const allowed = new Set((question.options ?? []).map((option) => String(option.value ?? option.id)));
    return value.every((item) => allowed.has(String(item))) ? null : "Choose valid options.";
  }
  if (["number", "percent", "scale_1_5", "scale_1_10"].includes(type)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a valid number.";
    if (type === "percent" && (value < 0 || value > 100)) return "Enter a percentage from 0 to 100.";
    if (type === "scale_1_5" && (value < 1 || value > 5)) return "Choose a value from 1 to 5.";
    if (type === "scale_1_10" && (value < 1 || value > 10)) return "Choose a value from 1 to 10.";
    return null;
  }
  if (["text", "short_text", "long_text", "date"].includes(type)) {
    return typeof value === "string" && value.length <= 5000 ? null : "Enter a valid response.";
  }
  return "This answer type is not supported.";
}

function validateAnswers(definition: PackDefinition, value: unknown): { answers?: Answers; error?: string } {
  if (!isRecord(value) || Object.keys(value).length > 100) {
    return { error: "Please answer the quiz before continuing." };
  }
  const questionIds = new Set(definition.questions.map((question) => question.id));
  if (Object.keys(value).some((questionId) => !questionIds.has(questionId))) {
    return { error: "The submitted answers do not match this quiz." };
  }
  const rawAnswers = value as Answers;
  const visibleIds = getVisibleQuestionIds(definition, rawAnswers);
  const answers: Answers = {};

  for (const questionId of visibleIds) {
    const question = definition.questions.find((item) => item.id === questionId)!;
    const answer = rawAnswers[questionId];
    if (!isAnswered(answer)) {
      if (question.required !== false) return { error: `Please answer: ${question.prompt}` };
      continue;
    }
    const issue = validateQuestionAnswer(question, answer);
    if (issue) return { error: `${question.prompt} ${issue}` };
    answers[questionId] = answer;
  }

  return { answers };
}

function formatFilenameTimestamp(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

let stripeClient: Stripe | null | undefined;

function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: "2024-06-20",
  });
  return stripeClient;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  const adminKey = process.env.ADMIN_KEY?.trim() || (
    process.env.NODE_ENV === "development" ? "local-dev-admin-key" : undefined
  );
  const adminAuth = requireAdmin(adminKey);

  app.get("/api/public/w/:workspaceSlug/:packSlug", async (req, res) => {
    const workspaceSlug = String(req.params.workspaceSlug);
    const packSlug = String(req.params.packSlug);
    const workspace = await storage.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) {
      return res.status(404).json({ message: "Not found" });
    }

    const pack = await storage.getPackBySlug(workspace.id, packSlug);
    if (!pack || !pack.publishedVersionId) {
      return res.status(404).json({ message: "Not found" });
    }

    const version = await storage.getPackVersion(pack.publishedVersionId);
    if (!version) {
      return res.status(404).json({ message: "Not found" });
    }

    if (req.query.preview !== "1") await storage.incrementPackViews(pack.id);

    return res.json({
      workspace,
      pack,
      version: {
        id: version.id,
        packId: version.packId,
        version: version.version,
        createdAt: version.createdAt,
      },
      definition: version.definition,
      publicAppUrlConfigured: Boolean(process.env.PUBLIC_APP_URL),
      emailConfigured: Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD &&
        process.env.EMAIL_FROM,
      ),
    });
  });

  app.post("/api/public/w/:workspaceSlug/:packSlug/start", async (req, res) => {
    const workspace = await storage.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });

    const pack = await storage.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack?.publishedVersionId) return res.status(404).json({ message: "Not found" });

    const version = await storage.getPackVersion(pack.publishedVersionId);
    if (!version) return res.status(404).json({ message: "Not found" });

    const submission = await storage.createSubmission({
      workspaceId: workspace.id,
      packId: pack.id,
      packVersionId: version.id,
      answers: {},
    });
    return res.status(201).json({ submissionId: submission.id, packVersionId: version.id });
  });

  app.post(
    "/api/public/w/:workspaceSlug/:packSlug/checkout",
    async (req, res) => {
      const workspaceSlug = String(req.params.workspaceSlug);
      const packSlug = String(req.params.packSlug);
      const answers = req.body?.answers as Answers | undefined;
      if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
        return res.status(400).json({ message: "Invalid answers" });
      }

      const workspace = await storage.getWorkspaceBySlug(workspaceSlug);
      if (!workspace) {
        return res.status(404).json({ message: "Not found" });
      }

      const pack = await storage.getPackBySlug(workspace.id, packSlug);
      if (!pack || !pack.publishedVersionId) {
        return res.status(404).json({ message: "Not found" });
      }

      const version = await storage.getPackVersion(pack.publishedVersionId);
      if (!version) {
        return res.status(404).json({ message: "Not found" });
      }
      const validatedAnswers = validateAnswers(version.definition, answers);
      if (!validatedAnswers.answers) {
        return res.status(400).json({ message: validatedAnswers.error ?? "Invalid answers" });
      }

      const pricing = version.definition.pricing;
      if (!pricing?.isPaid) {
        return res.status(400).json({ message: "Not a paid pack" });
      }

      const stripePriceId = pricing.stripePriceId?.trim();
      if (!stripePriceId) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const publicAppUrl = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "");
      if (!publicAppUrl) {
        return res.status(500).json({ message: "PUBLIC_APP_URL not configured" });
      }

      const stripe = getStripeClient();
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: stripePriceId, quantity: 1 }],
        client_reference_id: pack.id,
        metadata: {
          workspaceId: workspace.id,
          packId: pack.id,
          packVersionId: version.id,
        },
        success_url: `${publicAppUrl}/w/${workspaceSlug}/${packSlug}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicAppUrl}/w/${workspaceSlug}/${packSlug}?paid=0`,
      });

      return res.json({ url: session.url });
    },
  );

  // Example: curl "http://localhost:3000/api/public/w/demo/insurance-eligibility/pdf?answers=$(echo -n '{\"age\":25,\"coverage\":true,\"region\":\"west\"}' | node -e "const fs=require('fs');const input=fs.readFileSync(0,'utf8');const b=Buffer.from(input).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');process.stdout.write(b);")" --output result.pdf
  app.get("/api/public/w/:workspaceSlug/:packSlug/pdf", async (req, res) => {
    const workspaceSlug = String(req.params.workspaceSlug);
    const packSlug = String(req.params.packSlug);
    const answers = parseAnswers(req.query.answers);
    if (!answers) {
      return res.status(400).json({ message: "Invalid answers" });
    }

    const workspace = await storage.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) {
      return res.status(404).json({ message: "Not found" });
    }

    const pack = await storage.getPackBySlug(workspace.id, packSlug);
    if (!pack || !pack.publishedVersionId) {
      return res.status(404).json({ message: "Not found" });
    }

    const version = await storage.getPackVersion(pack.publishedVersionId);
    if (!version) {
      return res.status(404).json({ message: "Not found" });
    }
    const validatedAnswers = validateAnswers(version.definition, answers);
    if (!validatedAnswers.answers) {
      return res.status(400).json({ message: validatedAnswers.error ?? "Invalid answers" });
    }
    const safeAnswers = validatedAnswers.answers;

    const pricing = version.definition.pricing;
    if (pricing?.isPaid) {
      const sessionId = Array.isArray(req.query.session_id)
        ? req.query.session_id[0]
        : req.query.session_id;
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(402).json({ message: "Payment required" });
      }

      const stripe = getStripeClient();
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (
          session.payment_status !== "paid" ||
          session.metadata?.packId !== pack.id ||
          session.metadata?.workspaceId !== workspace.id
        ) {
          return res.status(402).json({ message: "Payment required" });
        }
      } catch (error) {
        return res.status(402).json({ message: "Payment required" });
      }
    }

    const evaluation = evaluatePack(version.definition, safeAnswers);
    const now = new Date();
    const filename = `qproquo-${workspace.slug}-${pack.slug}-${formatFilenameTimestamp(
      now,
    )}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );

    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    doc.pipe(res);

    await renderAssessmentPdf(doc, {
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        logoUrl: workspace.logoUrl ?? null,
        primaryColor: workspace.primaryColor ?? null,
        secondaryColor: workspace.secondaryColor ?? null,
      },
      pack: {
        name: pack.name,
        slug: pack.slug,
      },
      version: {
        version: version.version,
        createdAt: version.createdAt,
      },
      definition: version.definition,
      answers: safeAnswers,
      evaluation: {
        score: evaluation.score,
        reasons: evaluation.reasons,
        outcome: evaluation.outcome,
        disqualified: evaluation.disqualified,
      },
      timestamp: now,
    });

    doc.end();
  });

  app.get("/api/admin/workspaces", adminAuth, async (_req, res) => {
    const workspaces = await storage.listWorkspaces();
    return res.json({ workspaces });
  });

  app.post("/api/admin/workspaces", adminAuth, async (req, res) => {
    const { name, slug, logoUrl, primaryColor, secondaryColor } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120 || !isValidSlug(slug)) {
      return res.status(400).json({ message: "Use a workspace name (up to 120 characters) and a lowercase URL-safe slug." });
    }

    try {
      const workspace = await storage.createWorkspace({
        name,
        slug,
        logoUrl,
        primaryColor,
        secondaryColor,
      });
      return res.status(201).json({ workspace });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to create",
      });
    }
  });

  app.put("/api/admin/workspaces/:id", adminAuth, async (req, res) => {
    const id = String(req.params.id);
    const { name, slug, logoUrl, primaryColor, secondaryColor } = req.body ?? {};

    try {
      const workspace = await storage.updateWorkspace(id, {
        name,
        slug,
        logoUrl,
        primaryColor,
        secondaryColor,
      });
      if (!workspace) {
        return res.status(404).json({ message: "Not found" });
      }
      return res.json({ workspace });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to update",
      });
    }
  });

  app.get(
    "/api/admin/workspaces/:workspaceId/packs",
    adminAuth,
    async (req, res) => {
      const workspaceId = String(req.params.workspaceId);
      const packs = await storage.listPacks(workspaceId);
      return res.json({ packs });
    },
  );

  app.post(
    "/api/admin/workspaces/:workspaceId/packs",
    adminAuth,
    async (req, res) => {
      const workspaceId = String(req.params.workspaceId);
      const { name, slug, isPaid, stripePriceId } = req.body ?? {};

      if (typeof name !== "string" || !name.trim() || name.trim().length > 120 || !isValidSlug(slug)) {
        return res.status(400).json({ message: "Use a pack name (up to 120 characters) and a lowercase URL-safe slug." });
      }
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      try {
        const pack = await storage.createPack({
          workspaceId,
          name,
          slug,
          isPaid: Boolean(isPaid),
          stripePriceId: stripePriceId ?? null,
        });
        return res.status(201).json({ pack });
      } catch (error) {
        return res.status(400).json({
          message: error instanceof Error ? error.message : "Unable to create",
        });
      }
    },
  );

  app.put("/api/admin/packs/:id", adminAuth, async (req, res) => {
    const id = String(req.params.id);
    const { name, slug, isPaid, stripePriceId } = req.body ?? {};

    try {
      const pack = await storage.updatePack(id, {
        name,
        slug,
        isPaid,
        stripePriceId,
      });
      if (!pack) {
        return res.status(404).json({ message: "Not found" });
      }
      return res.json({ pack });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to update",
      });
    }
  });

  app.get("/api/admin/packs/:packId/versions", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const versions = await storage.listPackVersions(packId);
    return res.json({ versions });
  });

  app.post("/api/admin/packs/:packId/clone", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const { newName, newSlug, targetWorkspaceId } = req.body ?? {};
    if (!newName || !newSlug) {
      return res.status(400).json({ message: "newName and newSlug are required" });
    }

    const sourcePack = await storage.getPack(packId);
    if (!sourcePack || !sourcePack.publishedVersionId) {
      return res.status(404).json({ message: "Not found" });
    }

    const sourceVersion = await storage.getPackVersion(
      sourcePack.publishedVersionId,
    );
    if (!sourceVersion) {
      return res.status(400).json({ message: "Source pack not published" });
    }

    const workspaceId = targetWorkspaceId
      ? String(targetWorkspaceId)
      : sourcePack.workspaceId;
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const pricing = sourceVersion.definition.pricing;
    const isPaid = Boolean(pricing?.isPaid);
    const stripePriceId = pricing?.stripePriceId ?? null;

    try {
      const pack = await storage.createPack({
        workspaceId,
        name: String(newName),
        slug: String(newSlug),
        isPaid,
        stripePriceId,
      });

      const version = await storage.createPackVersion({
        packId: pack.id,
        version: 1,
        definition: sourceVersion.definition,
      });

      await storage.publishVersion(pack.id, version.id);

      return res.status(201).json({ pack, version });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to clone pack",
      });
    }
  });

  app.post(
    "/api/admin/packs/:packId/versions",
    adminAuth,
    async (req, res) => {
      const packId = String(req.params.packId);
      const { version, definition } = req.body ?? {};

      const validation = validatePackDefinition(definition);
      if (!validation.definition) {
        return res.status(400).json({ message: validation.error ?? "Invalid definition" });
      }
      const pack = await storage.getPack(packId);
      if (!pack) return res.status(404).json({ message: "Pack not found" });

      const existing = await storage.listPackVersions(packId);
      const nextVersion =
        typeof version === "number"
          ? version
          : existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;

      try {
        const created = await storage.createPackVersion({
          packId,
          version: nextVersion,
          definition: validation.definition!,
        });
        return res.status(201).json({ version: created });
      } catch (error) {
        return res.status(400).json({
          message: error instanceof Error ? error.message : "Unable to create",
        });
      }
    },
  );

  app.post(
    "/api/admin/packs/:packId/publish/:versionId",
    adminAuth,
    async (req, res) => {
      const packId = String(req.params.packId);
      const versionId = String(req.params.versionId);
      const pack = await storage.publishVersion(packId, versionId);
      if (!pack) {
        return res.status(404).json({ message: "Not found" });
      }

      return res.json({ pack });
    },
  );

  // The browser collects answers and contact details, but score/outcome are always
  // recomputed here so the submitted lead cannot alter its own qualification.
  app.post("/api/public/w/:workspaceSlug/:packSlug/submit", async (req, res) => {
    const workspace = await storage.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });

    const pack = await storage.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack) return res.status(404).json({ message: "Not found" });

    const {
      submissionId,
      email,
      firstName,
      answers: rawAnswers,
      paid,
      stripeSessionId,
    } = req.body ?? {};

    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    if (!normalizedEmail || normalizedEmail.length > 320 || !EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: "A valid email address is required to unlock results." });
    }
    if (firstName !== undefined && firstName !== null && (typeof firstName !== "string" || firstName.trim().length > 100)) {
      return res.status(400).json({ message: "First name must be 100 characters or fewer." });
    }

    let existingSubmission: Awaited<ReturnType<typeof storage.getSubmission>>;
    if (submissionId !== undefined) {
      if (typeof submissionId !== "string" || !submissionId.trim()) {
        return res.status(400).json({ message: "Invalid submission id." });
      }
      existingSubmission = await storage.getSubmission(submissionId);
      if (
        !existingSubmission ||
        existingSubmission.workspaceId !== workspace.id ||
        existingSubmission.packId !== pack.id
      ) {
        return res.status(404).json({ message: "Quiz session not found. Please start again." });
      }
    }

    const versionId = existingSubmission?.packVersionId ?? pack.publishedVersionId;
    if (!versionId) return res.status(404).json({ message: "This quiz has not been published." });
    const version = await storage.getPackVersion(versionId);
    if (!version || version.packId !== pack.id) {
      return res.status(404).json({ message: "Quiz version not found." });
    }

    const validated = validateAnswers(version.definition, rawAnswers);
    if (!validated.answers) return res.status(400).json({ message: validated.error ?? "Invalid answers." });
    const answers = validated.answers;
    const evaluation = evaluatePack(version.definition, answers);

    let verifiedPaid = false;
    let verifiedStripeSessionId: string | null = null;
    let amountPaidCents = 0;
    if (paid === true && typeof stripeSessionId === "string") {
      const stripe = getStripeClient();
      if (stripe) {
        try {
          const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
          verifiedPaid = session.payment_status === "paid" &&
            session.metadata?.packId === pack.id &&
            session.metadata?.workspaceId === workspace.id;
          if (verifiedPaid) {
            verifiedStripeSessionId = stripeSessionId;
            amountPaidCents = session.amount_total ?? 0;
          }
        } catch (error) {
          console.warn("[submit] Stripe session verification failed:", error);
        }
      }
    }

    // A retry after a successful response is idempotent. A verified Stripe return
    // may still update the payment fields, but never creates another lead or email.
    if (existingSubmission?.completedAt) {
      if (verifiedPaid) {
        await storage.updateSubmission(existingSubmission.id, {
          paid: true,
          amountPaidCents,
          stripeSessionId: verifiedStripeSessionId,
        });
      }
      return res.json({
        id: existingSubmission.id,
        success: true,
        evaluation: evaluatePack(version.definition, existingSubmission.answers as Answers),
        emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM),
      });
    }

    let submission;
    try {
      const submissionData = {
        email: normalizedEmail,
        firstName: typeof firstName === "string" && firstName.trim() ? firstName.trim() : null,
        answers,
        score: evaluation.score,
        outcomeId: evaluation.outcome?.id ?? null,
        outcomeLabel: evaluation.outcome?.title ?? null,
        paid: verifiedPaid,
        amountPaidCents,
        stripeSessionId: verifiedStripeSessionId,
        completedAt: new Date(),
      };
      submission = existingSubmission
        ? await storage.updateSubmission(existingSubmission.id, submissionData)
        : await storage.createSubmission({
            workspaceId: workspace.id,
            packId: pack.id,
            packVersionId: version.id,
            ...submissionData,
          });
      if (!submission) throw new Error("Quiz session is no longer available");
    } catch (error) {
      console.error("[submit] save failed:", error);
      return res.status(500).json({ message: "We couldn't save your results. Please try again." });
    }

    // Result delivery is asynchronous so the visitor can see results immediately.
    // The lead remains saved even if SMTP is not configured or temporarily unavailable.
    (async () => {
      try {
        const { sendResultsEmail, sendLeadNotification } = await import("./email");
        const doc = new PDFDocument({ size: "LETTER", margin: 48 });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        await new Promise<void>((resolve, reject) => {
          doc.on("end", resolve);
          doc.on("error", reject);
          renderAssessmentPdf(doc, {
            workspace: {
              name: workspace.name,
              slug: workspace.slug,
              logoUrl: workspace.logoUrl ?? null,
              primaryColor: workspace.primaryColor ?? null,
              secondaryColor: workspace.secondaryColor ?? null,
            },
            pack: { name: pack.name, slug: pack.slug },
            version: { version: version.version, createdAt: version.createdAt },
            definition: version.definition,
            answers,
            evaluation: {
              score: evaluation.score,
              reasons: evaluation.reasons,
              outcome: evaluation.outcome,
              disqualified: evaluation.disqualified,
            },
            timestamp: new Date(),
          }).then(() => doc.end()).catch(reject);
        });

        const pdfSent = await sendResultsEmail({
          to: normalizedEmail,
          firstName: submission.firstName ?? undefined,
          packName: pack.name,
          outcomeLabel: evaluation.outcome?.title ?? "Your Results",
          outcomeMessage: evaluation.outcome?.description ?? "",
          score: evaluation.score,
          pdfBuffer: Buffer.concat(chunks),
          workspaceName: workspace.name,
          packSlug: pack.slug,
        });
        await sendLeadNotification({
          packName: pack.name,
          workspaceName: workspace.name,
          leadEmail: normalizedEmail,
          leadFirstName: submission.firstName ?? undefined,
          score: evaluation.score,
          outcomeLabel: evaluation.outcome?.title ?? "Unknown",
          submissionId: submission.id,
        });
        if (pdfSent) await storage.updateSubmission(submission.id, { pdfSent: true });
      } catch (emailError) {
        console.error("[submit] Email delivery failed:", emailError);
      }
    })();

    return res.json({
      id: submission.id,
      success: true,
      evaluation,
      emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM),
    });
  });

  // ─── NEW: Admin submission/stats endpoints ──────────────────────────────────

  app.get("/api/admin/workspaces/:workspaceId/submissions", adminAuth, async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const all = await storage.getSubmissionsByWorkspace(workspaceId);
    return res.json({ submissions: all.slice(offset, offset + limit), total: all.length });
  });

  app.get("/api/admin/packs/:packId/stats", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const pack = await storage.getPack(packId);
    if (!pack) return res.status(404).json({ message: "Pack not found" });
    return res.json(await storage.getPackStats(packId));
  });

  app.get("/api/admin/packs/:packId/submissions", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const pack = await storage.getPack(packId);
    if (!pack) return res.status(404).json({ message: "Pack not found" });
    const submissions = await storage.getSubmissionsByPack(packId);
    return res.json(submissions);
  });

  app.get("/api/admin/workspaces/:workspaceId/stats", adminAuth, async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const stats = await storage.getWorkspaceStats(workspaceId);
    return res.json(stats);
  });

  app.get("/api/admin/submissions/:id", adminAuth, async (req, res) => {
    const id = String(req.params.id);
    const submission = await storage.getSubmission(id);
    if (!submission) return res.status(404).json({ message: "Not found" });
    return res.json(submission);
  });

  return httpServer;
}
