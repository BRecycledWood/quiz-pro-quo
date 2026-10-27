export type AnswerValue = string | string[] | number | boolean | null;
export type Answers = Record<string, AnswerValue>;

export type QuestionType =
  | "single"
  | "multi"
  | "number"
  | "text"
  | "short_text"
  | "long_text"
  | "date"
  | "boolean"
  | "yesno"
  | "yes_no"
  | "true_false"
  | "select"
  | "dropdown"
  | "percent"
  | "scale_1_5"
  | "scale_1_10";

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
  /** Legacy section label. Prefer PackSection.id and sectionId for new definitions. */
  section?: string;
  sectionId?: string;
  helpText?: string;
  requiredWhen?: ConditionGroup;
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface PackSection {
  id: string;
  title: string;
  description?: string;
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
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "answered"
  | "not_answered"
  | "empty"
  | "not_empty";

/** A leaf in the condition tree. Exactly one of questionId/variableId is used. */
export interface Condition {
  questionId?: string;
  variableId?: string;
  operator: ConditionOperator;
  value?: AnswerValue | AnswerValue[];
  caseSensitive?: boolean;
}

export type ConditionNode = Condition | ConditionGroup;

/**
 * Conditions are recursively composable. `all` and `any` combine with AND,
 * `not` negates its child. Legacy flat { all, any } definitions keep their
 * original AND-of-ALL plus OR-of-ANY semantics.
 */
export interface ConditionGroup {
  all?: ConditionNode[];
  any?: ConditionNode[];
  not?: ConditionNode;
}

export type FormulaValue = string | number | boolean | null;
export type FormulaOperator =
  | "literal"
  | "answer"
  | "variable"
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "modulo"
  | "min"
  | "max"
  | "average"
  | "abs"
  | "round"
  | "floor"
  | "ceil"
  | "count"
  | "length"
  | "concat"
  | "coalesce"
  | "days_between";

/** A small, serializable formula AST. It is interpreted; never evaluated as JS. */
export interface FormulaExpression {
  op: FormulaOperator;
  value?: FormulaValue;
  questionId?: string;
  variableId?: string;
  args?: FormulaExpression[];
}

export interface CalculatedVariable {
  id: string;
  label: string;
  expression: FormulaExpression;
  description?: string;
}

export interface ScoringCategory {
  id: string;
  label: string;
  description?: string;
}

export interface DisqualifierRule {
  id: string;
  reason: string;
  when: ConditionGroup;
  priority?: number;
}

export interface ScoringRule {
  id: string;
  points: number;
  /** Optional safe formula for dynamic weighted points; never executable JavaScript. */
  pointsFormula?: FormulaExpression;
  when: ConditionGroup;
  categoryId?: string;
  label?: string;
  priority?: number;
}

export interface ReusableCondition {
  id: string;
  label: string;
  when: ConditionGroup;
}

export interface ThresholdRule {
  id: string;
  minScore: number;
  maxScore?: number;
  outcomeId: string;
  categoryId?: string;
  priority?: number;
}

export interface ShowIfRule {
  questionId: string;
  when: ConditionGroup;
  label?: string;
}

export interface RoutingRule {
  id: string;
  fromQuestionId: string;
  targetQuestionId?: string | null;
  when: ConditionGroup;
  priority?: number;
  label?: string;
}

export interface PricingRule {
  isPaid?: boolean;
  stripePriceId?: string;
  currency?: string;
  amount?: number;
  interval?: "one_time" | "month" | "year";
}

export type BrandThemePreset = "studio" | "ocean" | "grove" | "sunrise" | "ink";
export type BrandFontPreset = "system" | "modern" | "friendly" | "editorial" | "rounded" | "serif";
export type BrandButtonStyle = "rounded" | "pill" | "square";
export type BrandProgressStyle = "bar" | "steps" | "minimal";

/** Assessment-level overrides inherit from the workspace when omitted. */
export interface PackBranding {
  brandName?: string;
  logoDataUrl?: string;
  /** HTTPS-hosted PNG/JPEG; browser uploads should use validated logoDataUrl assets instead. */
  logoUrl?: string;
  themePreset?: BrandThemePreset;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontPreset?: BrandFontPreset;
  customFontFamily?: string;
  buttonStyle?: BrandButtonStyle;
  progressStyle?: BrandProgressStyle;
  showAttribution?: boolean;
}

export type BrandPlan = "free" | "pro" | "agency" | "legacy";

export interface PackDefinition {
  id?: string;
  name?: string;
  description?: string;
  version?: number;
  logicVersion?: number;
  sections?: PackSection[];
  outcomes: Outcome[];
  questions: Question[];
  showIf?: ShowIfRule[];
  routing?: RoutingRule[];
  calculations?: CalculatedVariable[];
  scoringCategories?: ScoringCategory[];
  reusableConditions?: ReusableCondition[];
  disqualifiers?: DisqualifierRule[];
  scoring?: ScoringRule[];
  thresholds?: ThresholdRule[];
  branding?: PackBranding;
  pricing?: PricingRule;
}
