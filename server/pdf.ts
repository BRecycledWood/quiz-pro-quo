import PDFDocument from "pdfkit";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { PackBranding, PackDefinition, Answers, Outcome, Question } from "@shared/pack";
import { resolvePackBranding } from "@shared/branding";

export type PdfWorkspace = {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  brandSettings?: PackBranding;
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
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(trimmed) ? trimmed : fallback;
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168 || b === 88 && address.split(".")[2] === "99")) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51 && address.split(".")[2] === "100")) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("::ffff:")) return isPublicAddress(normalized.slice(7));
    // Only global-unicast addresses are considered routable. Exclude known
    // transition, benchmark, documentation, and special-purpose allocations.
    const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
    if (firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
    if (/^(?:2001:0(?::|$)|2001:2(?::|$)|2001:10(?::|$)|2001:20(?::|$)|2001:db8(?::|$)|2002:|3fff:)/.test(normalized)) return false;
    return true;
  }
  return false;
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
    const url = new URL(logoUrl);
    if (url.protocol !== "https:" || url.username || url.password || (url.port !== "" && url.port !== "443")) return null;
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) return null;
    const address = addresses[0];

    return await new Promise<Buffer | null>((resolve) => {
      const request = https.get(url, {
        timeout: 3_000,
        headers: { accept: "image/png,image/jpeg" },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, addresses);
          } else {
            callback(null, address.address, address.family);
          }
        },
      }, (response) => {
        const contentType = String(response.headers["content-type"] ?? "").split(";")[0].toLowerCase();
        if (response.statusCode !== 200 || !["image/png", "image/jpeg"].includes(contentType)) {
          response.destroy();
          resolve(null);
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > 2 * 1024 * 1024) {
            response.destroy(new Error("Logo image is too large"));
            resolve(null);
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const image = Buffer.concat(chunks);
          const isPng = image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
          const isJpeg = image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
          resolve(isPng || isJpeg ? image : null);
        });
        response.on("error", () => resolve(null));
      });
      request.on("timeout", () => request.destroy(new Error("Logo request timed out")));
      request.on("error", () => resolve(null));
    });
  } catch {
    return null;
  }
}

function decodeLogoDataUrl(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length > 700_000) return null;
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 512 * 1024) return null;
  const isPng = match[1] === "png" && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = match[1] === "jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return isPng || isJpeg ? bytes : null;
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
  const branding = resolvePackBranding(data.workspace, data.definition.branding);
  const primary = normalizeColor(branding.primaryColor, "#4f46e5");
  const secondary = normalizeColor(branding.secondaryColor, "#64748b");
  const brandName = branding.brandName || data.workspace.name;

  doc.rect(0, 0, doc.page.width, 110).fill(primary);
  doc.fillColor("#ffffff");

  const logoBuffer = decodeLogoDataUrl(branding.logoDataUrl) ?? (branding.logoUrl
    ? await fetchLogoBuffer(branding.logoUrl)
    : null);

  const headerY = 30;
  const leftMargin = doc.page.margins.left;

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, leftMargin, headerY, { width: 50, height: 50 });
      doc.fontSize(22).text(brandName, leftMargin + 64, headerY + 8, {
        continued: false,
      });
    } catch (error) {
      doc.fontSize(22).text(brandName, leftMargin, headerY + 8);
    }
  } else {
    doc.fontSize(22).text(brandName, leftMargin, headerY + 8);
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
