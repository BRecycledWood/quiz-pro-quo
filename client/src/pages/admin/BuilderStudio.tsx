import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, CircleHelp,
  ClipboardList, Code2, Eye, FilePlus2, Layers3, LockKeyhole, Palette, Plus, Settings2,
  Sparkles, Trash2, WandSparkles, X,
} from "lucide-react";
import type {
  AnswerValue, Answers, Condition, ConditionGroup, FormulaExpression, Outcome, PackBranding, PackDefinition,
  PackSection, Question, QuestionOption, QuestionType, ThresholdRule,
} from "@shared/pack";
import { analyzePackLogic } from "@shared/engine/interpreter";
import { getFeatureEntitlements } from "@shared/entitlements";
import type { Pack, PackVersion, Workspace } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ResizableHandle, ResizablePanel, ResizablePanelGroup,
} from "@/components/ui/resizable";
import BrandingEditor from "@/components/BrandingEditor";
import ConditionTreeEditor from "@/components/ConditionTreeEditor";
import FormulaExpressionEditor from "@/components/FormulaExpressionEditor";
import LiveAssessmentPreview from "@/components/LiveAssessmentPreview";
import LogicStudioPanel from "@/components/LogicStudioPanel";

const ADMIN_KEY_STORAGE = "adminKey";
const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const questionTypes: Array<{ value: QuestionType; label: string; description: string }> = [
  { value: "single", label: "Single choice", description: "Select one answer" },
  { value: "multi", label: "Multiple choice", description: "Select any that apply" },
  { value: "dropdown", label: "Dropdown", description: "Choose from a compact list" },
  { value: "short_text", label: "Short text", description: "One-line response" },
  { value: "long_text", label: "Long text", description: "Paragraph response" },
  { value: "number", label: "Number", description: "Numeric answer" },
  { value: "percent", label: "Percentage", description: "Numeric percentage" },
  { value: "date", label: "Date", description: "Calendar date" },
  { value: "yesno", label: "Yes / no", description: "Two clear choices" },
  { value: "true_false", label: "True / false", description: "Binary answer" },
  { value: "scale_1_5", label: "Scale · 1 to 5", description: "Five-point scale" },
  { value: "scale_1_10", label: "Scale · 1 to 10", description: "Ten-point scale" },
];

type StudioPack = Pick<Pack, "id" | "workspaceId" | "name" | "slug" | "publishedVersionId" | "isPaid" | "stripePriceId">;
type StudioVersion = Pick<PackVersion, "id" | "packId" | "version" | "createdAt"> & { definition: PackDefinition };
type RequestInitJson = Omit<RequestInit, "body"> & { body?: unknown };

class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(key: string, path: string, init: RequestInitJson = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-admin-key", key);
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new ApiError(typeof payload.message === "string" ? payload.message : `Request failed (${response.status}).`, response.status, typeof payload.code === "string" ? payload.code : undefined);
  return payload as T;
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2, 10)}`;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function createStarterDefinition(name: string): PackDefinition {
  const firstQuestionId = createId();
  const needsWorkId = createId();
  const readyId = createId();
  return {
    name,
    description: "Answer a few focused questions to understand where you are and what to do next.",
    logicVersion: 2,
    sections: [],
    questions: [{ id: firstQuestionId, prompt: "Do you have a consistent process for this area?", type: "yesno", required: true, options: [] }],
    outcomes: [
      { id: needsWorkId, title: "A good place to start", description: "There are a few foundations to put in place before moving forward.", status: "caution" },
      { id: readyId, title: "You are on the right track", description: "You have a useful foundation and can build on it with the next steps.", status: "pass" },
    ],
    scoring: [{ id: createId(), label: "Documented process", points: 1, when: { all: [{ questionId: firstQuestionId, operator: "equals", value: true }] } }],
    thresholds: [{ id: createId(), minScore: 0, maxScore: 0, outcomeId: needsWorkId }, { id: createId(), minScore: 1, outcomeId: readyId }],
    disqualifiers: [],
    showIf: [],
    routing: [],
    calculations: [],
    scoringCategories: [],
    reusableConditions: [],
  };
}

function createQuestion(type: QuestionType = "short_text"): Question {
  const options = ["single", "multi", "dropdown", "select"].includes(type)
    ? [{ id: createId(), label: "Option 1", value: "option-1" }, { id: createId(), label: "Option 2", value: "option-2" }]
    : undefined;
  return { id: createId(), prompt: "New question", type, required: true, ...(options ? { options } : {}) };
}

function makeDefaultOption(index: number): QuestionOption {
  return { id: createId(), label: `Option ${index + 1}`, value: `option-${index + 1}` };
}

function isChoice(type: QuestionType) {
  return ["single", "multi", "select", "dropdown"].includes(type);
}

function questionReferences(questionId: string, definition: PackDefinition): boolean {
  const groupUses = (group?: ConditionGroup): boolean => {
    if (!group) return false;
    const nodes = [...(group.all ?? []), ...(group.any ?? []), ...(group.not ? [group.not] : [])];
    return nodes.some((node) => "operator" in node ? node.questionId === questionId : groupUses(node));
  };
  const formulaUses = (expression?: FormulaExpression): boolean => Boolean(expression && (expression.op === "answer" && expression.questionId === questionId || expression.args?.some((item) => formulaUses(item))));
  return (definition.showIf ?? []).some((rule) => rule.questionId !== questionId && groupUses(rule.when)) ||
    definition.questions.some((question) => question.id !== questionId && groupUses(question.requiredWhen)) ||
    (definition.disqualifiers ?? []).some((rule) => groupUses(rule.when)) ||
    (definition.scoring ?? []).some((rule) => groupUses(rule.when) || formulaUses(rule.pointsFormula)) ||
    (definition.routing ?? []).some((rule) => rule.fromQuestionId !== questionId && rule.targetQuestionId === questionId || rule.fromQuestionId !== questionId && groupUses(rule.when)) ||
    (definition.reusableConditions ?? []).some((condition) => groupUses(condition.when)) ||
    (definition.calculations ?? []).some((variable) => formulaUses(variable.expression));
}

function normalizeDefinitionForSave(definition: PackDefinition, pack: StudioPack): PackDefinition {
  return { ...definition, id: definition.id ?? pack.id, name: definition.name?.trim() || pack.name };
}

function getStatusBadge(status: Outcome["status"]) {
  if (status === "fail") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  if (status === "caution") return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
}

function StructurePanel({
  definition,
  selectedQuestionId,
  onSelectQuestion,
  onAddQuestion,
  onAddSection,
  onUpdateSection,
  onRemoveSection,
  onMoveQuestion,
  onRemoveQuestion,
}: {
  definition: PackDefinition;
  selectedQuestionId: string;
  onSelectQuestion: (id: string) => void;
  onAddQuestion: () => void;
  onAddSection: () => void;
  onUpdateSection: (id: string, title: string) => void;
  onRemoveSection: (id: string) => void;
  onMoveQuestion: (id: string, delta: number) => void;
  onRemoveQuestion: (id: string) => void;
}) {
  const questionIndex = (id: string) => definition.questions.findIndex((question) => question.id === id);
  const questionRow = (question: Question) => {
    const index = questionIndex(question.id);
    const logicCount = (definition.showIf ?? []).filter((rule) => rule.questionId === question.id).length + (question.requiredWhen ? 1 : 0) + (definition.routing ?? []).filter((rule) => rule.fromQuestionId === question.id).length;
    return (
      <div key={question.id} className={`group flex items-center gap-1 rounded-xl border p-1.5 transition ${selectedQuestionId === question.id ? "border-primary/40 bg-primary/[0.06] shadow-sm" : "border-transparent hover:border-border hover:bg-muted/50"}`}>
        <button type="button" onClick={() => onSelectQuestion(question.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1 text-left">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${selectedQuestionId === question.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{String(index + 1).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{question.prompt || "Untitled question"}</span><span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span>{questionTypes.find((type) => type.value === question.type)?.label ?? question.type}</span>{question.required === false && !question.requiredWhen ? <span>· optional</span> : null}{logicCount ? <span className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-300"><GitBranchIcon />{logicCount}</span> : null}</span></span>
        </button>
        <div className="hidden shrink-0 items-center group-hover:flex focus-within:flex">
          <button type="button" aria-label="Move question up" disabled={index <= 0} onClick={() => onMoveQuestion(question.id, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
          <button type="button" aria-label="Move question down" disabled={index === definition.questions.length - 1} onClick={() => onMoveQuestion(question.id, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
          <button type="button" aria-label="Remove question" onClick={() => onRemoveQuestion(question.id)} className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    );
  };
  const sections = definition.sections ?? [];
  const unsectioned = definition.questions.filter((question) => !question.sectionId && !question.section);
  const legacySectioned = definition.questions.filter((question) => !question.sectionId && question.section);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white dark:bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em]">Structure</p><p className="mt-0.5 text-[10px] text-muted-foreground">{definition.questions.length} questions · {sections.length} sections</p></div><Button type="button" variant="ghost" size="icon" title="Add section" onClick={onAddSection} className="h-8 w-8"><Layers3 className="h-4 w-4" /></Button></div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {sections.map((section) => <section key={section.id} className="space-y-1.5"><div className="group flex items-center gap-1.5 px-2 pb-1"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /><input aria-label="Section title" value={section.title} onChange={(event) => onUpdateSection(section.id, event.target.value)} className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold uppercase tracking-[0.12em] outline-none" /><button type="button" aria-label={`Remove section ${section.title}`} onClick={() => onRemoveSection(section.id)} className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button></div>{definition.questions.filter((question) => question.sectionId === section.id).map(questionRow)}</section>)}
        {legacySectioned.length ? <section className="space-y-1.5"><p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legacy sections</p>{legacySectioned.map(questionRow)}</section> : null}
        {unsectioned.length ? <section className="space-y-1.5"><p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Questions</p>{unsectioned.map(questionRow)}</section> : null}
        {!definition.questions.length ? <div className="rounded-xl border border-dashed p-4 text-center"><ClipboardList className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs font-medium">No questions yet</p><p className="mt-1 text-[10px] text-muted-foreground">Add a question to shape the assessment.</p></div> : null}
      </div>
      <div className="space-y-2 border-t p-3"><Button type="button" onClick={onAddQuestion} className="h-9 w-full gap-2"><Plus className="h-4 w-4" />Add question</Button><Button type="button" variant="outline" onClick={onAddSection} className="h-8 w-full gap-2 text-xs"><Layers3 className="h-3.5 w-3.5" />Add section</Button></div>
    </aside>
  );
}

function GitBranchIcon() {
  return <Code2 className="h-2.5 w-2.5" />;
}

function QuestionEditor({
  definition,
  question,
  onChange,
  onRemove,
}: {
  definition: PackDefinition;
  question?: Question;
  onChange: (next: PackDefinition) => void;
  onRemove: () => void;
}) {
  if (!question) return <div className="rounded-2xl border border-dashed bg-card p-8 text-center"><FilePlus2 className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 text-lg font-semibold">Select a question</h2><p className="mt-1 text-sm text-muted-foreground">Choose one from the structure panel or add a new question.</p></div>;
  const update = (patch: Partial<Question>) => onChange({ ...definition, questions: definition.questions.map((item) => item.id === question.id ? { ...item, ...patch } : item) });
  const options = question.options ?? [];
  const isReferenced = questionReferences(question.id, definition);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Badge variant="secondary" className="mb-2">Question {String(definition.questions.indexOf(question) + 1).padStart(2, "0")}</Badge><h2 className="text-xl font-semibold tracking-tight">Edit question</h2><p className="mt-1 text-xs text-muted-foreground">Write a clear prompt, choose an answer format, and add helpful guidance.</p></div><Button type="button" variant="outline" size="sm" disabled={isReferenced} onClick={onRemove} className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" />Remove</Button></div>
      {isReferenced ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">This question is referenced by logic or calculations. Remove those references before deleting it so rules do not become invalid.</p> : null}
      <div className="space-y-2"><Label htmlFor="question-prompt">Question prompt</Label><Textarea id="question-prompt" rows={3} maxLength={1000} value={question.prompt} onChange={(event) => update({ prompt: event.target.value })} className="resize-y text-base" placeholder="Ask one clear question…" /><p className="text-right text-[10px] text-muted-foreground">{question.prompt.length}/1,000</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="question-type">Answer type</Label><select id="question-type" className={inputClass} value={question.type} onChange={(event) => { const type = event.target.value as QuestionType; update({ type, options: isChoice(type) ? question.options?.length ? question.options : [makeDefaultOption(0), makeDefaultOption(1)] : question.options }); }}><optgroup label="Choice">{questionTypes.filter((type) => ["single", "multi", "dropdown"].includes(type.value)).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</optgroup><optgroup label="Open response">{questionTypes.filter((type) => ["short_text", "long_text", "number", "percent", "date"].includes(type.value)).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</optgroup><optgroup label="Scales and binary">{questionTypes.filter((type) => ["yesno", "true_false", "scale_1_5", "scale_1_10"].includes(type.value)).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</optgroup></select><p className="text-[10px] text-muted-foreground">{questionTypes.find((type) => type.value === question.type)?.description}</p></div><div className="space-y-2"><Label htmlFor="question-section">Section</Label><select id="question-section" className={inputClass} value={question.sectionId ?? ""} onChange={(event) => update({ sectionId: event.target.value || undefined, section: undefined })}><option value="">No section</option>{(definition.sections ?? []).map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select><p className="text-[10px] text-muted-foreground">Questions keep their order within the assessment.</p></div></div>
      {isChoice(question.type) ? <div className="space-y-3 rounded-xl border bg-slate-50/70 p-4 dark:bg-muted/20"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Answer options</p><p className="text-[10px] text-muted-foreground">Use short, distinct labels. Values are stable for logic.</p></div><Button type="button" variant="outline" size="sm" disabled={options.length >= 100} onClick={() => update({ options: [...options, makeDefaultOption(options.length)] })} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add option</Button></div><div className="space-y-2">{options.map((option, index) => <div key={option.id} className="grid grid-cols-[28px_1fr_1fr_auto] items-center gap-2"><span className="text-center text-[10px] text-muted-foreground">{index + 1}</span><Input aria-label={`Option ${index + 1} label`} value={option.label} onChange={(event) => update({ options: options.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item) })} placeholder="Option label" /><Input aria-label={`Option ${index + 1} value`} value={option.value ?? option.id} onChange={(event) => update({ options: options.map((item) => item.id === option.id ? { ...item, value: event.target.value } : item) })} placeholder="Stable value" className="font-mono text-xs" /><Button type="button" variant="ghost" size="icon" aria-label="Remove option" disabled={options.length <= 1} onClick={() => update({ options: options.filter((item) => item.id !== option.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div>)}</div></div> : null}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="question-help">Help text</Label><Textarea id="question-help" rows={2} value={question.helpText ?? ""} onChange={(event) => update({ helpText: event.target.value || undefined })} placeholder="Optional extra context…" /></div><div className="space-y-2"><Label htmlFor="question-placeholder">Answer placeholder</Label><Input id="question-placeholder" value={question.placeholder ?? ""} onChange={(event) => update({ placeholder: event.target.value || undefined })} placeholder="Optional hint inside the answer field" /><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={question.required !== false} disabled={Boolean(question.requiredWhen)} onChange={(event) => update({ required: event.target.checked })} className="h-4 w-4 accent-primary" />Required by default <span className="text-[10px] text-muted-foreground">(conditional logic can override)</span></label></div></div>
      {["number", "percent"].includes(question.type) ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="question-min">Minimum</Label><Input id="question-min" type="number" value={question.min ?? ""} onChange={(event) => update({ min: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="No minimum" /></div><div className="space-y-2"><Label htmlFor="question-max">Maximum</Label><Input id="question-max" type="number" value={question.max ?? ""} onChange={(event) => update({ max: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="No maximum" /></div></div> : null}
      <div className="rounded-xl border bg-card p-3 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Accessibility note:</span> prompts and answer controls are labeled, keyboard navigable, and required state is announced in the public experience.</div>
    </div>
  );
}

function OutcomeEditor({ definition, onChange }: { definition: PackDefinition; onChange: (next: PackDefinition) => void }) {
  const updateOutcome = (id: string, patch: Partial<Outcome>) => onChange({ ...definition, outcomes: definition.outcomes.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const updateThreshold = (id: string, patch: Partial<ThresholdRule>) => onChange({ ...definition, thresholds: (definition.thresholds ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) });
  const addOutcome = () => onChange({ ...definition, outcomes: [...definition.outcomes, { id: createId(), title: `New outcome ${definition.outcomes.length + 1}`, description: "Add useful next steps for this result.", status: "caution" }] });
  const addThreshold = () => onChange({ ...definition, thresholds: [...(definition.thresholds ?? []), { id: createId(), minScore: 0, outcomeId: definition.outcomes[0]?.id ?? "", priority: 0 }] });

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Outcomes & score bands</h2><p className="mt-1 text-xs text-muted-foreground">Create the result people see and define which total or category score selects it.</p></div><Button type="button" onClick={addOutcome} className="gap-1.5"><Plus className="h-4 w-4" />Add outcome</Button></div>
    <div className="space-y-3">{definition.outcomes.map((outcome) => <div key={outcome.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="outline" className={getStatusBadge(outcome.status)}>{outcome.status ?? "pass"}</Badge><code className="text-[10px] text-muted-foreground">{outcome.id}</code></div><Button type="button" variant="ghost" size="icon" aria-label="Remove outcome" disabled={definition.outcomes.length <= 1 || (definition.thresholds ?? []).some((threshold) => threshold.outcomeId === outcome.id)} onClick={() => onChange({ ...definition, outcomes: definition.outcomes.filter((item) => item.id !== outcome.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-[1fr_160px]"><div className="space-y-1.5"><Label className="text-xs">Outcome title</Label><Input value={outcome.title} onChange={(event) => updateOutcome(outcome.id, { title: event.target.value })} /></div><div className="space-y-1.5"><Label className="text-xs">Status</Label><select className={inputClass} value={outcome.status ?? "pass"} onChange={(event) => updateOutcome(outcome.id, { status: event.target.value as Outcome["status"] })}><option value="pass">Positive</option><option value="caution">Caution</option><option value="fail">Needs attention</option></select></div></div><div className="space-y-1.5"><Label className="text-xs">Result description</Label><Textarea rows={3} value={outcome.description ?? ""} onChange={(event) => updateOutcome(outcome.id, { description: event.target.value })} placeholder="Explain what the outcome means and what to do next." /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Call-to-action label (optional)</Label><Input value={outcome.ctaLabel ?? ""} onChange={(event) => updateOutcome(outcome.id, { ctaLabel: event.target.value || undefined })} placeholder="e.g. Book a consultation" /></div><div className="space-y-1.5"><Label className="text-xs">Call-to-action URL</Label><Input type="url" value={outcome.ctaUrl ?? ""} onChange={(event) => updateOutcome(outcome.id, { ctaUrl: event.target.value || undefined })} placeholder="https://example.com/next-step" /></div></div></div>)}</div>
    <div className="rounded-2xl border bg-card p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Outcome selection rules</h3><p className="mt-1 text-[11px] text-muted-foreground">Overlapping ranges are highlighted. Higher priority wins; ties fall back to the more specific minimum score and insertion order.</p></div><Button type="button" variant="outline" size="sm" onClick={addThreshold} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add score band</Button></div>
      {(definition.thresholds ?? []).length ? <div className="space-y-2">{(definition.thresholds ?? []).map((threshold) => <div key={threshold.id} className="grid gap-2 rounded-xl border bg-slate-50/60 p-3 sm:grid-cols-[1fr_1fr_1fr_1.2fr_100px_auto] sm:items-end dark:bg-muted/20"><div className="space-y-1"><Label className="text-[10px]">Minimum</Label><Input type="number" value={threshold.minScore} onChange={(event) => updateThreshold(threshold.id, { minScore: Number(event.target.value) || 0 })} /></div><div className="space-y-1"><Label className="text-[10px]">Maximum (optional)</Label><Input type="number" value={threshold.maxScore ?? ""} onChange={(event) => updateThreshold(threshold.id, { maxScore: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="No limit" /></div><div className="space-y-1"><Label className="text-[10px]">Score on</Label><select className={inputClass} value={threshold.categoryId ?? ""} onChange={(event) => updateThreshold(threshold.id, { categoryId: event.target.value || undefined })}><option value="">Total score</option>{(definition.scoringCategories ?? []).map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></div><div className="space-y-1"><Label className="text-[10px]">Outcome</Label><select className={inputClass} value={threshold.outcomeId} onChange={(event) => updateThreshold(threshold.id, { outcomeId: event.target.value })}>{definition.outcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.title}</option>)}</select></div><div className="space-y-1"><Label className="text-[10px]">Priority</Label><Input type="number" value={threshold.priority ?? 0} onChange={(event) => updateThreshold(threshold.id, { priority: Number(event.target.value) || 0 })} /></div><Button type="button" variant="ghost" size="icon" aria-label="Remove score band" onClick={() => onChange({ ...definition, thresholds: (definition.thresholds ?? []).filter((item) => item.id !== threshold.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">No score bands. With one outcome, it is used as the default. Add bands to select among multiple results.</div>}
    </div>
  </div>;
}

export default function BuilderStudio() {
  const [adminKey, setAdminKey] = useState(() => typeof window !== "undefined" ? window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "" : "");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceBrandDraft, setWorkspaceBrandDraft] = useState<PackBranding>({});
  const [workspaceBrandSaving, setWorkspaceBrandSaving] = useState(false);
  const [packs, setPacks] = useState<StudioPack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [versions, setVersions] = useState<StudioVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [draft, setDraft] = useState<PackDefinition | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [activeTab, setActiveTab] = useState("question");
  const [brandScope, setBrandScope] = useState<"assessment" | "workspace">("assessment");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isWide, setIsWide] = useState(true);
  const [mobileView, setMobileView] = useState<"structure" | "editor" | "preview">("editor");
  const [focusMode, setFocusMode] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [packName, setPackName] = useState("");
  const [packSlug, setPackSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const adminRequest = useCallback(<T,>(path: string, init: RequestInitJson = {}) => requestJson<T>(adminKey, path, init), [adminKey]);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const selectedPack = packs.find((pack) => pack.id === selectedPackId) ?? null;
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  const selectedQuestion = draft?.questions.find((question) => question.id === selectedQuestionId);
  const diagnostics = useMemo(() => draft ? analyzePackLogic(draft) : [], [draft]);
  const blockingDiagnostics = diagnostics.filter((item) => item.severity === "error");
  const normalizedDraft = draft && selectedPack ? normalizeDefinitionForSave(draft, selectedPack) : null;
  const isDirty = Boolean(normalizedDraft && (!selectedVersion || JSON.stringify(normalizedDraft) !== JSON.stringify(selectedVersion.definition)));
  const workspaceBrandDirty = Boolean(selectedWorkspace && JSON.stringify(workspaceBrandDraft) !== JSON.stringify(selectedWorkspace.brandSettings ?? {}));
  const brandEntitlements = getFeatureEntitlements(selectedWorkspace?.brandPlan);
  const previewWorkspace = selectedWorkspace && brandScope === "workspace" ? { ...selectedWorkspace, brandSettings: workspaceBrandDraft } : selectedWorkspace;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const update = () => setIsWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!selectedWorkspace) return;
    setWorkspaceBrandDraft(selectedWorkspace.brandSettings ?? {});
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!adminKey) {
      setWorkspaces([]);
      setSelectedWorkspaceId("");
      return;
    }
    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError("");
    adminRequest<{ workspaces: Workspace[] }>("/api/admin/workspaces").then(({ workspaces: loaded }) => {
      if (cancelled) return;
      const next = loaded ?? [];
      setWorkspaces(next);
      setSelectedWorkspaceId((current) => next.some((workspace) => workspace.id === current) ? current : next[0]?.id ?? "");
    }).catch((error: unknown) => {
      if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Unable to load workspaces.");
    }).finally(() => { if (!cancelled) setWorkspaceLoading(false); });
    return () => { cancelled = true; };
  }, [adminRequest, adminKey]);

  useEffect(() => {
    if (!adminKey || !selectedWorkspaceId) {
      setPacks([]);
      setSelectedPackId("");
      return;
    }
    let cancelled = false;
    setPageError("");
    adminRequest<{ packs: StudioPack[] }>(`/api/admin/workspaces/${selectedWorkspaceId}/packs`).then(({ packs: loaded }) => {
      if (cancelled) return;
      const next = loaded ?? [];
      setPacks(next);
      setSelectedPackId((current) => next.some((pack) => pack.id === current) ? current : next[0]?.id ?? "");
    }).catch((error: unknown) => {
      if (!cancelled) setPageError(error instanceof Error ? error.message : "Unable to load assessments.");
    });
    return () => { cancelled = true; };
  }, [adminRequest, adminKey, selectedWorkspaceId]);

  useEffect(() => {
    if (!adminKey || !selectedPackId || !selectedPack) {
      setVersions([]);
      setSelectedVersionId("");
      setDraft(null);
      return;
    }
    let cancelled = false;
    setPageError("");
    setNotice("");
    adminRequest<{ versions: StudioVersion[] }>(`/api/admin/packs/${selectedPackId}/versions`).then(({ versions: loaded }) => {
      if (cancelled) return;
      const next = [...(loaded ?? [])].sort((left, right) => right.version - left.version);
      setVersions(next);
      const preferred = next.find((version) => version.id === selectedPack.publishedVersionId) ?? next[0];
      if (preferred) {
        setSelectedVersionId(preferred.id);
        setDraft(structuredClone(preferred.definition));
      } else {
        setSelectedVersionId("");
        setDraft(createStarterDefinition(selectedPack.name));
      }
      setSelectedQuestionId(preferred?.definition.questions[0]?.id ?? "");
    }).catch((error: unknown) => {
      if (!cancelled) setPageError(error instanceof Error ? error.message : "Unable to load versions.");
    });
    return () => { cancelled = true; };
  }, [adminRequest, adminKey, selectedPackId]);

  useEffect(() => {
    if (!draft) {
      setSelectedQuestionId("");
      return;
    }
    if (!draft.questions.some((question) => question.id === selectedQuestionId)) setSelectedQuestionId(draft.questions[0]?.id ?? "");
  }, [draft?.questions.map((question) => question.id).join("|"), selectedQuestionId]);

  const updateDefinition = (next: PackDefinition) => {
    setDraft(next);
    setPageError("");
    setNotice("");
  };

  const addQuestion = () => {
    if (!draft) return;
    const question = createQuestion();
    setDraft({ ...draft, questions: [...draft.questions, question] });
    setSelectedQuestionId(question.id);
    setActiveTab("question");
    setMobileView("editor");
  };

  const addSection = () => {
    if (!draft) return;
    const section: PackSection = { id: createId(), title: `Section ${(draft.sections ?? []).length + 1}` };
    setDraft({ ...draft, sections: [...(draft.sections ?? []), section] });
    setNotice("Section added. Assign questions to it in the question editor.");
  };

  const updateSection = (id: string, title: string) => {
    if (!draft) return;
    setDraft({ ...draft, sections: (draft.sections ?? []).map((section) => section.id === id ? { ...section, title } : section) });
  };

  const removeSection = (id: string) => {
    if (!draft) return;
    setDraft({ ...draft, sections: (draft.sections ?? []).filter((section) => section.id !== id), questions: draft.questions.map((question) => question.sectionId === id ? { ...question, sectionId: undefined } : question) });
  };

  const moveQuestion = (id: string, delta: number) => {
    if (!draft) return;
    const current = draft.questions.findIndex((question) => question.id === id);
    const target = current + delta;
    if (current < 0 || target < 0 || target >= draft.questions.length) return;
    const questions = [...draft.questions];
    [questions[current], questions[target]] = [questions[target]!, questions[current]!];
    setDraft({ ...draft, questions });
  };

  const removeQuestion = (id: string) => {
    if (!draft || questionReferences(id, draft)) return;
    setDraft({ ...draft, questions: draft.questions.filter((question) => question.id !== id), showIf: (draft.showIf ?? []).filter((rule) => rule.questionId !== id), routing: (draft.routing ?? []).filter((rule) => rule.fromQuestionId !== id) });
    setSelectedQuestionId(draft.questions.find((question) => question.id !== id)?.id ?? "");
  };

  const saveVersion = async (): Promise<string | null> => {
    if (!draft || !selectedPack || !adminKey) return null;
    setPageError("");
    setNotice("");
    if (draft.questions.length === 0) {
      setPageError("Add at least one question before saving.");
      return null;
    }
    if (draft.outcomes.length === 0) {
      setPageError("Add at least one outcome before saving.");
      return null;
    }
    if (blockingDiagnostics.length) {
      setPageError(`Fix ${blockingDiagnostics.length} logic error${blockingDiagnostics.length === 1 ? "" : "s"} before saving: ${blockingDiagnostics[0]?.message ?? "Invalid logic."}`);
      setActiveTab("logic");
      return null;
    }
    const definition = normalizeDefinitionForSave(draft, selectedPack);
    setSaving(true);
    try {
      const { version } = await adminRequest<{ version: StudioVersion }>(`/api/admin/packs/${selectedPack.id}/versions`, { method: "POST", body: { definition } });
      const saved = { ...version, definition: version.definition ?? definition };
      setVersions((items) => [saved, ...items.filter((item) => item.id !== saved.id)].sort((left, right) => right.version - left.version));
      setSelectedVersionId(saved.id);
      setDraft(structuredClone(saved.definition));
      setNotice(`Saved version ${saved.version}. Your published assessment is unchanged until you publish.`);
      return saved.id;
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to save this version.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!selectedPack || !selectedWorkspace || !selectedVersion || !adminKey) return;
    setPublishing(true);
    setPageError("");
    setNotice("");
    try {
      let versionId = selectedVersion.id;
      if (isDirty) {
        const savedVersionId = await saveVersion();
        if (!savedVersionId) return;
        versionId = savedVersionId;
      }
      await adminRequest(`/api/admin/packs/${selectedPack.id}/publish/${versionId}`, { method: "POST" });
      setPacks((items) => items.map((pack) => pack.id === selectedPack.id ? { ...pack, publishedVersionId: versionId } : pack));
      setNotice("Published successfully. The public assessment now uses this version.");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to publish this version.");
    } finally {
      setPublishing(false);
    }
  };

  const createWorkspace = async () => {
    const name = workspaceName.trim();
    const slug = slugify(workspaceSlug || workspaceName);
    if (!name || !slug) { setPageError("Enter a workspace name and URL-safe slug."); return; }
    setCreating(true);
    setPageError("");
    try {
      const { workspace } = await adminRequest<{ workspace: Workspace }>("/api/admin/workspaces", { method: "POST", body: { name, slug } });
      setWorkspaces((items) => [...items, workspace]);
      setSelectedWorkspaceId(workspace.id);
      setWorkspaceName(""); setWorkspaceSlug(""); setWorkspaceDialogOpen(false);
    } catch (error) { setPageError(error instanceof Error ? error.message : "Unable to create workspace."); }
    finally { setCreating(false); }
  };

  const createPack = async () => {
    if (!selectedWorkspace) return;
    const name = packName.trim();
    const slug = slugify(packSlug || packName);
    if (!name || !slug) { setPageError("Enter an assessment name and URL-safe slug."); return; }
    setCreating(true);
    setPageError("");
    try {
      const { pack } = await adminRequest<{ pack: StudioPack }>(`/api/admin/workspaces/${selectedWorkspace.id}/packs`, { method: "POST", body: { name, slug, isPaid: false } });
      setPacks((items) => [...items, pack]);
      setSelectedPackId(pack.id);
      setPackName(""); setPackSlug(""); setPackDialogOpen(false);
    } catch (error) { setPageError(error instanceof Error ? error.message : "Unable to create assessment."); }
    finally { setCreating(false); }
  };

  const saveWorkspaceBrand = async () => {
    if (!selectedWorkspace) return;
    setWorkspaceBrandSaving(true);
    setPageError("");
    setNotice("");
    try {
      const { workspace } = await adminRequest<{ workspace: Workspace }>(`/api/admin/workspaces/${selectedWorkspace.id}`, { method: "PUT", body: { brandSettings: workspaceBrandDraft } });
      setWorkspaces((items) => items.map((item) => item.id === workspace.id ? workspace : item));
      setWorkspaceBrandDraft(workspace.brandSettings ?? {});
      setNotice("Workspace brand defaults saved. Assessment overrides are unchanged.");
    } catch (error) { setPageError(error instanceof Error ? error.message : "Unable to save workspace brand defaults."); }
    finally { setWorkspaceBrandSaving(false); }
  };

  const selectVersion = (versionId: string) => {
    const version = versions.find((item) => item.id === versionId);
    if (!version || versionId === selectedVersionId) return;
    if (isDirty && !window.confirm("Discard your unsaved changes and load this saved version?")) return;
    setSelectedVersionId(versionId);
    setDraft(structuredClone(version.definition));
    setSelectedQuestionId(version.definition.questions[0]?.id ?? "");
    setPageError(""); setNotice("");
  };

  const handleKeySave = () => {
    const key = keyDraft.trim();
    if (!key) return;
    window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setKeyDraft(""); setKeyDialogOpen(false);
  };

  const shareUrl = selectedWorkspace && selectedPack ? `${window.location.origin}/w/${selectedWorkspace.slug}/${selectedPack.slug}` : "";
  const copyPublicUrl = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopyMessage("Link copied"); }
    catch { setCopyMessage(shareUrl); }
    window.setTimeout(() => setCopyMessage(""), 2600);
  };

  const renderEditor = () => {
    if (!draft) return <div className="grid h-full place-items-center p-8 text-center"><div><Sparkles className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 font-semibold">Choose an assessment</h2><p className="mt-1 text-sm text-muted-foreground">Select an existing assessment or create a new one.</p></div></div>;
    const question = draft.questions.find((item) => item.id === selectedQuestionId);
    return <div className="flex h-full min-h-0 flex-col bg-[#f7f8fc] dark:bg-background">
      <div className="border-b bg-white px-4 pt-3 dark:bg-card"><div className="mb-3 flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Builder</p><p className="truncate text-sm font-semibold">{draft.name || selectedPack?.name || "Untitled assessment"}</p></div>{diagnostics.length ? <Badge variant={blockingDiagnostics.length ? "destructive" : "secondary"}>{blockingDiagnostics.length ? `${blockingDiagnostics.length} errors` : `${diagnostics.filter((item) => item.severity === "warning").length} warnings`}</Badge> : <Badge variant="outline" className="gap-1 text-emerald-700"><Check className="h-3 w-3" />No issues</Badge>}</div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full"><TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0"><TabsTrigger value="question" className="gap-1.5 rounded-t-lg rounded-b-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"><ClipboardList className="h-3.5 w-3.5" />Question</TabsTrigger><TabsTrigger value="logic" className="gap-1.5 rounded-t-lg rounded-b-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"><Code2 className="h-3.5 w-3.5" />Logic</TabsTrigger><TabsTrigger value="outcomes" className="gap-1.5 rounded-t-lg rounded-b-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"><Sparkles className="h-3.5 w-3.5" />Outcomes</TabsTrigger><TabsTrigger value="branding" className="gap-1.5 rounded-t-lg rounded-b-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"><Palette className="h-3.5 w-3.5" />Branding</TabsTrigger><TabsTrigger value="settings" className="gap-1.5 rounded-t-lg rounded-b-none border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent"><Settings2 className="h-3.5 w-3.5" />Settings</TabsTrigger></TabsList></Tabs></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto max-w-3xl">
          {activeTab === "question" ? <QuestionEditor definition={draft} question={question} onChange={updateDefinition} onRemove={() => question && removeQuestion(question.id)} /> : null}
          {activeTab === "logic" ? <LogicStudioPanel definition={draft} selectedQuestion={question} onChange={updateDefinition} onSelectQuestion={setSelectedQuestionId} /> : null}
          {activeTab === "outcomes" ? <OutcomeEditor definition={draft} onChange={updateDefinition} /> : null}
          {activeTab === "branding" ? <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Branding & theme</h2><p className="mt-1 text-xs text-muted-foreground">Preview exactly how workspace defaults and assessment overrides combine.</p></div><div className="flex rounded-lg border bg-card p-1"><Button type="button" size="sm" variant={brandScope === "assessment" ? "secondary" : "ghost"} onClick={() => setBrandScope("assessment")} className="h-8 text-xs">This assessment</Button><Button type="button" size="sm" variant={brandScope === "workspace" ? "secondary" : "ghost"} onClick={() => setBrandScope("workspace")} className="h-8 text-xs">Workspace defaults</Button></div></div>{brandScope === "assessment" ? <BrandingEditor value={draft.branding ?? {}} workspace={selectedWorkspace!} scope="assessment" entitlements={brandEntitlements} onChange={(branding) => updateDefinition({ ...draft, branding })} /> : <><BrandingEditor value={workspaceBrandDraft} workspace={selectedWorkspace!} scope="workspace" entitlements={brandEntitlements} onChange={setWorkspaceBrandDraft} /><div className="flex justify-end"><Button type="button" disabled={workspaceBrandSaving || !workspaceBrandDirty} onClick={saveWorkspaceBrand}>{workspaceBrandSaving ? "Saving defaults…" : workspaceBrandDirty ? "Save workspace defaults" : "Defaults saved"}</Button></div></>}</div> : null}
          {activeTab === "settings" ? <div className="space-y-5"><div><h2 className="text-xl font-semibold">Assessment settings</h2><p className="mt-1 text-xs text-muted-foreground">Identity, introduction, and public assessment experience.</p></div><div className="space-y-2"><Label htmlFor="assessment-name">Assessment title</Label><Input id="assessment-name" value={draft.name ?? selectedPack?.name ?? ""} onChange={(event) => updateDefinition({ ...draft, name: event.target.value })} maxLength={120} /></div><div className="space-y-2"><Label htmlFor="assessment-description">Welcome description</Label><Textarea id="assessment-description" rows={4} value={draft.description ?? ""} onChange={(event) => updateDefinition({ ...draft, description: event.target.value })} maxLength={5000} placeholder="Set expectations and explain what participants will get." /><p className="text-[10px] text-muted-foreground">Shown on the welcome screen. Unsaved changes appear immediately in the preview.</p></div><div className="rounded-xl border bg-slate-50 p-4 dark:bg-muted/20"><p className="text-sm font-semibold">Draft safety</p><p className="mt-1 text-xs leading-5 text-muted-foreground">The preview uses local browser state only. It does not create leads, submissions, analytics, payments, PDF downloads, or emails. Scoring for real submissions remains authoritative on the server.</p></div><div className="rounded-xl border p-4"><p className="text-xs font-semibold">Public URL</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{shareUrl || "Create an assessment to get a public URL."}</p>{selectedPack?.publishedVersionId ? <Badge variant="outline" className="mt-2 text-emerald-700">Published</Badge> : <Badge variant="outline" className="mt-2">Not published</Badge>}</div></div> : null}
        </div>
      </div>
    </div>;
  };

  const renderPreview = () => draft ? <LiveAssessmentPreview definition={draft} workspace={previewWorkspace} focusMode={focusMode} onToggleFocus={() => setFocusMode((value) => !value)} /> : <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">Select an assessment to preview.</div>;

  if (!adminKey) {
    return <main className="grid min-h-[calc(100vh-3.25rem)] place-items-center bg-[#f7f8fc] px-4 py-12 dark:bg-background"><div className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl shadow-slate-200/60 dark:shadow-black/20"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div><h1 className="mt-5 text-2xl font-semibold tracking-tight">Open Builder Studio</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the admin key used by the existing workspace console. It is stored in this browser only and is sent to protected admin routes.</p><div className="mt-5 space-y-2"><Label htmlFor="builder-admin-key">Admin key</Label><Input id="builder-admin-key" type="password" autoComplete="current-password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleKeySave()} placeholder="Enter your admin key" /></div><Button type="button" className="mt-4 w-full" disabled={!keyDraft.trim()} onClick={handleKeySave}>Continue to builder <ArrowRight className="ml-2 h-4 w-4" /></Button><Link href="/admin" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">Back to existing admin</Link></div></main>;
  }

  if (!selectedWorkspace && !workspaceLoading && !workspaces.length) {
    return <main className="mx-auto grid min-h-[calc(100vh-3.25rem)] max-w-3xl place-items-center px-4 py-12"><div className="w-full rounded-3xl border bg-card p-7 text-center shadow-xl"><Sparkles className="mx-auto h-9 w-9 text-primary" /><h1 className="mt-4 text-2xl font-semibold">Start with a workspace</h1><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Workspace settings provide brand defaults. Existing packs and records stay in the current app and can be opened from this studio.</p><Button onClick={() => setWorkspaceDialogOpen(true)} className="mt-5 gap-2"><Plus className="h-4 w-4" />Create workspace</Button>{workspaceError ? <p role="alert" className="mt-4 text-sm text-destructive">{workspaceError}</p> : null}<div className="mt-4"><Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground">Open existing admin</Link></div><Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}><DialogContent><DialogHeader><DialogTitle>New workspace</DialogTitle><DialogDescription>Create a workspace to organize assessments and branding defaults.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1.5"><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" value={workspaceName} onChange={(event) => { setWorkspaceName(event.target.value); if (!workspaceSlug) setWorkspaceSlug(slugify(event.target.value)); }} /></div><div className="space-y-1.5"><Label htmlFor="workspace-slug">Workspace URL slug</Label><Input id="workspace-slug" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(slugify(event.target.value))} /></div></div><DialogFooter><Button onClick={createWorkspace} disabled={creating}>{creating ? "Creating…" : "Create workspace"}</Button></DialogFooter></DialogContent></Dialog></div></main>;
  }

  return (
    <main className="flex h-[calc(100vh-3.25rem)] min-h-[620px] flex-col overflow-hidden bg-[#f7f8fc] dark:bg-background">
      <header className="z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-3 py-2.5 dark:bg-card sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><Link href="/admin" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Back to admin"><ArrowLeft className="h-4 w-4" /></Link><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-semibold tracking-tight">Builder Studio</span><Badge variant="outline" className="hidden text-[9px] uppercase tracking-wide sm:inline-flex">Draft-safe</Badge></div><p className="hidden truncate text-[10px] text-muted-foreground md:block">Build · test · publish</p></div></div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 px-1 md:px-4">
          <select aria-label="Workspace" className={`${inputClass} max-w-[190px] text-xs`} value={selectedWorkspaceId} onChange={(event) => { if ((isDirty || workspaceBrandDirty) && !window.confirm("Discard your unsaved assessment or workspace-brand changes and switch workspaces?")) return; setSelectedWorkspaceId(event.target.value); }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
          <Button type="button" size="icon" variant="outline" aria-label="Create workspace" title="Create workspace" onClick={() => { if ((isDirty || workspaceBrandDirty) && !window.confirm("Discard your unsaved changes and create a new workspace?")) return; setWorkspaceName(""); setWorkspaceSlug(""); setWorkspaceDialogOpen(true); }} className="h-9 w-9 shrink-0"><Plus className="h-4 w-4" /></Button>
          <select aria-label="Assessment" className={`${inputClass} max-w-[220px] text-xs`} value={selectedPackId} onChange={(event) => { if (isDirty && !window.confirm("Discard your unsaved changes and switch assessments?")) return; setSelectedPackId(event.target.value); }}>{packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select>
          <Button type="button" size="icon" variant="outline" aria-label="Create assessment" title="Create assessment" onClick={() => { if (isDirty && !window.confirm("Discard your unsaved assessment changes and create another assessment?")) return; setPackName(""); setPackSlug(""); setPackDialogOpen(true); }} className="h-9 w-9 shrink-0"><Plus className="h-4 w-4" /></Button>
          {versions.length ? <select aria-label="Version" className={`${inputClass} max-w-[126px] text-xs`} value={selectedVersionId} onChange={(event) => selectVersion(event.target.value)}>{versions.map((version) => <option key={version.id} value={version.id}>v{version.version}{version.id === selectedPack?.publishedVersionId ? " · live" : " · saved"}</option>)}</select> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5"><span className={`hidden items-center gap-1 text-[10px] sm:inline-flex ${isDirty ? "text-amber-700" : "text-emerald-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${isDirty ? "bg-amber-500" : "bg-emerald-500"}`} />{isDirty ? "Unsaved changes" : "Saved"}</span>{selectedPack?.publishedVersionId ? <Button type="button" variant="outline" size="sm" onClick={copyPublicUrl} title={shareUrl} className="h-8 px-2.5 text-xs sm:px-3">Copy link</Button> : null}<Button type="button" variant="outline" size="sm" disabled={!draft || saving || !isDirty} onClick={saveVersion} className="h-8 gap-1.5 px-2.5 text-xs sm:px-3">{saving ? "Saving…" : "Save version"}</Button><Button type="button" size="sm" disabled={!selectedVersion || publishing || blockingDiagnostics.length > 0} onClick={publish} className="h-8 gap-1.5 px-2.5 text-xs sm:px-3">{publishing ? "Publishing…" : selectedPack?.publishedVersionId === selectedVersion?.id && !isDirty ? "Live" : "Publish"}<ArrowRight className="hidden h-3.5 w-3.5 sm:block" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Change admin key" title="Admin key settings" onClick={() => { setKeyDraft(""); setKeyDialogOpen(true); }} className="h-8 w-8"><LockKeyhole className="h-4 w-4" /></Button></div>
      </header>
      {pageError || workspaceError ? <div role="alert" className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{pageError || workspaceError}</span><button type="button" onClick={() => { setPageError(""); setWorkspaceError(""); }} className="ml-auto text-current/70 hover:text-current" aria-label="Dismiss error"><X className="h-3.5 w-3.5" /></button></div> : null}
      {notice ? <div role="status" className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><Check className="h-3.5 w-3.5 shrink-0" /><span>{notice}</span><button type="button" onClick={() => setNotice("")} className="ml-auto" aria-label="Dismiss message"><X className="h-3.5 w-3.5" /></button></div> : null}
      {copyMessage ? <div className="absolute right-4 top-20 z-50 max-w-[80vw] rounded-lg border bg-card px-3 py-2 text-xs shadow-xl">{copyMessage}</div> : null}

      {selectedWorkspace ? <>
        {focusMode ? <div className="min-h-0 flex-1">{renderPreview()}</div> : isWide ? <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={23} minSize={17} maxSize={31} className="min-w-0 border-r"><StructurePanel definition={draft ?? createStarterDefinition(selectedPack?.name ?? "Assessment")} selectedQuestionId={selectedQuestionId} onSelectQuestion={(id) => { setSelectedQuestionId(id); setActiveTab("question"); }} onAddQuestion={addQuestion} onAddSection={addSection} onUpdateSection={updateSection} onRemoveSection={removeSection} onMoveQuestion={moveQuestion} onRemoveQuestion={removeQuestion} /></ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={43} minSize={32} className="min-w-0">{renderEditor()}</ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={34} minSize={25} className="min-w-0 border-l">{renderPreview()}</ResizablePanel>
        </ResizablePanelGroup> : <div className="flex min-h-0 flex-1 flex-col"><div className="grid grid-cols-3 border-b bg-white p-1 dark:bg-card">{(["structure", "editor", "preview"] as const).map((view) => <button key={view} type="button" onClick={() => setMobileView(view)} className={`rounded-md py-2 text-xs font-medium capitalize ${mobileView === view ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{view === "editor" ? "Edit" : view}</button>)}</div><div className="min-h-0 flex-1">{mobileView === "structure" ? <StructurePanel definition={draft ?? createStarterDefinition(selectedPack?.name ?? "Assessment")} selectedQuestionId={selectedQuestionId} onSelectQuestion={(id) => { setSelectedQuestionId(id); setActiveTab("question"); setMobileView("editor"); }} onAddQuestion={addQuestion} onAddSection={addSection} onUpdateSection={updateSection} onRemoveSection={removeSection} onMoveQuestion={moveQuestion} onRemoveQuestion={removeQuestion} /> : mobileView === "editor" ? renderEditor() : renderPreview()}</div></div>}
      </> : <div className="grid min-h-0 flex-1 place-items-center p-6 text-center"><div className="max-w-md"><Sparkles className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">Create your first assessment</h2><p className="mt-1 text-sm text-muted-foreground">Choose a workspace and add a first assessment. Draft preview stays local and does not submit participant data.</p><Button className="mt-4 gap-2" onClick={() => setPackDialogOpen(true)}><Plus className="h-4 w-4" />New assessment</Button></div></div>}

      <Dialog open={packDialogOpen} onOpenChange={setPackDialogOpen}><DialogContent><DialogHeader><DialogTitle>New assessment</DialogTitle><DialogDescription>Create an assessment in {selectedWorkspace?.name ?? "this workspace"}. You can save a first version after editing.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1.5"><Label htmlFor="pack-name">Assessment name</Label><Input id="pack-name" value={packName} onChange={(event) => { setPackName(event.target.value); if (!packSlug) setPackSlug(slugify(event.target.value)); }} placeholder="e.g. Readiness check" /></div><div className="space-y-1.5"><Label htmlFor="pack-slug">Public URL slug</Label><Input id="pack-slug" value={packSlug} onChange={(event) => setPackSlug(slugify(event.target.value))} placeholder="readiness-check" /><p className="text-[10px] text-muted-foreground">Lowercase letters, numbers, and hyphens.</p></div></div><DialogFooter><Button variant="outline" onClick={() => setPackDialogOpen(false)}>Cancel</Button><Button onClick={createPack} disabled={creating || !selectedWorkspace}>{creating ? "Creating…" : "Create assessment"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}><DialogContent><DialogHeader><DialogTitle>New workspace</DialogTitle><DialogDescription>Workspaces keep assessments and brand defaults isolated.</DialogDescription></DialogHeader><div className="space-y-3"><div className="space-y-1.5"><Label htmlFor="workspace-name-dialog">Workspace name</Label><Input id="workspace-name-dialog" value={workspaceName} onChange={(event) => { setWorkspaceName(event.target.value); if (!workspaceSlug) setWorkspaceSlug(slugify(event.target.value)); }} /></div><div className="space-y-1.5"><Label htmlFor="workspace-slug-dialog">Workspace slug</Label><Input id="workspace-slug-dialog" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(slugify(event.target.value))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setWorkspaceDialogOpen(false)}>Cancel</Button><Button onClick={createWorkspace} disabled={creating}>{creating ? "Creating…" : "Create workspace"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}><DialogContent><DialogHeader><DialogTitle>Admin access</DialogTitle><DialogDescription>Update the existing admin key stored in this browser. The key is not saved in the assessment definition.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="admin-key-update">Admin key</Label><Input id="admin-key-update" type="password" autoComplete="current-password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setKeyDialogOpen(false)}>Cancel</Button><Button disabled={!keyDraft.trim()} onClick={handleKeySave}>Save key</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
