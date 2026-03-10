import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { evaluatePack } from "@shared/engine/interpreter";
import type { Answers } from "@shared/pack";
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
  const adminKey = process.env.ADMIN_KEY;
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
    });
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

      const pricing = version.definition.pricing;
      if (!pricing?.isPaid) {
        return res.status(400).json({ message: "Not a paid pack" });
      }

      const stripePriceId = pricing.stripePriceId?.trim();
      if (!stripePriceId) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const publicAppUrl = process.env.PUBLIC_APP_URL;
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
        if (session.payment_status !== "paid") {
          return res.status(402).json({ message: "Payment required" });
        }
      } catch (error) {
        return res.status(402).json({ message: "Payment required" });
      }
    }

    const evaluation = evaluatePack(version.definition, answers);
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
      answers,
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
    if (!name || !slug) {
      return res.status(400).json({ message: "name and slug are required" });
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

      if (!name || !slug) {
        return res.status(400).json({ message: "name and slug are required" });
      }

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

      if (!definition) {
        return res.status(400).json({ message: "definition is required" });
      }

      const existing = await storage.listPackVersions(packId);
      const nextVersion =
        typeof version === "number"
          ? version
          : existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;

      try {
        const created = await storage.createPackVersion({
          packId,
          version: nextVersion,
          definition,
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

  return httpServer;
}
