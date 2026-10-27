import type {
  AnswerValue,
  Answers,
  CalculatedVariable,
  Condition,
  ConditionGroup,
  ConditionNode,
  FormulaExpression,
  FormulaValue,
  Outcome,
  PackDefinition,
  Question,
  RoutingRule,
} from "../pack";

type PrimitiveAnswer = string | number | boolean;
type RuntimeValue = FormulaValue | string[] | undefined;

export interface LogicDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  targetId?: string;
  targetType?: "question" | "rule" | "variable" | "outcome";
}

export interface LogicTraceEntry {
  id: string;
  kind: "visibility" | "required" | "calculation" | "score" | "disqualifier" | "threshold" | "route" | "outcome" | "diagnostic";
  label: string;
  fired: boolean | null;
  detail: string;
  targetId?: string;
}

export interface DetailedEvaluation {
  visibleQuestionIds: string[];
  requiredQuestionIds: string[];
  score: number;
  categoryScores: Record<string, number>;
  variables: Record<string, RuntimeValue>;
  outcome: Outcome | null;
  disqualified: boolean;
  reasons: string[];
  selectedThresholdId: string | null;
  matchingRouteIds: string[];
  trace: LogicTraceEntry[];
  diagnostics: LogicDiagnostic[];
}

function isAnswered(value: AnswerValue | RuntimeValue): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function toPrimitiveArray(value: AnswerValue | RuntimeValue | AnswerValue[] | undefined): PrimitiveAnswer[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const output: PrimitiveAnswer[] = [];
  for (const item of raw) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") output.push(item);
  }
  return output;
}

function isConditionGroup(value: unknown): value is ConditionGroup {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return ("all" in value || "any" in value || "not" in value) && !("operator" in value);
}

function compareStrings(left: string, right: string, caseSensitive = true): boolean {
  return caseSensitive ? left === right : left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function compareText(left: string, right: string, caseSensitive = false): [string, string] {
  return caseSensitive ? [left, right] : [left.toLocaleLowerCase(), right.toLocaleLowerCase()];
}

function asDateNumber(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function readConditionSource(condition: Condition, answers: Answers, variables: Record<string, RuntimeValue>): RuntimeValue {
  if (condition.questionId) return answers[condition.questionId] as RuntimeValue;
  if (condition.variableId) return variables[condition.variableId];
  return undefined;
}

function evaluateCondition(condition: Condition, answers: Answers, variables: Record<string, RuntimeValue>): boolean {
  const answer = readConditionSource(condition, answers, variables);
  if (!isAnswered(answer) && !["answered", "not_answered", "empty", "not_empty"].includes(condition.operator)) return false;
  const answerValues = toPrimitiveArray(answer);
  const values = toPrimitiveArray(condition.value);
  const candidate = values[0];
  const caseSensitive = condition.caseSensitive ?? false;

  switch (condition.operator) {
    case "answered":
    case "not_empty":
      return isAnswered(answer);
    case "not_answered":
    case "empty":
      return !isAnswered(answer);
    case "equals":
      return answerValues.some((left) => values.some((right) =>
        typeof left === "string" && typeof right === "string"
          ? compareStrings(left, right, caseSensitive)
          : left === right,
      ));
    case "not_equals":
      return !answerValues.some((left) => values.some((right) =>
        typeof left === "string" && typeof right === "string"
          ? compareStrings(left, right, caseSensitive)
          : left === right,
      ));
    case "includes":
      if (Array.isArray(answer)) {
        return values.some((value) => answerValues.some((item) =>
          typeof item === "string" && typeof value === "string"
            ? compareStrings(item, value, caseSensitive)
            : item === value,
        ));
      }
      if (typeof answer === "string") {
        return values.some((value) => {
          if (typeof value !== "string") return false;
          const [text, search] = compareText(answer, value, caseSensitive);
          return text.includes(search);
        });
      }
      return false;
    case "not_includes":
    case "not_contains":
      return !evaluateCondition({ ...condition, operator: "includes" }, answers, variables);
    case "contains":
      if (typeof answer !== "string" || typeof candidate !== "string") return false;
      {
        const [text, search] = compareText(answer, candidate, caseSensitive);
        return text.includes(search);
      }
    case "starts_with":
      if (typeof answer !== "string" || typeof candidate !== "string") return false;
      {
        const [text, search] = compareText(answer, candidate, caseSensitive);
        return text.startsWith(search);
      }
    case "ends_with":
      if (typeof answer !== "string" || typeof candidate !== "string") return false;
      {
        const [text, search] = compareText(answer, candidate, caseSensitive);
        return text.endsWith(search);
      }
    case "gt":
      return typeof answer === "number" && typeof candidate === "number" && answer > candidate;
    case "gte":
      return typeof answer === "number" && typeof candidate === "number" && answer >= candidate;
    case "lt":
      return typeof answer === "number" && typeof candidate === "number" && answer < candidate;
    case "lte":
      return typeof answer === "number" && typeof candidate === "number" && answer <= candidate;
    case "before":
      return asDateNumber(answer) !== null && asDateNumber(candidate) !== null && asDateNumber(answer)! < asDateNumber(candidate)!;
    case "after":
      return asDateNumber(answer) !== null && asDateNumber(candidate) !== null && asDateNumber(answer)! > asDateNumber(candidate)!;
    case "on_or_before":
      return asDateNumber(answer) !== null && asDateNumber(candidate) !== null && asDateNumber(answer)! <= asDateNumber(candidate)!;
    case "on_or_after":
      return asDateNumber(answer) !== null && asDateNumber(candidate) !== null && asDateNumber(answer)! >= asDateNumber(candidate)!;
    default:
      return false;
  }
}

export function evaluateConditionGroup(
  group: ConditionGroup | undefined,
  answers: Answers,
  variables: Record<string, RuntimeValue> = {},
): boolean {
  if (!group) return true;
  const allNodes = group.all ?? [];
  const anyNodes = group.any ?? [];
  const allPass = allNodes.every((node) => evaluateConditionNode(node, answers, variables));
  const anyPass = anyNodes.length === 0 || anyNodes.some((node) => evaluateConditionNode(node, answers, variables));
  const notPass = group.not === undefined || !evaluateConditionNode(group.not, answers, variables);
  return allPass && anyPass && notPass;
}

function evaluateConditionNode(node: ConditionNode, answers: Answers, variables: Record<string, RuntimeValue>): boolean {
  return isConditionGroup(node)
    ? evaluateConditionGroup(node, answers, variables)
    : evaluateCondition(node as Condition, answers, variables);
}

function evaluateFormulaExpression(
  expression: FormulaExpression,
  answers: Answers,
  resolveVariable: (id: string) => RuntimeValue,
  depth = 0,
): RuntimeValue {
  if (!expression || depth > 32) return null;
  if (expression.op === "literal") return expression.value ?? null;
  if (expression.op === "answer") return expression.questionId ? answers[expression.questionId] as RuntimeValue ?? null : null;
  if (expression.op === "variable") return expression.variableId ? resolveVariable(expression.variableId) ?? null : null;

  const args = Array.isArray(expression.args)
    ? expression.args.map((argument) => evaluateFormulaExpression(argument, answers, resolveVariable, depth + 1))
    : [];
  const numbers = args.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null);
  const numeric = (...indexes: number[]) => indexes.every((index) => numbers[index] !== null);
  const strings = args.map((value) => value === null || value === undefined ? "" : Array.isArray(value) ? value.join(", ") : String(value));
  const first = args[0];

  switch (expression.op) {
    case "add": return numeric(...args.map((_, index) => index)) ? numbers.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    case "subtract": return args.length >= 2 && numeric(0, 1) ? numbers[0]! - numbers[1]! : null;
    case "multiply": return args.length >= 2 && numeric(...args.map((_, index) => index)) ? numbers.reduce<number>((product, value) => product * (value ?? 1), 1) : null;
    case "divide": return args.length >= 2 && numeric(0, 1) && numbers[1] !== 0 ? numbers[0]! / numbers[1]! : null;
    case "modulo": return args.length >= 2 && numeric(0, 1) && numbers[1] !== 0 ? numbers[0]! % numbers[1]! : null;
    case "min": return numbers.length > 0 && numbers.every((value) => value !== null) ? Math.min(...numbers as number[]) : null;
    case "max": return numbers.length > 0 && numbers.every((value) => value !== null) ? Math.max(...numbers as number[]) : null;
    case "average": return numbers.length > 0 && numbers.every((value) => value !== null) ? numbers.reduce<number>((sum, value) => sum + (value ?? 0), 0) / numbers.length : null;
    case "abs": return numeric(0) ? Math.abs(numbers[0]!) : null;
    case "round": return numeric(0) ? Math.round(numbers[0]!) : null;
    case "floor": return numeric(0) ? Math.floor(numbers[0]!) : null;
    case "ceil": return numeric(0) ? Math.ceil(numbers[0]!) : null;
    case "count": return args.reduce<number>((count, value) => count + (isAnswered(value as AnswerValue) ? (Array.isArray(value) ? value.length : 1) : 0), 0);
    case "length": return typeof first === "string" ? first.length : Array.isArray(first) ? first.length : null;
    case "concat": return strings.join("");
    case "coalesce": return args.find((value) => value !== undefined && value !== null && value !== "") ?? null;
    case "days_between": {
      const left = asDateNumber(args[0]);
      const right = asDateNumber(args[1]);
      return left === null || right === null ? null : (right - left) / 86_400_000;
    }
    default: return null;
  }
}

export function calculateVariables(
  pack: Pick<PackDefinition, "calculations">,
  answers: Answers,
): { values: Record<string, RuntimeValue>; issues: string[] } {
  const definitions = pack.calculations ?? [];
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const values: Record<string, RuntimeValue> = {};
  const issues: string[] = [];
  const evaluating = new Set<string>();
  const evaluated = new Set<string>();

  const resolve = (id: string): RuntimeValue => {
    if (evaluated.has(id)) return values[id];
    const variable = byId.get(id);
    if (!variable) return undefined;
    if (evaluating.has(id)) {
      issues.push(`Circular calculation dependency at “${variable.label || id}”.`);
      return null;
    }
    evaluating.add(id);
    const result = evaluateFormulaExpression(variable.expression, answers, resolve);
    evaluating.delete(id);
    evaluated.add(id);
    values[id] = typeof result === "number" && !Number.isFinite(result) ? null : result;
    return values[id];
  };

  for (const variable of definitions) resolve(variable.id);
  return { values, issues: Array.from(new Set(issues)) };
}

export function getVisibleQuestionIds(pack: PackDefinition, answers: Answers): string[] {
  const rules = pack.showIf ?? [];
  let previousVisible = pack.questions.map((question) => question.id);
  const maxIterations = Math.max(4, Math.min(pack.questions.length + 2, 102));

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const visibleSet = new Set(previousVisible);
    const effectiveAnswers = Object.fromEntries(
      Object.entries(answers).filter(([questionId]) => visibleSet.has(questionId)),
    ) as Answers;
    const variables = calculateVariables(pack, effectiveAnswers).values;
    const visibleAnswers: Answers = { ...effectiveAnswers };
    const nextVisible: string[] = [];

    for (const question of pack.questions) {
      const questionRules = rules.filter((rule) => rule.questionId === question.id);
      const isVisible = questionRules.length === 0 || questionRules.some((rule) =>
        evaluateConditionGroup(rule.when, visibleAnswers, variables),
      );
      if (isVisible) nextVisible.push(question.id);
      else delete visibleAnswers[question.id];
    }

    if (nextVisible.length === previousVisible.length && nextVisible.every((id, index) => id === previousVisible[index])) {
      return nextVisible;
    }
    previousVisible = nextVisible;
  }
  return previousVisible;
}

export function isQuestionRequired(question: Question, answers: Answers, variables: Record<string, RuntimeValue> = {}): boolean {
  if (question.requiredWhen) return evaluateConditionGroup(question.requiredWhen, answers, variables);
  return question.required !== false;
}

function effectiveAnswers(pack: PackDefinition, answers: Answers, visibleQuestionIds = getVisibleQuestionIds(pack, answers)): Answers {
  const visible = new Set(visibleQuestionIds);
  return Object.fromEntries(Object.entries(answers).filter(([questionId]) => visible.has(questionId))) as Answers;
}

export function getNextQuestionId(
  pack: PackDefinition,
  currentQuestionId: string,
  answers: Answers,
): string | null {
  const visible = getVisibleQuestionIds(pack, answers);
  const currentIndex = visible.indexOf(currentQuestionId);
  if (currentIndex < 0) return visible[0] ?? null;
  const relevantRoutes = (pack.routing ?? [])
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.fromQuestionId === currentQuestionId)
    .filter(({ rule }) => evaluateConditionGroup(rule.when, effectiveAnswers(pack, answers, visible), calculateVariables(pack, effectiveAnswers(pack, answers, visible)).values))
    .sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0) || a.index - b.index);
  const route = relevantRoutes[0]?.rule;
  if (route) {
    if (route.targetQuestionId === null || route.targetQuestionId === "") return null;
    if (route.targetQuestionId && visible.includes(route.targetQuestionId)) return route.targetQuestionId;
  }
  return visible[currentIndex + 1] ?? null;
}

function conditionNodeReferences(node: ConditionNode | undefined, questionIds: Set<string>, variableIds: Set<string>, diagnostics: LogicDiagnostic[], targetId: string, targetType: LogicDiagnostic["targetType"], depth = 0) {
  if (!node) return;
  if (depth > 16) {
    diagnostics.push({ code: "condition-depth", severity: "error", message: "Condition nesting exceeds 16 levels.", targetId, targetType });
    return;
  }
  if (isConditionGroup(node)) {
    for (const child of node.all ?? []) conditionNodeReferences(child, questionIds, variableIds, diagnostics, targetId, targetType, depth + 1);
    for (const child of node.any ?? []) conditionNodeReferences(child, questionIds, variableIds, diagnostics, targetId, targetType, depth + 1);
    if (node.not) conditionNodeReferences(node.not, questionIds, variableIds, diagnostics, targetId, targetType, depth + 1);
    return;
  }
  const condition = node as Condition;
  if (condition.questionId && !questionIds.has(condition.questionId)) {
    diagnostics.push({ code: "missing-question-reference", severity: "error", message: `Condition refers to missing question “${condition.questionId}”.`, targetId, targetType });
  }
  if (condition.variableId && !variableIds.has(condition.variableId)) {
    diagnostics.push({ code: "missing-variable-reference", severity: "error", message: `Condition refers to missing variable “${condition.variableId}”.`, targetId, targetType });
  }
  if (!condition.questionId && !condition.variableId) {
    diagnostics.push({ code: "missing-condition-source", severity: "error", message: "Condition must reference a question or calculated variable.", targetId, targetType });
  }
  if (condition.questionId && condition.variableId) {
    diagnostics.push({ code: "ambiguous-condition-source", severity: "error", message: "Condition cannot reference both a question and a calculated variable.", targetId, targetType });
  }
}

function formulaReferences(expression: FormulaExpression | undefined, questionIds: Set<string>, variableIds: Set<string>, diagnostics: LogicDiagnostic[], targetId: string, seen: { nodes: number }, depth = 0, targetType: LogicDiagnostic["targetType"] = "variable") {
  if (!expression || typeof expression !== "object") {
    diagnostics.push({ code: "invalid-formula", severity: "error", message: "Formula expression is missing or invalid.", targetId, targetType });
    return;
  }
  seen.nodes += 1;
  if (depth > 16 || seen.nodes > 256) {
    diagnostics.push({ code: "formula-complexity", severity: "error", message: "Formula exceeds the supported safe complexity limit (16 levels / 256 nodes).", targetId, targetType });
    return;
  }
  if (expression.op === "answer" && (!expression.questionId || !questionIds.has(expression.questionId))) {
    diagnostics.push({ code: "missing-formula-question", severity: "error", message: `Formula refers to missing question “${expression.questionId ?? ""}”.`, targetId, targetType });
  }
  if (expression.op === "variable" && (!expression.variableId || !variableIds.has(expression.variableId))) {
    diagnostics.push({ code: "missing-formula-variable", severity: "error", message: `Formula refers to missing variable “${expression.variableId ?? ""}”.`, targetId, targetType });
  }
  for (const child of expression.args ?? []) formulaReferences(child, questionIds, variableIds, diagnostics, targetId, seen, depth + 1, targetType);
}

function collectVariableRefs(expression: FormulaExpression | undefined, output: Set<string>, depth = 0): void {
  if (!expression || depth > 16) return;
  if (expression.op === "variable" && expression.variableId) output.add(expression.variableId);
  for (const child of expression.args ?? []) collectVariableRefs(child, output, depth + 1);
}

function findCycles(graph: Map<string, Set<string>>): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (node: string) => {
    const current = state.get(node) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const start = stack.lastIndexOf(node);
      if (start >= 0) cycles.push([...stack.slice(start), node]);
      return;
    }
    state.set(node, 1);
    stack.push(node);
    for (const neighbor of graph.get(node) ?? []) if (graph.has(neighbor)) visit(neighbor);
    stack.pop();
    state.set(node, 2);
  };
  for (const node of graph.keys()) visit(node);
  const seen = new Set<string>();
  return cycles.filter((cycle) => {
    const key = [...new Set(cycle)].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzePackLogic(pack: PackDefinition): LogicDiagnostic[] {
  const diagnostics: LogicDiagnostic[] = [];
  const questionIds = new Set((pack.questions ?? []).map((question) => question.id));
  const variableIds = new Set((pack.calculations ?? []).map((variable) => variable.id));
  const outcomeIds = new Set((pack.outcomes ?? []).map((outcome) => outcome.id));
  const variableGraph = new Map<string, Set<string>>();
  const dependencyGraph = new Map<string, Set<string>>();

  for (const variable of pack.calculations ?? []) {
    const edges = new Set<string>();
    collectVariableRefs(variable.expression, edges);
    variableGraph.set(variable.id, edges);
    formulaReferences(variable.expression, questionIds, variableIds, diagnostics, variable.id, { nodes: 0 });
  }
  for (const cycle of findCycles(variableGraph)) {
    diagnostics.push({ code: "circular-calculation", severity: "error", message: `Circular calculation dependency: ${cycle.join(" → ")}.`, targetId: cycle[0], targetType: "variable" });
  }
  for (const rule of pack.scoring ?? []) if (rule.pointsFormula) {
    formulaReferences(rule.pointsFormula, questionIds, variableIds, diagnostics, rule.id, { nodes: 0 }, 0, "rule");
  }

  const inspectGroup = (group: ConditionGroup | undefined, targetId: string, targetType: LogicDiagnostic["targetType"], targetQuestionId?: string) => {
    if (!group) {
      diagnostics.push({ code: "empty-condition-group", severity: "error", message: "A configured logic rule has no condition group.", targetId, targetType });
      return;
    }
    const nodes = [...(group.all ?? []), ...(group.any ?? []), ...(group.not ? [group.not] : [])];
    if (nodes.length === 0) diagnostics.push({ code: "empty-condition-group", severity: "error", message: "A configured logic rule has no conditions.", targetId, targetType });
    for (const node of nodes) conditionNodeReferences(node, questionIds, variableIds, diagnostics, targetId, targetType);
    if (targetQuestionId) {
      const dependencies = new Set<string>();
      const visit = (node: ConditionNode) => {
        if (isConditionGroup(node)) {
          for (const child of [...(node.all ?? []), ...(node.any ?? []), ...(node.not ? [node.not] : [])]) visit(child);
        } else {
          const condition = node as Condition;
          if (condition.questionId) dependencies.add(condition.questionId);
          if (condition.variableId) {
            const variable = (pack.calculations ?? []).find((item) => item.id === condition.variableId);
            const refs = new Set<string>();
            collectAnswerRefs(variable?.expression, refs);
            for (const ref of refs) dependencies.add(ref);
          }
        }
      };
      for (const node of nodes) visit(node);
      dependencyGraph.set(targetQuestionId, dependencies);
    }
  };

  for (const rule of pack.showIf ?? []) inspectGroup(rule.when, rule.questionId, "question", rule.questionId);
  for (const question of pack.questions ?? []) if (question.requiredWhen) inspectGroup(question.requiredWhen, `${question.id}:required`, "question", question.id);
  for (const rule of pack.disqualifiers ?? []) inspectGroup(rule.when, rule.id, "rule");
  for (const rule of pack.scoring ?? []) inspectGroup(rule.when, rule.id, "rule");
  for (const rule of pack.routing ?? []) {
    inspectGroup(rule.when, rule.id, "rule");
    if (!questionIds.has(rule.fromQuestionId)) diagnostics.push({ code: "missing-route-source", severity: "error", message: `Route “${rule.id}” starts at a missing question.`, targetId: rule.id, targetType: "rule" });
    if (rule.targetQuestionId && !questionIds.has(rule.targetQuestionId)) diagnostics.push({ code: "missing-route-target", severity: "error", message: `Route “${rule.id}” targets a missing question.`, targetId: rule.id, targetType: "rule" });
  }

  const dependencyCycles = findCycles(dependencyGraph);
  for (const cycle of dependencyCycles) {
    diagnostics.push({ code: "circular-question-dependency", severity: "error", message: `Visibility/required/routing dependency cycle: ${cycle.join(" → ")}.`, targetId: cycle[0], targetType: "question" });
  }

  const routeGraph = new Map<string, Set<string>>();
  for (const rule of pack.routing ?? []) {
    if (!routeGraph.has(rule.fromQuestionId)) routeGraph.set(rule.fromQuestionId, new Set());
    if (rule.targetQuestionId) routeGraph.get(rule.fromQuestionId)!.add(rule.targetQuestionId);
  }
  for (const cycle of findCycles(routeGraph)) {
    diagnostics.push({ code: "circular-routing", severity: "warning", message: `Routing can revisit a question indefinitely: ${cycle.join(" → ")}.`, targetId: cycle[0], targetType: "question" });
  }

  const routePriorityGroups = new Map<string, RoutingRule[]>();
  for (const rule of pack.routing ?? []) {
    const key = `${rule.fromQuestionId}:${rule.priority ?? 0}`;
    routePriorityGroups.set(key, [...(routePriorityGroups.get(key) ?? []), rule]);
  }
  for (const routes of routePriorityGroups.values()) if (routes.length > 1) {
    diagnostics.push({ code: "route-priority-conflict", severity: "warning", message: `Multiple routes from “${routes[0].fromQuestionId}” share the same priority; the first matching route wins.`, targetId: routes[0].fromQuestionId, targetType: "question" });
  }

  for (const question of pack.questions ?? []) {
    if (question.sectionId && !(pack.sections ?? []).some((section) => section.id === question.sectionId)) {
      diagnostics.push({ code: "missing-section", severity: "warning", message: `Question “${question.prompt}” references a missing section.`, targetId: question.id, targetType: "question" });
    }
    if (question.section && !question.sectionId && !(pack.sections ?? []).some((section) => section.title === question.section)) {
      diagnostics.push({ code: "legacy-section", severity: "info", message: `Question “${question.prompt}” uses a legacy free-text section label.`, targetId: question.id, targetType: "question" });
    }
  }

  const referencedOutcomes = new Set<string>();
  for (const threshold of pack.thresholds ?? []) {
    if (!outcomeIds.has(threshold.outcomeId)) diagnostics.push({ code: "missing-threshold-outcome", severity: "error", message: `Threshold “${threshold.id}” references a missing outcome.`, targetId: threshold.id, targetType: "rule" });
    referencedOutcomes.add(threshold.outcomeId);
  }
  for (const outcome of pack.outcomes ?? []) if (!referencedOutcomes.has(outcome.id) && (pack.outcomes?.length ?? 0) > 1) {
    diagnostics.push({ code: "unreferenced-outcome", severity: "warning", message: `Outcome “${outcome.title}” is not selected by any score threshold.`, targetId: outcome.id, targetType: "outcome" });
  }
  const thresholds = pack.thresholds ?? [];
  for (let left = 0; left < thresholds.length; left += 1) {
    for (let right = left + 1; right < thresholds.length; right += 1) {
      const a = thresholds[left];
      const b = thresholds[right];
      if ((a.categoryId ?? "") !== (b.categoryId ?? "")) continue;
      const aMax = a.maxScore ?? Number.POSITIVE_INFINITY;
      const bMax = b.maxScore ?? Number.POSITIVE_INFINITY;
      if (a.minScore <= bMax && b.minScore <= aMax) {
        diagnostics.push({ code: "overlapping-thresholds", severity: "warning", message: `Thresholds “${a.id}” and “${b.id}” overlap; priority resolves the match.`, targetId: a.id, targetType: "rule" });
      }
    }
  }

  const unique = new Map<string, LogicDiagnostic>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.targetId ?? ""}:${diagnostic.message}`;
    if (!unique.has(key)) unique.set(key, diagnostic);
  }
  return Array.from(unique.values());
}

function collectAnswerRefs(expression: FormulaExpression | undefined, output: Set<string>, depth = 0): void {
  if (!expression || depth > 16) return;
  if (expression.op === "answer" && expression.questionId) output.add(expression.questionId);
  for (const child of expression.args ?? []) collectAnswerRefs(child, output, depth + 1);
}

function conditionDescription(condition: Condition): string {
  const source = condition.questionId ? `answer “${condition.questionId}”` : `variable “${condition.variableId ?? "?"}”`;
  return `${source} ${condition.operator.replaceAll("_", " ")}${condition.value === undefined ? "" : ` ${JSON.stringify(condition.value)}`}`;
}

function explainConditionNode(node: ConditionNode, answers: Answers, variables: Record<string, RuntimeValue>): { passed: boolean; detail: string } {
  if (isConditionGroup(node)) {
    const all = node.all ?? [];
    const any = node.any ?? [];
    const parts: string[] = [];
    const allResults = all.map((child) => explainConditionNode(child, answers, variables));
    const anyResults = any.map((child) => explainConditionNode(child, answers, variables));
    if (all.length) parts.push(`ALL (${allResults.filter((item) => item.passed).length}/${all.length} passed)`);
    if (any.length) parts.push(`ANY (${anyResults.filter((item) => item.passed).length}/${any.length} passed)`);
    const notResult = node.not ? explainConditionNode(node.not, answers, variables) : null;
    if (notResult) parts.push(`NOT (${notResult.passed ? "matched" : "not matched"})`);
    return {
      passed: allResults.every((item) => item.passed) && (any.length === 0 || anyResults.some((item) => item.passed)) && (!notResult || !notResult.passed),
      detail: parts.join(" · ") || "No conditions configured",
    };
  }
  const condition = node as Condition;
  return { passed: evaluateCondition(condition, answers, variables), detail: conditionDescription(condition) };
}

export function evaluatePackDetailed(pack: PackDefinition, answers: Answers): DetailedEvaluation {
  const visibleQuestionIds = getVisibleQuestionIds(pack, answers);
  const answersForVisibleQuestions = effectiveAnswers(pack, answers, visibleQuestionIds);
  const variableResult = calculateVariables(pack, answersForVisibleQuestions);
  const variables = variableResult.values;
  const diagnostics = analyzePackLogic(pack);
  const trace: LogicTraceEntry[] = [];

  for (const question of pack.questions ?? []) {
    const rules = (pack.showIf ?? []).filter((rule) => rule.questionId === question.id);
    const visible = visibleQuestionIds.includes(question.id);
    if (rules.length > 0) {
      const explanations = rules.map((rule) => explainConditionNode(rule.when, answersForVisibleQuestions, variables));
      trace.push({ id: `visibility:${question.id}`, kind: "visibility", label: `Show “${question.prompt}”`, fired: visible, detail: visible ? "Visible" : "Hidden" + ` · ${explanations.map((item) => item.detail).join(" OR ")}`, targetId: question.id });
    }
  }

  for (const variable of pack.calculations ?? []) {
    const value = variables[variable.id] ?? null;
    trace.push({ id: `calculation:${variable.id}`, kind: "calculation", label: variable.label || variable.id, fired: true, detail: `Calculated ${JSON.stringify(value)}`, targetId: variable.id });
  }
  for (const issue of variableResult.issues) trace.push({ id: `calculation-issue:${trace.length}`, kind: "diagnostic", label: "Calculation issue", fired: null, detail: issue });

  const requiredQuestionIds: string[] = [];
  for (const question of pack.questions ?? []) {
    if (!visibleQuestionIds.includes(question.id)) continue;
    const required = isQuestionRequired(question, answersForVisibleQuestions, variables);
    if (required) requiredQuestionIds.push(question.id);
    if (question.requiredWhen) {
      const explanation = explainConditionNode(question.requiredWhen, answersForVisibleQuestions, variables);
      trace.push({ id: `required:${question.id}`, kind: "required", label: `Require “${question.prompt}”`, fired: required, detail: required ? `Required · ${explanation.detail}` : `Optional · ${explanation.detail}`, targetId: question.id });
    }
  }

  const categoryScores: Record<string, number> = Object.fromEntries((pack.scoringCategories ?? []).map((category) => [category.id, 0]));
  let score = 0;
  for (const rule of pack.scoring ?? []) {
    const explanation = explainConditionNode(rule.when, answersForVisibleQuestions, variables);
    const formulaPoints = rule.pointsFormula
      ? evaluateFormulaExpression(rule.pointsFormula, answersForVisibleQuestions, (id) => variables[id])
      : rule.points;
    const points = typeof formulaPoints === "number" && Number.isFinite(formulaPoints) ? formulaPoints : 0;
    if (explanation.passed) {
      score += points;
      if (rule.categoryId) categoryScores[rule.categoryId] = (categoryScores[rule.categoryId] ?? 0) + points;
    }
    trace.push({ id: `score:${rule.id}`, kind: "score", label: rule.label || `Scoring rule ${rule.id}`, fired: explanation.passed, detail: explanation.passed ? `${points >= 0 ? "+" : ""}${points} points${rule.categoryId ? ` · ${categoryScores[rule.categoryId]} in category` : ""} · ${explanation.detail}` : `No points · ${explanation.detail}`, targetId: rule.id });
  }

  const firedDisqualifiers = (pack.disqualifiers ?? []).filter((rule) => {
    const explanation = explainConditionNode(rule.when, answersForVisibleQuestions, variables);
    trace.push({ id: `disqualifier:${rule.id}`, kind: "disqualifier", label: rule.reason, fired: explanation.passed, detail: explanation.passed ? `Triggered · ${explanation.detail}` : `Not triggered · ${explanation.detail}`, targetId: rule.id });
    return explanation.passed;
  });
  const reasons = firedDisqualifiers.map((rule) => rule.reason);
  const disqualified = reasons.length > 0;

  const matchingThresholds = (pack.thresholds ?? [])
    .map((threshold, index) => ({ threshold, index, scoreToCheck: threshold.categoryId ? categoryScores[threshold.categoryId] ?? 0 : score }))
    .filter(({ threshold, scoreToCheck }) => scoreToCheck >= threshold.minScore && (threshold.maxScore === undefined || scoreToCheck <= threshold.maxScore))
    .sort((a, b) => (b.threshold.priority ?? b.threshold.minScore) - (a.threshold.priority ?? a.threshold.minScore) || b.threshold.minScore - a.threshold.minScore || b.index - a.index);
  for (const { threshold, scoreToCheck } of matchingThresholds) {
    trace.push({ id: `threshold:${threshold.id}`, kind: "threshold", label: `Threshold ${threshold.minScore}${threshold.maxScore === undefined ? "+" : `–${threshold.maxScore}`}`, fired: true, detail: `Matched score ${scoreToCheck}${threshold.categoryId ? ` in category ${threshold.categoryId}` : ""} → ${threshold.outcomeId}`, targetId: threshold.id });
  }
  for (const threshold of pack.thresholds ?? []) if (!matchingThresholds.some((item) => item.threshold.id === threshold.id)) {
    const scoreToCheck = threshold.categoryId ? categoryScores[threshold.categoryId] ?? 0 : score;
    trace.push({ id: `threshold:${threshold.id}`, kind: "threshold", label: `Threshold ${threshold.minScore}${threshold.maxScore === undefined ? "+" : `–${threshold.maxScore}`}`, fired: false, detail: `Did not match score ${scoreToCheck}`, targetId: threshold.id });
  }

  const selectedThreshold = matchingThresholds[0]?.threshold ?? null;
  let outcome: Outcome | null = null;
  if (!disqualified) {
    outcome = selectedThreshold
      ? pack.outcomes.find((item) => item.id === selectedThreshold.outcomeId) ?? null
      : pack.outcomes.length === 1 ? pack.outcomes[0] : null;
  }
  trace.push({ id: "outcome:selected", kind: "outcome", label: "Selected outcome", fired: Boolean(outcome), detail: disqualified ? "No outcome selected because a disqualifier fired." : outcome ? `Selected “${outcome.title}”${selectedThreshold ? ` via ${selectedThreshold.id}` : ""}.` : "No threshold selected an outcome.", targetId: outcome?.id });

  const matchingRouteIds = (pack.routing ?? [])
    .filter((rule) => rule.fromQuestionId && evaluateConditionGroup(rule.when, answersForVisibleQuestions, variables))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((rule) => rule.id);
  for (const rule of pack.routing ?? []) {
    const explanation = explainConditionNode(rule.when, answersForVisibleQuestions, variables);
    trace.push({ id: `route:${rule.id}`, kind: "route", label: rule.label || `Route from ${rule.fromQuestionId}`, fired: explanation.passed, detail: explanation.passed ? `Matches → ${rule.targetQuestionId || "Finish"} · ${explanation.detail}` : `Not matched · ${explanation.detail}`, targetId: rule.id });
  }

  for (const diagnostic of diagnostics) {
    trace.push({ id: `diagnostic:${diagnostic.code}:${diagnostic.targetId ?? ""}`, kind: "diagnostic", label: diagnostic.severity === "error" ? "Logic error" : diagnostic.severity === "warning" ? "Logic warning" : "Logic note", fired: null, detail: diagnostic.message, targetId: diagnostic.targetId });
  }

  return {
    visibleQuestionIds,
    requiredQuestionIds,
    score: Math.round(score * 1000) / 1000,
    categoryScores: Object.fromEntries(Object.entries(categoryScores).map(([id, value]) => [id, Math.round(value * 1000) / 1000])),
    variables,
    outcome,
    disqualified,
    reasons,
    selectedThresholdId: selectedThreshold?.id ?? null,
    matchingRouteIds,
    trace,
    diagnostics,
  };
}

export function evaluatePack(
  pack: PackDefinition,
  answers: Answers,
): {
  visibleQuestionIds: string[];
  score: number;
  outcome: Outcome | null;
  disqualified: boolean;
  reasons: string[];
} {
  const result = evaluatePackDetailed(pack, answers);
  return {
    visibleQuestionIds: result.visibleQuestionIds,
    score: result.score,
    outcome: result.outcome,
    disqualified: result.disqualified,
    reasons: result.reasons,
  };
}
