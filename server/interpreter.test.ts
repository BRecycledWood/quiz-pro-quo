import assert from "node:assert/strict";
import { test } from "node:test";
import type { Answers, PackDefinition } from "@shared/pack";
import {
  analyzePackLogic,
  calculateVariables,
  evaluateConditionGroup,
  evaluatePackDetailed,
  getNextQuestionId,
  getVisibleQuestionIds,
} from "@shared/engine/interpreter";

test("nested AND/OR/NOT conditions preserve legacy semantics and require answered values for comparisons", () => {
  const answers = { region: "north", consent: true, tag: ["a", "c"] };
  const nested = {
    all: [
      { questionId: "region", operator: "equals" as const, value: "north" },
      { any: [
        { questionId: "consent", operator: "equals" as const, value: true },
        { questionId: "tag", operator: "includes" as const, value: "b" },
      ] },
    ],
    not: { questionId: "region", operator: "equals" as const, value: "south" },
  };
  assert.equal(evaluateConditionGroup(nested, answers), true);
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "region", operator: "equals", value: "north" }], any: [{ questionId: "consent", operator: "equals", value: false }] }, answers), false);
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "missing", operator: "not_equals", value: "x" }] }, {}), false);
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "region", operator: "not_contains", value: "south" }] }, answers), true);
});

test("draft interpreter resolves calculated variables, conditional requiredness, weighted category scores, outcomes, and routing", () => {
  const pack: PackDefinition = {
    id: "readiness",
    name: "Readiness",
    sections: [{ id: "foundation", title: "Foundation" }],
    questions: [
      { id: "process", prompt: "Do you have a process?", type: "yesno", required: true, sectionId: "foundation" },
      { id: "hours", prompt: "How many hours?", type: "number", required: false, requiredWhen: { all: [{ questionId: "process", operator: "equals", value: true }] } },
      { id: "next", prompt: "What next?", type: "short_text", required: false },
    ],
    outcomes: [
      { id: "review", title: "Needs review", status: "caution" },
      { id: "ready", title: "Ready", status: "pass" },
    ],
    showIf: [{ questionId: "hours", when: { all: [{ questionId: "process", operator: "equals", value: true }] } }],
    calculations: [
      { id: "weightedHours", label: "Weighted hours", expression: { op: "multiply", args: [{ op: "answer", questionId: "hours" }, { op: "literal", value: 2 }] } },
      { id: "readinessTotal", label: "Readiness total", expression: { op: "add", args: [{ op: "variable", variableId: "weightedHours" }, { op: "literal", value: 1 }] } },
    ],
    scoringCategories: [{ id: "capacity", label: "Capacity" }],
    scoring: [
      { id: "processScore", label: "Process", points: 1, categoryId: "capacity", when: { all: [{ questionId: "process", operator: "equals", value: true }] } },
      { id: "dynamic", label: "Hours weight", points: 0, pointsFormula: { op: "divide", args: [{ op: "variable", variableId: "weightedHours" }, { op: "literal", value: 2 }] }, categoryId: "capacity", when: { all: [{ variableId: "readinessTotal", operator: "gte", value: 5 }] } },
    ],
    thresholds: [
      { id: "review-band", minScore: 0, maxScore: 2, outcomeId: "review", priority: 1 },
      { id: "ready-band", minScore: 2, outcomeId: "ready", priority: 1 },
    ],
    routing: [{ id: "skip-to-next", fromQuestionId: "process", targetQuestionId: "next", when: { all: [{ questionId: "process", operator: "equals", value: true }] }, priority: 10, label: "Skip hours" }],
  };

  const answers = { process: true, hours: 3 };
  assert.deepEqual(getVisibleQuestionIds(pack, answers), ["process", "hours", "next"]);
  assert.equal(getNextQuestionId(pack, "process", answers), "next");
  const evaluation = evaluatePackDetailed(pack, answers);
  assert.deepEqual(evaluation.requiredQuestionIds, ["process", "hours"]);
  assert.equal(evaluation.variables.weightedHours, 6);
  assert.equal(evaluation.variables.readinessTotal, 7);
  assert.equal(evaluation.score, 4);
  assert.equal(evaluation.categoryScores.capacity, 4);
  assert.equal(evaluation.outcome?.id, "ready");
  assert.equal(evaluation.selectedThresholdId, "ready-band");
  assert.deepEqual(evaluation.matchingRouteIds, ["skip-to-next"]);
  assert.ok(evaluation.trace.some((entry) => entry.kind === "calculation" && entry.detail.includes("6")));
  assert.ok(evaluation.trace.some((entry) => entry.kind === "score" && entry.id === "score:dynamic" && entry.fired));
  assert.ok(analyzePackLogic(pack).some((item) => item.code === "overlapping-thresholds" && item.severity === "warning"));
});

test("conditional visibility prunes hidden answers from calculations and required state", () => {
  const pack: PackDefinition = {
    questions: [
      { id: "eligible", prompt: "Eligible?", type: "yesno", required: true },
      { id: "amount", prompt: "Amount", type: "number", required: true, requiredWhen: { all: [{ questionId: "eligible", operator: "equals", value: true }] } },
    ],
    outcomes: [{ id: "only", title: "Done" }],
    showIf: [{ questionId: "amount", when: { all: [{ questionId: "eligible", operator: "equals", value: true }] } }],
    calculations: [{ id: "double", label: "Double", expression: { op: "multiply", args: [{ op: "answer", questionId: "amount" }, { op: "literal", value: 2 }] } }],
  };
  assert.deepEqual(getVisibleQuestionIds(pack, { eligible: false, amount: 99 }), ["eligible"]);
  const result = evaluatePackDetailed(pack, { eligible: false, amount: 99 });
  assert.deepEqual(result.requiredQuestionIds, ["eligible"]);
  assert.equal(result.variables.double, null);
  assert.equal(result.diagnostics.some((item) => item.severity === "error"), false);
});

test("calculation cycles and ambiguous routing are explainable diagnostics, not executable code", () => {
  const pack: PackDefinition = {
    questions: [{ id: "a", prompt: "A", type: "yesno" }, { id: "b", prompt: "B", type: "yesno" }],
    outcomes: [{ id: "one", title: "One" }],
    calculations: [
      { id: "first", label: "First", expression: { op: "variable", variableId: "second" } },
      { id: "second", label: "Second", expression: { op: "variable", variableId: "first" } },
    ],
    routing: [
      { id: "route-1", fromQuestionId: "a", targetQuestionId: "b", when: { all: [{ questionId: "a", operator: "equals", value: true }] }, priority: 1 },
      { id: "route-2", fromQuestionId: "a", targetQuestionId: null, when: { all: [{ questionId: "a", operator: "equals", value: true }] }, priority: 1 },
      { id: "route-3", fromQuestionId: "b", targetQuestionId: "a", when: { all: [{ questionId: "b", operator: "equals", value: true }] }, priority: 1 },
    ],
  };
  const issues = analyzePackLogic(pack);
  assert.ok(issues.some((item) => item.code === "circular-calculation" && item.severity === "error"));
  assert.ok(issues.some((item) => item.code === "route-priority-conflict" && item.severity === "warning"));
  assert.ok(issues.some((item) => item.code === "circular-routing" && item.severity === "warning"));
  const result = calculateVariables(pack, { a: true });
  assert.ok(result.issues.some((issue) => issue.includes("Circular calculation")));
  assert.equal(result.values.first, null);
});

test("typed string, date, and multi-select comparisons work without evaluation", () => {
  const answers: Answers = { name: "Arena studio", started: "2025-05-10", choices: ["one", "three"] };
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "name", operator: "contains", value: "studio" }] }, answers), true);
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "name", operator: "starts_with", value: "Arena" }] }, answers), true);
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "started", operator: "before", value: "2025-06-01" }] }, answers), true);
  assert.equal(evaluateConditionGroup({ all: [{ questionId: "choices", operator: "includes", value: "three" }] }, answers), true);
});
