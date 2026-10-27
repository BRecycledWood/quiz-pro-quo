import { ChevronDown, Layers3, Plus, Trash2 } from "lucide-react";
import type { AnswerValue, CalculatedVariable, Condition, ConditionGroup, ConditionNode, Question } from "@shared/pack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const VALUELESS = new Set<Condition["operator"]>(["answered", "not_answered", "empty", "not_empty"]);
const COMMON_OPERATORS: Array<{ value: Condition["operator"]; label: string }> = [
  { value: "answered", label: "is answered" },
  { value: "not_answered", label: "is not answered" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "includes", label: "includes" },
  { value: "not_includes", label: "does not include" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "gt", label: "is greater than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "before", label: "is before" },
  { value: "after", label: "is after" },
  { value: "on_or_before", label: "is on or before" },
  { value: "on_or_after", label: "is on or after" },
];

const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function createLeaf(questions: Question[]): Condition {
  const first = questions[0];
  return { ...(first ? { questionId: first.id } : { questionId: "" }), operator: "answered" };
}

function isGroup(node: ConditionNode): node is ConditionGroup {
  return "all" in node || "any" in node || "not" in node;
}

function valueOperatorsFor(question: Question | undefined, isVariable: boolean): Condition["operator"][] {
  if (isVariable || !question) return COMMON_OPERATORS.map((item) => item.value);
  if (["number", "percent", "scale_1_5", "scale_1_10"].includes(question.type)) {
    return ["equals", "not_equals", "gt", "gte", "lt", "lte"];
  }
  if (question.type === "date") return ["equals", "not_equals", "before", "after", "on_or_before", "on_or_after"];
  if (["boolean", "yesno", "yes_no", "true_false"].includes(question.type)) return ["equals", "not_equals"];
  if (["single", "select", "dropdown", "multi"].includes(question.type)) {
    return question.type === "multi"
      ? ["equals", "not_equals", "includes", "not_includes"]
      : ["equals", "not_equals", "includes", "not_includes"];
  }
  return ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "includes", "not_includes"];
}

function typeLabel(type: Question["type"]): string {
  if (["number", "percent", "scale_1_5", "scale_1_10"].includes(type)) return "number";
  if (type === "date") return "date";
  if (["boolean", "yesno", "yes_no", "true_false"].includes(type)) return "yes or no";
  if (["single", "select", "dropdown", "multi"].includes(type)) return "choice";
  return "text";
}

function ValueField({
  condition,
  question,
  onChange,
}: {
  condition: Condition;
  question?: Question;
  onChange: (value: Condition["value"]) => void;
}) {
  if (VALUELESS.has(condition.operator)) return null;
  const value = condition.value;
  if (question && ["boolean", "yesno", "yes_no", "true_false"].includes(question.type)) {
    return (
      <select className={fieldClass} value={value === true ? "true" : value === false ? "false" : ""} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="">Choose an answer</option>
        <option value="true">{question.type === "true_false" ? "True" : "Yes"}</option>
        <option value="false">{question.type === "true_false" ? "False" : "No"}</option>
      </select>
    );
  }
  if (question?.options?.length) {
    return (
      <select className={fieldClass} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose an option</option>
        {question.options.map((option) => {
          const optionValue = option.value ?? option.id;
          return <option key={option.id} value={optionValue}>{option.label}</option>;
        })}
      </select>
    );
  }
  const numericQuestion = Boolean(question && ["number", "percent", "scale_1_5", "scale_1_10"].includes(question.type));
  const dateQuestion = question?.type === "date";
  const numberOperator = numericQuestion || ["gt", "gte", "lt", "lte"].includes(condition.operator);
  const dateOperator = dateQuestion || ["before", "after", "on_or_before", "on_or_after"].includes(condition.operator);
  const valueForInput = value === undefined || value === null || Array.isArray(value) ? "" : String(value);
  return (
    <Input
      type={numberOperator ? "number" : dateOperator ? "date" : "text"}
      value={valueForInput}
      aria-label="Comparison value"
      onChange={(event) => {
        const raw = event.target.value;
        onChange(numberOperator ? raw === "" ? undefined : Number(raw) : raw);
      }}
    />
  );
}

function ConditionLeaf({
  condition,
  questions,
  variables,
  onChange,
  onRemove,
}: {
  condition: Condition;
  questions: Question[];
  variables: CalculatedVariable[];
  onChange: (value: Condition) => void;
  onRemove: () => void;
}) {
  const question = questions.find((item) => item.id === condition.questionId);
  const variable = variables.find((item) => item.id === condition.variableId);
  const isVariable = Boolean(variable);
  const operators = valueOperatorsFor(question, isVariable);
  const sourceValue = condition.questionId ? `question:${condition.questionId}` : condition.variableId ? `variable:${condition.variableId}` : "";
  const operatorList = [
    ...COMMON_OPERATORS.filter((item) => VALUELESS.has(item.value)),
    ...COMMON_OPERATORS.filter((item) => operators.includes(item.value) && !VALUELESS.has(item.value)),
  ];

  return (
    <div className="rounded-xl border border-border/80 bg-background p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(130px,0.9fr)_minmax(140px,1fr)_auto]">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Answer or calculation</Label>
          <select
            className={fieldClass}
            value={sourceValue}
            onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              onChange({
                ...(kind === "question" ? { questionId: id } : kind === "variable" ? { variableId: id } : {}),
                operator: "answered",
              });
            }}
          >
            <option value="">Choose a source…</option>
            {questions.map((item) => <option key={`q-${item.id}`} value={`question:${item.id}`}>Question · {item.prompt || "Untitled"}</option>)}
            {variables.map((item) => <option key={`v-${item.id}`} value={`variable:${item.id}`}>Calculation · {item.label || item.id}</option>)}
          </select>
          {question ? <span className="text-[10px] text-muted-foreground">{typeLabel(question.type)}</span> : variable ? <span className="text-[10px] text-muted-foreground">calculated value</span> : null}
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Comparison</Label>
          <select
            className={fieldClass}
            value={condition.operator}
            onChange={(event) => {
              const operator = event.target.value as Condition["operator"];
              onChange({ ...condition, operator, value: VALUELESS.has(operator) ? undefined : condition.value });
            }}
          >
            {operatorList.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Match value</Label>
          <ValueField condition={condition} question={question} onChange={(value) => onChange({ ...condition, value })} />
        </div>
        <div className="flex items-end justify-end">
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove condition" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NodeEditor({
  node,
  questions,
  variables,
  depth,
  onChange,
  onRemove,
}: {
  node: ConditionNode;
  questions: Question[];
  variables: CalculatedVariable[];
  depth: number;
  onChange: (next: ConditionNode) => void;
  onRemove: () => void;
}) {
  if (!isGroup(node)) {
    return <ConditionLeaf condition={node} questions={questions} variables={variables} onChange={onChange} onRemove={onRemove} />;
  }
  return (
    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/35 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900 dark:text-indigo-200"><Layers3 className="h-3.5 w-3.5" /> Nested logic group <span className="text-[10px] font-normal text-muted-foreground">{depth + 1}/16</span></div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove nested logic group" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
      </div>
      <ConditionGroupEditor group={node} questions={questions} variables={variables} depth={depth + 1} onChange={onChange} />
    </div>
  );
}

function ConditionGroupEditor({
  group,
  questions,
  variables,
  depth,
  onChange,
}: {
  group: ConditionGroup;
  questions: Question[];
  variables: CalculatedVariable[];
  depth: number;
  onChange: (next: ConditionGroup) => void;
}) {
  const updateChildren = (key: "all" | "any", next: ConditionNode[]) => onChange({ ...group, [key]: next });
  const addLeaf = (key: "all" | "any") => updateChildren(key, [...(group[key] ?? []), createLeaf(questions)]);
  const addGroup = (key: "all" | "any") => updateChildren(key, [...(group[key] ?? []), { all: [createLeaf(questions)] }]);
  const replaceNode = (key: "all" | "any", index: number, next: ConditionNode | null) => {
    const children = [...(group[key] ?? [])];
    if (next === null) children.splice(index, 1);
    else children[index] = next;
    updateChildren(key, children);
  };
  const maxDepth = depth >= 15;

  const renderSet = (key: "all" | "any", title: string, subtitle: string) => {
    const children = group[key] ?? [];
    return (
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">{title}</p>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => addLeaf(key)} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Condition</Button>
            <Button type="button" variant="outline" size="sm" disabled={maxDepth} onClick={() => addGroup(key)} className="h-8 gap-1.5 text-xs"><Layers3 className="h-3.5 w-3.5" />Group</Button>
          </div>
        </div>
        {children.length ? <div className="space-y-2">{children.map((node, index) => (
          <NodeEditor key={`${key}-${index}`} node={node} questions={questions} variables={variables} depth={depth} onChange={(next) => replaceNode(key, index, next)} onRemove={() => replaceNode(key, index, null)} />
        ))}</div> : <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">No conditions in this group yet.</p>}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {depth === 0 ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><ChevronDown className="h-3.5 w-3.5" />The group passes when every ALL rule and at least one ANY rule match. NOT negates its nested rule.</div> : null}
      {renderSet("all", "All of these", "Every condition in this stack must match (AND).")}
      {renderSet("any", "Any of these", "At least one condition in this stack must match (OR).")}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em]">NOT</p><p className="text-[11px] text-muted-foreground">Exclude when this nested condition matches.</p></div>
          {!group.not ? <Button type="button" variant="outline" size="sm" disabled={maxDepth} onClick={() => onChange({ ...group, not: createLeaf(questions) })} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add NOT condition</Button> : null}
        </div>
        {group.not ? <NodeEditor node={group.not} questions={questions} variables={variables} depth={depth} onChange={(next) => onChange({ ...group, not: next })} onRemove={() => { const next = { ...group }; delete next.not; onChange(next); }} /> : null}
      </section>
    </div>
  );
}

export default function ConditionTreeEditor({
  value,
  questions,
  variables = [],
  onChange,
}: {
  value: ConditionGroup;
  questions: Question[];
  variables?: CalculatedVariable[];
  onChange: (next: ConditionGroup) => void;
}) {
  if (questions.length === 0 && variables.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Add at least one question or calculation before creating a condition.</div>;
  }
  return <ConditionGroupEditor group={value} questions={questions} variables={variables} depth={0} onChange={onChange} />;
}
