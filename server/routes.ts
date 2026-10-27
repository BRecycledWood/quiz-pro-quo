import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage, type IStorage, type PackVersionRecord } from "./storage";
import type { sendLeadNotification, sendResultsEmail } from "./email";
import { analyzePackLogic, calculateVariables, evaluatePack, getVisibleQuestionIds, isQuestionRequired } from "@shared/engine/interpreter";
import type { Answers, BrandPlan, ConditionGroup, FormulaExpression, PackBranding, PackDefinition, Question } from "@shared/pack";
import { getBrandEntitlementIssues, getFeatureEntitlements } from "@shared/entitlements";
import { BRAND_THEME_PRESETS } from "@shared/branding";
import type { Submission } from "@shared/schema";
import { renderAssessmentPdf } from "./pdf";
import PDFDocument from "pdfkit";
import Stripe from "stripe";

function requireAdmin(adminKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!adminKey) {
      return res.status(500).json({ message: "ADMIN_KEY not configured" });
    }

    const headerKey = req.header("x-admin-key");
    const authHeader = req.header("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const provided = headerKey ?? bearerToken;
    if (!provided || provided !== adminKey) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return next();
  };
}

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
    const buffer = Buffer.from(`${normalized}${padding}`, "base64");
    return buffer.toString("utf8");
  } catch (error) {
    return null;
  }
}

function parseAnswers(raw: unknown): Answers | null {
  if (raw === undefined || raw === null) return null;
  const encoded = Array.isArray(raw)
    ? raw.find((entry) => typeof entry === "string")
    : typeof raw === "string"
      ? raw
      : null;
  if (!encoded || encoded.trim().length === 0) return null;
  const decoded = decodeBase64Url(encoded);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Answers;
  } catch (error) {
    return null;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidColor(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string" && value === value.trim() && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
}

function isValidLogoUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidStripePriceId(value: unknown): boolean {
  return value === undefined || value === null || value === "" ||
    typeof value === "string" && /^price_[a-zA-Z0-9]{1,100}$/.test(value);
}

const QUESTION_TYPES = new Set<Question["type"]>([
  "single", "multi", "number", "text", "short_text", "long_text", "date",
  "boolean", "yesno", "yes_no", "true_false", "select", "dropdown",
  "percent", "scale_1_5", "scale_1_10",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeAdminSubmission(submission: Submission) {
  const { stripeSessionId: _stripeSessionId, ...safe } = submission;
  return safe;
}

function createRateLimiter(limit: number, windowMs: number) {
  const clients = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const clientId = req.ip || req.socket.remoteAddress || "unknown";
    let record = clients.get(clientId);
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      clients.set(clientId, record);
    }
    record.count += 1;
    if (record.count > limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))));
      return res.status(429).json({ message: "Too many requests. Please try again shortly." });
    }
    if (clients.size > 10_000) {
      for (const [key, value] of clients) if (value.resetAt <= now) clients.delete(key);
      while (clients.size > 10_000) {
        const oldest = clients.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        clients.delete(oldest);
      }
    }
    return next();
  };
}

function validateConditionGroup(
  value: unknown,
  questionIds: Set<string>,
  variableIds: Set<string> = new Set(),
  depth = 0,
  state = { leaves: 0 },
): string | null {
  if (!isRecord(value)) return "Conditions must be objects.";
  if (depth > 16) return "Condition nesting cannot exceed 16 levels.";

  if (typeof value.operator === "string") {
    state.leaves += 1;
    if (state.leaves > 500) return "A rule cannot contain more than 500 conditions.";
    const hasQuestion = typeof value.questionId === "string" && value.questionId.length > 0;
    const hasVariable = typeof value.variableId === "string" && value.variableId.length > 0;
    if (hasQuestion === hasVariable) return "Each condition must reference exactly one question or calculated variable.";
    if (hasQuestion && !questionIds.has(value.questionId as string)) return "A condition refers to a question that does not exist.";
    if (hasVariable && !variableIds.has(value.variableId as string)) return "A condition refers to a calculated variable that does not exist.";
    if (!CONDITION_OPERATORS.has(value.operator)) return "A condition uses an unsupported operator.";
    if (value.caseSensitive !== undefined && typeof value.caseSensitive !== "boolean") return "Condition caseSensitive must be a boolean.";
    const requiresValue = !["answered", "not_answered", "empty", "not_empty"].includes(value.operator);
    if (requiresValue && value.value === undefined) return "Each value-based condition needs a value.";
    const conditionValue = value.value;
    const isPrimitive = (item: unknown) =>
      typeof item === "string" || typeof item === "number" && Number.isFinite(item) || typeof item === "boolean";
    if (conditionValue !== undefined && !(isPrimitive(conditionValue) || Array.isArray(conditionValue) && conditionValue.every(isPrimitive))) {
      return "Condition values must be strings, numbers, booleans, or arrays of those values.";
    }
    if (["gt", "gte", "lt", "lte"].includes(value.operator) && typeof conditionValue !== "number") {
      return "Numeric comparison conditions need a numeric value.";
    }
    if (["before", "after", "on_or_before", "on_or_after"].includes(value.operator)) {
      if (typeof conditionValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(conditionValue) || Number.isNaN(Date.parse(`${conditionValue}T00:00:00Z`))) {
        return "Date comparison conditions need a valid YYYY-MM-DD date.";
      }
    }
    return null;
  }

  const childNodes: unknown[] = [];
  for (const key of ["all", "any"] as const) {
    if (value[key] !== undefined && !Array.isArray(value[key])) return `Condition ${key} must be an array.`;
    if (Array.isArray(value[key])) childNodes.push(...value[key]);
  }
  if (value.not !== undefined) childNodes.push(value.not);
  if (childNodes.length === 0) return "Add at least one condition.";
  for (const child of childNodes) {
    const issue = validateConditionGroup(child, questionIds, variableIds, depth + 1, state);
    if (issue) return issue;
  }
  return null;
}

const CONDITION_OPERATORS = new Set([
  "equals", "not_equals", "includes", "not_includes", "contains", "not_contains",
  "starts_with", "ends_with", "gt", "gte", "lt", "lte", "before", "after",
  "on_or_before", "on_or_after", "answered", "not_answered", "empty", "not_empty",
]);

function isSafeLogoDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 700_000) return false;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 512 * 1024) return false;
  if (match[1] === "png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

const FORMULA_OPERATORS = new Set([
  "literal", "answer", "variable", "add", "subtract", "multiply", "divide", "modulo",
  "min", "max", "average", "abs", "round", "floor", "ceil", "count", "length",
  "concat", "coalesce", "days_between",
]);

function validateFormulaExpression(
  value: unknown,
  questionIds: Set<string>,
  variableIds: Set<string>,
  depth = 0,
  state = { nodes: 0 },
): string | null {
  if (!isRecord(value) || typeof value.op !== "string" || !FORMULA_OPERATORS.has(value.op)) {
    return "Formula nodes must use a supported safe operation.";
  }
  state.nodes += 1;
  if (depth > 16 || state.nodes > 256) return "Formula exceeds the supported complexity limit (16 levels / 256 nodes).";
  if (value.op === "literal") {
    const literal = value.value;
    if (!(literal === null || typeof literal === "string" && literal.length <= 5_000 || typeof literal === "boolean" || typeof literal === "number" && Number.isFinite(literal))) {
      return "Formula literals must be finite numbers, booleans, strings up to 5,000 characters, or null.";
    }
    return null;
  }
  if (value.op === "answer") {
    return typeof value.questionId === "string" && questionIds.has(value.questionId)
      ? null
      : "Formula refers to a missing question.";
  }
  if (value.op === "variable") {
    return typeof value.variableId === "string" && variableIds.has(value.variableId)
      ? null
      : "Formula refers to a missing calculated variable.";
  }
  if (!Array.isArray(value.args) || value.args.length === 0 || value.args.length > 32) return "Formula operations need between 1 and 32 arguments.";
  const arity: Record<string, number> = { subtract: 2, divide: 2, modulo: 2, abs: 1, round: 1, floor: 1, ceil: 1, length: 1, days_between: 2 };
  if (arity[value.op] !== undefined && value.args.length !== arity[value.op]) return `Formula ${value.op} requires exactly ${arity[value.op]} argument(s).`;
  for (const argument of value.args) {
    const issue = validateFormulaExpression(argument, questionIds, variableIds, depth + 1, state);
    if (issue) return issue;
  }
  return null;
}

function validateBrandingShape(value: unknown): string | null {
  if (value === undefined) return null;
  if (!isRecord(value)) return "Branding settings must be an object.";
  const brand = value;
  if (brand.brandName !== undefined && (typeof brand.brandName !== "string" || brand.brandName.trim().length === 0 || brand.brandName.length > 120)) return "Brand name must be 1–120 characters.";
  if (brand.logoDataUrl !== undefined && !isSafeLogoDataUrl(brand.logoDataUrl)) return "Uploaded logos must be PNG or JPEG images under 512 KB with a valid file signature.";
  if (brand.logoUrl !== undefined && !isValidLogoUrl(brand.logoUrl)) return "Brand logo URLs must use HTTPS and point to a safe public host.";
  for (const key of ["primaryColor", "secondaryColor", "backgroundColor", "textColor"] as const) {
    if (brand[key] !== undefined && !isValidColor(brand[key])) return `Brand ${key} must be a valid hex color.`;
  }
  const enums: Record<string, string[]> = {
    themePreset: ["studio", "ocean", "grove", "sunrise", "ink"],
    fontPreset: ["system", "modern", "friendly", "editorial", "rounded", "serif"],
    buttonStyle: ["rounded", "pill", "square"],
    progressStyle: ["bar", "steps", "minimal"],
  };
  for (const [field, allowed] of Object.entries(enums)) {
    if (brand[field] !== undefined && (typeof brand[field] !== "string" || !allowed.includes(brand[field] as string))) return `Brand ${field} is not supported.`;
  }
  if (brand.customFontFamily !== undefined && (typeof brand.customFontFamily !== "string" || brand.customFontFamily.length > 100 || !/^[\w\s,'"()-]+$/.test(brand.customFontFamily))) return "Custom font family contains unsupported characters.";
  if (brand.showAttribution !== undefined && typeof brand.showAttribution !== "boolean") return "Brand attribution setting must be a boolean.";
  const theme = (typeof brand.themePreset === "string" ? BRAND_THEME_PRESETS[brand.themePreset as keyof typeof BRAND_THEME_PRESETS] : undefined) ?? BRAND_THEME_PRESETS.studio;
  const effectiveBackground = typeof brand.backgroundColor === "string" ? brand.backgroundColor : theme?.backgroundColor;
  const effectiveText = typeof brand.textColor === "string" ? brand.textColor : theme?.textColor;
  if ((brand.backgroundColor !== undefined || brand.textColor !== undefined) && effectiveBackground && effectiveText && colorContrastRatio(effectiveBackground, effectiveText) < 4.5) {
    return "Brand text must meet a 4.5:1 contrast ratio against the page background.";
  }
  return null;
}

function colorContrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const raw = color.slice(1);
    const expanded = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    const channels = [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function validatePackDefinition(value: unknown): { definition?: PackDefinition; error?: string } {
  if (!isRecord(value) || !Array.isArray(value.questions) || !Array.isArray(value.outcomes)) {
    return { error: "A pack definition must include questions and outcomes arrays." };
  }
  const definition = value as unknown as PackDefinition;
  for (const field of ["disqualifiers", "scoring", "showIf", "thresholds", "routing", "calculations", "scoringCategories", "sections", "reusableConditions"] as const) {
    const collection = definition[field];
    if (collection !== undefined && (!Array.isArray(collection) || collection.length > 300)) {
      return { error: `Pack ${field} must be an array of at most 300 items.` };
    }
    if (Array.isArray(collection) && collection.some((item) => !isRecord(item))) {
      return { error: `Every item in pack ${field} must be an object.` };
    }
  }
  if (definition.pricing !== undefined && !isRecord(definition.pricing)) {
    return { error: "Pack pricing must be an object." };
  }
  const brandingIssue = validateBrandingShape(definition.branding);
  if (brandingIssue) return { error: brandingIssue };
  if (definition.logicVersion !== undefined && (!Number.isSafeInteger(definition.logicVersion) || definition.logicVersion < 1 || definition.logicVersion > 2)) {
    return { error: "Pack logicVersion must be 1 or 2." };
  }
  if (definition.pricing?.isPaid !== undefined && typeof definition.pricing.isPaid !== "boolean") {
    return { error: "Pack pricing isPaid must be a boolean." };
  }
  if (definition.pricing?.stripePriceId !== undefined && !isValidStripePriceId(definition.pricing.stripePriceId)) {
    return { error: "Stripe price id must be a valid Stripe price identifier." };
  }
  if (definition.pricing?.currency !== undefined && (typeof definition.pricing.currency !== "string" || !/^[a-z]{3}$/i.test(definition.pricing.currency))) {
    return { error: "Pricing currency must be a three-letter ISO currency code." };
  }
  if (definition.pricing?.amount !== undefined && (typeof definition.pricing.amount !== "number" || !Number.isFinite(definition.pricing.amount) || definition.pricing.amount < 0)) {
    return { error: "Pricing amount must be a non-negative number." };
  }
  if (
    definition.pricing?.interval !== undefined &&
    (typeof definition.pricing.interval !== "string" || !["one_time", "month", "year"].includes(definition.pricing.interval))
  ) {
    return { error: "Pricing interval is invalid." };
  }
  if (typeof definition.name !== "string" || !definition.name.trim() || definition.name.trim().length > 120) {
    return { error: "A pack needs a name of 1–120 characters." };
  }
  if (definition.description !== undefined && (typeof definition.description !== "string" || definition.description.length > 5000)) {
    return { error: "Pack description must be 5,000 characters or fewer." };
  }
  if (definition.questions.length === 0 || definition.questions.length > 100) {
    return { error: "A pack needs between 1 and 100 questions." };
  }
  if (definition.outcomes.length === 0 || definition.outcomes.length > 100) {
    return { error: "A pack needs between 1 and 100 outcomes." };
  }
  const questionIds = new Set<string>();
  const outcomeIds = new Set<string>();
  const sectionIds = new Set<string>();
  const variableIds = new Set<string>();
  const categoryIds = new Set<string>();

  for (const section of definition.sections ?? []) {
    if (!section || typeof section.id !== "string" || !section.id.trim() || section.id.length > 120 || sectionIds.has(section.id)) return { error: "Every section needs a unique id of 1–120 characters." };
    if (typeof section.title !== "string" || !section.title.trim() || section.title.length > 120) return { error: `Section ${section.id} needs a title of 1–120 characters.` };
    if (section.description !== undefined && (typeof section.description !== "string" || section.description.length > 1000)) return { error: `Section ${section.id} description is too long.` };
    sectionIds.add(section.id);
  }
  for (const variable of definition.calculations ?? []) {
    if (!variable || typeof variable.id !== "string" || !variable.id.trim() || variable.id.length > 120 || variableIds.has(variable.id)) return { error: "Every calculated variable needs a unique id of 1–120 characters." };
    if (typeof variable.label !== "string" || !variable.label.trim() || variable.label.length > 120) return { error: `Calculated variable ${variable.id} needs a label.` };
    variableIds.add(variable.id);
  }
  for (const category of definition.scoringCategories ?? []) {
    if (!category || typeof category.id !== "string" || !category.id.trim() || category.id.length > 120 || categoryIds.has(category.id)) return { error: "Every scoring category needs a unique id of 1–120 characters." };
    if (typeof category.label !== "string" || !category.label.trim() || category.label.length > 120) return { error: `Scoring category ${category.id} needs a label.` };
    categoryIds.add(category.id);
  }
  const reusableConditionIds = new Set<string>();
  for (const reusable of definition.reusableConditions ?? []) {
    if (!reusable || typeof reusable.id !== "string" || !reusable.id.trim() || reusable.id.length > 120 || reusableConditionIds.has(reusable.id)) return { error: "Every reusable condition needs a unique id of 1–120 characters." };
    if (typeof reusable.label !== "string" || !reusable.label.trim() || reusable.label.length > 120) return { error: `Reusable condition ${reusable.id} needs a label.` };
    reusableConditionIds.add(reusable.id);
  }

  for (const outcome of definition.outcomes) {
    if (!outcome || typeof outcome.id !== "string" || !outcome.id.trim() || outcome.id.length > 120) {
      return { error: "Every outcome needs a valid id." };
    }
    if (outcomeIds.has(outcome.id)) return { error: `Duplicate outcome id: ${outcome.id}` };
    outcomeIds.add(outcome.id);
    if (typeof outcome.title !== "string" || !outcome.title.trim() || outcome.title.length > 200) {
      return { error: `Outcome ${outcome.id} needs a title of 1–200 characters.` };
    }
    if (outcome.description !== undefined && (typeof outcome.description !== "string" || outcome.description.length > 5000)) {
      return { error: `Outcome ${outcome.id} description is too long.` };
    }
    if (outcome.status !== undefined && !["pass", "caution", "fail"].includes(outcome.status)) {
      return { error: `Outcome ${outcome.id} has an invalid status.` };
    }
    if (outcome.ctaLabel !== undefined && (typeof outcome.ctaLabel !== "string" || outcome.ctaLabel.length > 120)) {
      return { error: `Outcome ${outcome.id} CTA label is too long.` };
    }
    if (outcome.ctaUrl !== undefined) {
      if (typeof outcome.ctaUrl !== "string" || outcome.ctaUrl.length > 2048) return { error: `Outcome ${outcome.id} CTA URL is invalid.` };
      try {
        const url = new URL(outcome.ctaUrl);
        if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password) return { error: `Outcome ${outcome.id} CTA URL must use HTTP or HTTPS.` };
      } catch {
        return { error: `Outcome ${outcome.id} CTA URL must be an absolute HTTP or HTTPS URL.` };
      }
    }
  }

  for (const question of definition.questions) {
    if (!question || typeof question.id !== "string" || !question.id.trim() || question.id.length > 120) {
      return { error: "Every question needs a valid id." };
    }
    if (questionIds.has(question.id)) return { error: `Duplicate question id: ${question.id}` };
    questionIds.add(question.id);
    if (typeof question.prompt !== "string" || !question.prompt.trim() || question.prompt.length > 1000) {
      return { error: `Question ${question.id} needs prompt text of 1–1,000 characters.` };
    }
    if (!QUESTION_TYPES.has(question.type)) return { error: `Question ${question.id} has an unsupported type.` };
    if (question.required !== undefined && typeof question.required !== "boolean") {
      return { error: `Question ${question.id} has an invalid required setting.` };
    }
    if (question.section !== undefined && (typeof question.section !== "string" || question.section.length > 100)) {
      return { error: `Question ${question.id} section label is too long.` };
    }
    if (question.sectionId !== undefined && (typeof question.sectionId !== "string" || !sectionIds.has(question.sectionId))) {
      return { error: `Question ${question.id} refers to a missing section.` };
    }
    if (question.min !== undefined && (typeof question.min !== "number" || !Number.isFinite(question.min)) || question.max !== undefined && (typeof question.max !== "number" || !Number.isFinite(question.max))) {
      return { error: `Question ${question.id} numeric bounds must be finite numbers.` };
    }
    if (question.min !== undefined && question.max !== undefined && question.max < question.min) return { error: `Question ${question.id} maximum must be at least its minimum.` };
    if (question.helpText !== undefined && (typeof question.helpText !== "string" || question.helpText.length > 1000)) {
      return { error: `Question ${question.id} help text is too long.` };
    }
    if (["single", "select", "dropdown", "multi"].includes(question.type)) {
      if (!Array.isArray(question.options) || question.options.length === 0 || question.options.length > 100) {
        return { error: `Question ${question.id} needs between 1 and 100 answer options.` };
      }
      const optionIds = new Set<string>();
      const optionValues = new Set<string>();
      for (const option of question.options) {
        if (!option || typeof option.id !== "string" || !option.id.trim() || option.id.length > 120 || optionIds.has(option.id)) {
          return { error: `Question ${question.id} has an invalid or duplicate option id.` };
        }
        optionIds.add(option.id);
        if (typeof option.label !== "string" || !option.label.trim() || option.label.length > 200) {
          return { error: `Every answer option for ${question.id} needs a label.` };
        }
        if (option.value !== undefined && (typeof option.value !== "string" || !option.value.trim() || option.value.length > 120)) {
          return { error: `Answer option values for ${question.id} must be non-empty strings of 120 characters or fewer.` };
        }
        const optionValue = option.value ?? option.id;
        if (optionValues.has(optionValue)) return { error: `Question ${question.id} has duplicate option values.` };
        optionValues.add(optionValue);
      }
    }
  }

  for (const variable of definition.calculations ?? []) {
    const issue = validateFormulaExpression(variable.expression, questionIds, variableIds);
    if (issue) return { error: `Calculated variable ${variable.id}: ${issue}` };
    if (variable.description !== undefined && (typeof variable.description !== "string" || variable.description.length > 500)) return { error: `Calculated variable ${variable.id} description is too long.` };
  }

  const disqualifierIds = new Set<string>();
  for (const rule of definition.disqualifiers ?? []) {
    if (typeof rule.id !== "string" || !rule.id.trim() || rule.id.length > 120 || disqualifierIds.has(rule.id)) {
      return { error: "Every disqualifier needs a unique id of 1–120 characters." };
    }
    disqualifierIds.add(rule.id);
  }
  const scoringIds = new Set<string>();
  for (const rule of definition.scoring ?? []) {
    if (typeof rule.id !== "string" || !rule.id.trim() || rule.id.length > 120 || scoringIds.has(rule.id)) {
      return { error: "Every scoring rule needs a unique id of 1–120 characters." };
    }
    scoringIds.add(rule.id);
  }
  for (const rule of definition.showIf ?? []) {
    if (typeof rule.questionId !== "string" || !rule.questionId.trim() || rule.questionId.length > 120 || !questionIds.has(rule.questionId)) {
      return { error: "Every visibility rule must target an existing question id." };
    }
  }
  const routeIds = new Set<string>();
  for (const rule of definition.routing ?? []) {
    if (typeof rule.id !== "string" || !rule.id.trim() || rule.id.length > 120 || routeIds.has(rule.id)) return { error: "Every routing rule needs a unique id of 1–120 characters." };
    routeIds.add(rule.id);
    if (typeof rule.fromQuestionId !== "string" || !questionIds.has(rule.fromQuestionId)) return { error: `Routing rule ${rule.id} refers to a missing source question.` };
    if (rule.targetQuestionId !== undefined && rule.targetQuestionId !== null && (typeof rule.targetQuestionId !== "string" || !questionIds.has(rule.targetQuestionId))) return { error: `Routing rule ${rule.id} refers to a missing target question.` };
    if (rule.priority !== undefined && (typeof rule.priority !== "number" || !Number.isFinite(rule.priority))) return { error: `Routing rule ${rule.id} priority must be a finite number.` };
  }

  const rules: Array<{
    name: string;
    group: ConditionGroup;
    questionId?: string;
    description?: string;
  }> = [
    ...(definition.disqualifiers ?? []).map((rule) => ({ name: `Disqualifier ${rule.id}`, group: rule.when, description: rule.reason })),
    ...(definition.scoring ?? []).map((rule) => ({ name: `Scoring rule ${rule.id}`, group: rule.when })),
    ...(definition.showIf ?? []).map((rule) => ({ name: `Visibility rule for ${rule.questionId}`, questionId: rule.questionId, group: rule.when })),
    ...(definition.routing ?? []).map((rule) => ({ name: `Routing rule ${rule.id}`, questionId: rule.fromQuestionId, group: rule.when })),
    ...(definition.reusableConditions ?? []).map((condition) => ({ name: `Reusable condition ${condition.id}`, group: condition.when })),
    ...definition.questions.filter((question) => question.requiredWhen).map((question) => ({ name: `Required rule for ${question.id}`, questionId: question.id, group: question.requiredWhen! })),
  ];
  for (const rule of rules) {
    if (rule.questionId !== undefined && !questionIds.has(rule.questionId)) return { error: `Rule points to missing question ${rule.questionId}.` };
    const issue = validateConditionGroup(rule.group, questionIds, variableIds);
    if (issue) return { error: `${rule.name}: ${issue}` };
    if ("description" in rule && (typeof rule.description !== "string" || !rule.description.trim() || rule.description.length > 500)) {
      return { error: `${rule.name} needs a reason of 1–500 characters.` };
    }
  }
  for (const rule of definition.scoring ?? []) {
    if (typeof rule.points !== "number" || !Number.isFinite(rule.points) || Math.abs(rule.points) > 1_000_000) {
      return { error: `Scoring rule ${rule.id} must use finite points between -1,000,000 and 1,000,000.` };
    }
    if (rule.categoryId !== undefined && !categoryIds.has(rule.categoryId)) return { error: `Scoring rule ${rule.id} refers to a missing scoring category.` };
    if (rule.priority !== undefined && (typeof rule.priority !== "number" || !Number.isFinite(rule.priority))) return { error: `Scoring rule ${rule.id} priority must be finite.` };
    if (rule.label !== undefined && (typeof rule.label !== "string" || rule.label.length > 120)) return { error: `Scoring rule ${rule.id} label is too long.` };
    if (rule.pointsFormula) {
      const formulaIssue = validateFormulaExpression(rule.pointsFormula, questionIds, variableIds);
      if (formulaIssue) return { error: `Scoring rule ${rule.id}: ${formulaIssue}` };
    }
  }
  for (const rule of definition.disqualifiers ?? []) {
    if (rule.priority !== undefined && (typeof rule.priority !== "number" || !Number.isFinite(rule.priority))) return { error: `Disqualifier ${rule.id} priority must be finite.` };
  }
  const thresholdIds = new Set<string>();
  for (const threshold of definition.thresholds ?? []) {
    if (!threshold || typeof threshold.id !== "string" || !threshold.id.trim() || threshold.id.length > 120 || thresholdIds.has(threshold.id)) {
      return { error: "Every threshold needs a unique id of 1–120 characters." };
    }
    thresholdIds.add(threshold.id);
    if (!Number.isInteger(threshold.minScore) || (threshold.maxScore !== undefined && !Number.isInteger(threshold.maxScore))) {
      return { error: `Threshold ${threshold.id} must use whole-number score limits.` };
    }
    if (threshold.maxScore !== undefined && threshold.maxScore < threshold.minScore) {
      return { error: `Threshold ${threshold.id} max score must be at least its min score.` };
    }
    if (!outcomeIds.has(threshold.outcomeId)) return { error: `Threshold ${threshold.id} points to a missing outcome.` };
    if (threshold.categoryId !== undefined && !categoryIds.has(threshold.categoryId)) return { error: `Threshold ${threshold.id} refers to a missing scoring category.` };
    if (threshold.priority !== undefined && (typeof threshold.priority !== "number" || !Number.isFinite(threshold.priority))) return { error: `Threshold ${threshold.id} priority must be finite.` };
  }
  if (definition.outcomes.length > 1 && (!definition.thresholds || definition.thresholds.length === 0)) {
    return { error: "Add at least one score threshold when a pack has multiple outcomes." };
  }

  if (
    definition.pricing?.isPaid &&
    (typeof definition.pricing.stripePriceId !== "string" || !definition.pricing.stripePriceId.trim())
  ) {
    return { error: "Add a Stripe price id before saving a paid pack." };
  }
  const logicError = analyzePackLogic(definition).find((diagnostic) => diagnostic.severity === "error");
  if (logicError) return { error: logicError.message };
  return { definition };
}
function isAnswered(value: unknown) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function validateQuestionAnswer(question: Question, value: unknown): string | null {
  const type = question.type;
  if (["boolean", "yesno", "yes_no", "true_false"].includes(type)) {
    return typeof value === "boolean" ? null : "Choose yes or no.";
  }
  if (["single", "select", "dropdown"].includes(type)) {
    if (typeof value !== "string" && typeof value !== "number") return "Choose one of the available options.";
    const allowed = (question.options ?? []).map((option) => String(option.value ?? option.id));
    return allowed.includes(String(value)) ? null : "Choose one of the available options.";
  }
  if (type === "multi") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" && typeof item !== "number")) {
      return "Choose valid options.";
    }
    const allowed = new Set((question.options ?? []).map((option) => String(option.value ?? option.id)));
    const selected = value.map(String);
    if (new Set(selected).size !== selected.length) return "Remove duplicate option selections.";
    return selected.every((item) => allowed.has(item)) ? null : "Choose valid options.";
  }
  if (["number", "percent", "scale_1_5", "scale_1_10"].includes(type)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a valid number.";
    if (question.min !== undefined && value < question.min) return `Enter a value of at least ${question.min}.`;
    if (question.max !== undefined && value > question.max) return `Enter a value no greater than ${question.max}.`;
    if (type === "percent" && (value < 0 || value > 100)) return "Enter a percentage from 0 to 100.";
    if (type === "scale_1_5" && (value < 1 || value > 5 || !Number.isInteger(value))) return "Choose a whole-number value from 1 to 5.";
    if (type === "scale_1_10" && (value < 1 || value > 10 || !Number.isInteger(value))) return "Choose a whole-number value from 1 to 10.";
    return null;
  }
  if (type === "date") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date.";
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? "Enter a valid date." : null;
  }
  if (["text", "short_text", "long_text"].includes(type)) {
    return typeof value === "string" && value.length <= 5000 ? null : "Enter a valid response.";
  }
  return "This answer type is not supported.";
}

function validateAnswers(definition: PackDefinition, value: unknown): { answers?: Answers; error?: string } {
  if (!isRecord(value) || Object.keys(value).length > 100) {
    return { error: "Please answer the quiz before continuing." };
  }
  const questionIds = new Set(definition.questions.map((question) => question.id));
  if (Object.keys(value).some((questionId) => !questionIds.has(questionId))) {
    return { error: "The submitted answers do not match this quiz." };
  }
  const rawAnswers = value as Answers;
  const visibleIds = getVisibleQuestionIds(definition, rawAnswers);
  const visibleAnswerEntries = Object.fromEntries(Object.entries(rawAnswers).filter(([questionId]) => visibleIds.includes(questionId))) as Answers;
  const variables = calculateVariables(definition, visibleAnswerEntries).values;
  const answers: Answers = {};

  for (const questionId of visibleIds) {
    const question = definition.questions.find((item) => item.id === questionId)!;
    const answer = rawAnswers[questionId];
    if (!isAnswered(answer)) {
      if (isQuestionRequired(question, visibleAnswerEntries, variables)) return { error: `Please answer: ${question.prompt}` };
      continue;
    }
    const issue = validateQuestionAnswer(question, answer);
    if (issue) return { error: `${question.prompt} ${issue}` };
    answers[questionId] = answer;
  }

  return { answers };
}

function formatFilenameTimestamp(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

let stripeClient: Stripe | null | undefined;

type ResultsEmailSender = typeof sendResultsEmail;
type LeadNotificationSender = typeof sendLeadNotification;

export type RouteDependencies = {
  storage?: IStorage;
  getStripeClient?: () => Stripe | null;
  sendResultsEmail?: ResultsEmailSender;
  sendLeadNotification?: LeadNotificationSender;
};

function getStripeClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: "2024-06-20",
  });
  return stripeClient;
}

async function checkoutHasExpectedPrice(stripe: Stripe, sessionId: string, expectedPriceId: string): Promise<boolean> {
  const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 });
  return !lineItems.has_more &&
    lineItems.data.length === 1 &&
    lineItems.data[0].price?.id === expectedPriceId &&
    lineItems.data[0].quantity === 1;
}

async function verifyPaidCheckoutSession(
  stripe: Stripe,
  sessionId: string,
  submission: Submission,
  workspaceId: string,
  packId: string,
  version: PackVersionRecord,
): Promise<Stripe.Checkout.Session | null> {
  const expectedPriceId = version.definition.pricing?.stripePriceId?.trim();
  if (
    !expectedPriceId ||
    !version.definition.pricing?.isPaid ||
    version.packId !== packId ||
    submission.workspaceId !== workspaceId ||
    submission.packId !== packId ||
    submission.packVersionId !== version.id ||
    !submission.completedAt ||
    submission.stripeSessionId !== sessionId
  ) {
    return null;
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (
    session.id !== sessionId ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.status !== "complete" ||
    !session.amount_total ||
    session.amount_total <= 0 ||
    session.metadata?.workspaceId !== workspaceId ||
    session.metadata?.packId !== packId ||
    session.metadata?.packVersionId !== version.id ||
    session.metadata?.submissionId !== submission.id ||
    session.client_reference_id !== submission.id
  ) {
    return null;
  }

  if (!await checkoutHasExpectedPrice(stripe, sessionId, expectedPriceId)) return null;

  return session;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  dependencies: RouteDependencies = {},
): Promise<Server> {
  const store = dependencies.storage ?? storage;
  const stripeProvider = dependencies.getStripeClient ?? getStripeClient;
  const adminKey = process.env.ADMIN_KEY?.trim() || (
    process.env.NODE_ENV === "development" ? "local-dev-admin-key" : undefined
  );
  const adminAuth = requireAdmin(adminKey);
  const publicReadLimit = createRateLimiter(300, 60_000);
  const publicStartLimit = createRateLimiter(30, 10 * 60_000);
  const publicSubmitLimit = createRateLimiter(30, 10 * 60_000);
  const publicCheckoutLimit = createRateLimiter(10, 10 * 60_000);

  app.post("/api/stripe/webhook", async (req, res) => {
    const stripe = stripeProvider();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.header("stripe-signature");
    const rawBody = (req as Request & { rawBody?: unknown }).rawBody;
    if (!stripe || !webhookSecret) {
      return res.status(503).json({ message: "Stripe webhook is not configured." });
    }
    if (!signature || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ message: "Invalid Stripe webhook request." });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      return res.status(400).json({ message: "Invalid Stripe webhook signature." });
    }

    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      return res.json({ received: true });
    }

    const eventSession = event.data.object as Stripe.Checkout.Session;
    const submissionId = eventSession.metadata?.submissionId;
    if (!submissionId) return res.json({ received: true, ignored: true });

    try {
      const submission = await store.getSubmission(submissionId);
      if (!submission) return res.json({ received: true, ignored: true });
      const [workspace, pack, version] = await Promise.all([
        store.getWorkspace(submission.workspaceId),
        store.getPack(submission.packId),
        store.getPackVersion(submission.packVersionId),
      ]);
      if (!workspace || !pack || pack.workspaceId !== workspace.id || !version) {
        return res.json({ received: true, ignored: true });
      }
      const session = await verifyPaidCheckoutSession(
        stripe,
        eventSession.id,
        submission,
        workspace.id,
        pack.id,
        version,
      );
      if (!session) return res.json({ received: true, ignored: true });
      await store.updateSubmission(submission.id, {
        paid: true,
        amountPaidCents: session.amount_total ?? 0,
        stripeSessionId: session.id,
      });
      return res.json({ received: true });
    } catch (error) {
      console.error("[stripe-webhook] Processing failed:", error);
      return res.status(500).json({ message: "Webhook processing failed." });
    }
  });

  app.get("/api/public/w/:workspaceSlug/:packSlug", publicReadLimit, async (req, res) => {
    const workspaceSlug = String(req.params.workspaceSlug);
    const packSlug = String(req.params.packSlug);
    const workspace = await store.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) {
      return res.status(404).json({ message: "Not found" });
    }

    const pack = await store.getPackBySlug(workspace.id, packSlug);
    if (!pack || !pack.publishedVersionId) {
      return res.status(404).json({ message: "Not found" });
    }

    const version = await store.getPackVersion(pack.publishedVersionId);
    if (!version) {
      return res.status(404).json({ message: "Not found" });
    }

    if (req.query.preview !== "1") await store.incrementPackViews(pack.id);

    return res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        logoUrl: workspace.logoUrl ?? null,
        primaryColor: workspace.primaryColor ?? null,
        secondaryColor: workspace.secondaryColor ?? null,
        brandSettings: workspace.brandSettings ?? {},
      },
      pack,
      version: {
        id: version.id,
        packId: version.packId,
        version: version.version,
        createdAt: version.createdAt,
      },
      definition: version.definition,
      publicAppUrlConfigured: Boolean(process.env.PUBLIC_APP_URL),
      emailConfigured: Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD &&
        process.env.EMAIL_FROM,
      ),
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    });
  });

  app.post("/api/public/w/:workspaceSlug/:packSlug/start", publicStartLimit, async (req, res) => {
    const workspace = await store.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });

    const pack = await store.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack?.publishedVersionId) return res.status(404).json({ message: "Not found" });

    const version = await store.getPackVersion(pack.publishedVersionId);
    if (!version) return res.status(404).json({ message: "Not found" });
    if (req.query.preview === "1") {
      return res.json({ preview: true, submissionId: null, packVersionId: version.id });
    }

    const submission = await store.createSubmission({
      workspaceId: workspace.id,
      packId: pack.id,
      packVersionId: version.id,
      answers: {},
    });
    return res.status(201).json({ submissionId: submission.id, packVersionId: version.id });
  });

  app.post(
    "/api/public/w/:workspaceSlug/:packSlug/checkout",
    publicCheckoutLimit,
    async (req, res) => {
      if (req.query.preview === "1") return res.status(400).json({ message: "Preview sessions cannot start checkout." });
      const workspaceSlug = String(req.params.workspaceSlug);
      const packSlug = String(req.params.packSlug);
      const { submissionId } = req.body ?? {};
      if (typeof submissionId !== "string" || !submissionId.trim()) {
        return res.status(400).json({ message: "A completed assessment is required before checkout." });
      }

      const workspace = await store.getWorkspaceBySlug(workspaceSlug);
      if (!workspace) return res.status(404).json({ message: "Not found" });
      const pack = await store.getPackBySlug(workspace.id, packSlug);
      if (!pack) return res.status(404).json({ message: "Not found" });
      const submission = await store.getSubmission(submissionId);
      if (!submission || submission.workspaceId !== workspace.id || submission.packId !== pack.id) {
        return res.status(404).json({ message: "Assessment session not found." });
      }
      if (!submission.completedAt || !submission.email) {
        return res.status(409).json({ message: "Complete the assessment and enter an email before checkout." });
      }
      const version = await store.getPackVersion(submission.packVersionId);
      if (!version || version.packId !== pack.id) return res.status(404).json({ message: "Assessment version not found." });
      const pricing = version.definition.pricing;
      if (!pricing?.isPaid) return res.status(400).json({ message: "This assessment does not have a paid report." });
      const stripePriceId = pricing.stripePriceId?.trim();
      if (!stripePriceId || !isValidStripePriceId(stripePriceId)) {
        return res.status(500).json({ message: "Stripe price is not configured." });
      }

      const publicAppUrl = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "");
      if (!publicAppUrl) return res.status(500).json({ message: "PUBLIC_APP_URL not configured" });
      const stripe = stripeProvider();
      if (!stripe || (!process.env.STRIPE_WEBHOOK_SECRET && !submission.stripeSessionId)) {
        return res.status(503).json({ message: "Stripe checkout is not fully configured." });
      }

      const paidReturnUrl = `${publicAppUrl}/w/${workspaceSlug}/${packSlug}?paid=1&submission_id=${encodeURIComponent(submission.id)}&session_id=`;
      if (submission.paid) {
        if (!submission.stripeSessionId) return res.status(409).json({ message: "Paid assessment has no verifiable Checkout Session." });
        let paidSession: Stripe.Checkout.Session | null;
        try {
          paidSession = await verifyPaidCheckoutSession(
            stripe,
            submission.stripeSessionId,
            submission,
            workspace.id,
            pack.id,
            version,
          );
        } catch {
          return res.status(503).json({ message: "Unable to verify this payment. Please retry shortly." });
        }
        if (!paidSession) return res.status(409).json({ message: "Payment could not be verified for this assessment." });
        return res.json({ url: `${paidReturnUrl}${encodeURIComponent(paidSession.id)}`, alreadyPaid: true });
      }

      let idempotencyKey = `qpp-checkout-${submission.id}`;
      if (submission.stripeSessionId) {
        let priorSession: Stripe.Checkout.Session;
        try {
          priorSession = await stripe.checkout.sessions.retrieve(submission.stripeSessionId);
        } catch {
          return res.status(503).json({ message: "Unable to verify the existing checkout session. Please retry shortly." });
        }
        const matches = priorSession.id === submission.stripeSessionId &&
          priorSession.mode === "payment" &&
          priorSession.client_reference_id === submission.id &&
          priorSession.metadata?.workspaceId === workspace.id &&
          priorSession.metadata?.packId === pack.id &&
          priorSession.metadata?.packVersionId === version.id &&
          priorSession.metadata?.submissionId === submission.id;
        if (!matches) return res.status(409).json({ message: "Checkout session does not match this assessment." });
        if (priorSession.payment_status === "paid") {
          let verifiedSession: Stripe.Checkout.Session | null;
          try {
            verifiedSession = await verifyPaidCheckoutSession(
              stripe,
              priorSession.id,
              submission,
              workspace.id,
              pack.id,
              version,
            );
          } catch {
            return res.status(503).json({ message: "Unable to verify the existing payment. Please retry shortly." });
          }
          if (!verifiedSession) return res.status(409).json({ message: "Checkout session does not match this assessment's configured price." });
          await store.updateSubmission(submission.id, {
            paid: true,
            amountPaidCents: verifiedSession.amount_total ?? 0,
            stripeSessionId: verifiedSession.id,
          });
          return res.json({ url: `${paidReturnUrl}${encodeURIComponent(verifiedSession.id)}`, alreadyPaid: true });
        }
        if (priorSession.status === "open" && priorSession.url) {
          let expectedPrice: boolean;
          try {
            expectedPrice = await checkoutHasExpectedPrice(stripe, priorSession.id, stripePriceId);
          } catch {
            return res.status(503).json({ message: "Unable to verify the existing checkout price. Please retry shortly." });
          }
          if (!expectedPrice) return res.status(409).json({ message: "Checkout session does not match this assessment's configured price." });
          return res.json({ url: priorSession.url, sessionId: priorSession.id, reused: true });
        }
        if (priorSession.status !== "expired") {
          return res.status(409).json({ message: "Payment is still processing. Please refresh in a moment." });
        }
        // One deterministic key per expired session makes concurrent retries converge
        // on the same new Stripe Checkout Session instead of creating duplicate charges.
        idempotencyKey = `qpp-checkout-${submission.id}-retry-${priorSession.id}`;
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{ price: stripePriceId, quantity: 1 }],
          customer_email: submission.email,
          client_reference_id: submission.id,
          metadata: {
            workspaceId: workspace.id,
            packId: pack.id,
            packVersionId: version.id,
            submissionId: submission.id,
          },
          success_url: `${publicAppUrl}/w/${workspaceSlug}/${packSlug}?paid=1&submission_id=${encodeURIComponent(submission.id)}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${publicAppUrl}/w/${workspaceSlug}/${packSlug}?paid=0&submission_id=${encodeURIComponent(submission.id)}`,
        }, { idempotencyKey });
        if (!session.url) return res.status(502).json({ message: "Stripe did not return a checkout URL." });
        await store.updateSubmission(submission.id, { stripeSessionId: session.id });
        return res.json({ url: session.url, sessionId: session.id });
      } catch (error) {
        console.error("[checkout] Stripe session creation failed:", error);
        return res.status(502).json({ message: "Unable to start secure checkout. Please retry." });
      }
    },
  );

  app.get("/api/public/w/:workspaceSlug/:packSlug/payment-return", publicReadLimit, async (req, res) => {
    const workspace = await store.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });
    const pack = await store.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack) return res.status(404).json({ message: "Not found" });

    const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
    const submissionId = typeof req.query.submission_id === "string" ? req.query.submission_id : "";
    if (!sessionId || !submissionId) return res.status(400).json({ message: "Payment session is incomplete." });
    const stripe = stripeProvider();
    if (!stripe) return res.status(503).json({ message: "Payment verification is temporarily unavailable." });

    try {
      const submission = await store.getSubmission(submissionId);
      if (!submission || submission.workspaceId !== workspace.id || submission.packId !== pack.id) {
        return res.status(404).json({ message: "Assessment not found." });
      }
      const version = await store.getPackVersion(submission.packVersionId);
      if (!version) return res.status(402).json({ message: "Payment could not be verified for this assessment." });
      const session = await verifyPaidCheckoutSession(
        stripe,
        sessionId,
        submission,
        workspace.id,
        pack.id,
        version,
      );
      if (!session) return res.status(402).json({ message: "Payment could not be verified for this assessment." });
      const validated = validateAnswers(version.definition, submission.answers);
      if (!validated.answers) return res.status(409).json({ message: "Saved assessment answers are invalid." });
      await store.updateSubmission(submission.id, {
        paid: true,
        amountPaidCents: session.amount_total ?? 0,
        stripeSessionId: session.id,
      });
      return res.json({
        success: true,
        paid: true,
        submissionId: submission.id,
        packVersionId: version.id,
        email: submission.email,
        firstName: submission.firstName,
        answers: validated.answers,
        evaluation: evaluatePack(version.definition, validated.answers),
      });
    } catch (error) {
      console.warn("[payment-return] Stripe verification failed:", error);
      return res.status(402).json({ message: "Payment could not be verified for this assessment." });
    }
  });

  app.get("/api/public/w/:workspaceSlug/:packSlug/restore", publicReadLimit, async (req, res) => {
    const workspace = await store.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });
    const pack = await store.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack) return res.status(404).json({ message: "Not found" });
    const submissionId = typeof req.query.submission_id === "string" ? req.query.submission_id : "";
    if (!submissionId) return res.status(400).json({ message: "Assessment reference is missing." });
    const submission = await store.getSubmission(submissionId);
    if (
      !submission ||
      submission.workspaceId !== workspace.id ||
      submission.packId !== pack.id ||
      !submission.completedAt
    ) {
      return res.status(404).json({ message: "Saved assessment not found." });
    }
    const version = await store.getPackVersion(submission.packVersionId);
    if (!version || version.packId !== pack.id) return res.status(404).json({ message: "Saved assessment version not found." });
    const validated = validateAnswers(version.definition, submission.answers);
    if (!validated.answers) return res.status(409).json({ message: "Saved assessment answers are invalid." });
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.json({
      success: true,
      submissionId: submission.id,
      email: submission.email,
      firstName: submission.firstName,
      answers: validated.answers,
      evaluation: evaluatePack(version.definition, validated.answers),
    });
  });

  app.get("/api/public/w/:workspaceSlug/:packSlug/pdf", publicReadLimit, async (req, res) => {
    const workspace = await store.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });
    const pack = await store.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack) return res.status(404).json({ message: "Not found" });

    const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
    const submissionId = typeof req.query.submission_id === "string" ? req.query.submission_id : "";
    let version: PackVersionRecord | undefined;
    let safeAnswers: Answers;
    if (sessionId || submissionId) {
      if (!sessionId || !submissionId) return res.status(400).json({ message: "Payment session is incomplete." });
      const stripe = stripeProvider();
      if (!stripe) return res.status(503).json({ message: "Stripe not configured" });
      try {
        const submission = await store.getSubmission(submissionId);
        if (!submission || submission.workspaceId !== workspace.id || submission.packId !== pack.id) {
          return res.status(404).json({ message: "Not found" });
        }
        version = await store.getPackVersion(submission.packVersionId);
        if (!version) return res.status(402).json({ message: "Payment required" });
        const session = await verifyPaidCheckoutSession(
          stripe,
          sessionId,
          submission,
          workspace.id,
          pack.id,
          version,
        );
        if (!session) return res.status(402).json({ message: "Payment required" });
        const validated = validateAnswers(version.definition, submission.answers);
        if (!validated.answers) return res.status(409).json({ message: "Saved assessment answers are invalid." });
        safeAnswers = validated.answers;
        await store.updateSubmission(submission.id, {
          paid: true,
          amountPaidCents: session.amount_total ?? 0,
          stripeSessionId: session.id,
        });
      } catch (error) {
        console.warn("[pdf] Stripe verification failed:", error);
        return res.status(402).json({ message: "Payment required" });
      }
    } else {
      if (req.query.preview === "1") return res.status(400).json({ message: "Preview reports are not available." });
      if (!pack.publishedVersionId) return res.status(404).json({ message: "Not found" });
      version = await store.getPackVersion(pack.publishedVersionId);
      if (!version || version.packId !== pack.id) return res.status(404).json({ message: "Not found" });
      if (version.definition.pricing?.isPaid) return res.status(402).json({ message: "Payment required" });
      const rawAnswers = parseAnswers(req.query.answers);
      if (!rawAnswers) return res.status(400).json({ message: "Invalid answers" });
      const validated = validateAnswers(version.definition, rawAnswers);
      if (!validated.answers) return res.status(400).json({ message: validated.error ?? "Invalid answers" });
      safeAnswers = validated.answers;
    }

    const evaluation = evaluatePack(version.definition, safeAnswers);
    const now = new Date();
    const safeFilenameSlug = (slug: string) => slug.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
    const filename = `qproquo-${safeFilenameSlug(workspace.slug)}-${safeFilenameSlug(pack.slug)}-${formatFilenameTimestamp(now)}.pdf`;
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    try {
      await renderAssessmentPdf(doc, {
        workspace: {
          name: workspace.name,
          slug: workspace.slug,
          logoUrl: workspace.logoUrl ?? null,
          primaryColor: workspace.primaryColor ?? null,
          secondaryColor: workspace.secondaryColor ?? null,
          brandSettings: workspace.brandSettings ?? {},
        },
        pack: { name: pack.name, slug: pack.slug },
        version: { version: version.version, createdAt: version.createdAt },
        definition: version.definition,
        answers: safeAnswers,
        evaluation: {
          score: evaluation.score,
          reasons: evaluation.reasons,
          outcome: evaluation.outcome,
          disqualified: evaluation.disqualified,
        },
        timestamp: now,
      });
    } catch (error) {
      console.warn("[pdf] Report rendering failed:", error);
      doc.end();
      return res.status(500).json({ message: "Unable to generate report." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    doc.pipe(res);
    doc.end();
  });

  app.get("/api/admin/workspaces", adminAuth, async (_req, res) => {
    const workspaces = await store.listWorkspaces();
    return res.json({ workspaces });
  });

  // Internal entitlement assignment hook for a future billing provider. No checkout,
  // subscription, or charge is activated here; advanced logic remains available on every plan.
  app.put("/api/admin/workspaces/:id/entitlements", adminAuth, async (req, res) => {
    const plan = req.body?.brandPlan as unknown;
    if (!["free", "pro", "agency", "legacy"].includes(String(plan))) {
      return res.status(400).json({ message: "brandPlan must be free, pro, agency, or legacy." });
    }
    const existingWorkspace = await store.getWorkspace(String(req.params.id));
    if (!existingWorkspace) return res.status(404).json({ message: "Workspace not found." });
    const targetEntitlements = getFeatureEntitlements(plan as BrandPlan);
    const workspaceBranding = {
      ...(existingWorkspace.brandSettings ?? {}),
      ...(existingWorkspace.logoUrl ? { logoUrl: existingWorkspace.logoUrl } : {}),
      ...(existingWorkspace.primaryColor ? { primaryColor: existingWorkspace.primaryColor } : {}),
      ...(existingWorkspace.secondaryColor ? { secondaryColor: existingWorkspace.secondaryColor } : {}),
    };
    const workspaceIssues = getBrandEntitlementIssues(workspaceBranding, targetEntitlements);
    if (workspaceIssues.length) return res.status(409).json({ code: "branding_entitlement_required", message: `Cannot assign this tier while workspace branding uses gated features. ${workspaceIssues.join(" ")}` });
    const packs = await store.listPacks(existingWorkspace.id);
    for (const pack of packs) {
      if (!pack.publishedVersionId) continue;
      const version = await store.getPackVersion(pack.publishedVersionId);
      if (!version) continue;
      const packIssues = getBrandEntitlementIssues(version.definition.branding, targetEntitlements);
      if (packIssues.length) return res.status(409).json({ code: "branding_entitlement_required", message: `Cannot assign this tier while published assessment “${pack.name}” uses gated branding. ${packIssues.join(" ")}` });
    }
    const workspace = await store.updateWorkspace(existingWorkspace.id, { brandPlan: plan as BrandPlan });
    if (!workspace) return res.status(404).json({ message: "Workspace not found." });
    return res.json({ brandPlan: workspace.brandPlan, entitlements: getFeatureEntitlements(workspace.brandPlan) });
  });

  app.post("/api/admin/workspaces", adminAuth, async (req, res) => {
    const { name, slug, logoUrl, primaryColor, secondaryColor, brandSettings } = req.body ?? {};
    if (
      typeof name !== "string" || !name.trim() || name.trim().length > 120 || !isValidSlug(slug) ||
      !isValidLogoUrl(logoUrl) || !isValidColor(primaryColor) || !isValidColor(secondaryColor)
    ) {
      return res.status(400).json({ message: "Use a workspace name (up to 120 characters), a lowercase URL-safe slug, HTTPS logo URL, and valid hex colors." });
    }
    const brandingIssue = validateBrandingShape(brandSettings);
    if (brandingIssue) return res.status(400).json({ message: brandingIssue });
    const candidateBranding = {
      ...(isRecord(brandSettings) ? brandSettings : {}),
      ...(logoUrl ? { logoUrl } : {}),
      ...(primaryColor ? { primaryColor } : {}),
      ...(secondaryColor ? { secondaryColor } : {}),
    };
    const entitlementIssues = getBrandEntitlementIssues(candidateBranding, getFeatureEntitlements("free"));
    if (entitlementIssues.length > 0) return res.status(403).json({ code: "branding_entitlement_required", message: entitlementIssues.join(" ") });

    try {
      const workspace = await store.createWorkspace({
        name: name.trim(),
        slug,
        logoUrl,
        primaryColor,
        secondaryColor,
        brandSettings: brandSettings as PackBranding | undefined,
      });
      return res.status(201).json({ workspace });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to create",
      });
    }
  });

  app.put("/api/admin/workspaces/:id", adminAuth, async (req, res) => {
    const id = String(req.params.id);
    const { name, slug, logoUrl, primaryColor, secondaryColor, brandSettings } = req.body ?? {};
    if (
      name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 120) ||
      slug !== undefined && !isValidSlug(slug) ||
      !isValidLogoUrl(logoUrl) || !isValidColor(primaryColor) || !isValidColor(secondaryColor)
    ) {
      return res.status(400).json({ message: "Workspace updates must use a valid name, lowercase slug, HTTPS logo URL, and hex colors." });
    }
    const brandingIssue = validateBrandingShape(brandSettings);
    if (brandingIssue) return res.status(400).json({ message: brandingIssue });
    const existingWorkspace = await store.getWorkspace(id);
    if (!existingWorkspace) return res.status(404).json({ message: "Not found" });
    const finalLogoUrl = logoUrl === undefined ? existingWorkspace.logoUrl : logoUrl;
    const finalPrimaryColor = primaryColor === undefined ? existingWorkspace.primaryColor : primaryColor;
    const finalSecondaryColor = secondaryColor === undefined ? existingWorkspace.secondaryColor : secondaryColor;
    const effectiveBrandSettings = isRecord(brandSettings) ? brandSettings : existingWorkspace.brandSettings ?? {};
    const candidateBranding = {
      ...effectiveBrandSettings,
      logoUrl: effectiveBrandSettings.logoUrl ?? (finalLogoUrl || undefined),
      primaryColor: effectiveBrandSettings.primaryColor ?? (finalPrimaryColor || undefined),
      secondaryColor: effectiveBrandSettings.secondaryColor ?? (finalSecondaryColor || undefined),
    };
    const entitlementIssues = getBrandEntitlementIssues(candidateBranding, getFeatureEntitlements(existingWorkspace.brandPlan));
    if (entitlementIssues.length > 0) return res.status(403).json({ code: "branding_entitlement_required", message: entitlementIssues.join(" "), entitlements: getFeatureEntitlements(existingWorkspace.brandPlan) });

    try {
      const workspace = await store.updateWorkspace(id, {
        name: typeof name === "string" ? name.trim() : undefined,
        slug,
        logoUrl,
        primaryColor,
        secondaryColor,
        brandSettings: brandSettings as PackBranding | undefined,
      });
      if (!workspace) {
        return res.status(404).json({ message: "Not found" });
      }
      return res.json({ workspace });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to update",
      });
    }
  });

  app.get(
    "/api/admin/workspaces/:workspaceId/packs",
    adminAuth,
    async (req, res) => {
      const workspaceId = String(req.params.workspaceId);
      const packs = await store.listPacks(workspaceId);
      return res.json({ packs });
    },
  );

  app.post(
    "/api/admin/workspaces/:workspaceId/packs",
    adminAuth,
    async (req, res) => {
      const workspaceId = String(req.params.workspaceId);
      const { name, slug, isPaid, stripePriceId } = req.body ?? {};

      if (
        typeof name !== "string" || !name.trim() || name.trim().length > 120 || !isValidSlug(slug) ||
        isPaid !== undefined && typeof isPaid !== "boolean" || !isValidStripePriceId(stripePriceId)
      ) {
        return res.status(400).json({ message: "Use a pack name (up to 120 characters), a lowercase URL-safe slug, boolean paid status, and valid Stripe price ID." });
      }
      const workspace = await store.getWorkspace(workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      try {
        const pack = await store.createPack({
          workspaceId,
          name: name.trim(),
          slug,
          isPaid: Boolean(isPaid),
          stripePriceId: stripePriceId ?? null,
        });
        return res.status(201).json({ pack });
      } catch (error) {
        return res.status(400).json({
          message: error instanceof Error ? error.message : "Unable to create",
        });
      }
    },
  );

  app.put("/api/admin/packs/:id", adminAuth, async (req, res) => {
    const id = String(req.params.id);
    const { name, slug, isPaid, stripePriceId } = req.body ?? {};
    if (
      name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 120) ||
      slug !== undefined && !isValidSlug(slug) ||
      isPaid !== undefined && typeof isPaid !== "boolean" ||
      !isValidStripePriceId(stripePriceId)
    ) {
      return res.status(400).json({ message: "Pack updates must use a valid name, lowercase slug, boolean paid status, and Stripe price ID." });
    }

    try {
      const pack = await store.updatePack(id, {
        name: typeof name === "string" ? name.trim() : undefined,
        slug,
        isPaid,
        stripePriceId,
      });
      if (!pack) {
        return res.status(404).json({ message: "Not found" });
      }
      return res.json({ pack });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to update",
      });
    }
  });

  app.get("/api/admin/packs/:packId/versions", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const versions = await store.listPackVersions(packId);
    return res.json({ versions });
  });

  app.post("/api/admin/packs/:packId/clone", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const { newName, newSlug, targetWorkspaceId } = req.body ?? {};
    if (
      typeof newName !== "string" || !newName.trim() || newName.trim().length > 120 ||
      !isValidSlug(newSlug) ||
      targetWorkspaceId !== undefined && typeof targetWorkspaceId !== "string"
    ) {
      return res.status(400).json({ message: "Use a pack name (up to 120 characters), lowercase URL-safe slug, and valid target workspace id." });
    }

    const sourcePack = await store.getPack(packId);
    if (!sourcePack || !sourcePack.publishedVersionId) {
      return res.status(404).json({ message: "Not found" });
    }

    const sourceVersion = await store.getPackVersion(
      sourcePack.publishedVersionId,
    );
    if (!sourceVersion) {
      return res.status(400).json({ message: "Source pack not published" });
    }
    const sourceDefinition = validatePackDefinition(sourceVersion.definition);
    if (!sourceDefinition.definition) {
      return res.status(400).json({ message: sourceDefinition.error ?? "Source pack definition is invalid." });
    }

    const workspaceId = typeof targetWorkspaceId === "string"
      ? targetWorkspaceId
      : sourcePack.workspaceId;
    const workspace = await store.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const entitlementIssues = getBrandEntitlementIssues(sourceDefinition.definition.branding, getFeatureEntitlements(workspace.brandPlan));
    if (entitlementIssues.length > 0) return res.status(403).json({ code: "branding_entitlement_required", message: entitlementIssues.join(" ") });

    const pricing = sourceVersion.definition.pricing;
    const isPaid = Boolean(pricing?.isPaid);
    const stripePriceId = pricing?.stripePriceId ?? null;

    try {
      const pack = await store.createPack({
        workspaceId,
        name: newName.trim(),
        slug: newSlug,
        isPaid,
        stripePriceId,
      });

      const version = await store.createPackVersion({
        packId: pack.id,
        version: 1,
        definition: sourceDefinition.definition,
      });

      await store.publishVersion(pack.id, version.id);

      return res.status(201).json({ pack, version });
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "Unable to clone pack",
      });
    }
  });

  app.post(
    "/api/admin/packs/:packId/versions",
    adminAuth,
    async (req, res) => {
      const packId = String(req.params.packId);
      const { version, definition } = req.body ?? {};

      const validation = validatePackDefinition(definition);
      if (!validation.definition) {
        return res.status(400).json({ message: validation.error ?? "Invalid definition" });
      }
      const pack = await store.getPack(packId);
      if (!pack) return res.status(404).json({ message: "Pack not found" });
      const workspace = await store.getWorkspace(pack.workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });
      const entitlementIssues = getBrandEntitlementIssues(validation.definition.branding, getFeatureEntitlements(workspace.brandPlan));
      if (entitlementIssues.length > 0) return res.status(403).json({ code: "branding_entitlement_required", message: entitlementIssues.join(" "), entitlements: getFeatureEntitlements(workspace.brandPlan) });

      if (version !== undefined && (!Number.isSafeInteger(version) || version < 1)) {
        return res.status(400).json({ message: "Version must be a positive whole number." });
      }
      const existing = await store.listPackVersions(packId);
      const nextVersion = version ?? existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;
      if (!Number.isSafeInteger(nextVersion) || nextVersion < 1) {
        return res.status(400).json({ message: "Unable to calculate a valid next version." });
      }

      try {
        const created = await store.createPackVersion({
          packId,
          version: nextVersion,
          definition: validation.definition!,
        });
        return res.status(201).json({ version: created });
      } catch (error) {
        return res.status(400).json({
          message: error instanceof Error ? error.message : "Unable to create",
        });
      }
    },
  );

  app.post(
    "/api/admin/packs/:packId/publish/:versionId",
    adminAuth,
    async (req, res) => {
      const packId = String(req.params.packId);
      const versionId = String(req.params.versionId);
      const existingPack = await store.getPack(packId);
      const version = await store.getPackVersion(versionId);
      if (!existingPack || !version || version.packId !== existingPack.id) return res.status(404).json({ message: "Not found" });
      const workspace = await store.getWorkspace(existingPack.workspaceId);
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });
      const entitlementIssues = getBrandEntitlementIssues(version.definition.branding, getFeatureEntitlements(workspace.brandPlan));
      if (entitlementIssues.length > 0) return res.status(403).json({ code: "branding_entitlement_required", message: entitlementIssues.join(" ") });
      const pack = await store.publishVersion(packId, versionId);
      if (!pack) return res.status(404).json({ message: "Not found" });
      return res.json({ pack });
    },
  );

  // The browser collects answers and contact details, but score/outcome are always
  // recomputed here so the submitted lead cannot alter its own qualification.
  app.post("/api/public/w/:workspaceSlug/:packSlug/submit", publicSubmitLimit, async (req, res) => {
    const workspace = await store.getWorkspaceBySlug(String(req.params.workspaceSlug));
    if (!workspace) return res.status(404).json({ message: "Not found" });
    const pack = await store.getPackBySlug(workspace.id, String(req.params.packSlug));
    if (!pack) return res.status(404).json({ message: "Not found" });

    const { submissionId, email, firstName, answers: rawAnswers } = req.body ?? {};
    if (req.query.preview === "1") {
      const previewVersion = pack.publishedVersionId
        ? await store.getPackVersion(pack.publishedVersionId)
        : undefined;
      if (!previewVersion) return res.status(404).json({ message: "Not found" });
      const previewAnswers = validateAnswers(previewVersion.definition, rawAnswers);
      if (!previewAnswers.answers) return res.status(400).json({ message: previewAnswers.error ?? "Invalid answers." });
      return res.json({
        id: null,
        success: true,
        preview: true,
        evaluation: evaluatePack(previewVersion.definition, previewAnswers.answers),
        emailConfigured: false,
      });
    }
    if (typeof submissionId !== "string" || !submissionId.trim()) {
      return res.status(400).json({ message: "Start the assessment before submitting results." });
    }
    const existingSubmission = await store.getSubmission(submissionId);
    if (
      !existingSubmission ||
      existingSubmission.workspaceId !== workspace.id ||
      existingSubmission.packId !== pack.id
    ) {
      return res.status(404).json({ message: "Quiz session not found. Please start again." });
    }
    const version = await store.getPackVersion(existingSubmission.packVersionId);
    if (!version || version.packId !== pack.id) {
      return res.status(404).json({ message: "Quiz version not found." });
    }
    const validated = validateAnswers(version.definition, rawAnswers);
    if (!validated.answers) return res.status(400).json({ message: validated.error ?? "Invalid answers." });
    const answers = validated.answers;
    const evaluation = evaluatePack(version.definition, answers);
    const isPaidReport = Boolean(version.definition.pricing?.isPaid);
    const emailConfigured = !isPaidReport && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.EMAIL_FROM);

    // Submissions are immutable after their first completion. This makes retries safe
    // and prevents a repeat request from changing the lead's identity or answers.
    if (existingSubmission.completedAt) {
      return res.json({
        id: existingSubmission.id,
        success: true,
        evaluation: evaluatePack(version.definition, existingSubmission.answers as Answers),
        emailConfigured,
      });
    }

    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    if (!normalizedEmail || normalizedEmail.length > 320 || !EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: "A valid email address is required to unlock results." });
    }
    if (firstName !== undefined && firstName !== null && (typeof firstName !== "string" || firstName.trim().length > 100)) {
      return res.status(400).json({ message: "First name must be 100 characters or fewer." });
    }

    let submission: Submission | undefined;
    let newlyCompleted = false;
    try {
      const completed = await store.completeSubmission(existingSubmission.id, {
        email: normalizedEmail,
        firstName: typeof firstName === "string" && firstName.trim() ? firstName.trim() : null,
        answers,
        score: evaluation.score,
        outcomeId: evaluation.outcome?.id ?? null,
        outcomeLabel: evaluation.outcome?.title ?? null,
        paid: false,
        amountPaidCents: 0,
        stripeSessionId: null,
      });
      submission = completed.submission;
      newlyCompleted = completed.newlyCompleted;
      if (!submission) throw new Error("Quiz session is no longer available");
    } catch (error) {
      console.error("[submit] save failed:", error);
      return res.status(500).json({ message: "We couldn't save your results. Please try again." });
    }

    if (!newlyCompleted) {
      return res.json({
        id: submission.id,
        success: true,
        evaluation: evaluatePack(version.definition, submission.answers as Answers),
        emailConfigured,
      });
    }

    // Result delivery is asynchronous so the visitor can see results immediately.
    // The lead remains saved even if SMTP is not configured or temporarily unavailable.
    (async () => {
      try {
        const emailModule = dependencies.sendResultsEmail && dependencies.sendLeadNotification
          ? null
          : await import("./email");
        const sendResults = dependencies.sendResultsEmail ?? emailModule!.sendResultsEmail;
        const notifyLead = dependencies.sendLeadNotification ?? emailModule!.sendLeadNotification;
        let pdfSent = false;
        if (!isPaidReport) {
          const doc = new PDFDocument({ size: "LETTER", margin: 48 });
          const chunks: Buffer[] = [];
          doc.on("data", (chunk: Buffer) => chunks.push(chunk));
          await new Promise<void>((resolve, reject) => {
            doc.on("end", resolve);
            doc.on("error", reject);
            renderAssessmentPdf(doc, {
              workspace: {
                name: workspace.name,
                slug: workspace.slug,
                logoUrl: workspace.logoUrl ?? null,
                primaryColor: workspace.primaryColor ?? null,
                secondaryColor: workspace.secondaryColor ?? null,
              },
              pack: { name: pack.name, slug: pack.slug },
              version: { version: version.version, createdAt: version.createdAt },
              definition: version.definition,
              answers,
              evaluation: {
                score: evaluation.score,
                reasons: evaluation.reasons,
                outcome: evaluation.outcome,
                disqualified: evaluation.disqualified,
              },
              timestamp: new Date(),
            }).then(() => doc.end()).catch(reject);
          });

          pdfSent = await sendResults({
            to: normalizedEmail,
            firstName: submission.firstName ?? undefined,
            packName: pack.name,
            outcomeLabel: evaluation.outcome?.title ?? "Your Results",
            outcomeMessage: evaluation.outcome?.description ?? "",
            score: evaluation.score,
            pdfBuffer: Buffer.concat(chunks),
            workspaceName: workspace.name,
            packSlug: pack.slug,
          });
        }
        await notifyLead({
          packName: pack.name,
          workspaceName: workspace.name,
          leadEmail: normalizedEmail,
          leadFirstName: submission.firstName ?? undefined,
          score: evaluation.score,
          outcomeLabel: evaluation.outcome?.title ?? "Unknown",
          submissionId: submission.id,
        });
        if (pdfSent) await store.updateSubmission(submission.id, { pdfSent: true });
      } catch (emailError) {
        console.error("[submit] Email delivery failed:", emailError);
      }
    })();

    return res.json({
      id: submission.id,
      success: true,
      evaluation,
      emailConfigured,
    });
  });

  // ─── NEW: Admin submission/stats endpoints ──────────────────────────────────

  app.get("/api/admin/workspaces/:workspaceId/submissions", adminAuth, async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const requestedLimit = Number(req.query.limit ?? 50);
    const requestedOffset = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
    const all = await store.getSubmissionsByWorkspace(workspaceId);
    return res.json({
      submissions: all.slice(offset, offset + limit).map(safeAdminSubmission),
      total: all.length,
    });
  });

  app.get("/api/admin/packs/:packId/stats", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const pack = await store.getPack(packId);
    if (!pack) return res.status(404).json({ message: "Pack not found" });
    return res.json(await store.getPackStats(packId));
  });

  app.get("/api/admin/packs/:packId/submissions", adminAuth, async (req, res) => {
    const packId = String(req.params.packId);
    const pack = await store.getPack(packId);
    if (!pack) return res.status(404).json({ message: "Pack not found" });
    const submissions = await store.getSubmissionsByPack(packId);
    return res.json(submissions.map(safeAdminSubmission));
  });

  app.get("/api/admin/workspaces/:workspaceId/stats", adminAuth, async (req, res) => {
    const workspaceId = String(req.params.workspaceId);
    const stats = await store.getWorkspaceStats(workspaceId);
    return res.json(stats);
  });

  app.get("/api/admin/submissions/:id", adminAuth, async (req, res) => {
    const id = String(req.params.id);
    const submission = await store.getSubmission(id);
    if (!submission) return res.status(404).json({ message: "Not found" });
    return res.json(safeAdminSubmission(submission));
  });

  return httpServer;
}
