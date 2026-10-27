import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown, CircleHelp, GitBranch, Layers3, Plus, Sparkles, Trash2 } from "lucide-react";
import type { CalculatedVariable, ConditionGroup, DisqualifierRule, PackDefinition, Question, ReusableCondition, RoutingRule, ScoringRule } from "@shared/pack";
import { analyzePackLogic } from "@shared/engine/interpreter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ConditionTreeEditor from "@/components/ConditionTreeEditor";
import FormulaExpressionEditor from "@/components/FormulaExpressionEditor";

const shortId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2, 10)}`;
const conditionFor = (questionId?: string): ConditionGroup => ({ all: questionId ? [{ questionId, operator: "answered" }] : [] });
const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function PanelSection({ title, subtitle, icon, children, defaultOpen = false }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">{icon ?? <Sparkles className="h-4 w-4" />}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span>{subtitle ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{subtitle}</span> : null}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

function LogicMap({ definition }: { definition: PackDefinition }) {
  const routeByQuestion = new Map<string, RoutingRule[]>();
  for (const route of definition.routing ?? []) routeByQuestion.set(route.fromQuestionId, [...(routeByQuestion.get(route.fromQuestionId) ?? []), route]);
  return (
    <div className="rounded-2xl border bg-slate-50/80 p-4 dark:bg-muted/20">
      <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Logic map</p><p className="text-[11px] text-muted-foreground">A live map of the default path and conditional jumps.</p></div><GitBranch className="h-4 w-4 text-indigo-500" /></div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-center gap-2">
          <div className="grid h-12 w-20 place-items-center rounded-xl border border-indigo-200 bg-white text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:border-indigo-900 dark:bg-card dark:text-indigo-300">Start</div>
          {definition.questions.map((question, index) => <div key={question.id} className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <div className="w-44 rounded-xl border bg-white p-2.5 dark:bg-card"><p className="truncate text-[10px] font-semibold text-muted-foreground">Q{index + 1} · {question.sectionId ? definition.sections?.find((section) => section.id === question.sectionId)?.title ?? "Section" : "Question"}</p><p className="mt-1 line-clamp-2 text-xs font-medium">{question.prompt || "Untitled question"}</p>{(definition.showIf ?? []).some((rule) => rule.questionId === question.id) ? <span className="mt-1 inline-flex rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] text-violet-800 dark:bg-violet-950 dark:text-violet-200">conditional</span> : null}</div>
          </div>)}
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <div className="grid h-12 min-w-24 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">Results</div>
        </div>
      </div>
      {(definition.routing ?? []).length ? <div className="mt-3 space-y-1.5 border-t pt-3">{definition.routing!.map((route) => {
        const source = definition.questions.find((question) => question.id === route.fromQuestionId)?.prompt ?? "Missing question";
        const target = route.targetQuestionId ? definition.questions.find((question) => question.id === route.targetQuestionId)?.prompt ?? "Missing target" : "Finish assessment";
        return <div key={route.id} className="flex flex-wrap items-center gap-1.5 text-[10px]"><span className="rounded-md bg-white px-2 py-1 dark:bg-card">{source}</span><ArrowRight className="h-3 w-3 text-indigo-500" /><span className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{target}</span><span className="text-muted-foreground">· priority {route.priority ?? 0}</span></div>;
      })}</div> : <p className="mt-3 border-t pt-3 text-[10px] text-muted-foreground">No explicit jumps yet. Questions follow their visible order.</p>}
    </div>
  );
}

export default function LogicStudioPanel({
  definition,
  selectedQuestion,
  onChange,
  onSelectQuestion,
}: {
  definition: PackDefinition;
  selectedQuestion?: Question;
  onChange: (next: PackDefinition) => void;
  onSelectQuestion: (id: string) => void;
}) {
  const questions = definition.questions;
  const variables = definition.calculations ?? [];
  const diagnostics = useMemo(() => analyzePackLogic(definition), [definition]);
  const selectedVisibility = (definition.showIf ?? []).filter((rule) => rule.questionId === selectedQuestion?.id);
  const [templateLabel, setTemplateLabel] = useState("");

  const updateQuestion = (questionId: string, patch: Partial<Question>) => onChange({ ...definition, questions: definition.questions.map((question) => question.id === questionId ? { ...question, ...patch } : question) });
  const updateRule = <T extends { id: string }>(items: T[], id: string, patch: Partial<T>) => items.map((item) => item.id === id ? { ...item, ...patch } : item);
  const removeRule = <T extends { id: string }>(items: T[], id: string) => items.filter((item) => item.id !== id);

  const addVisibility = () => {
    if (!selectedQuestion) return;
    const conditionQuestion = questions.find((question) => question.id !== selectedQuestion.id) ?? selectedQuestion;
    const rule = { questionId: selectedQuestion.id, when: conditionFor(conditionQuestion.id), label: "Show when…" };
    onChange({ ...definition, showIf: [...(definition.showIf ?? []), rule] });
  };
  const addRoute = () => {
    if (!selectedQuestion) return;
    const nextQuestion = questions[questions.findIndex((question) => question.id === selectedQuestion.id) + 1];
    const rule: RoutingRule = { id: shortId(), fromQuestionId: selectedQuestion.id, targetQuestionId: nextQuestion?.id ?? null, when: conditionFor(selectedQuestion.id), priority: 0, label: "Conditional route" };
    onChange({ ...definition, routing: [...(definition.routing ?? []), rule] });
  };
  const addScoring = () => {
    const firstQuestion = questions[0];
    const rule: ScoringRule = { id: shortId(), label: "Weighted score", points: 1, when: conditionFor(firstQuestion?.id) };
    onChange({ ...definition, scoring: [...(definition.scoring ?? []), rule] });
  };
  const addDisqualifier = () => {
    const firstQuestion = questions[0];
    const rule: DisqualifierRule = { id: shortId(), reason: "This answer needs a manual review.", when: conditionFor(firstQuestion?.id), priority: 0 };
    onChange({ ...definition, disqualifiers: [...(definition.disqualifiers ?? []), rule] });
  };
  const addCalculation = () => {
    const variable: CalculatedVariable = { id: shortId(), label: `Calculated value ${(definition.calculations ?? []).length + 1}`, expression: { op: "add", args: [{ op: "literal", value: 0 }, { op: "literal", value: 0 }] } };
    onChange({ ...definition, calculations: [...(definition.calculations ?? []), variable] });
  };
  const addCategory = () => onChange({ ...definition, scoringCategories: [...(definition.scoringCategories ?? []), { id: shortId(), label: `Category ${(definition.scoringCategories ?? []).length + 1}` }] });
  const addTemplate = () => {
    const question = questions[0];
    const reusable: ReusableCondition = { id: shortId(), label: templateLabel.trim() || `Saved condition ${(definition.reusableConditions ?? []).length + 1}`, when: conditionFor(question?.id) };
    onChange({ ...definition, reusableConditions: [...(definition.reusableConditions ?? []), reusable] });
    setTemplateLabel("");
  };
  const insertTemplate = (condition: ReusableCondition, target: "visibility" | "required") => {
    if (!selectedQuestion) return;
    if (target === "required") {
      const requiredWhen = selectedQuestion.requiredWhen ?? { all: [] };
      updateQuestion(selectedQuestion.id, { requiredWhen: { ...requiredWhen, all: [...(requiredWhen.all ?? []), structuredClone(condition.when)] } });
      return;
    }
    const first = selectedVisibility[0];
    if (first) {
      onChange({ ...definition, showIf: definition.showIf?.map((rule) => rule === first ? { ...rule, when: { ...rule.when, all: [...(rule.when.all ?? []), structuredClone(condition.when)] } } : rule) });
    } else {
      onChange({ ...definition, showIf: [...(definition.showIf ?? []), { questionId: selectedQuestion.id, when: structuredClone(condition.when), label: condition.label }] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs leading-5 text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/25 dark:text-indigo-100"><strong>Advanced logic is available on every plan.</strong> Conditions, routing, formulas, scoring, preview and debugging are never gated by subscription.</div>
      <LogicMap definition={definition} />

      <PanelSection title="Question behavior" subtitle={selectedQuestion ? `Rules for “${selectedQuestion.prompt || "Untitled question"}”` : "Select a question to configure visibility, requirements, and routes."} icon={<GitBranch className="h-4 w-4" />} defaultOpen>
        {!selectedQuestion ? <p className="text-sm text-muted-foreground">Choose a question in the structure panel to edit its conditional behavior.</p> : <div className="space-y-5">
          <div className="space-y-3 rounded-xl bg-slate-50/70 p-3 dark:bg-muted/20"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Show question when…</p><p className="text-[11px] text-muted-foreground">Multiple visibility groups combine with OR.</p></div><Button type="button" variant="outline" size="sm" onClick={addVisibility} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add condition group</Button></div>
            {selectedVisibility.map((rule, index) => {
              const ruleIndex = (definition.showIf ?? []).indexOf(rule);
              return <div key={`${rule.questionId}-${index}`} className="space-y-2 rounded-xl border bg-card p-3"><div className="flex items-center justify-between"><Label className="text-xs">Show when group {index + 1}</Label><Button type="button" variant="ghost" size="icon" aria-label="Remove visibility group" onClick={() => onChange({ ...definition, showIf: (definition.showIf ?? []).filter((_, itemIndex) => itemIndex !== ruleIndex) })} className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div><ConditionTreeEditor value={rule.when} questions={questions} variables={variables} onChange={(when) => onChange({ ...definition, showIf: (definition.showIf ?? []).map((item, itemIndex) => itemIndex === ruleIndex ? { ...item, when } : item) })} /></div>;
            })}
            {!selectedVisibility.length ? <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">Always visible until you add a rule.</p> : null}
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50/70 p-3 dark:bg-muted/20"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Required answer</p><p className="text-[11px] text-muted-foreground">Set a rule to make the answer required only on matching paths.</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(selectedQuestion.requiredWhen)} onChange={(event) => updateQuestion(selectedQuestion.id, { requiredWhen: event.target.checked ? conditionFor(questions.find((question) => question.id !== selectedQuestion.id)?.id ?? selectedQuestion.id) : undefined })} className="h-4 w-4 accent-primary" />Conditional</label></div>
            {selectedQuestion.requiredWhen ? <ConditionTreeEditor value={selectedQuestion.requiredWhen} questions={questions} variables={variables} onChange={(requiredWhen) => updateQuestion(selectedQuestion.id, { requiredWhen })} /> : <p className="text-xs text-muted-foreground">The standard required/optional setting is used for all paths.</p>}
          </div>

          <div className="space-y-3 rounded-xl bg-slate-50/70 p-3 dark:bg-muted/20"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Route after this answer</p><p className="text-[11px] text-muted-foreground">Highest priority matching route wins; unmatched answers follow the next visible question.</p></div><Button type="button" variant="outline" size="sm" onClick={addRoute} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add route</Button></div>
            {(definition.routing ?? []).filter((rule) => rule.fromQuestionId === selectedQuestion.id).map((rule) => <div key={rule.id} className="space-y-3 rounded-xl border bg-card p-3"><div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]"><div className="space-y-1"><Label className="text-[11px]">Next step</Label><select className={inputClass} value={rule.targetQuestionId ?? "finish"} onChange={(event) => onChange({ ...definition, routing: updateRule(definition.routing ?? [], rule.id, { targetQuestionId: event.target.value === "finish" ? null : event.target.value }) })}><option value="finish">Finish assessment</option>{questions.filter((item) => item.id !== selectedQuestion.id).map((item) => <option key={item.id} value={item.id}>{item.prompt || "Untitled question"}</option>)}</select></div><div className="space-y-1"><Label className="text-[11px]">Priority</Label><Input type="number" value={rule.priority ?? 0} onChange={(event) => onChange({ ...definition, routing: updateRule(definition.routing ?? [], rule.id, { priority: Number(event.target.value) || 0 }) })} /></div><div className="flex items-end justify-end"><Button type="button" variant="ghost" size="icon" aria-label="Remove route" onClick={() => onChange({ ...definition, routing: removeRule(definition.routing ?? [], rule.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div></div><Input aria-label="Route label" placeholder="Rule name (optional)" value={rule.label ?? ""} onChange={(event) => onChange({ ...definition, routing: updateRule(definition.routing ?? [], rule.id, { label: event.target.value }) })} /><ConditionTreeEditor value={rule.when} questions={questions} variables={variables} onChange={(when) => onChange({ ...definition, routing: updateRule(definition.routing ?? [], rule.id, { when }) })} /></div>)}
            {!(definition.routing ?? []).some((rule) => rule.fromQuestionId === selectedQuestion.id) ? <p className="text-xs text-muted-foreground">No explicit route. The assessment follows question order.</p> : null}
          </div>
        </div>}
      </PanelSection>

      <PanelSection title="Weighted and category scoring" subtitle="Additive points, formula-based weights, category totals, and priority-resolved outcomes." icon={<Sparkles className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold">Scoring categories</p><p className="text-[11px] text-muted-foreground">Optional sub-scores for skill areas or dimensions.</p></div><Button type="button" size="sm" variant="outline" onClick={addCategory} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add category</Button></div>
        {(definition.scoringCategories ?? []).map((category) => <div key={category.id} className="flex items-center gap-2"><Input aria-label="Category label" value={category.label} onChange={(event) => onChange({ ...definition, scoringCategories: updateRule(definition.scoringCategories ?? [], category.id, { label: event.target.value }) })} /><Button type="button" variant="ghost" size="icon" aria-label="Remove category" onClick={() => onChange({ ...definition, scoringCategories: removeRule(definition.scoringCategories ?? [], category.id), scoring: (definition.scoring ?? []).map((rule) => rule.categoryId === category.id ? { ...rule, categoryId: undefined } : rule), thresholds: (definition.thresholds ?? []).map((rule) => rule.categoryId === category.id ? { ...rule, categoryId: undefined } : rule) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div>)}
        <div className="flex items-center justify-between gap-2 border-t pt-3"><div><p className="text-xs font-semibold">Scoring rules</p><p className="text-[11px] text-muted-foreground">Each matched rule contributes points to the total and its optional category.</p></div><Button type="button" size="sm" onClick={addScoring} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add score rule</Button></div>
        {(definition.scoring ?? []).map((rule) => <div key={rule.id} className="space-y-3 rounded-xl border bg-slate-50/60 p-3 dark:bg-muted/20"><div className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]"><div className="space-y-1"><Label className="text-[11px]">Rule label</Label><Input value={rule.label ?? ""} placeholder="e.g. Documented process" onChange={(event) => onChange({ ...definition, scoring: updateRule(definition.scoring ?? [], rule.id, { label: event.target.value }) })} /></div><div className="space-y-1"><Label className="text-[11px]">Points</Label><Input type="number" value={rule.points} onChange={(event) => onChange({ ...definition, scoring: updateRule(definition.scoring ?? [], rule.id, { points: Number(event.target.value) || 0 }) })} /></div><div className="space-y-1"><Label className="text-[11px]">Category</Label><select className={inputClass} value={rule.categoryId ?? ""} onChange={(event) => onChange({ ...definition, scoring: updateRule(definition.scoring ?? [], rule.id, { categoryId: event.target.value || undefined }) })}><option value="">Overall score</option>{(definition.scoringCategories ?? []).map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></div><div className="flex items-end justify-end"><Button type="button" variant="ghost" size="icon" aria-label="Remove scoring rule" onClick={() => onChange({ ...definition, scoring: removeRule(definition.scoring ?? [], rule.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div></div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(rule.pointsFormula)} onChange={(event) => onChange({ ...definition, scoring: updateRule(definition.scoring ?? [], rule.id, { pointsFormula: event.target.checked ? { op: "literal", value: rule.points } : undefined }) })} className="h-4 w-4 accent-primary" />Calculate weighted points with a safe formula</label>
          {rule.pointsFormula ? <FormulaExpressionEditor value={rule.pointsFormula} questions={questions} variables={variables} onChange={(pointsFormula) => onChange({ ...definition, scoring: updateRule(definition.scoring ?? [], rule.id, { pointsFormula }) })} /> : null}
          <ConditionTreeEditor value={rule.when} questions={questions} variables={variables} onChange={(when) => onChange({ ...definition, scoring: updateRule(definition.scoring ?? [], rule.id, { when }) })} />
        </div>)}
        {!(definition.scoring ?? []).length ? <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No scoring rules yet. Add weighted points when a condition matches.</p> : null}
      </PanelSection>

      <PanelSection title="Disqualifiers and conflict checks" subtitle="Explainable rules can suppress an outcome when a condition must stop the flow." icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">All matching reasons are recorded and shown in the local debugger.</p><Button type="button" size="sm" variant="outline" onClick={addDisqualifier} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add rule</Button></div>
        {(definition.disqualifiers ?? []).map((rule) => <div key={rule.id} className="space-y-3 rounded-xl border bg-slate-50/60 p-3 dark:bg-muted/20"><div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]"><div className="space-y-1"><Label className="text-[11px]">Reason shown in the result</Label><Textarea rows={2} value={rule.reason} onChange={(event) => onChange({ ...definition, disqualifiers: updateRule(definition.disqualifiers ?? [], rule.id, { reason: event.target.value }) })} /></div><div className="space-y-1"><Label className="text-[11px]">Priority</Label><Input type="number" value={rule.priority ?? 0} onChange={(event) => onChange({ ...definition, disqualifiers: updateRule(definition.disqualifiers ?? [], rule.id, { priority: Number(event.target.value) || 0 }) })} /><p className="text-[10px] text-muted-foreground">For ordering/debug clarity.</p></div><div className="flex items-start justify-end"><Button type="button" variant="ghost" size="icon" aria-label="Remove disqualifier" onClick={() => onChange({ ...definition, disqualifiers: removeRule(definition.disqualifiers ?? [], rule.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div></div><ConditionTreeEditor value={rule.when} questions={questions} variables={variables} onChange={(when) => onChange({ ...definition, disqualifiers: updateRule(definition.disqualifiers ?? [], rule.id, { when }) })} /></div>)}
        {!(definition.disqualifiers ?? []).length ? <p className="text-xs text-muted-foreground">No disqualifiers configured.</p> : null}
      </PanelSection>

      <PanelSection title="Calculated variables" subtitle="Build numeric, text, and date calculations with a safe expression tree—never JavaScript." icon={<Layers3 className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-muted-foreground">Calculated values can power conditions and weighted scoring.</p></div><Button type="button" size="sm" variant="outline" onClick={addCalculation} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add calculation</Button></div>
        {variables.map((variable) => <div key={variable.id} className="space-y-3 rounded-xl border bg-slate-50/60 p-3 dark:bg-muted/20"><div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]"><div className="space-y-1"><Label className="text-[11px]">Variable name</Label><Input value={variable.label} onChange={(event) => onChange({ ...definition, calculations: updateRule(variables, variable.id, { label: event.target.value }) })} /></div><div className="space-y-1"><Label className="text-[11px]">Description (optional)</Label><Input value={variable.description ?? ""} onChange={(event) => onChange({ ...definition, calculations: updateRule(variables, variable.id, { description: event.target.value }) })} /></div><div className="flex items-end justify-end"><Button type="button" variant="ghost" size="icon" aria-label="Remove calculated variable" onClick={() => onChange({ ...definition, calculations: removeRule(variables, variable.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div></div><FormulaExpressionEditor value={variable.expression} questions={questions} variables={variables.filter((item) => item.id !== variable.id)} onChange={(expression) => onChange({ ...definition, calculations: updateRule(variables, variable.id, { expression }) })} /></div>)}
        {!variables.length ? <p className="text-xs text-muted-foreground">No calculations yet.</p> : null}
      </PanelSection>

      <PanelSection title="Reusable condition library" subtitle="Save a condition group once and insert a copy into a visibility or required rule." icon={<CircleHelp className="h-4 w-4" />}>
        <div className="flex gap-2"><Input value={templateLabel} onChange={(event) => setTemplateLabel(event.target.value)} placeholder="Template name" aria-label="Reusable condition name" /><Button type="button" variant="outline" onClick={addTemplate} className="shrink-0 gap-1.5"><Plus className="h-4 w-4" />Save template</Button></div>
        {(definition.reusableConditions ?? []).map((condition) => <div key={condition.id} className="space-y-3 rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-medium">{condition.label}</p><p className="text-[10px] text-muted-foreground">A saved copy, safe to edit after insertion.</p></div><Button type="button" variant="ghost" size="icon" aria-label="Remove reusable condition" onClick={() => onChange({ ...definition, reusableConditions: removeRule(definition.reusableConditions ?? [], condition.id) })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div><ConditionTreeEditor value={condition.when} questions={questions} variables={variables} onChange={(when) => onChange({ ...definition, reusableConditions: updateRule(definition.reusableConditions ?? [], condition.id, { when }) })} /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!selectedQuestion} onClick={() => insertTemplate(condition, "visibility")} className="text-xs">Insert in visibility</Button><Button type="button" variant="outline" size="sm" disabled={!selectedQuestion} onClick={() => insertTemplate(condition, "required")} className="text-xs">Insert in required rule</Button></div></div>)}
        {!(definition.reusableConditions ?? []).length ? <p className="text-xs text-muted-foreground">Save useful condition groups here for quick insertion in multiple rules.</p> : null}
      </PanelSection>

      <PanelSection title="Logic diagnostics" subtitle="Errors block publishing; warnings explain ambiguous paths and overlapping thresholds." icon={<AlertTriangle className="h-4 w-4" />} defaultOpen={diagnostics.some((diagnostic) => diagnostic.severity !== "info")}>
        {diagnostics.length ? <div className="space-y-2">{diagnostics.map((diagnostic, index) => <div key={`${diagnostic.code}-${diagnostic.targetId ?? index}`} className="flex gap-2 rounded-lg border bg-background p-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${diagnostic.severity === "error" ? "bg-rose-500" : diagnostic.severity === "warning" ? "bg-amber-500" : "bg-sky-500"}`} /><div><p className="text-xs font-medium">{diagnostic.message}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{diagnostic.severity}{diagnostic.targetId ? ` · ${diagnostic.targetId}` : ""}</p></div></div>)}</div> : <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />No structural logic conflicts detected.</p>}
      </PanelSection>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-muted-foreground dark:border-slate-800 dark:bg-slate-900/30"><ArrowUp className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Evaluation stays server-side for real submissions. The editor and draft preview run the same deterministic interpreter locally; preview activity is never sent to production endpoints.</span></div>
    </div>
  );
}
