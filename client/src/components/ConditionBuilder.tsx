import { useMemo } from "react";
import type { AnswerValue, Condition, Question } from "@shared/pack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const OPERATORS: Array<{ value: Condition["operator"]; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not equals" },
  { value: "gte", label: "Greater or equal" },
  { value: "lte", label: "Less or equal" },
  { value: "includes", label: "In" },
];

type QuestionKind = "yesno" | "number" | "select" | "text";

function getQuestionKind(type: Question["type"] | undefined): QuestionKind {
  if (type === "number") return "number";
  if (type === "boolean" || type === "yesno") return "yesno";
  if (type === "single" || type === "select" || type === "multi") return "select";
  return "text";
}

function normalizeValue(value: AnswerValue | AnswerValue[] | undefined) {
  if (value === undefined) return undefined;
  return value;
}

function toArrayValue(value: AnswerValue | AnswerValue[] | undefined) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

type ConditionBuilderProps = {
  conditions: Condition[];
  questions: Question[];
  onChange: (next: Condition[]) => void;
};

export default function ConditionBuilder({
  conditions,
  questions,
  onChange,
}: ConditionBuilderProps) {
  const questionMap = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );

  const updateCondition = (index: number, patch: Partial<Condition>) => {
    const next = conditions.map((condition, idx) =>
      idx === index ? { ...condition, ...patch } : condition,
    );
    onChange(next);
  };

  const addCondition = () => {
    onChange([
      ...conditions,
      { questionId: "", operator: "equals", value: undefined },
    ]);
  };

  const removeCondition = (index: number) => {
    const next = conditions.filter((_, idx) => idx !== index);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {conditions.map((condition, index) => {
        const question = questionMap.get(condition.questionId);
        const kind = getQuestionKind(question?.type);
        const operator = condition.operator ?? "equals";
        const value = normalizeValue(condition.value);
        const optionList = question?.options ?? [];

        return (
          <div key={`${condition.questionId}-${index}`} className="rounded-md border p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr,180px,auto]">
              <div className="space-y-2">
                <Label>Question</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={condition.questionId}
                  onChange={(event) =>
                    updateCondition(index, {
                      questionId: event.target.value,
                      value: undefined,
                    })
                  }
                >
                  <option value="">Select a question</option>
                  {questions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.prompt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={operator}
                  onChange={(event) => {
                    const nextOperator = event.target.value as Condition["operator"];
                    updateCondition(index, {
                      operator: nextOperator,
                      value: nextOperator === "includes" ? [] : undefined,
                    });
                  }}
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeCondition(index)}
                >
                  Remove
                </Button>
              </div>
            </div>

            {condition.questionId ? (
              <div className="space-y-2">
                <Label>Value</Label>
                {kind === "yesno" ? (
                  operator === "includes" ? (
                    <div className="flex items-center gap-4">
                      {[true, false].map((flag) => {
                        const values = toArrayValue(value);
                        const checked = values.includes(flag);
                        return (
                          <label key={String(flag)} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              onChange={(event) => {
                                const next = new Set(values as Array<string | number | boolean>);
                                if (event.target.checked) {
                                  next.add(flag);
                                } else {
                                  next.delete(flag);
                                }
                                updateCondition(index, { value: Array.from(next) });
                              }}
                            />
                            {flag ? "Yes" : "No"}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={value === true}
                        onCheckedChange={(checked) =>
                          updateCondition(index, { value: checked })
                        }
                      />
                      <span className="text-sm">{value === true ? "Yes" : "No"}</span>
                    </div>
                  )
                ) : null}

                {kind === "number" ? (
                  operator === "includes" ? (
                    <div className="space-y-2">
                      {toArrayValue(value).map((entry, entryIndex) => (
                        <div key={`${condition.questionId}-${entryIndex}`} className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={entry === undefined || entry === null ? "" : String(entry)}
                            onChange={(event) => {
                              const nextValues = [...toArrayValue(value)];
                              const nextValue = event.target.value === "" ? null : Number(event.target.value);
                              nextValues[entryIndex] = Number.isNaN(nextValue) ? null : nextValue;
                              updateCondition(index, { value: nextValues });
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const nextValues = toArrayValue(value).filter((_, idx) => idx !== entryIndex);
                              updateCondition(index, { value: nextValues });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const nextValues = [...toArrayValue(value), null];
                          updateCondition(index, { value: nextValues });
                        }}
                      >
                        Add value
                      </Button>
                    </div>
                  ) : (
                    <Input
                      type="number"
                      value={value === undefined || value === null ? "" : String(value)}
                      onChange={(event) => {
                        const raw = event.target.value;
                        updateCondition(index, {
                          value: raw === "" ? null : Number(raw),
                        });
                      }}
                    />
                  )
                ) : null}

                {kind === "select" ? (
                  operator === "includes" ? (
                    <div className="space-y-2">
                      {optionList.map((option) => {
                        const optionValue = option.value ?? option.id;
                        const values = toArrayValue(value).map(String);
                        const checked = values.includes(String(optionValue));
                        return (
                          <label key={option.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              onChange={(event) => {
                                const next = new Set(values);
                                if (event.target.checked) {
                                  next.add(String(optionValue));
                                } else {
                                  next.delete(String(optionValue));
                                }
                                updateCondition(index, { value: Array.from(next) });
                              }}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                      {optionList.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No options available.</p>
                      ) : null}
                    </div>
                  ) : (
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) => updateCondition(index, { value: event.target.value })}
                    >
                      <option value="">Select an option</option>
                      {optionList.map((option) => {
                        const optionValue = option.value ?? option.id;
                        return (
                          <option key={option.id} value={optionValue}>
                            {option.label}
                          </option>
                        );
                      })}
                    </select>
                  )
                ) : null}

                {kind === "text" ? (
                  operator === "includes" ? (
                    <div className="space-y-2">
                      {toArrayValue(value).map((entry, entryIndex) => (
                        <div key={`${condition.questionId}-${entryIndex}`} className="flex items-center gap-2">
                          <Input
                            value={entry === undefined || entry === null ? "" : String(entry)}
                            onChange={(event) => {
                              const nextValues = [...toArrayValue(value)];
                              nextValues[entryIndex] = event.target.value;
                              updateCondition(index, { value: nextValues });
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const nextValues = toArrayValue(value).filter((_, idx) => idx !== entryIndex);
                              updateCondition(index, { value: nextValues });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const nextValues = [...toArrayValue(value), ""];
                          updateCondition(index, { value: nextValues });
                        }}
                      >
                        Add value
                      </Button>
                    </div>
                  ) : (
                    <Input
                      value={value === undefined || value === null ? "" : String(value)}
                      onChange={(event) => updateCondition(index, { value: event.target.value })}
                    />
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addCondition}>
        Add condition
      </Button>
    </div>
  );
}
