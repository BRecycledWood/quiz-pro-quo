import nodemailer from "nodemailer";

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  leadTo: string;
};

function getEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;

  if (!host || !user || !pass || !from) return null;

  const configuredPort = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65_535
    ? configuredPort
    : 587;
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user,
    pass,
    from,
    leadTo: process.env.LEAD_NOTIFICATION_EMAIL || from,
  };
}

function getTransporter() {
  const config = getEmailConfig();
  if (!config) return null;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
}

function outcomeColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("leader") || l.includes("pass") || l.includes("preferred") || l.includes("high")) return "#16a34a";
  if (l.includes("caution") || l.includes("aware") || l.includes("standard") || l.includes("moderate") || l.includes("review")) return "#d97706";
  return "#dc2626";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendResultsEmail(params: {
  to: string;
  firstName?: string;
  packName: string;
  outcomeLabel: string;
  outcomeMessage: string;
  score?: number;
  scoreMax?: number;
  pdfBuffer: Buffer;
  workspaceName: string;
  packSlug: string;
}): Promise<boolean> {
  const transporter = getTransporter();
  const config = getEmailConfig();
  if (!transporter) {
    console.warn("[email] SMTP email configuration not set — skipping sendResultsEmail");
    return false;
  }

  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi there,";
  const workspaceName = escapeHtml(params.workspaceName);
  const packName = escapeHtml(params.packName);
  const outcomeLabel = escapeHtml(params.outcomeLabel);
  const outcomeMessage = escapeHtml(params.outcomeMessage);
  const badgeColor = outcomeColor(params.outcomeLabel);
  const scoreHtml = params.score !== undefined && params.scoreMax !== undefined
    ? `<p style="font-size:15px;color:#374151;margin:16px 0;">Your Score: <strong>${params.score}/${params.scoreMax}</strong></p>`
    : params.score !== undefined
    ? `<p style="font-size:15px;color:#374151;margin:16px 0;">Your Score: <strong>${params.score}</strong></p>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:100%;">
        <tr><td style="background:#0f172a;padding:28px 32px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${workspaceName}</p>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${packName}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;color:#111827;margin:0 0 16px;">${greeting}</p>
          <p style="font-size:15px;color:#374151;margin:0 0 24px;">Your <strong>${packName}</strong> assessment is complete.</p>
          <div style="display:inline-block;background:${badgeColor};color:#ffffff;font-size:14px;font-weight:700;padding:8px 20px;border-radius:999px;margin-bottom:16px;">${outcomeLabel}</div>
          ${scoreHtml}
          <blockquote style="margin:16px 0;padding:16px 20px;background:#f8fafc;border-left:4px solid ${badgeColor};border-radius:0 8px 8px 0;">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${outcomeMessage}</p>
          </blockquote>
          <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">Your full personalized report is attached to this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #f1f5f9;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Powered by <a href="https://tryqpq.com" style="color:#6366f1;text-decoration:none;">QuizProQuo</a> · tryqpq.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safePackSlug = params.packSlug.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80) || "assessment";
  const safePackNameForHeader = params.packName.replace(/[\r\n]+/g, " ").slice(0, 120);
  const safeWorkspaceNameForHeader = params.workspaceName.replace(/[\r\n"<>]+/g, " ").slice(0, 120);
  try {
    await transporter.sendMail({
      from: `"${safeWorkspaceNameForHeader}" <${config!.from}>`,
      to: params.to,
      subject: `Your ${safePackNameForHeader} Results`,
      html,
      attachments: [
        {
          filename: `${safePackSlug}-report.pdf`,
          content: params.pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return true;
  } catch (err) {
    console.error("[email] sendResultsEmail failed:", err);
    return false;
  }
}

export async function sendLeadNotification(params: {
  packName: string;
  workspaceName: string;
  leadEmail: string;
  leadFirstName?: string;
  score?: number;
  outcomeLabel: string;
  submissionId: string;
}): Promise<void> {
  const transporter = getTransporter();
  const config = getEmailConfig();
  if (!transporter) {
    console.warn("[email] SMTP email configuration not set — skipping sendLeadNotification");
    return;
  }

  const rows = [
    ["Pack", escapeHtml(params.packName)],
    ["Workspace", escapeHtml(params.workspaceName)],
    ["Email", escapeHtml(params.leadEmail)],
    ["First Name", escapeHtml(params.leadFirstName ?? "—")],
    ["Score", params.score !== undefined ? String(params.score) : "—"],
    ["Outcome", escapeHtml(params.outcomeLabel)],
    ["Submission ID", escapeHtml(params.submissionId)],
  ];

  const rowsHtml = rows
    .map(([k, v]) => `<tr><td style="padding:8px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${k}</td><td style="padding:8px 12px;color:#111827;font-size:13px;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`)
    .join("");

  const safePackNameForHeader = params.packName.replace(/[\r\n]+/g, " ").slice(0, 120);
  const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;padding:32px;">
  <h2 style="color:#111827;font-size:18px;margin:0 0 16px;">New Lead — ${escapeHtml(params.packName)}</h2>
  <table cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    ${rowsHtml}
  </table>
</body></html>`;

  try {
    await transporter.sendMail({
      from: `"QuizProQuo Leads" <${config!.from}>`,
      to: config!.leadTo,
      subject: `New Lead — ${safePackNameForHeader}: ${params.leadEmail}`,
      html,
    });
  } catch (err) {
    console.error("[email] sendLeadNotification failed:", err);
  }
}
