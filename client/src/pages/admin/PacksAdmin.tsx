import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type {
  AnswerValue,
  Answers,
  Condition,
  ConditionGroup,
  DisqualifierRule,
  Outcome,
  PackDefinition,
  Question,
  ScoringRule,
  ThresholdRule,
} from "@shared/pack";
import { evaluatePack, getVisibleQuestionIds } from "@shared/engine/interpreter";
import ConditionBuilder from "@/components/ConditionBuilder";

const ADMIN_KEY_STORAGE = "adminKey";

const packStatusTone = (outcome: Outcome | null, disqualified: boolean) => {
  if (outcome?.status === "pass" || outcome?.status === "caution" || outcome?.status === "fail") {
    return outcome.status;
  }
  return disqualified ? "fail" : "pass";
};

const packStatusLabel = (status: "pass" | "caution" | "fail") => {
  if (status === "pass") return "Pass";
  if (status === "caution") return "Caution";
  return "Fail";
};

const packStatusClasses = (status: "pass" | "caution" | "fail") => {
  if (status === "fail") return "bg-destructive text-destructive-foreground";
  if (status === "caution") return "bg-amber-500 text-white";
  return "bg-emerald-600 text-white";
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
};

type Pack = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  publishedVersionId: string | null;
  isPaid: boolean;
  stripePriceId: string | null;
};

type PackVersion = {
  id: string;
  packId: string;
  version: number;
  createdAt: string;
  definition: unknown;
};

type SimpleQuestionType = "yesno" | "select" | "number";

type SimpleOption = {
  id: string;
  label: string;
  value?: string;
};

type SimpleQuestion = {
  id: string;
  prompt: string;
  type: SimpleQuestionType;
  options: SimpleOption[];
};

type SimpleOutcome = {
  id: string;
  title: string;
  description: string;
  status: "pass" | "caution" | "fail";
};

type SimpleDisqualifier = {
  id: string;
  reason: string;
  conditions: Condition[];
};

type SimpleScoring = {
  id: string;
  points: number | "";
  conditions: Condition[];
};

type SimpleThreshold = {
  id: string;
  minScore: number | "";
  maxScore: number | "";
  outcomeId: string;
};

type SimplePdfModule = {
  id: string;
  label: string;
  enabled: boolean;
  data: Record<string, unknown>;
};

type PdfModulesPath = "pdfModules" | "pdf.modules";

type SimpleEditorState = {
  name: string;
  isPaid: boolean;
  stripePriceId: string;
  outcomes: SimpleOutcome[];
  questions: SimpleQuestion[];
  disqualifiers: SimpleDisqualifier[];
  scoring: SimpleScoring[];
  thresholds: SimpleThreshold[];
  pdfModules: SimplePdfModule[] | null;
  pdfModulesPath: PdfModulesPath | null;
};

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeOutcomeStatus(status: unknown): "pass" | "caution" | "fail" {
  if (status === "pass" || status === "caution" || status === "fail") return status;
  return "pass";
}

function toSimpleQuestionType(type: Question["type"]): SimpleQuestionType {
  if (type === "number") return "number";
  if (type === "yesno" || type === "boolean") return "yesno";
  return "select";
}

function toPackQuestionType(type: SimpleQuestionType): Question["type"] {
  if (type === "number") return "number";
  if (type === "yesno") return "yesno";
  return "select";
}

function encodeAnswersBase64Url(answers: Answers): string {
  const json = JSON.stringify(answers ?? {});
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getPdfModules(definition: Record<string, unknown> | null) {
  if (!definition) return null;
  const directModules = definition["pdfModules"];
  if (Array.isArray(directModules)) {
    return { path: "pdfModules" as const, modules: directModules };
  }
  const pdf = definition["pdf"];
  if (pdf && typeof pdf === "object" && Array.isArray((pdf as Record<string, unknown>).modules)) {
    return { path: "pdf.modules" as const, modules: (pdf as Record<string, unknown>).modules as unknown[] };
  }
  return null;
}

function extractSimpleState(definition: PackDefinition | null): SimpleEditorState {
  const outcomes = (definition?.outcomes ?? []).map((outcome) => ({
    id: outcome.id ?? createId(),
    title: outcome.title ?? "",
    description: outcome.description ?? "",
    status: normalizeOutcomeStatus(outcome.status),
  }));

  const questions = (definition?.questions ?? []).map((question) => ({
    id: question.id ?? createId(),
    prompt: question.prompt ?? "",
    type: toSimpleQuestionType(question.type),
    options: (question.options ?? []).map((option) => ({
      id: option.id ?? createId(),
      label: option.label ?? "",
      value: option.value,
    })),
  }));

  const disqualifiers = (definition?.disqualifiers ?? []).map((rule) => ({
    id: rule.id ?? createId(),
    reason: rule.reason ?? "",
    conditions: rule.when?.all ? deepClone(rule.when.all) : [],
  }));

  const scoring = (definition?.scoring ?? []).map((rule) => ({
    id: rule.id ?? createId(),
    points: typeof rule.points === "number" ? rule.points : ("" as const),
    conditions: rule.when?.all ? deepClone(rule.when.all) : [],
  }));

  const thresholds = (definition?.thresholds ?? []).map((rule) => ({
    id: rule.id ?? createId(),
    minScore: typeof rule.minScore === "number" ? rule.minScore : ("" as const),
    maxScore: typeof rule.maxScore === "number" ? rule.maxScore : ("" as const),
    outcomeId: rule.outcomeId ?? "",
  }));

  const pricing = definition?.pricing;
  const pdfInfo = getPdfModules(definition as Record<string, unknown> | null);

  return {
    name: definition?.name ?? "",
    isPaid: Boolean(pricing?.isPaid),
    stripePriceId: typeof pricing?.stripePriceId === "string" ? pricing.stripePriceId : "",
    outcomes,
    questions,
    disqualifiers,
    scoring,
    thresholds,
    pdfModules: pdfInfo
      ? pdfInfo.modules.map((module, index) => {
        const data = module && typeof module === "object"
          ? (module as Record<string, unknown>)
          : {};
        const id = typeof data.id === "string" ? data.id : `module-${index + 1}`;
        const label = typeof data.title === "string"
          ? data.title
          : typeof data.name === "string"
            ? data.name
            : id;
        const enabled = typeof data.enabled === "boolean" ? data.enabled : true;
        return {
          id,
          label,
          enabled,
          data,
        };
      })
      : null,
    pdfModulesPath: pdfInfo?.path ?? null,
  };
}

function mergeConditionGroup(base: ConditionGroup | undefined, conditions: Condition[]) {
  return {
    ...(base ?? {}),
    all: conditions,
  };
}

function mergeOutcomes(baseOutcomes: Outcome[] = [], simpleOutcomes: SimpleOutcome[]) {
  const baseById = new Map(baseOutcomes.map((outcome) => [outcome.id, outcome]));
  return simpleOutcomes.map((outcome) => {
    const base = baseById.get(outcome.id) ?? ({ id: outcome.id } as Outcome);
    return {
      ...base,
      title: outcome.title,
      description: outcome.description,
      status: outcome.status,
    };
  });
}

function mergeQuestions(baseQuestions: Question[] = [], simpleQuestions: SimpleQuestion[]) {
  const baseById = new Map(baseQuestions.map((question) => [question.id, question]));
  return simpleQuestions.map((question) => {
    const base = baseById.get(question.id) ?? ({ id: question.id } as Question);
    const baseOptions = Array.isArray(base.options) ? base.options : [];
    const baseOptionsById = new Map(baseOptions.map((option) => [option.id, option]));
    const nextOptions = question.type === "select"
      ? question.options.map((option) => {
        const baseOption = baseOptionsById.get(option.id) ?? { id: option.id };
        return {
          ...baseOption,
          label: option.label,
          value: option.value,
        };
      })
      : undefined;
    return {
      ...base,
      prompt: question.prompt,
      type: toPackQuestionType(question.type),
      options: nextOptions,
    };
  });
}

function mergeDisqualifiers(
  baseRules: DisqualifierRule[] = [],
  simpleRules: SimpleDisqualifier[],
) {
  const baseById = new Map(baseRules.map((rule) => [rule.id, rule]));
  return simpleRules.map((rule) => {
    const base = baseById.get(rule.id) ?? ({ id: rule.id } as DisqualifierRule);
    return {
      ...base,
      reason: rule.reason,
      when: mergeConditionGroup(base.when, rule.conditions),
    };
  });
}

function mergeScoringRules(
  baseRules: ScoringRule[] = [],
  simpleRules: SimpleScoring[],
) {
  const baseById = new Map(baseRules.map((rule) => [rule.id, rule]));
  return simpleRules.map((rule) => {
    const base = baseById.get(rule.id) ?? ({ id: rule.id } as ScoringRule);
    const points = typeof rule.points === "number" ? rule.points : Number(rule.points);
    return {
      ...base,
      points: Number.isFinite(points) ? points : 0,
      when: mergeConditionGroup(base.when, rule.conditions),
    };
  });
}

function mergeThresholds(
  baseRules: ThresholdRule[] = [],
  simpleRules: SimpleThreshold[],
) {
  const baseById = new Map(baseRules.map((rule) => [rule.id, rule]));
  return simpleRules.map((rule) => {
    const base = baseById.get(rule.id) ?? ({ id: rule.id } as ThresholdRule);
    const minScore = typeof rule.minScore === "number" ? rule.minScore : Number(rule.minScore);
    const maxScore = typeof rule.maxScore === "number" ? rule.maxScore : Number(rule.maxScore);
    return {
      ...base,
      minScore: Number.isFinite(minScore) ? minScore : 0,
      maxScore: Number.isFinite(maxScore) ? maxScore : undefined,
      outcomeId: rule.outcomeId,
    };
  });
}

function buildDefinition(
  baseDefinition: PackDefinition | null,
  simple: SimpleEditorState,
): PackDefinition {
  const base = baseDefinition ?? { outcomes: [], questions: [] } as PackDefinition;
  const next = deepClone(base);

  next.name = simple.name;
  next.outcomes = mergeOutcomes(base.outcomes ?? [], simple.outcomes);
  next.questions = mergeQuestions(base.questions ?? [], simple.questions);
  next.disqualifiers = mergeDisqualifiers(base.disqualifiers ?? [], simple.disqualifiers);
  next.scoring = mergeScoringRules(base.scoring ?? [], simple.scoring);
  next.thresholds = mergeThresholds(base.thresholds ?? [], simple.thresholds);

  const pricing = { ...(base.pricing ?? {}) };
  pricing.isPaid = simple.isPaid;
  if (simple.isPaid) {
    pricing.stripePriceId = simple.stripePriceId.trim();
  } else {
    delete pricing.stripePriceId;
  }
  next.pricing = pricing;

  if (simple.pdfModules && simple.pdfModulesPath) {
    const updatedModules = simple.pdfModules.map((module) => ({
      ...module.data,
      enabled: module.enabled,
    }));

    if (simple.pdfModulesPath === "pdfModules") {
      const nextRecord = next as unknown as Record<string, unknown>;
      nextRecord.pdfModules = updatedModules;
    } else {
      const nextRecord = next as unknown as Record<string, unknown>;
      const pdfRaw = nextRecord.pdf;
      const pdf = pdfRaw && typeof pdfRaw === "object"
        ? { ...(pdfRaw as Record<string, unknown>) }
        : {};
      pdf.modules = updatedModules;
      nextRecord.pdf = pdf;
    }
  }

  return next;
}

function getDisqualifierIssues(rule: SimpleDisqualifier) {
  const issues: string[] = [];
  if (!rule.reason.trim()) issues.push("Reason is required.");
  if (rule.conditions.length === 0) issues.push("Add at least one condition.");
  return issues;
}

function getScoringIssues(rule: SimpleScoring) {
  const issues: string[] = [];
  const points = typeof rule.points === "number" ? rule.points : Number(rule.points);
  if (!Number.isFinite(points)) issues.push("Points must be a number.");
  if (rule.conditions.length === 0) issues.push("Add at least one condition.");
  return issues;
}

function getThresholdIssues(rule: SimpleThreshold, outcomes: SimpleOutcome[]) {
  const issues: string[] = [];
  const minScore = typeof rule.minScore === "number" ? rule.minScore : Number(rule.minScore);
  const maxScore = typeof rule.maxScore === "number" ? rule.maxScore : Number(rule.maxScore);
  if (!Number.isFinite(minScore)) issues.push("Min score is required.");
  if (rule.maxScore !== "" && !Number.isFinite(maxScore)) issues.push("Max score must be a number.");
  if (Number.isFinite(minScore) && Number.isFinite(maxScore) && maxScore < minScore) {
    issues.push("Max score must be greater than or equal to min score.");
  }
  if (!rule.outcomeId) issues.push("Select an outcome.");
  if (outcomes.length === 0) issues.push("Add outcomes before thresholds.");
  return issues;
}

export default function PacksAdmin() {
  const [adminKey, setAdminKey] = useState("");
  const [adminKeyDraft, setAdminKeyDraft] = useState("");

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");

  const [packs, setPacks] = useState<Pack[]>([]);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string>("");

  const [versions, setVersions] = useState<PackVersion[]>([]);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  const [definitionDraft, setDefinitionDraft] = useState("");
  const [definitionError, setDefinitionError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saveVersionLoading, setSaveVersionLoading] = useState(false);

  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [cloneName, setCloneName] = useState("");
  const [cloneSlug, setCloneSlug] = useState("");
  const [cloneWorkspaceId, setCloneWorkspaceId] = useState<string>("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const [baseDefinition, setBaseDefinition] = useState<PackDefinition | null>(null);
  const [simpleDefinition, setSimpleDefinition] = useState<SimpleEditorState>(() =>
    extractSimpleState(null),
  );
  const [editorTab, setEditorTab] = useState("simple");

  const [testAnswers, setTestAnswers] = useState<Answers>({});
  const [testResult, setTestResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY_STORAGE);
    if (stored) {
      setAdminKey(stored);
      setAdminKeyDraft(stored);
    }
  }, []);

  const selectedWorkspace = useMemo(
    () => workspaces.find((item) => item.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId],
  );

  const selectedPack = useMemo(
    () => packs.find((item) => item.id === selectedPackId) ?? null,
    [packs, selectedPackId],
  );

  const selectedVersion = useMemo(
    () => versions.find((item) => item.id === selectedVersionId) ?? null,
    [versions, selectedVersionId],
  );

  const authHeaders = adminKey
    ? { "x-admin-key": adminKey }
    : undefined;

  const combinedDefinition = useMemo(
    () => buildDefinition(baseDefinition, simpleDefinition),
    [baseDefinition, simpleDefinition],
  );
  const pdfModules = simpleDefinition.pdfModules ?? [];
  const disqualifierIssues = simpleDefinition.disqualifiers.map(getDisqualifierIssues);
  const scoringIssues = simpleDefinition.scoring.map(getScoringIssues);
  const thresholdIssues = simpleDefinition.thresholds.map((rule) =>
    getThresholdIssues(rule, simpleDefinition.outcomes),
  );

  const testVisibleQuestionIds = useMemo(() => {
    return combinedDefinition
      ? getVisibleQuestionIds(combinedDefinition, testAnswers)
      : [];
  }, [combinedDefinition, testAnswers]);

  const testVisibleQuestions = useMemo(() => {
    return combinedDefinition
      ? combinedDefinition.questions.filter((question) =>
        testVisibleQuestionIds.includes(question.id),
      )
      : [];
  }, [combinedDefinition, testVisibleQuestionIds]);

  const runnerTestUrl = useMemo(() => {
    if (!selectedWorkspace || !selectedPack) return "";
    const encoded = encodeAnswersBase64Url(testAnswers);
    return `/w/${selectedWorkspace.slug}/${selectedPack.slug}?answers=${encodeURIComponent(encoded)}&autores=1`;
  }, [selectedWorkspace, selectedPack, testAnswers]);

  const loadWorkspaces = async () => {
    if (!adminKey) return;
    setLoadingWorkspaces(true);
    setWorkspaceError(null);

    try {
      const response = await fetch("/api/admin/workspaces", {
        headers: authHeaders,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setWorkspaceError(payload?.message ?? "Unable to load workspaces");
        return;
      }
      const payload = (await response.json()) as { workspaces: Workspace[] };
      setWorkspaces(payload.workspaces ?? []);
      const first = payload.workspaces?.[0];
      if (first) {
        setSelectedWorkspaceId(first.id);
      } else {
        setSelectedWorkspaceId("");
      }
    } catch (error) {
      setWorkspaceError("Unable to load workspaces");
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const loadPacks = async (workspaceId: string) => {
    if (!adminKey || !workspaceId) return;
    setLoadingPacks(true);
    setPacksError(null);

    try {
      const response = await fetch(`/api/admin/workspaces/${workspaceId}/packs`, {
        headers: authHeaders,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setPacksError(payload?.message ?? "Unable to load packs");
        return;
      }
      const payload = (await response.json()) as { packs: Pack[] };
      setPacks(payload.packs ?? []);
      const first = payload.packs?.[0];
      if (first) {
        setSelectedPackId(first.id);
      } else {
        setSelectedPackId("");
      }
    } catch (error) {
      setPacksError("Unable to load packs");
    } finally {
      setLoadingPacks(false);
    }
  };

  const loadVersions = async (packId: string) => {
    if (!adminKey || !packId) return;
    setLoadingVersions(true);
    setVersionsError(null);

    try {
      const response = await fetch(`/api/admin/packs/${packId}/versions`, {
        headers: authHeaders,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setVersionsError(payload?.message ?? "Unable to load versions");
        return;
      }
      const payload = (await response.json()) as { versions: PackVersion[] };
      setVersions(payload.versions ?? []);
      const publishedId = selectedPack?.publishedVersionId ?? null;
      const nextId = publishedId ?? payload.versions?.[0]?.id ?? "";
      setSelectedVersionId(nextId);
      const nextVersion = payload.versions?.find((item) => item.id === nextId);
      if (nextVersion) {
        setDefinitionDraft(prettyJson(nextVersion.definition));
        setBaseDefinition(nextVersion.definition as PackDefinition);
        setSimpleDefinition(extractSimpleState(nextVersion.definition as PackDefinition));
      } else {
        setDefinitionDraft("");
        setBaseDefinition(null);
        setSimpleDefinition(extractSimpleState(null));
      }
      setJsonError(null);
      setDefinitionError(null);
      setTestAnswers({});
      setTestResult(null);
    } catch (error) {
      setVersionsError("Unable to load versions");
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    if (!adminKey) return;
    loadWorkspaces();
  }, [adminKey]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setPacks([]);
      setSelectedPackId("");
      return;
    }
    loadPacks(selectedWorkspaceId);
  }, [selectedWorkspaceId, adminKey]);

  useEffect(() => {
    if (!selectedPackId) {
      setVersions([]);
      setSelectedVersionId("");
      setDefinitionDraft("");
      setBaseDefinition(null);
      setSimpleDefinition(extractSimpleState(null));
      return;
    }
    loadVersions(selectedPackId);
  }, [selectedPackId, adminKey]);

  useEffect(() => {
    if (!selectedVersion) return;
    setDefinitionDraft(prettyJson(selectedVersion.definition));
    setBaseDefinition(selectedVersion.definition as PackDefinition);
    setSimpleDefinition(extractSimpleState(selectedVersion.definition as PackDefinition));
    setTestAnswers({});
    setTestResult(null);
  }, [selectedVersion?.id]);

  const handleSaveAdminKey = () => {
    const nextKey = adminKeyDraft.trim();
    setAdminKey(nextKey);
    localStorage.setItem(ADMIN_KEY_STORAGE, nextKey);
  };

  const handleSaveNewVersion = async () => {
    if (!selectedPackId) return;
    setDefinitionError(null);
    setSaveVersionLoading(true);

    const validationIssues = [
      ...simpleDefinition.disqualifiers.flatMap(getDisqualifierIssues),
      ...simpleDefinition.scoring.flatMap(getScoringIssues),
      ...simpleDefinition.thresholds.flatMap((rule) =>
        getThresholdIssues(rule, simpleDefinition.outcomes),
      ),
    ].filter(Boolean);

    if (validationIssues.length > 0) {
      setDefinitionError(validationIssues.join(" "));
      setSaveVersionLoading(false);
      return;
    }

    const definition = combinedDefinition;

    try {
      const response = await fetch(`/api/admin/packs/${selectedPackId}/versions`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ definition }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setDefinitionError(payload?.message ?? "Unable to create version");
        return;
      }

      await loadVersions(selectedPackId);
    } catch (error) {
      setDefinitionError("Unable to create version");
    } finally {
      setSaveVersionLoading(false);
    }
  };

  const handlePublishVersion = async (versionId: string) => {
    if (!selectedPackId) return;
    setPublishLoading(true);
    setPublishError(null);

    try {
      const response = await fetch(
        `/api/admin/packs/${selectedPackId}/publish/${versionId}`,
        {
          method: "POST",
          headers: authHeaders,
        },
      );

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setPublishError(payload?.message ?? "Unable to publish version");
        return;
      }

      await loadPacks(selectedWorkspaceId);
      await loadVersions(selectedPackId);
    } catch (error) {
      setPublishError("Unable to publish version");
    } finally {
      setPublishLoading(false);
    }
  };

  const handleClonePack = async () => {
    if (!selectedPackId) return;
    if (!cloneName.trim() || !cloneSlug.trim()) {
      setCloneError("Name and slug are required");
      return;
    }

    setCloneLoading(true);
    setCloneError(null);

    try {
      const response = await fetch(`/api/admin/packs/${selectedPackId}/clone`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newName: cloneName.trim(),
          newSlug: cloneSlug.trim(),
          targetWorkspaceId: cloneWorkspaceId || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setCloneError(payload?.message ?? "Unable to clone pack");
        return;
      }

      const payload = (await response.json()) as { pack?: Pack };
      if (payload.pack) {
        if (payload.pack.workspaceId === selectedWorkspaceId) {
          await loadPacks(selectedWorkspaceId);
          setSelectedPackId(payload.pack.id);
        } else {
          await loadPacks(selectedWorkspaceId);
        }
      } else {
        await loadPacks(selectedWorkspaceId);
      }
    } catch (error) {
      setCloneError("Unable to clone pack");
    } finally {
      setCloneLoading(false);
    }
  };

  const handleValidateJson = () => {
    setJsonError(null);
    try {
      JSON.parse(definitionDraft);
    } catch (error) {
      setJsonError("Definition must be valid JSON");
    }
  };

  const handleApplyJsonToSimple = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(definitionDraft) as PackDefinition;
      setBaseDefinition(parsed);
      setSimpleDefinition(extractSimpleState(parsed));
      setDefinitionDraft(prettyJson(parsed));
    } catch (error) {
      setJsonError("Definition must be valid JSON");
    }
  };

  const handleOutcomeChange = (
    outcomeId: string,
    patch: Partial<SimpleOutcome>,
  ) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      outcomes: prev.outcomes.map((outcome) =>
        outcome.id === outcomeId ? { ...outcome, ...patch } : outcome,
      ),
    }));
  };

  const handleQuestionChange = (
    questionId: string,
    patch: Partial<SimpleQuestion>,
  ) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      questions: prev.questions.map((question) =>
        question.id === questionId ? { ...question, ...patch } : question,
      ),
    }));
  };

  const handleOptionChange = (
    questionId: string,
    optionId: string,
    patch: Partial<SimpleOption>,
  ) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      questions: prev.questions.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          options: question.options.map((option) =>
            option.id === optionId ? { ...option, ...patch } : option,
          ),
        };
      }),
    }));
  };

  const handleAddOption = (questionId: string) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      questions: prev.questions.map((question) => {
        if (question.id !== questionId) return question;
        const nextOption: SimpleOption = {
          id: createId(),
          label: "",
        };
        return {
          ...question,
          options: [...question.options, nextOption],
        };
      }),
    }));
  };

  const handleRemoveOption = (questionId: string, optionId: string) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      questions: prev.questions.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          options: question.options.filter((option) => option.id !== optionId),
        };
      }),
    }));
  };

  const handlePdfModuleToggle = (moduleId: string, enabled: boolean) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      pdfModules: prev.pdfModules
        ? prev.pdfModules.map((module) =>
          module.id === moduleId ? { ...module, enabled } : module,
        )
        : null,
    }));
  };

  const handlePdfModuleMove = (moduleId: string, direction: "up" | "down") => {
    setSimpleDefinition((prev) => {
      if (!prev.pdfModules) return prev;
      const index = prev.pdfModules.findIndex((module) => module.id === moduleId);
      if (index < 0) return prev;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.pdfModules.length) return prev;
      const nextModules = [...prev.pdfModules];
      const [moved] = nextModules.splice(index, 1);
      nextModules.splice(target, 0, moved);
      return {
        ...prev,
        pdfModules: nextModules,
      };
    });
  };

  const handleDisqualifierChange = (id: string, patch: Partial<SimpleDisqualifier>) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      disqualifiers: prev.disqualifiers.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    }));
  };

  const handleAddDisqualifier = () => {
    setSimpleDefinition((prev) => ({
      ...prev,
      disqualifiers: [
        ...prev.disqualifiers,
        { id: createId(), reason: "", conditions: [] },
      ],
    }));
  };

  const handleRemoveDisqualifier = (id: string) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      disqualifiers: prev.disqualifiers.filter((rule) => rule.id !== id),
    }));
  };

  const handleScoringChange = (id: string, patch: Partial<SimpleScoring>) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      scoring: prev.scoring.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    }));
  };

  const handleAddScoring = () => {
    setSimpleDefinition((prev) => ({
      ...prev,
      scoring: [
        ...prev.scoring,
        { id: createId(), points: "", conditions: [] },
      ],
    }));
  };

  const handleRemoveScoring = (id: string) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      scoring: prev.scoring.filter((rule) => rule.id !== id),
    }));
  };

  const handleThresholdChange = (id: string, patch: Partial<SimpleThreshold>) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      thresholds: prev.thresholds.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    }));
  };

  const handleAddThreshold = () => {
    setSimpleDefinition((prev) => ({
      ...prev,
      thresholds: [
        ...prev.thresholds,
        { id: createId(), minScore: "", maxScore: "", outcomeId: "" },
      ],
    }));
  };

  const handleRemoveThreshold = (id: string) => {
    setSimpleDefinition((prev) => ({
      ...prev,
      thresholds: prev.thresholds.filter((rule) => rule.id !== id),
    }));
  };

  const handleTestAnswerChange = (questionId: string, value: AnswerValue) => {
    setTestAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleRunTest = () => {
    if (!combinedDefinition) return;
    setTestResult(evaluatePack(combinedDefinition, testAnswers));
  };

  const handleCopyTestAnswers = async () => {
    setTestMessage(null);
    try {
      await navigator.clipboard.writeText(JSON.stringify(testAnswers));
      setTestMessage("Answers copied.");
    } catch (error) {
      setTestMessage("Unable to copy answers.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Pack Admin</CardTitle>
            <CardDescription>
              This is the control panel for managing your quiz platform. Enter your admin key to unlock the workspace, pack, and version editors below. Your admin key is set via the <code className="text-xs bg-muted px-1 py-0.5 rounded">ADMIN_KEY</code> environment variable on the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="admin-key">Admin key</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                id="admin-key"
                type="password"
                value={adminKeyDraft}
                onChange={(event) => setAdminKeyDraft(event.target.value)}
                placeholder="Enter ADMIN_KEY"
              />
              <Button onClick={handleSaveAdminKey}>Save</Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-[240px,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Workspaces</CardTitle>
              <CardDescription>
                A <strong>Workspace</strong> is a tenant container — typically one per client or brand. Each workspace has its own slug (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">acme-corp</code>) that appears in quiz URLs. Select a workspace to see its packs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={loadWorkspaces} disabled={loadingWorkspaces || !adminKey}>
                {loadingWorkspaces ? "Loading..." : "Refresh"}
              </Button>
              {workspaceError ? (
                <p className="text-sm text-destructive">{workspaceError}</p>
              ) : null}
              <div className="space-y-2">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      workspace.id === selectedWorkspaceId
                        ? "border-primary text-primary"
                        : "border-border"
                    }`}
                  >
                    <div className="font-medium">{workspace.name}</div>
                    <div className="text-xs text-muted-foreground">{workspace.slug}</div>
                  </button>
                ))}
                {workspaces.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No workspaces found.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Packs</CardTitle>
                <CardDescription>
                  A <strong>Pack</strong> is a single assessment (quiz). It belongs to a workspace and has its own slug (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">ai-readiness</code>). The full URL to run a pack is <code className="text-xs bg-muted px-1 py-0.5 rounded">/w/&#123;workspace&#125;/&#123;pack&#125;</code>. Select a pack to edit its questions, scoring, and outcomes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => loadPacks(selectedWorkspaceId)}
                    disabled={loadingPacks || !selectedWorkspaceId}
                  >
                    {loadingPacks ? "Loading..." : "Refresh"}
                  </Button>
                  {selectedWorkspace ? (
                    <span className="text-sm text-muted-foreground">
                      {selectedWorkspace.name}
                    </span>
                  ) : null}
                </div>
                {packsError ? (
                  <p className="text-sm text-destructive">{packsError}</p>
                ) : null}
                <div className="grid gap-2 md:grid-cols-2">
                  {packs.map((pack) => (
                    <div
                      key={pack.id}
                      className={`rounded-md border p-3 text-left text-sm transition-colors ${
                        pack.id === selectedPackId
                          ? "border-primary text-primary"
                          : "border-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPackId(pack.id)}
                        className="w-full text-left"
                      >
                        <div className="font-medium">{pack.name}</div>
                        <div className="text-xs text-muted-foreground">{pack.slug}</div>
                        <div className="text-xs text-muted-foreground">
                          Published: {pack.publishedVersionId ? "Yes" : "No"}
                        </div>
                      </button>
                      {selectedWorkspace ? (
                        <div className="mt-3">
                          <Link href={`/w/${selectedWorkspace.slug}/${pack.slug}`}>
                            <Button size="sm">Open Assessment</Button>
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {packs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No packs found.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Versions</CardTitle>
                <CardDescription>
                  Each time you edit a pack's questions, scoring, or outcomes and click <strong>Save as new version</strong>, a snapshot is stored here. <strong>Publishing</strong> a version makes it live — visitors running the quiz will see that version. This lets you draft and test changes without affecting the live quiz.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedPack ? (
                  <div className="text-sm text-muted-foreground">
                    Published version: {selectedPack.publishedVersionId ?? "None"}
                  </div>
                ) : null}

                <Button
                  onClick={() => loadVersions(selectedPackId)}
                  disabled={loadingVersions || !selectedPackId}
                >
                  {loadingVersions ? "Loading..." : "Refresh"}
                </Button>

                {versionsError ? (
                  <p className="text-sm text-destructive">{versionsError}</p>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      className={`rounded-md border p-3 text-left text-sm transition-colors ${
                        version.id === selectedVersionId
                          ? "border-primary text-primary"
                          : "border-border"
                      }`}
                    >
                      <div className="font-medium">Version {version.version}</div>
                      <div className="text-xs text-muted-foreground">{version.id}</div>
                    </button>
                  ))}
                  {versions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No versions found.</p>
                  ) : null}
                </div>

                <Tabs value={editorTab} onValueChange={setEditorTab}>
                  <TabsList>
                    <TabsTrigger value="simple">Simple Editor</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced JSON</TabsTrigger>
                  </TabsList>

                  <TabsContent value="simple" className="space-y-6">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="definition-name">Definition name</Label>
                          <Input
                            id="definition-name"
                            value={simpleDefinition.name}
                            onChange={(event) =>
                              setSimpleDefinition((prev) => ({
                                ...prev,
                                name: event.target.value,
                              }))
                            }
                            placeholder="Assessment name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Pricing</Label>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={simpleDefinition.isPaid}
                              onCheckedChange={(checked) =>
                                setSimpleDefinition((prev) => ({
                                  ...prev,
                                  isPaid: checked,
                                }))
                              }
                            />
                            <span className="text-sm">
                              {simpleDefinition.isPaid ? "Paid" : "Free"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {simpleDefinition.isPaid ? (
                        <div className="space-y-2">
                          <Label htmlFor="stripe-price">Stripe price id</Label>
                          <Input
                            id="stripe-price"
                            value={simpleDefinition.stripePriceId}
                            onChange={(event) =>
                              setSimpleDefinition((prev) => ({
                                ...prev,
                                stripePriceId: event.target.value,
                              }))
                            }
                            placeholder="price_..."
                          />
                        </div>
                      ) : null}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Outcomes</div>
                      {simpleDefinition.outcomes.map((outcome, index) => (
                        <div key={outcome.id} className="rounded-md border p-3 space-y-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Outcome {index + 1}
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`outcome-title-${outcome.id}`}>Title</Label>
                              <Input
                                id={`outcome-title-${outcome.id}`}
                                value={outcome.title}
                                onChange={(event) =>
                                  handleOutcomeChange(outcome.id, { title: event.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`outcome-status-${outcome.id}`}>Status</Label>
                              <select
                                id={`outcome-status-${outcome.id}`}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={outcome.status}
                                onChange={(event) =>
                                  handleOutcomeChange(outcome.id, {
                                    status: event.target.value as SimpleOutcome["status"],
                                  })
                                }
                              >
                                <option value="pass">Pass</option>
                                <option value="caution">Caution</option>
                                <option value="fail">Fail</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`outcome-desc-${outcome.id}`}>Description</Label>
                            <Textarea
                              id={`outcome-desc-${outcome.id}`}
                              rows={3}
                              value={outcome.description}
                              onChange={(event) =>
                                handleOutcomeChange(outcome.id, {
                                  description: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      ))}
                      {simpleDefinition.outcomes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No outcomes available.
                        </p>
                      ) : null}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Questions</div>
                      {simpleDefinition.questions.map((question, index) => (
                        <div key={question.id} className="rounded-md border p-3 space-y-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Question {index + 1}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`question-prompt-${question.id}`}>Prompt</Label>
                            <Input
                              id={`question-prompt-${question.id}`}
                              value={question.prompt}
                              onChange={(event) =>
                                handleQuestionChange(question.id, {
                                  prompt: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`question-type-${question.id}`}>Type</Label>
                            <select
                              id={`question-type-${question.id}`}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={question.type}
                              onChange={(event) =>
                                handleQuestionChange(question.id, {
                                  type: event.target.value as SimpleQuestionType,
                                })
                              }
                            >
                              <option value="yesno">Yes / No</option>
                              <option value="select">Select</option>
                              <option value="number">Number</option>
                            </select>
                          </div>
                          {question.type === "select" ? (
                            <div className="space-y-2">
                              <Label>Options</Label>
                              <div className="space-y-2">
                                {question.options.map((option) => (
                                  <div
                                    key={option.id}
                                    className="grid gap-2 md:grid-cols-[1fr,1fr,auto]"
                                  >
                                    <Input
                                      value={option.label}
                                      onChange={(event) =>
                                        handleOptionChange(question.id, option.id, {
                                          label: event.target.value,
                                        })
                                      }
                                      placeholder="Label"
                                    />
                                    <Input
                                      value={option.value ?? ""}
                                      onChange={(event) =>
                                        handleOptionChange(question.id, option.id, {
                                          value: event.target.value,
                                        })
                                      }
                                      placeholder="Value (optional)"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleRemoveOption(question.id, option.id)}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                                {question.options.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No options yet.
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddOption(question.id)}
                              >
                                Add option
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {simpleDefinition.questions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No questions available.
                        </p>
                      ) : null}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Disqualifiers</div>
                      {simpleDefinition.disqualifiers.map((rule, index) => (
                        <div key={rule.id} className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Disqualifier {index + 1}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveDisqualifier(rule.id)}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>Reason</Label>
                            <Input
                              value={rule.reason}
                              onChange={(event) =>
                                handleDisqualifierChange(rule.id, { reason: event.target.value })
                              }
                              placeholder="Reason shown to the user"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Conditions</Label>
                            <ConditionBuilder
                              conditions={rule.conditions}
                              questions={combinedDefinition?.questions ?? []}
                              onChange={(conditions) =>
                                handleDisqualifierChange(rule.id, { conditions })
                              }
                            />
                          </div>
                          {disqualifierIssues[index].length > 0 ? (
                            <p className="text-xs text-destructive">{disqualifierIssues[index].join(" ")}</p>
                          ) : null}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddDisqualifier}
                      >
                        Add disqualifier
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Scoring rules</div>
                      {simpleDefinition.scoring.map((rule, index) => (
                        <div key={rule.id} className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Rule {index + 1}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveScoring(rule.id)}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>Points</Label>
                            <Input
                              type="number"
                              value={rule.points}
                              onChange={(event) =>
                                handleScoringChange(rule.id, {
                                  points: event.target.value === "" ? "" : Number(event.target.value),
                                })
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Conditions</Label>
                            <ConditionBuilder
                              conditions={rule.conditions}
                              questions={combinedDefinition?.questions ?? []}
                              onChange={(conditions) =>
                                handleScoringChange(rule.id, { conditions })
                              }
                            />
                          </div>
                          {scoringIssues[index].length > 0 ? (
                            <p className="text-xs text-destructive">{scoringIssues[index].join(" ")}</p>
                          ) : null}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddScoring}
                      >
                        Add scoring rule
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Thresholds</div>
                      {simpleDefinition.thresholds.map((rule, index) => (
                        <div key={rule.id} className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Threshold {index + 1}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveThreshold(rule.id)}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Min score</Label>
                              <Input
                                type="number"
                                value={rule.minScore}
                                onChange={(event) =>
                                  handleThresholdChange(rule.id, {
                                    minScore: event.target.value === "" ? "" : Number(event.target.value),
                                  })
                                }
                                placeholder="0"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Max score</Label>
                              <Input
                                type="number"
                                value={rule.maxScore}
                                onChange={(event) =>
                                  handleThresholdChange(rule.id, {
                                    maxScore: event.target.value === "" ? "" : Number(event.target.value),
                                  })
                                }
                                placeholder="Optional"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Outcome</Label>
                              <select
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={rule.outcomeId}
                                onChange={(event) =>
                                  handleThresholdChange(rule.id, { outcomeId: event.target.value })
                                }
                              >
                                <option value="">Select outcome</option>
                                {simpleDefinition.outcomes.map((outcome) => (
                                  <option key={outcome.id} value={outcome.id}>
                                    {outcome.title || outcome.id}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {thresholdIssues[index].length > 0 ? (
                            <p className="text-xs text-destructive">{thresholdIssues[index].join(" ")}</p>
                          ) : null}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddThreshold}
                      >
                        Add threshold
                      </Button>
                    </div>

                    {simpleDefinition.pdfModules ? (
                      <>
                        <Separator />
                        <div className="space-y-3">
                          <div className="text-sm font-medium">PDF modules</div>
                          <div className="space-y-2">
                            {pdfModules.map((module, index) => (
                              <div
                                key={module.id}
                                className="flex flex-col gap-2 rounded-md border px-3 py-2 md:flex-row md:items-center md:justify-between"
                              >
                                <div>
                                  <div className="font-medium">{module.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {module.id}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={module.enabled}
                                    onCheckedChange={(checked) =>
                                      handlePdfModuleToggle(module.id, checked)
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={index === 0}
                                    onClick={() => handlePdfModuleMove(module.id, "up")}
                                  >
                                    Up
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={index === pdfModules.length - 1}
                                    onClick={() => handlePdfModuleMove(module.id, "down")}
                                  >
                                    Down
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : null}

                    <Separator />

                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold mb-4">Test this pack</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                          Enter sample answers below to validate the evaluation logic. showIf rules are applied automatically.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {testVisibleQuestions.length > 0 ? (
                          testVisibleQuestions.map((question) => {
                            const value = testAnswers[question.id];
                            const type = question.type;
                            const isYesNo = type === "boolean" || type === "yesno";
                            const isSelect = type === "single" || type === "select";
                            const isNumber = type === "number";

                            return (
                              <div key={question.id} className="rounded-md border p-4 space-y-3">
                                <div className="text-sm font-medium">{question.prompt}</div>

                                {isYesNo ? (
                                  <RadioGroup
                                    value={
                                      value === true ? "true" : value === false ? "false" : ""
                                    }
                                    onValueChange={(next) =>
                                      handleTestAnswerChange(question.id, next === "true")
                                    }
                                    className="grid gap-2"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="true" id={`${question.id}-yes`} />
                                      <Label htmlFor={`${question.id}-yes`}>Yes</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="false" id={`${question.id}-no`} />
                                      <Label htmlFor={`${question.id}-no`}>No</Label>
                                    </div>
                                  </RadioGroup>
                                ) : null}

                                {isSelect ? (
                                  <Select
                                    value={typeof value === "string" ? value : ""}
                                    onValueChange={(next) => handleTestAnswerChange(question.id, next)}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select an option" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(question.options ?? []).map((option) => {
                                        const optionValue = option.value ?? option.id;
                                        return (
                                          <SelectItem key={option.id} value={optionValue}>
                                            {option.label}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                ) : null}

                                {isNumber ? (
                                  <Input
                                    type="number"
                                    value={typeof value === "number" ? String(value) : ""}
                                    onChange={(event) => {
                                      const raw = event.target.value;
                                      handleTestAnswerChange(
                                        question.id,
                                        raw === "" ? null : Number(raw),
                                      );
                                    }}
                                    placeholder="Enter a number"
                                  />
                                ) : null}

                                {!isYesNo && !isSelect && !isNumber ? (
                                  <p className="text-xs text-muted-foreground">
                                    Unsupported question type in tester.
                                  </p>
                                ) : null}
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground italic py-4">
                            No visible questions to test.
                          </p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            onClick={handleRunTest}
                            disabled={testVisibleQuestions.length === 0}
                          >
                            Run Test
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCopyTestAnswers}
                          >
                            Copy answers as JSON
                          </Button>
                          {runnerTestUrl && testVisibleQuestions.length > 0 ? (
                            <Link href={runnerTestUrl}>
                              <Button type="button" variant="outline">
                                Open in Runner
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                        {testMessage ? (
                          <p className="text-xs text-muted-foreground">{testMessage}</p>
                        ) : null}
                      </div>

                      {testResult ? (
                        <div className="rounded-md border p-4 space-y-4 bg-muted/30">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              {(() => {
                                const status = packStatusTone(testResult.outcome, testResult.disqualified);
                                return (
                                  <Badge className={packStatusClasses(status)}>
                                    {packStatusLabel(status)}
                                  </Badge>
                                );
                              })()}
                              <div className="text-sm font-medium">
                                {testResult.outcome?.title ?? "No outcome"}
                              </div>
                            </div>
                            {testResult.outcome?.description ? (
                              <p className="text-sm text-muted-foreground">
                                {testResult.outcome.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-sm border border-border px-3 py-2">
                              <div className="text-xs text-muted-foreground">Score</div>
                              <div className="text-lg font-semibold">{testResult.score}</div>
                            </div>
                          </div>

                          {testResult.reasons.length > 0 ? (
                            <div className="rounded-sm border border-border px-3 py-2">
                              <div className="text-xs text-muted-foreground mb-2">Disqualifiers / Reasons</div>
                              <ul className="list-disc pl-5 text-sm space-y-1">
                                {testResult.reasons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>

                  <TabsContent value="advanced" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="definition">Definition JSON</Label>
                      <Textarea
                        id="definition"
                        rows={16}
                        value={definitionDraft}
                        onChange={(event) => {
                          setDefinitionDraft(event.target.value);
                          setJsonError(null);
                        }}
                        placeholder="Paste definition JSON"
                      />
                      {jsonError ? (
                        <p className="text-sm text-destructive">{jsonError}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Use Apply to Simple Editor before saving if you change this JSON.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleValidateJson}
                      >
                        Validate JSON
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleApplyJsonToSimple}
                      >
                        Apply to Simple Editor
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                {definitionError ? (
                  <p className="text-sm text-destructive">{definitionError}</p>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleSaveNewVersion}
                    disabled={saveVersionLoading || !selectedPackId}
                  >
                    {saveVersionLoading ? "Saving..." : "Save as new version"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedVersionId && handlePublishVersion(selectedVersionId)}
                    disabled={publishLoading || !selectedVersionId}
                  >
                    {publishLoading ? "Publishing..." : "Publish version"}
                  </Button>
                </div>
                {publishError ? (
                  <p className="text-sm text-destructive">{publishError}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Clone Pack</CardTitle>
                <CardDescription>
                  Creates an exact copy of the currently selected pack — including all its questions, scoring rules, and outcomes — under a new name and slug. Useful for spinning up a similar assessment for a different client or use case without starting from scratch. You can clone into any workspace.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="clone-name">New name</Label>
                    <Input
                      id="clone-name"
                      value={cloneName}
                      onChange={(event) => setCloneName(event.target.value)}
                      placeholder="Pack name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="clone-slug">New slug</Label>
                    <Input
                      id="clone-slug"
                      value={cloneSlug}
                      onChange={(event) => setCloneSlug(event.target.value)}
                      placeholder="pack-slug"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="clone-workspace">Target workspace</Label>
                  <select
                    id="clone-workspace"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={cloneWorkspaceId}
                    onChange={(event) => setCloneWorkspaceId(event.target.value)}
                  >
                    <option value="">Current workspace</option>
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={handleClonePack}
                  disabled={cloneLoading || !selectedPackId}
                >
                  {cloneLoading ? "Cloning..." : "Clone pack"}
                </Button>
                {cloneError ? (
                  <p className="text-sm text-destructive">{cloneError}</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
