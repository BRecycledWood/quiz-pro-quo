import { Plus, Trash2 } from "lucide-react";
import type { CalculatedVariable, FormulaExpression, FormulaOperator, FormulaValue, Question } from "@shared/pack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OPERATORS: Array<{ op: FormulaOperator; label: string; description: string }> = [
  { op: "literal", label: "Constant", description: "A fixed number, text, or flag" },
  { op: "answer", label: "Answer", description: "Read a numeric, text, or date answer" },
  { op: "variable", label: "Calculated value", description: "Reuse another calculated value" },
  { op: "add", label: "Add", description: "Add numeric inputs" },
  { op: "subtract", label: "Subtract", description: "Subtract the second value from the first" },
  { op: "multiply", label: "Multiply", description: "Multiply numeric inputs" },
  { op: "divide", label: "Divide", description: "Divide the first value by the second" },
  { op: "modulo", label: "Remainder", description: "Remainder after division" },
  { op: "min", label: "Minimum", description: "Smallest numeric input" },
  { op: "max", label: "Maximum", description: "Largest numeric input" },
  { op: "average", label: "Average", description: "Mean of numeric inputs" },
  { op: "abs", label: "Absolute value", description: "Distance from zero" },
  { op: "round", label: "Round", description: "Round to the nearest whole number" },
  { op: "floor", label: "Round down", description: "Round toward negative infinity" },
  { op: "ceil", label: "Round up", description: "Round toward positive infinity" },
  { op: "count", label: "Count answered", description: "Count non-empty values or selected items" },
  { op: "length", label: "Length", description: "Count characters or selected items" },
  { op: "concat", label: "Join text", description: "Join values as text" },
  { op: "coalesce", label: "First available", description: "Return the first non-empty value" },
  { op: "days_between", label: "Days between", description: "Calendar date distance in days" },
];

const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const leaf = (op: FormulaOperator, value?: FormulaValue): FormulaExpression => ({ op, ...(value !== undefined ? { value } : {}) });

function defaultExpression(op: FormulaOperator): FormulaExpression {
  if (op === "literal") return { op, value: 0 };
  if (op === "subtract" || op === "divide" || op === "modulo" || op === "days_between") return { op, args: [leaf("literal", 0), leaf("literal", 1)] };
  if (["abs", "round", "floor", "ceil", "length"].includes(op)) return { op, args: [leaf("literal", 0)] };
  if (["add", "multiply", "min", "max", "average", "concat", "coalesce", "count"].includes(op)) return { op, args: [leaf("literal", 0), leaf("literal", 0)] };
  return { op };
}

function FormulaNodeEditor({
  expression,
  questions,
  variables,
  onChange,
  onRemove,
  depth = 0,
}: {
  expression: FormulaExpression;
  questions: Question[];
  variables: CalculatedVariable[];
  onChange: (next: FormulaExpression) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const isSource = expression.op === "answer" || expression.op === "variable";
  const args = expression.args ?? [];
  const fixedArity: Partial<Record<FormulaOperator, number>> = { subtract: 2, divide: 2, modulo: 2, abs: 1, round: 1, floor: 1, ceil: 1, length: 1, days_between: 2 };
  const maxDepth = depth >= 15;
  const updateArg = (index: number, next: FormulaExpression | null) => {
    const updated = [...args];
    if (next === null) updated.splice(index, 1);
    else updated[index] = next;
    onChange({ ...expression, args: updated });
  };
  const operator = OPERATORS.find((item) => item.op === expression.op);

  return (
    <div className={`rounded-xl border bg-background p-3 ${depth ? "border-border/80" : "border-indigo-200 dark:border-indigo-900"}`}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Safe operation</Label>
          <select
            className={fieldClass}
            value={expression.op}
            onChange={(event) => onChange(defaultExpression(event.target.value as FormulaOperator))}
          >
            {OPERATORS.map((item) => <option key={item.op} value={item.op}>{item.label}</option>)}
          </select>
        </div>
        {onRemove ? <Button type="button" variant="ghost" size="icon" aria-label="Remove formula input" onClick={onRemove} className="h-9 w-9 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button> : null}
      </div>
      {operator ? <p className="mt-1.5 text-[11px] text-muted-foreground">{operator.description}</p> : null}

      {expression.op === "literal" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr]">
          <select
            className={fieldClass}
            value={expression.value === null ? "null" : typeof expression.value}
            aria-label="Constant type"
            onChange={(event) => {
              const type = event.target.value;
              onChange({ op: "literal", value: type === "number" ? 0 : type === "boolean" ? false : type === "null" ? null : "" });
            }}
          >
            <option value="number">Number</option><option value="string">Text</option><option value="boolean">True / false</option><option value="null">Empty</option>
          </select>
          {typeof expression.value === "boolean" ? (
            <select className={fieldClass} value={String(expression.value)} onChange={(event) => onChange({ op: "literal", value: event.target.value === "true" })}>
              <option value="true">True</option><option value="false">False</option>
            </select>
          ) : expression.value === null ? <div className="flex h-9 items-center px-3 text-xs text-muted-foreground">Null value</div> : (
            <Input type={typeof expression.value === "number" ? "number" : "text"} value={String(expression.value ?? "")} onChange={(event) => onChange({ op: "literal", value: typeof expression.value === "number" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value })} />
          )}
        </div>
      ) : null}

      {isSource ? (
        <div className="mt-3 space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Read from</Label>
          <select
            className={fieldClass}
            value={expression.op === "answer" ? expression.questionId ?? "" : expression.variableId ?? ""}
            onChange={(event) => onChange({ op: expression.op, ...(expression.op === "answer" ? { questionId: event.target.value } : { variableId: event.target.value }) })}
          >
            <option value="">Choose a source…</option>
            {expression.op === "answer" ? questions.map((question) => <option key={question.id} value={question.id}>Question · {question.prompt || "Untitled"}</option>) : variables.filter((item) => item.id !== (variables.find((variable) => variable.expression === expression)?.id)).map((item) => <option key={item.id} value={item.id}>Calculation · {item.label || item.id}</option>)}
          </select>
        </div>
      ) : null}

      {expression.op !== "literal" && !isSource ? (
        <div className="mt-3 space-y-2.5">
          {args.map((argument, index) => (
            <div key={index} className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Input {index + 1}</Label>
              <FormulaNodeEditor expression={argument} questions={questions} variables={variables} depth={depth + 1} onChange={(next) => updateArg(index, next)} onRemove={fixedArity[expression.op] === undefined ? () => updateArg(index, null) : undefined} />
            </div>
          ))}
          {fixedArity[expression.op] === undefined && args.length < 32 ? <Button type="button" size="sm" variant="outline" disabled={maxDepth} onClick={() => updateArg(args.length, leaf("literal", 0))} className="h-8 gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add input</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function FormulaExpressionEditor({
  value,
  questions,
  variables = [],
  onChange,
}: {
  value: FormulaExpression;
  questions: Question[];
  variables?: CalculatedVariable[];
  onChange: (next: FormulaExpression) => void;
}) {
  return <FormulaNodeEditor expression={value} questions={questions} variables={variables} onChange={onChange} />;
}
