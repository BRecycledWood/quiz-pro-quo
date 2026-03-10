import PDFDocument from "pdfkit";
import type { PackDefinition, Answers, Outcome, Question } from "@shared/pack";

export type PdfWorkspace = {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

export type PdfPack = {
  name: string;
  slug: string;
};

export type PdfVersion = {
  version: number;
  createdAt: Date | string;
};

export type PdfEvaluation = {
  score: number;
  reasons: string[];
  outcome: Outcome | null;
  disqualified: boolean;
};

type PdfDoc = InstanceType<typeof PDFDocument>;

type PrimitiveAnswer = string | number | boolean;

function normalizeColor(color: string | null | undefined, fallback: string) {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function formatTimestamp(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function renderAnswer(question: Question, answer: Answers[string]): string {
  if (answer === null || answer === undefined) return "";

  const type = question.type;
  const options = question.options ?? [];

  const findLabel = (value: string) => {
    const option = options.find(
      (item) => (item.value ?? item.id) === value || item.id === value,
    );
    return option?.label ?? value;
  };

  if (type === "boolean" || type === "yesno") {
    return answer === true ? "Yes" : "No";
  }

  if (type === "number") {
    return typeof answer === "number" ? String(answer) : String(answer);
  }

  if (type === "single" || type === "select") {
    return typeof answer === "string" ? findLabel(answer) : String(answer);
  }

  if (Array.isArray(answer)) {
    return answer
      .map((item) => (typeof item === "string" ? findLabel(item) : String(item)))
      .join(", ");
  }

  return typeof answer === "string" ? answer : String(answer);
}

async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    return null;
  }
}

export async function renderAssessmentPdf(
  doc: PdfDoc,
  data: {
    workspace: PdfWorkspace;
    pack: PdfPack;
    version: PdfVersion;
    definition: PackDefinition;
    answers: Answers;
    evaluation: PdfEvaluation;
    timestamp: Date;
  },
): Promise<void> {
  const primary = normalizeColor(data.workspace.primaryColor, "#0f172a");
  const secondary = normalizeColor(data.workspace.secondaryColor, "#64748b");

  doc.rect(0, 0, doc.page.width, 110).fill(primary);
  doc.fillColor("#ffffff");

  const logoBuffer = data.workspace.logoUrl
    ? await fetchLogoBuffer(data.workspace.logoUrl)
    : null;

  const headerY = 30;
  const leftMargin = doc.page.margins.left;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, leftMargin, headerY, { width: 50, height: 50 });
      doc.fontSize(22).text(data.workspace.name, leftMargin + 64, headerY + 8, {
        continued: false,
      });
    } catch (error) {
      doc.fontSize(22).text(data.workspace.name, leftMargin, headerY + 8);
    }
  } else {
    doc.fontSize(22).text(data.workspace.name, leftMargin, headerY + 8);
  }

  doc
    .fontSize(12)
    .text(
      `${data.pack.name} · v${data.version.version}`,
      leftMargin,
      headerY + 40,
    );

  doc
    .fontSize(10)
    .text(formatTimestamp(data.timestamp), leftMargin, headerY + 60);

  doc.moveDown(2);
  doc.fillColor(primary);
  doc.fontSize(16).text("Assessment Results", { underline: false });
  doc.moveDown(0.5);

  const outcome = data.evaluation.outcome;
  const outcomeTitle = outcome?.title ?? "No outcome";
  const outcomeBody = outcome?.description ?? "";

  doc.fontSize(14).fillColor(primary).text(outcomeTitle);
  if (outcomeBody) {
    doc.fillColor(secondary).fontSize(11).text(outcomeBody);
  }

  const actions: Array<{ label: string; url?: string }> = [];
  if (outcome?.ctaLabel) {
    actions.push({ label: outcome.ctaLabel, url: outcome.ctaUrl });
  }

  const metaActions = (outcome?.metadata as Record<string, unknown> | undefined)
    ?.actions;
  if (Array.isArray(metaActions)) {
    metaActions.forEach((action) => {
      if (action && typeof action === "object") {
        const label = "label" in action ? String(action.label ?? "") : "";
        const url = "url" in action ? String(action.url ?? "") : undefined;
        if (label) actions.push({ label, url });
      }
    });
  }

  doc.moveDown(0.5);
  doc.fillColor(primary).fontSize(12).text("Score");
  doc.fillColor(secondary).fontSize(11).text(String(data.evaluation.score));

  if (data.evaluation.reasons.length > 0) {
    doc.moveDown(0.5);
    doc.fillColor(primary).fontSize(12).text("Reasons");
    doc.fillColor(secondary).fontSize(11);
    data.evaluation.reasons.forEach((reason) => {
      doc.text(`• ${reason}`);
    });
  }

  if (actions.length > 0) {
    doc.moveDown(0.5);
    doc.fillColor(primary).fontSize(12).text("Actions");
    doc.fillColor(secondary).fontSize(11);
    actions.forEach((action) => {
      doc.text(action.url ? `${action.label} — ${action.url}` : action.label);
    });
  }

  doc.moveDown(1);
  doc.fillColor(primary).fontSize(14).text("Responses");
  doc.moveDown(0.5);

  const answeredQuestions = data.definition.questions.filter((question) => {
    const value = data.answers[question.id];
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });

  answeredQuestions.forEach((question) => {
    const answer = renderAnswer(question, data.answers[question.id]);
    doc.fillColor(primary).fontSize(11).text(question.prompt);
    doc.fillColor(secondary).fontSize(10).text(answer || "-");
    doc.moveDown(0.4);
  });
}
