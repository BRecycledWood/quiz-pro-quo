import type {
  AnswerValue,
  Answers,
  Condition,
  ConditionGroup,
  Outcome,
  PackDefinition,
} from "../pack";

type PrimitiveAnswer = string | number | boolean;

function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function toPrimitiveArray(
  value: AnswerValue | AnswerValue[] | undefined,
): PrimitiveAnswer[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const output: PrimitiveAnswer[] = [];

  raw.forEach((item) => {
    if (Array.isArray(item)) {
      item.forEach((entry) => {
        if (typeof entry === "string") output.push(entry);
      });
      return;
    }
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      output.push(item);
    }
  });

  return output;
}

function evaluateCondition(condition: Condition, answers: Answers): boolean {
  const answer = answers[condition.questionId];
  const answerValues = toPrimitiveArray(answer);
  const values = toPrimitiveArray(condition.value);

  switch (condition.operator) {
    case "answered":
      return isAnswered(answer ?? null);
    case "not_answered":
      return !isAnswered(answer ?? null);
    case "equals":
      return answerValues.some((value) => values.includes(value));
    case "not_equals":
      return !answerValues.some((value) => values.includes(value));
    case "includes":
      if (Array.isArray(answer)) {
        return values.some((value) => answerValues.includes(value));
      }
      if (typeof answer === "string") {
        return values.some((value) =>
          typeof value === "string" ? answer.includes(value) : false,
        );
      }
      return false;
    case "not_includes":
      if (Array.isArray(answer)) {
        return !values.some((value) => answerValues.includes(value));
      }
      if (typeof answer === "string") {
        return !values.some((value) =>
          typeof value === "string" ? answer.includes(value) : false,
        );
      }
      return true;
    case "gt":
      return typeof answer === "number" && typeof values[0] === "number"
        ? answer > values[0]
        : false;
    case "gte":
      return typeof answer === "number" && typeof values[0] === "number"
        ? answer >= values[0]
        : false;
    case "lt":
      return typeof answer === "number" && typeof values[0] === "number"
        ? answer < values[0]
        : false;
    case "lte":
      return typeof answer === "number" && typeof values[0] === "number"
        ? answer <= values[0]
        : false;
    default:
      return false;
  }
}

function evaluateConditionGroup(
  group: ConditionGroup | undefined,
  answers: Answers,
): boolean {
  if (!group) return true;
  const allConditions = group.all ?? [];
  const anyConditions = group.any ?? [];

  const allPass = allConditions.every((condition) =>
    evaluateCondition(condition, answers),
  );
  const anyPass =
    anyConditions.length === 0
      ? true
      : anyConditions.some((condition) => evaluateCondition(condition, answers));

  return allPass && anyPass;
}

export function getVisibleQuestionIds(
  pack: PackDefinition,
  answers: Answers,
): string[] {
  const rules = pack.showIf ?? [];

  return pack.questions
    .filter((question) => {
      const questionRules = rules.filter(
        (rule) => rule.questionId === question.id,
      );
      if (questionRules.length === 0) return true;
      return questionRules.some((rule) =>
        evaluateConditionGroup(rule.when, answers),
      );
    })
    .map((question) => question.id);
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
  const visibleQuestionIds = getVisibleQuestionIds(pack, answers);
  const disqualifiers = pack.disqualifiers ?? [];
  const reasons = disqualifiers
    .filter((rule) => evaluateConditionGroup(rule.when, answers))
    .map((rule) => rule.reason);
  const disqualified = reasons.length > 0;

  const scoringRules = pack.scoring ?? [];
  const score = scoringRules.reduce((total, rule) => {
    if (evaluateConditionGroup(rule.when, answers)) {
      return total + rule.points;
    }
    return total;
  }, 0);

  let outcome: Outcome | null = null;
  if (!disqualified) {
    const thresholds = (pack.thresholds ?? []).slice().sort((a, b) => {
      if (a.minScore === b.minScore) return 0;
      return a.minScore - b.minScore;
    });

    const matched = thresholds.filter((threshold) => {
      const meetsMin = score >= threshold.minScore;
      const meetsMax =
        threshold.maxScore === undefined ? true : score <= threshold.maxScore;
      return meetsMin && meetsMax;
    });

    const selected = matched.length > 0 ? matched[matched.length - 1] : null;
    if (selected) {
      outcome = pack.outcomes.find((item) => item.id === selected.outcomeId) ?? null;
    } else if (pack.outcomes.length === 1) {
      outcome = pack.outcomes[0];
    }
  }

  return {
    visibleQuestionIds,
    score,
    outcome,
    disqualified,
    reasons,
  };
}
