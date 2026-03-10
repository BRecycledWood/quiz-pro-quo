export type AnswerValue = string | string[] | number | boolean | null;
export type Answers = Record<string, AnswerValue>;

export type QuestionType =
  | "single"
  | "multi"
  | "number"
  | "text"
  | "boolean"
  | "yesno"
  | "select";

export interface QuestionOption {
  id: string;
  label: string;
  value?: string;
}

export interface Question {
  id: string;
  prompt: string;
  type: QuestionType;
  options?: QuestionOption[];
  required?: boolean;
}

export interface Outcome {
  id: string;
  title: string;
  description?: string;
  status?: "pass" | "caution" | "fail";
  ctaLabel?: string;
  ctaUrl?: string;
  metadata?: Record<string, unknown>;
}

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "includes"
  | "not_includes"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "answered"
  | "not_answered";

export interface Condition {
  questionId: string;
  operator: ConditionOperator;
  value?: AnswerValue | AnswerValue[];
}

export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
}

export interface ShowIfRule {
  questionId: string;
  when: ConditionGroup;
}

export interface DisqualifierRule {
  id: string;
  reason: string;
  when: ConditionGroup;
}

export interface ScoringRule {
  id: string;
  points: number;
  when: ConditionGroup;
}

export interface ThresholdRule {
  id: string;
  minScore: number;
  maxScore?: number;
  outcomeId: string;
}

export interface PricingRule {
  isPaid?: boolean;
  stripePriceId?: string;
  currency?: string;
  amount?: number;
  interval?: "one_time" | "month" | "year";
}

export interface PackDefinition {
  id?: string;
  name?: string;
  version?: number;
  outcomes: Outcome[];
  questions: Question[];
  showIf?: ShowIfRule[];
  disqualifiers?: DisqualifierRule[];
  scoring?: ScoringRule[];
  thresholds?: ThresholdRule[];
  pricing?: PricingRule;
}
