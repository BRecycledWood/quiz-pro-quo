import { randomUUID } from "crypto";
import { Pool } from "pg";
import type { PackDefinition } from "@shared/pack";
import type { Pack, PackVersion, Submission, Workspace } from "@shared/schema";

export type PackVersionRecord = Omit<PackVersion, "definition"> & {
  definition: PackDefinition;
};

export type WorkspaceCreateInput = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type WorkspaceUpdateInput = {
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type PackCreateInput = {
  workspaceId: string;
  name: string;
  slug: string;
  isPaid?: boolean;
  stripePriceId?: string | null;
};

export type PackUpdateInput = {
  name?: string;
  slug?: string;
  isPaid?: boolean;
  stripePriceId?: string | null;
};

export type PackVersionCreateInput = {
  packId: string;
  version: number;
  definition: PackDefinition;
};

export type SubmissionCreateInput = {
  workspaceId: string;
  packId: string;
  packVersionId: string;
  email?: string | null;
  firstName?: string | null;
  answers: Record<string, unknown>;
  score?: number | null;
  outcomeId?: string | null;
  outcomeLabel?: string | null;
  paid?: boolean;
  stripeSessionId?: string | null;
  pdfSent?: boolean;
  completedAt?: Date | null;
  createdAt?: Date;
};

export type SubmissionUpdateInput = {
  pdfSent?: boolean;
  paid?: boolean;
  stripeSessionId?: string | null;
  completedAt?: Date | null;
};

export type WorkspaceStats = {
  totalSubmissions: number;
  completedSubmissions: number;
  totalRevenue: number;
  avgCompletionRate: number;
  submissionsByDay: Array<{ date: string; count: number }>;
  outcomeBreakdown: Array<{ outcomeId: string; label: string; count: number }>;
  quizBreakdown: Array<{
    packId: string;
    packName: string;
    packSlug: string;
    totalSubmissions: number;
    completedSubmissions: number;
    completionRate: number;
    totalRevenue: number;
    lastSubmissionAt: string | null;
  }>;
};

export interface IStorage {
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceBySlug(slug: string): Promise<Workspace | undefined>;
  createWorkspace(input: WorkspaceCreateInput): Promise<Workspace>;
  updateWorkspace(id: string, input: WorkspaceUpdateInput): Promise<Workspace | undefined>;

  listPacks(workspaceId: string): Promise<Pack[]>;
  getPack(id: string): Promise<Pack | undefined>;
  getPackBySlug(workspaceId: string, slug: string): Promise<Pack | undefined>;
  createPack(input: PackCreateInput): Promise<Pack>;
  updatePack(id: string, input: PackUpdateInput): Promise<Pack | undefined>;

  listPackVersions(packId: string): Promise<PackVersionRecord[]>;
  getPackVersion(id: string): Promise<PackVersionRecord | undefined>;
  createPackVersion(input: PackVersionCreateInput): Promise<PackVersionRecord>;
  publishVersion(packId: string, versionId: string): Promise<Pack | undefined>;

  createSubmission(input: SubmissionCreateInput): Promise<Submission>;
  updateSubmission(id: string, data: SubmissionUpdateInput): Promise<Submission | undefined>;
  getSubmissionsByPack(packId: string): Promise<Submission[]>;
  getSubmissionsByWorkspace(workspaceId: string): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | undefined>;
  countSubmissionsByWorkspace(workspaceId: string): Promise<number>;
  getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats>;
}

function sortSubmissionsDesc(submissions: Submission[]) {
  return [...submissions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function buildWorkspaceStats(
  allSubs: Submission[],
  packsById: Map<string, Pick<Pack, "id" | "name" | "slug">>,
): WorkspaceStats {
  const completed = allSubs.filter((s) => s.completedAt !== null);
  const paidSubs = allSubs.filter((s) => s.paid);
  const totalRevenue = paidSubs.length * 49;

  const dayMap = new Map<string, number>();
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }
  allSubs.forEach((s) => {
    const key = new Date(s.createdAt).toISOString().slice(0, 10);
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  });
  const submissionsByDay = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

  const outcomeMap = new Map<string, { label: string; count: number }>();
  allSubs.forEach((s) => {
    if (!s.outcomeId || !s.outcomeLabel) return;
    const existing = outcomeMap.get(s.outcomeId);
    if (existing) {
      existing.count++;
    } else {
      outcomeMap.set(s.outcomeId, { label: s.outcomeLabel, count: 1 });
    }
  });
  const outcomeBreakdown = Array.from(outcomeMap.entries()).map(([outcomeId, { label, count }]) => ({
    outcomeId,
    label,
    count,
  }));

  const packIds = Array.from(new Set(allSubs.map((s) => s.packId)));
  const quizBreakdown = packIds.map((packId) => {
    const pack = packsById.get(packId);
    const packSubs = allSubs.filter((s) => s.packId === packId);
    const packCompleted = packSubs.filter((s) => s.completedAt !== null);
    const packPaid = packSubs.filter((s) => s.paid);
    const sorted = sortSubmissionsDesc(packSubs);
    return {
      packId,
      packName: pack?.name ?? packId,
      packSlug: pack?.slug ?? packId,
      totalSubmissions: packSubs.length,
      completedSubmissions: packCompleted.length,
      completionRate: packSubs.length > 0 ? Math.round((packCompleted.length / packSubs.length) * 100) : 0,
      totalRevenue: packPaid.length * 49,
      lastSubmissionAt: sorted[0]?.createdAt ? new Date(sorted[0].createdAt).toISOString() : null,
    };
  });

  return {
    totalSubmissions: allSubs.length,
    completedSubmissions: completed.length,
    totalRevenue,
    avgCompletionRate: allSubs.length > 0 ? Math.round((completed.length / allSubs.length) * 100) : 0,
    submissionsByDay,
    outcomeBreakdown,
    quizBreakdown,
  };
}

export class MemStorage implements IStorage {
  private workspaces: Map<string, Workspace>;
  private packs: Map<string, Pack>;
  private packVersions: Map<string, PackVersionRecord>;
  private submissions: Map<string, Submission>;

  constructor() {
    this.workspaces = new Map();
    this.packs = new Map();
    this.packVersions = new Map();
    this.submissions = new Map();
    this.seed();
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return Array.from(this.workspaces.values());
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async getWorkspaceBySlug(slug: string): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(
      (workspace) => workspace.slug === slug,
    );
  }

  async createWorkspace(input: WorkspaceCreateInput): Promise<Workspace> {
    const exists = Array.from(this.workspaces.values()).some(
      (workspace) => workspace.slug === input.slug,
    );
    if (exists) {
      throw new Error("Workspace slug already exists");
    }
    return this.addWorkspace(input);
  }

  async updateWorkspace(id: string, input: WorkspaceUpdateInput): Promise<Workspace | undefined> {
    const workspace = this.workspaces.get(id);
    if (!workspace) return undefined;
    if (input.slug && input.slug !== workspace.slug) {
      const exists = Array.from(this.workspaces.values()).some(
        (item) => item.slug === input.slug && item.id !== id,
      );
      if (exists) throw new Error("Workspace slug already exists");
    }
    const updated: Workspace = {
      ...workspace,
      name: input.name ?? workspace.name,
      slug: input.slug ?? workspace.slug,
      logoUrl: input.logoUrl ?? workspace.logoUrl,
      primaryColor: input.primaryColor ?? workspace.primaryColor,
      secondaryColor: input.secondaryColor ?? workspace.secondaryColor,
      updatedAt: new Date(),
    };
    this.workspaces.set(id, updated);
    return updated;
  }

  async listPacks(workspaceId: string): Promise<Pack[]> {
    return Array.from(this.packs.values()).filter(
      (pack) => pack.workspaceId === workspaceId,
    );
  }

  async getPack(id: string): Promise<Pack | undefined> {
    return this.packs.get(id);
  }

  async getPackBySlug(workspaceId: string, slug: string): Promise<Pack | undefined> {
    return Array.from(this.packs.values()).find(
      (pack) => pack.workspaceId === workspaceId && pack.slug === slug,
    );
  }

  async createPack(input: PackCreateInput): Promise<Pack> {
    const exists = Array.from(this.packs.values()).some(
      (pack) => pack.workspaceId === input.workspaceId && pack.slug === input.slug,
    );
    if (exists) throw new Error("Pack slug already exists in workspace");
    return this.addPack(input);
  }

  async updatePack(id: string, input: PackUpdateInput): Promise<Pack | undefined> {
    const pack = this.packs.get(id);
    if (!pack) return undefined;
    if (input.slug && input.slug !== pack.slug) {
      const exists = Array.from(this.packs.values()).some(
        (item) => item.workspaceId === pack.workspaceId && item.slug === input.slug && item.id !== id,
      );
      if (exists) throw new Error("Pack slug already exists in workspace");
    }
    const updated: Pack = {
      ...pack,
      name: input.name ?? pack.name,
      slug: input.slug ?? pack.slug,
      isPaid: input.isPaid ?? pack.isPaid,
      stripePriceId: input.stripePriceId ?? pack.stripePriceId,
      updatedAt: new Date(),
    };
    this.packs.set(id, updated);
    return updated;
  }

  async listPackVersions(packId: string): Promise<PackVersionRecord[]> {
    return Array.from(this.packVersions.values()).filter(
      (version) => version.packId === packId,
    );
  }

  async getPackVersion(id: string): Promise<PackVersionRecord | undefined> {
    return this.packVersions.get(id);
  }

  async createPackVersion(input: PackVersionCreateInput): Promise<PackVersionRecord> {
    const existing = Array.from(this.packVersions.values()).find(
      (version) => version.packId === input.packId && version.version === input.version,
    );
    if (existing) throw new Error("Version already exists for pack");
    return this.addPackVersion(input);
  }

  async publishVersion(packId: string, versionId: string): Promise<Pack | undefined> {
    const version = this.packVersions.get(versionId);
    if (!version || version.packId !== packId) return undefined;
    const pack = this.packs.get(packId);
    if (!pack) return undefined;
    const updatedPack: Pack = { ...pack, publishedVersionId: versionId, updatedAt: new Date() };
    this.packs.set(packId, updatedPack);
    return updatedPack;
  }

  async createSubmission(input: SubmissionCreateInput): Promise<Submission> {
    const now = new Date();
    const submission: Submission = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      packId: input.packId,
      packVersionId: input.packVersionId,
      email: input.email ?? null,
      firstName: input.firstName ?? null,
      answers: input.answers as Submission["answers"],
      score: input.score ?? null,
      outcomeId: input.outcomeId ?? null,
      outcomeLabel: input.outcomeLabel ?? null,
      paid: input.paid ?? false,
      stripeSessionId: input.stripeSessionId ?? null,
      pdfSent: input.pdfSent ?? false,
      completedAt: input.completedAt ?? null,
      createdAt: input.createdAt ?? now,
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async updateSubmission(id: string, data: SubmissionUpdateInput): Promise<Submission | undefined> {
    const sub = this.submissions.get(id);
    if (!sub) return undefined;
    const updated: Submission = {
      ...sub,
      pdfSent: data.pdfSent ?? sub.pdfSent,
      paid: data.paid ?? sub.paid,
      stripeSessionId: data.stripeSessionId !== undefined ? data.stripeSessionId : sub.stripeSessionId,
      completedAt: data.completedAt !== undefined ? data.completedAt : sub.completedAt,
    };
    this.submissions.set(id, updated);
    return updated;
  }

  async getSubmission(id: string): Promise<Submission | undefined> {
    return this.submissions.get(id);
  }

  async getSubmissionsByPack(packId: string): Promise<Submission[]> {
    return sortSubmissionsDesc(
      Array.from(this.submissions.values()).filter((s) => s.packId === packId),
    );
  }

  async getSubmissionsByWorkspace(workspaceId: string): Promise<Submission[]> {
    return sortSubmissionsDesc(
      Array.from(this.submissions.values()).filter((s) => s.workspaceId === workspaceId),
    );
  }

  async countSubmissionsByWorkspace(workspaceId: string): Promise<number> {
    return Array.from(this.submissions.values()).filter(
      (s) => s.workspaceId === workspaceId,
    ).length;
  }

  async getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
    const allSubs = Array.from(this.submissions.values()).filter((s) => s.workspaceId === workspaceId);
    const packsById = new Map(
      Array.from(this.packs.values()).map((pack) => [pack.id, pack] as const),
    );
    return buildWorkspaceStats(allSubs, packsById);
  }

  private addWorkspace(input: WorkspaceCreateInput): Workspace {
    const now = new Date();
    const workspace: Workspace = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      secondaryColor: input.secondaryColor ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  private addPack(input: PackCreateInput): Pack {
    const now = new Date();
    const pack: Pack = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug,
      publishedVersionId: null,
      isPaid: input.isPaid ?? false,
      stripePriceId: input.stripePriceId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.packs.set(pack.id, pack);
    return pack;
  }

  private addPackVersion(input: PackVersionCreateInput): PackVersionRecord {
    const now = new Date();
    const version: PackVersionRecord = {
      id: randomUUID(),
      packId: input.packId,
      version: input.version,
      definition: input.definition,
      createdAt: now,
    };
    this.packVersions.set(version.id, version);
    return version;
  }

  private seed() {
    const demo = this.addWorkspace({
      name: "Demo Workspace",
      slug: "demo",
      logoUrl: "https://placehold.co/120x120",
      primaryColor: "#0f766e",
      secondaryColor: "#0f172a",
    });

    this.addWorkspace({
      name: "Partner Workspace",
      slug: "partner",
      logoUrl: "https://placehold.co/120x120",
      primaryColor: "#0f4c81",
      secondaryColor: "#f97316",
    });

    const insurancePack = this.addPack({
      workspaceId: demo.id,
      name: "Insurance Eligibility",
      slug: "insurance-eligibility",
      isPaid: false,
    });

    const propertyPack = this.addPack({
      workspaceId: demo.id,
      name: "Property Readiness",
      slug: "property-readiness",
      isPaid: true,
      stripePriceId: "price_1Stom3IxvVaQKv3AefT04dyg",
    });

    const insuranceDefinition: import("@shared/pack").PackDefinition = {
      name: "Insurance Eligibility",
      version: 1,
      outcomes: [
        { id: "eligible", title: "Eligible", description: "Based on current inputs, eligibility criteria is met.", status: "pass" },
        { id: "ineligible", title: "Not Eligible", description: "Eligibility criteria is not met.", status: "fail" },
      ],
      questions: [
        { id: "age", prompt: "What is the applicant's age?", type: "number" },
        { id: "coverage", prompt: "Do you currently have active coverage?", type: "boolean" },
        { id: "region", prompt: "Primary region of residence", type: "single", options: [{ id: "north", label: "North" }, { id: "south", label: "South" }, { id: "west", label: "West" }, { id: "east", label: "East" }] },
      ],
      disqualifiers: [{ id: "no-coverage", reason: "Active coverage is required.", when: { all: [{ questionId: "coverage", operator: "equals", value: false }] } }],
      scoring: [
        { id: "age-qualifier", points: 2, when: { all: [{ questionId: "age", operator: "gte", value: 18 }] } },
        { id: "region-west", points: 1, when: { all: [{ questionId: "region", operator: "equals", value: "west" }] } },
      ],
      thresholds: [{ id: "t1", minScore: 0, maxScore: 2, outcomeId: "ineligible" }, { id: "t2", minScore: 3, outcomeId: "eligible" }],
      pricing: { isPaid: false },
    };

    const propertyDefinition: import("@shared/pack").PackDefinition = {
      name: "Property Readiness",
      version: 1,
      outcomes: [
        { id: "ready", title: "Ready", description: "The property appears ready for onboarding.", status: "pass" },
        { id: "needs-review", title: "Needs Review", description: "Additional checks are required before onboarding.", status: "caution" },
      ],
      questions: [
        { id: "units", prompt: "How many units are in the property?", type: "number" },
        { id: "compliance", prompt: "Has the property passed compliance checks?", type: "boolean" },
        { id: "category", prompt: "Primary property category", type: "single", options: [{ id: "residential", label: "Residential" }, { id: "commercial", label: "Commercial" }, { id: "mixed", label: "Mixed Use" }] },
      ],
      disqualifiers: [{ id: "compliance-fail", reason: "Compliance checks are required.", when: { all: [{ questionId: "compliance", operator: "equals", value: false }] } }],
      scoring: [
        { id: "units-qualifier", points: 2, when: { all: [{ questionId: "units", operator: "gte", value: 10 }] } },
        { id: "category-commercial", points: 1, when: { all: [{ questionId: "category", operator: "equals", value: "commercial" }] } },
      ],
      thresholds: [{ id: "p1", minScore: 0, maxScore: 2, outcomeId: "needs-review" }, { id: "p2", minScore: 3, outcomeId: "ready" }],
      pricing: { isPaid: true, stripePriceId: "price_1Stom3IxvVaQKv3AefT04dyg" },
    };

    const insuranceVersion = this.addPackVersion({ packId: insurancePack.id, version: 1, definition: insuranceDefinition });
    const propertyVersion = this.addPackVersion({ packId: propertyPack.id, version: 1, definition: propertyDefinition });
    this.publishVersion(insurancePack.id, insuranceVersion.id);
    this.publishVersion(propertyPack.id, propertyVersion.id);
  }
}

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PackRow = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  publishedVersionId: string | null;
  isPaid: boolean;
  stripePriceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PackVersionRow = {
  id: string;
  packId: string;
  version: number;
  definition: PackDefinition;
  createdAt: Date;
};

type SubmissionRow = {
  id: string;
  workspaceId: string;
  packId: string;
  packVersionId: string;
  email: string | null;
  firstName: string | null;
  answers: Submission["answers"];
  score: number | null;
  outcomeId: string | null;
  outcomeLabel: string | null;
  paid: boolean;
  stripeSessionId: string | null;
  pdfSent: boolean;
  completedAt: Date | null;
  createdAt: Date;
};

function mapWorkspace(row: WorkspaceRow): Workspace {
  return row;
}

function mapPack(row: PackRow): Pack {
  return row;
}

function mapPackVersion(row: PackVersionRow): PackVersionRecord {
  return row;
}

function mapSubmission(row: SubmissionRow): Submission {
  return row;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export class PgStorage implements IStorage {
  private pool: Pool;
  private ready: Promise<void>;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.ready = this.ensureSchema();
  }

  private async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        logo_url text,
        primary_color text,
        secondary_color text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS packs (
        id text PRIMARY KEY,
        workspace_id text NOT NULL,
        name text NOT NULL,
        slug text NOT NULL,
        published_version_id text,
        is_paid boolean NOT NULL DEFAULT false,
        stripe_price_id text,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS pack_versions (
        id text PRIMARY KEY,
        pack_id text NOT NULL,
        version integer NOT NULL,
        definition jsonb NOT NULL,
        created_at timestamptz NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id text PRIMARY KEY,
        workspace_id text NOT NULL,
        pack_id text NOT NULL,
        pack_version_id text NOT NULL,
        email text,
        first_name text,
        answers jsonb NOT NULL,
        score integer,
        outcome_id text,
        outcome_label text,
        paid boolean NOT NULL DEFAULT false,
        stripe_session_id text,
        pdf_sent boolean NOT NULL DEFAULT false,
        completed_at timestamptz,
        created_at timestamptz NOT NULL
      );
    `);
    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_unique_idx ON workspaces (slug);`);
    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS packs_workspace_slug_unique_idx ON packs (workspace_id, slug);`);
    await this.pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS pack_versions_pack_version_unique_idx ON pack_versions (pack_id, version);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS submissions_workspace_id_idx ON submissions (workspace_id);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS submissions_pack_id_idx ON submissions (pack_id);`);
  }

  private async queryOne<T>(sql: string, values: unknown[] = []) {
    await this.ready;
    const result = await this.pool.query(sql, values);
    return result.rows[0] as T | undefined;
  }

  private async queryMany<T>(sql: string, values: unknown[] = []) {
    await this.ready;
    const result = await this.pool.query(sql, values);
    return result.rows as T[];
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = await this.queryMany<WorkspaceRow>(`
      SELECT
        id,
        name,
        slug,
        logo_url AS "logoUrl",
        primary_color AS "primaryColor",
        secondary_color AS "secondaryColor",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM workspaces
      ORDER BY created_at ASC
    `);
    return rows.map(mapWorkspace);
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const row = await this.queryOne<WorkspaceRow>(`
      SELECT
        id,
        name,
        slug,
        logo_url AS "logoUrl",
        primary_color AS "primaryColor",
        secondary_color AS "secondaryColor",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM workspaces
      WHERE id = $1
    `, [id]);
    return row ? mapWorkspace(row) : undefined;
  }

  async getWorkspaceBySlug(slug: string): Promise<Workspace | undefined> {
    const row = await this.queryOne<WorkspaceRow>(`
      SELECT
        id,
        name,
        slug,
        logo_url AS "logoUrl",
        primary_color AS "primaryColor",
        secondary_color AS "secondaryColor",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM workspaces
      WHERE slug = $1
    `, [slug]);
    return row ? mapWorkspace(row) : undefined;
  }

  async createWorkspace(input: WorkspaceCreateInput): Promise<Workspace> {
    const workspace: Workspace = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      secondaryColor: input.secondaryColor ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      const row = await this.queryOne<WorkspaceRow>(`
        INSERT INTO workspaces (
          id, name, slug, logo_url, primary_color, secondary_color, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          name,
          slug,
          logo_url AS "logoUrl",
          primary_color AS "primaryColor",
          secondary_color AS "secondaryColor",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        workspace.id,
        workspace.name,
        workspace.slug,
        workspace.logoUrl,
        workspace.primaryColor,
        workspace.secondaryColor,
        workspace.createdAt,
        workspace.updatedAt,
      ]);
      return mapWorkspace(row!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Workspace slug already exists");
      throw error;
    }
  }

  async updateWorkspace(id: string, input: WorkspaceUpdateInput): Promise<Workspace | undefined> {
    const existing = await this.getWorkspace(id);
    if (!existing) return undefined;
    try {
      const row = await this.queryOne<WorkspaceRow>(`
        UPDATE workspaces
        SET
          name = $2,
          slug = $3,
          logo_url = $4,
          primary_color = $5,
          secondary_color = $6,
          updated_at = $7
        WHERE id = $1
        RETURNING
          id,
          name,
          slug,
          logo_url AS "logoUrl",
          primary_color AS "primaryColor",
          secondary_color AS "secondaryColor",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        id,
        input.name ?? existing.name,
        input.slug ?? existing.slug,
        input.logoUrl ?? existing.logoUrl,
        input.primaryColor ?? existing.primaryColor,
        input.secondaryColor ?? existing.secondaryColor,
        new Date(),
      ]);
      return row ? mapWorkspace(row) : undefined;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Workspace slug already exists");
      throw error;
    }
  }

  async listPacks(workspaceId: string): Promise<Pack[]> {
    const rows = await this.queryMany<PackRow>(`
      SELECT
        id,
        workspace_id AS "workspaceId",
        name,
        slug,
        published_version_id AS "publishedVersionId",
        is_paid AS "isPaid",
        stripe_price_id AS "stripePriceId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM packs
      WHERE workspace_id = $1
      ORDER BY created_at ASC
    `, [workspaceId]);
    return rows.map(mapPack);
  }

  async getPack(id: string): Promise<Pack | undefined> {
    const row = await this.queryOne<PackRow>(`
      SELECT
        id,
        workspace_id AS "workspaceId",
        name,
        slug,
        published_version_id AS "publishedVersionId",
        is_paid AS "isPaid",
        stripe_price_id AS "stripePriceId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM packs
      WHERE id = $1
    `, [id]);
    return row ? mapPack(row) : undefined;
  }

  async getPackBySlug(workspaceId: string, slug: string): Promise<Pack | undefined> {
    const row = await this.queryOne<PackRow>(`
      SELECT
        id,
        workspace_id AS "workspaceId",
        name,
        slug,
        published_version_id AS "publishedVersionId",
        is_paid AS "isPaid",
        stripe_price_id AS "stripePriceId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM packs
      WHERE workspace_id = $1 AND slug = $2
    `, [workspaceId, slug]);
    return row ? mapPack(row) : undefined;
  }

  async createPack(input: PackCreateInput): Promise<Pack> {
    const pack: Pack = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug,
      publishedVersionId: null,
      isPaid: input.isPaid ?? false,
      stripePriceId: input.stripePriceId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      const row = await this.queryOne<PackRow>(`
        INSERT INTO packs (
          id, workspace_id, name, slug, published_version_id, is_paid, stripe_price_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          workspace_id AS "workspaceId",
          name,
          slug,
          published_version_id AS "publishedVersionId",
          is_paid AS "isPaid",
          stripe_price_id AS "stripePriceId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        pack.id,
        pack.workspaceId,
        pack.name,
        pack.slug,
        pack.publishedVersionId,
        pack.isPaid,
        pack.stripePriceId,
        pack.createdAt,
        pack.updatedAt,
      ]);
      return mapPack(row!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Pack slug already exists in workspace");
      throw error;
    }
  }

  async updatePack(id: string, input: PackUpdateInput): Promise<Pack | undefined> {
    const existing = await this.getPack(id);
    if (!existing) return undefined;
    try {
      const row = await this.queryOne<PackRow>(`
        UPDATE packs
        SET
          name = $2,
          slug = $3,
          is_paid = $4,
          stripe_price_id = $5,
          updated_at = $6
        WHERE id = $1
        RETURNING
          id,
          workspace_id AS "workspaceId",
          name,
          slug,
          published_version_id AS "publishedVersionId",
          is_paid AS "isPaid",
          stripe_price_id AS "stripePriceId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [
        id,
        input.name ?? existing.name,
        input.slug ?? existing.slug,
        input.isPaid ?? existing.isPaid,
        input.stripePriceId ?? existing.stripePriceId,
        new Date(),
      ]);
      return row ? mapPack(row) : undefined;
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Pack slug already exists in workspace");
      throw error;
    }
  }

  async listPackVersions(packId: string): Promise<PackVersionRecord[]> {
    const rows = await this.queryMany<PackVersionRow>(`
      SELECT
        id,
        pack_id AS "packId",
        version,
        definition,
        created_at AS "createdAt"
      FROM pack_versions
      WHERE pack_id = $1
      ORDER BY version DESC
    `, [packId]);
    return rows.map(mapPackVersion);
  }

  async getPackVersion(id: string): Promise<PackVersionRecord | undefined> {
    const row = await this.queryOne<PackVersionRow>(`
      SELECT
        id,
        pack_id AS "packId",
        version,
        definition,
        created_at AS "createdAt"
      FROM pack_versions
      WHERE id = $1
    `, [id]);
    return row ? mapPackVersion(row) : undefined;
  }

  async createPackVersion(input: PackVersionCreateInput): Promise<PackVersionRecord> {
    const version: PackVersionRecord = {
      id: randomUUID(),
      packId: input.packId,
      version: input.version,
      definition: input.definition,
      createdAt: new Date(),
    };
    try {
      const row = await this.queryOne<PackVersionRow>(`
        INSERT INTO pack_versions (id, pack_id, version, definition, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          pack_id AS "packId",
          version,
          definition,
          created_at AS "createdAt"
      `, [
        version.id,
        version.packId,
        version.version,
        version.definition,
        version.createdAt,
      ]);
      return mapPackVersion(row!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error("Version already exists for pack");
      throw error;
    }
  }

  async publishVersion(packId: string, versionId: string): Promise<Pack | undefined> {
    const row = await this.queryOne<PackRow>(`
      UPDATE packs
      SET published_version_id = $2, updated_at = $3
      WHERE id = $1
      RETURNING
        id,
        workspace_id AS "workspaceId",
        name,
        slug,
        published_version_id AS "publishedVersionId",
        is_paid AS "isPaid",
        stripe_price_id AS "stripePriceId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [packId, versionId, new Date()]);
    return row ? mapPack(row) : undefined;
  }

  async createSubmission(input: SubmissionCreateInput): Promise<Submission> {
    const submission: Submission = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      packId: input.packId,
      packVersionId: input.packVersionId,
      email: input.email ?? null,
      firstName: input.firstName ?? null,
      answers: input.answers as Submission["answers"],
      score: input.score ?? null,
      outcomeId: input.outcomeId ?? null,
      outcomeLabel: input.outcomeLabel ?? null,
      paid: input.paid ?? false,
      stripeSessionId: input.stripeSessionId ?? null,
      pdfSent: input.pdfSent ?? false,
      completedAt: input.completedAt ?? null,
      createdAt: input.createdAt ?? new Date(),
    };
    const row = await this.queryOne<SubmissionRow>(`
      INSERT INTO submissions (
        id, workspace_id, pack_id, pack_version_id, email, first_name, answers, score,
        outcome_id, outcome_label, paid, stripe_session_id, pdf_sent, completed_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING
        id,
        workspace_id AS "workspaceId",
        pack_id AS "packId",
        pack_version_id AS "packVersionId",
        email,
        first_name AS "firstName",
        answers,
        score,
        outcome_id AS "outcomeId",
        outcome_label AS "outcomeLabel",
        paid,
        stripe_session_id AS "stripeSessionId",
        pdf_sent AS "pdfSent",
        completed_at AS "completedAt",
        created_at AS "createdAt"
    `, [
      submission.id,
      submission.workspaceId,
      submission.packId,
      submission.packVersionId,
      submission.email,
      submission.firstName,
      submission.answers,
      submission.score,
      submission.outcomeId,
      submission.outcomeLabel,
      submission.paid,
      submission.stripeSessionId,
      submission.pdfSent,
      submission.completedAt,
      submission.createdAt,
    ]);
    return mapSubmission(row!);
  }

  async updateSubmission(id: string, data: SubmissionUpdateInput): Promise<Submission | undefined> {
    const existing = await this.getSubmission(id);
    if (!existing) return undefined;
    const row = await this.queryOne<SubmissionRow>(`
      UPDATE submissions
      SET
        paid = $2,
        stripe_session_id = $3,
        pdf_sent = $4,
        completed_at = $5
      WHERE id = $1
      RETURNING
        id,
        workspace_id AS "workspaceId",
        pack_id AS "packId",
        pack_version_id AS "packVersionId",
        email,
        first_name AS "firstName",
        answers,
        score,
        outcome_id AS "outcomeId",
        outcome_label AS "outcomeLabel",
        paid,
        stripe_session_id AS "stripeSessionId",
        pdf_sent AS "pdfSent",
        completed_at AS "completedAt",
        created_at AS "createdAt"
    `, [
      id,
      data.paid ?? existing.paid,
      data.stripeSessionId !== undefined ? data.stripeSessionId : existing.stripeSessionId,
      data.pdfSent ?? existing.pdfSent,
      data.completedAt !== undefined ? data.completedAt : existing.completedAt,
    ]);
    return row ? mapSubmission(row) : undefined;
  }

  async getSubmission(id: string): Promise<Submission | undefined> {
    const row = await this.queryOne<SubmissionRow>(`
      SELECT
        id,
        workspace_id AS "workspaceId",
        pack_id AS "packId",
        pack_version_id AS "packVersionId",
        email,
        first_name AS "firstName",
        answers,
        score,
        outcome_id AS "outcomeId",
        outcome_label AS "outcomeLabel",
        paid,
        stripe_session_id AS "stripeSessionId",
        pdf_sent AS "pdfSent",
        completed_at AS "completedAt",
        created_at AS "createdAt"
      FROM submissions
      WHERE id = $1
    `, [id]);
    return row ? mapSubmission(row) : undefined;
  }

  async getSubmissionsByPack(packId: string): Promise<Submission[]> {
    const rows = await this.queryMany<SubmissionRow>(`
      SELECT
        id,
        workspace_id AS "workspaceId",
        pack_id AS "packId",
        pack_version_id AS "packVersionId",
        email,
        first_name AS "firstName",
        answers,
        score,
        outcome_id AS "outcomeId",
        outcome_label AS "outcomeLabel",
        paid,
        stripe_session_id AS "stripeSessionId",
        pdf_sent AS "pdfSent",
        completed_at AS "completedAt",
        created_at AS "createdAt"
      FROM submissions
      WHERE pack_id = $1
      ORDER BY created_at DESC
    `, [packId]);
    return rows.map(mapSubmission);
  }

  async getSubmissionsByWorkspace(workspaceId: string): Promise<Submission[]> {
    const rows = await this.queryMany<SubmissionRow>(`
      SELECT
        id,
        workspace_id AS "workspaceId",
        pack_id AS "packId",
        pack_version_id AS "packVersionId",
        email,
        first_name AS "firstName",
        answers,
        score,
        outcome_id AS "outcomeId",
        outcome_label AS "outcomeLabel",
        paid,
        stripe_session_id AS "stripeSessionId",
        pdf_sent AS "pdfSent",
        completed_at AS "completedAt",
        created_at AS "createdAt"
      FROM submissions
      WHERE workspace_id = $1
      ORDER BY created_at DESC
    `, [workspaceId]);
    return rows.map(mapSubmission);
  }

  async countSubmissionsByWorkspace(workspaceId: string): Promise<number> {
    const row = await this.queryOne<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM submissions
      WHERE workspace_id = $1
    `, [workspaceId]);
    return Number(row?.count ?? 0);
  }

  async getWorkspaceStats(workspaceId: string): Promise<WorkspaceStats> {
    const [submissions, packs] = await Promise.all([
      this.getSubmissionsByWorkspace(workspaceId),
      this.listPacks(workspaceId),
    ]);
    const packsById = new Map(packs.map((pack) => [pack.id, pack] as const));
    return buildWorkspaceStats(submissions, packsById);
  }
}

if (
  process.env.NODE_ENV === "production" &&
  !process.env.DATABASE_URL &&
  process.env.ALLOW_MEMORY_STORAGE !== "true"
) {
  throw new Error(
    "DATABASE_URL is required in production. Set ALLOW_MEMORY_STORAGE=true only for an intentional non-persistent demo.",
  );
}

export const storage: IStorage = process.env.DATABASE_URL
  ? new PgStorage(process.env.DATABASE_URL)
  : new MemStorage();
