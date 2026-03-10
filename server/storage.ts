import { randomUUID } from "crypto";
import type { PackDefinition } from "@shared/pack";
import type { Pack, PackVersion, Workspace } from "@shared/schema";

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
  publishVersion(
    packId: string,
    versionId: string,
  ): Promise<Pack | undefined>;
}

export class MemStorage implements IStorage {
  private workspaces: Map<string, Workspace>;
  private packs: Map<string, Pack>;
  private packVersions: Map<string, PackVersionRecord>;

  constructor() {
    this.workspaces = new Map();
    this.packs = new Map();
    this.packVersions = new Map();
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

  async updateWorkspace(
    id: string,
    input: WorkspaceUpdateInput,
  ): Promise<Workspace | undefined> {
    const workspace = this.workspaces.get(id);
    if (!workspace) return undefined;

    if (input.slug && input.slug !== workspace.slug) {
      const exists = Array.from(this.workspaces.values()).some(
        (item) => item.slug === input.slug && item.id !== id,
      );
      if (exists) {
        throw new Error("Workspace slug already exists");
      }
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

  async getPackBySlug(
    workspaceId: string,
    slug: string,
  ): Promise<Pack | undefined> {
    return Array.from(this.packs.values()).find(
      (pack) => pack.workspaceId === workspaceId && pack.slug === slug,
    );
  }

  async createPack(input: PackCreateInput): Promise<Pack> {
    const exists = Array.from(this.packs.values()).some(
      (pack) => pack.workspaceId === input.workspaceId && pack.slug === input.slug,
    );
    if (exists) {
      throw new Error("Pack slug already exists in workspace");
    }
    return this.addPack(input);
  }

  async updatePack(id: string, input: PackUpdateInput): Promise<Pack | undefined> {
    const pack = this.packs.get(id);
    if (!pack) return undefined;

    if (input.slug && input.slug !== pack.slug) {
      const exists = Array.from(this.packs.values()).some(
        (item) => item.workspaceId === pack.workspaceId && item.slug === input.slug && item.id !== id,
      );
      if (exists) {
        throw new Error("Pack slug already exists in workspace");
      }
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

  async createPackVersion(
    input: PackVersionCreateInput,
  ): Promise<PackVersionRecord> {
    const existing = Array.from(this.packVersions.values()).find(
      (version) => version.packId === input.packId && version.version === input.version,
    );
    if (existing) {
      throw new Error("Version already exists for pack");
    }
    return this.addPackVersion(input);
  }

  async publishVersion(
    packId: string,
    versionId: string,
  ): Promise<Pack | undefined> {
    const version = this.packVersions.get(versionId);
    if (!version || version.packId !== packId) return undefined;
    const pack = this.packs.get(packId);
    if (!pack) return undefined;

    const updatedPack: Pack = {
      ...pack,
      publishedVersionId: versionId,
      updatedAt: new Date(),
    };
    this.packs.set(packId, updatedPack);
    return updatedPack;
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

    const insuranceDefinition: PackDefinition = {
      name: "Insurance Eligibility",
      version: 1,
      outcomes: [
        {
          id: "eligible",
          title: "Eligible",
          description: "Based on current inputs, eligibility criteria is met.",
          status: "pass",
        },
        {
          id: "ineligible",
          title: "Not Eligible",
          description: "Eligibility criteria is not met.",
          status: "fail",
        },
      ],
      questions: [
        {
          id: "age",
          prompt: "What is the applicant's age?",
          type: "number",
        },
        {
          id: "coverage",
          prompt: "Do you currently have active coverage?",
          type: "boolean",
        },
        {
          id: "region",
          prompt: "Primary region of residence",
          type: "single",
          options: [
            { id: "north", label: "North" },
            { id: "south", label: "South" },
            { id: "west", label: "West" },
            { id: "east", label: "East" },
          ],
        },
      ],
      disqualifiers: [
        {
          id: "no-coverage",
          reason: "Active coverage is required.",
          when: {
            all: [{ questionId: "coverage", operator: "equals", value: false }],
          },
        },
      ],
      scoring: [
        {
          id: "age-qualifier",
          points: 2,
          when: {
            all: [{ questionId: "age", operator: "gte", value: 18 }],
          },
        },
        {
          id: "region-west",
          points: 1,
          when: {
            all: [{ questionId: "region", operator: "equals", value: "west" }],
          },
        },
      ],
      thresholds: [
        { id: "t1", minScore: 0, maxScore: 2, outcomeId: "ineligible" },
        { id: "t2", minScore: 3, outcomeId: "eligible" },
      ],
      pricing: {
        isPaid: false,
      },
    };

    const propertyDefinition: PackDefinition = {
      name: "Property Readiness",
      version: 1,
      outcomes: [
        {
          id: "ready",
          title: "Ready",
          description: "The property appears ready for onboarding.",
          status: "pass",
        },
        {
          id: "needs-review",
          title: "Needs Review",
          description: "Additional checks are required before onboarding.",
          status: "caution",
        },
      ],
      questions: [
        {
          id: "units",
          prompt: "How many units are in the property?",
          type: "number",
        },
        {
          id: "compliance",
          prompt: "Has the property passed compliance checks?",
          type: "boolean",
        },
        {
          id: "category",
          prompt: "Primary property category",
          type: "single",
          options: [
            { id: "residential", label: "Residential" },
            { id: "commercial", label: "Commercial" },
            { id: "mixed", label: "Mixed Use" },
          ],
        },
      ],
      disqualifiers: [
        {
          id: "compliance-fail",
          reason: "Compliance checks are required.",
          when: {
            all: [{ questionId: "compliance", operator: "equals", value: false }],
          },
        },
      ],
      scoring: [
        {
          id: "units-qualifier",
          points: 2,
          when: {
            all: [{ questionId: "units", operator: "gte", value: 10 }],
          },
        },
        {
          id: "category-commercial",
          points: 1,
          when: {
            all: [{ questionId: "category", operator: "equals", value: "commercial" }],
          },
        },
      ],
      thresholds: [
        { id: "p1", minScore: 0, maxScore: 2, outcomeId: "needs-review" },
        { id: "p2", minScore: 3, outcomeId: "ready" },
      ],
      pricing: {
        isPaid: true,
        stripePriceId: "price_1Stom3IxvVaQKv3AefT04dyg",
      },
    };

    const insuranceVersion = this.addPackVersion({
      packId: insurancePack.id,
      version: 1,
      definition: insuranceDefinition,
    });

    const propertyVersion = this.addPackVersion({
      packId: propertyPack.id,
      version: 1,
      definition: propertyDefinition,
    });

    this.publishVersion(insurancePack.id, insuranceVersion.id);
    this.publishVersion(propertyPack.id, propertyVersion.id);
  }
}

export const storage = new MemStorage();
