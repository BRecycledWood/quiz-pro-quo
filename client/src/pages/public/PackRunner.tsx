import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import type { Answers, AnswerValue, PackDefinition, Outcome } from "@shared/pack";
import { evaluatePack, getVisibleQuestionIds } from "@shared/engine/interpreter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const NOT_FOUND = "not_found" as const;
const UNAVAILABLE = "unavailable" as const;
const STRIPE_PLACEHOLDER_PRICE = "price_TEST_PLACEHOLDER";
const RUNNER_STORAGE_KEY = "lastRunnerUrl";

const packStorageKey = (workspaceSlug: string, packSlug: string) =>
  `packAnswers:${workspaceSlug}:${packSlug}`;
const downloadFlagKey = (sessionId: string) => `pdfDownloaded:${sessionId}`;

type StoredAnswersPayload = {
  answers: Answers;
  encodedAnswersBase64Url: string;
  createdAt: number;
};

type PublicPackResponse = {
  workspace: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
  };
  pack: {
    id: string;
    name: string;
    slug: string;
    publishedVersionId: string | null;
    isPaid: boolean;
    stripePriceId: string | null;
  };
  version: {
    id: string;
    packId: string;
    version: number;
    createdAt: string;
  };
  definition: PackDefinition;
  publicAppUrlConfigured: boolean;
};

type StatusTone = "pass" | "caution" | "fail";

function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function formatStatusLabel(status: StatusTone) {
  if (status === "pass") return "Pass";
  if (status === "caution") return "Caution";
  return "Fail";
}

function getStatusFromOutcome(outcome: Outcome | null, disqualified: boolean): {
  label: string;
  tone: StatusTone;
} {
  const explicit = outcome?.status;
  if (explicit === "pass" || explicit === "caution" || explicit === "fail") {
    return { label: formatStatusLabel(explicit), tone: explicit };
  }
  if (disqualified) return { label: "Fail", tone: "fail" };
  const meta = outcome?.metadata as Record<string, unknown> | undefined;
  const raw = typeof meta?.status === "string" ? meta.status : undefined;
  const candidate = raw ?? outcome?.title ?? outcome?.id ?? "";
  const normalized = candidate.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("ineligible")) return { label: "Fail", tone: "fail" };
  if (normalized.includes("caution") || normalized.includes("review")) return { label: "Caution", tone: "caution" };
  if (normalized.includes("pass") || normalized.includes("eligible")) return { label: "Pass", tone: "pass" };
  if (raw === "pass" || raw === "caution" || raw === "fail") return { label: raw.charAt(0).toUpperCase() + raw.slice(1), tone: raw };
  return { label: "Pass", tone: "pass" };
}

function getToneClasses(tone: StatusTone) {
  switch (tone) {
    case "fail": return "bg-destructive text-destructive-foreground";
    case "caution": return "bg-amber-500 text-white";
    default: return "bg-emerald-600 text-white";
  }
}

function encodeAnswersBase64Url(answers: Answers): string {
  const json = JSON.stringify(answers ?? {});
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeAnswersBase64Url(encoded: string): Answers | null {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = atob(`${normalized}${padding}`);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Answers;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch { return null; }
}

// ─── Email Gate Component ──────────────────────────────────────────────────

function EmailGate({
  onSubmit,
  onSkip,
}: {
  onSubmit: (email: string, firstName: string) => void;
  onSkip: () => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [emailError, setEmailError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    onSubmit(email.trim(), firstName.trim());
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">You're almost done.</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Enter your details to unlock your results and receive your personalized PDF report by email.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="gate-firstname">First name</Label>
                <Input
                  id="gate-firstname"
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gate-email">Work email <span className="text-destructive">*</span></Label>
                <Input
                  id="gate-email"
                  type="email"
                  placeholder="Work email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                />
                {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
              </div>
              <Button type="submit" className="w-full h-11 text-base">
                Get My Results →
              </Button>
            </form>
            <p className="text-center text-xs text-muted-foreground mt-3">
              No spam. Your results are sent once, immediately.
            </p>
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={onSkip}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Skip — view results without report
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main PackRunner ────────────────────────────────────────────────────────

export default function PackRunner() {
  const [, params] = useRoute<{ workspaceSlug: string; packSlug: string }>(
    "/w/:workspaceSlug/:packSlug",
  );
  const workspaceSlug = params?.workspaceSlug ?? "";
  const packSlug = params?.packSlug ?? "";
  const { toast } = useToast();

  const [data, setData] = useState<PublicPackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<typeof NOT_FOUND | typeof UNAVAILABLE | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [pendingResult, setPendingResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentReturnError, setPaymentReturnError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const paidParam = searchParams.get("paid");
  const sessionIdParam = searchParams.get("session_id");
  const answersParam = searchParams.get("answers");
  const autoresParam = searchParams.get("autores");
  const hasPaidSession = paidParam === "1" && Boolean(sessionIdParam);

  const prefillAnswers = useMemo(() => {
    if (!answersParam) return null;
    return decodeAnswersBase64Url(answersParam);
  }, [answersParam]);

  useEffect(() => {
    if (!workspaceSlug || !packSlug) return;
    if (typeof window === "undefined") return;
    const nextUrl = `/w/${workspaceSlug}/${packSlug}${window.location.search}`;
    window.localStorage.setItem(RUNNER_STORAGE_KEY, nextUrl);
  }, [workspaceSlug, packSlug]);

  useEffect(() => {
    if (!workspaceSlug || !packSlug) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      setAnswers({});
      setResult(null);
      setPendingResult(null);
      setShowEmailGate(false);
      setPaymentReturnError(null);
      setDownloadMessage(null);
      try {
        const response = await fetch(`/api/public/w/${workspaceSlug}/${packSlug}`);
        if (!response.ok) {
          if (!cancelled) setError(response.status === 404 ? NOT_FOUND : UNAVAILABLE);
          return;
        }
        const payload = (await response.json()) as PublicPackResponse;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError(UNAVAILABLE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [workspaceSlug, packSlug]);

  const definition = data?.definition ?? null;
  const pricing = definition?.pricing;
  const isPaidPack = Boolean(pricing?.isPaid);
  const stripePriceId = typeof pricing?.stripePriceId === "string" ? pricing.stripePriceId : "";
  const stripeConfigured = stripePriceId.trim().length > 0 && stripePriceId !== STRIPE_PLACEHOLDER_PRICE;
  const publicAppUrlConfigured = Boolean(data?.publicAppUrlConfigured);

  useEffect(() => {
    if (!definition) return;
    if (!prefillAnswers) return;
    if (hasPaidSession) return;
    setAnswers(prefillAnswers);
    if (autoresParam === "1") setResult(evaluatePack(definition, prefillAnswers));
  }, [definition, prefillAnswers, autoresParam, hasPaidSession]);

  const encodedAnswers = useMemo(() => encodeAnswersBase64Url(answers), [answers]);

  const visibleQuestionIds = useMemo(() => {
    if (!definition) return [];
    return getVisibleQuestionIds(definition, answers);
  }, [definition, answers]);

  const visibleQuestions = useMemo(() => {
    if (!definition) return [];
    return definition.questions.filter((q) => visibleQuestionIds.includes(q.id));
  }, [definition, visibleQuestionIds]);

  const answeredCount = visibleQuestions.filter((q) => isAnswered(answers[q.id])).length;

  const downloadPdf = (encoded: string, sessionId: string | null) => {
    if (!encoded) return;
    if (isPaidPack && !sessionId) return;
    const pdfUrl = `/api/public/w/${workspaceSlug}/${packSlug}/pdf?answers=${encoded}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
    window.location.href = pdfUrl;
  };

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  // Fire-and-forget submit to API
  const postSubmission = (email: string | null, firstName: string | null, evaluation: ReturnType<typeof evaluatePack>) => {
    if (!definition || !data) return;
    fetch(`/api/public/w/${workspaceSlug}/${packSlug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        firstName,
        answers,
        score: evaluation.score,
        outcomeId: evaluation.outcome?.id ?? null,
        outcomeLabel: evaluation.outcome?.title ?? null,
        outcomeMessage: evaluation.outcome?.description ?? null,
        outcomeStatus: evaluation.outcome?.status ?? null,
      }),
    }).catch((err) => console.warn("[PackRunner] submit failed:", err));
  };

  const handleSeeResults = () => {
    if (!definition) return;
    const evaluation = evaluatePack(definition, answers);
    const payload: StoredAnswersPayload = { answers, encodedAnswersBase64Url: encodedAnswers, createdAt: Date.now() };
    localStorage.setItem(packStorageKey(workspaceSlug, packSlug), JSON.stringify(payload));
    setPendingResult(evaluation);
    setShowEmailGate(true);
  };

  const handleEmailGateSubmit = (email: string, firstName: string) => {
    if (!pendingResult) return;
    setSubmittedEmail(email);
    setResult(pendingResult);
    setShowEmailGate(false);
    postSubmission(email, firstName || null, pendingResult);
    toast({ title: `Your PDF report is on its way to ${email}`, description: "Check your inbox in a few minutes." });
  };

  const handleEmailGateSkip = () => {
    if (!pendingResult) return;
    setResult(pendingResult);
    setShowEmailGate(false);
    postSubmission(null, null, pendingResult);
  };

  const handleStartOver = () => {
    setAnswers({});
    setResult(null);
    setPendingResult(null);
    setShowEmailGate(false);
    setCheckoutError(null);
    setPaymentReturnError(null);
    setSubmittedEmail(null);
  };

  const handleUnlockPdf = async () => {
    if (!definition) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const response = await fetch(`/api/public/w/${workspaceSlug}/${packSlug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        setCheckoutError(payload?.message ?? "Unable to start checkout");
        return;
      }
      const payload = (await response.json()) as { url?: string };
      if (!payload.url) { setCheckoutError("Unable to start checkout"); return; }
      window.location.href = payload.url;
    } catch {
      setCheckoutError("Unable to start checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  useEffect(() => {
    if (!definition) return;
    if (!hasPaidSession) return;
    if (!sessionIdParam) return;
    const stored = localStorage.getItem(packStorageKey(workspaceSlug, packSlug));
    if (!stored) { setPaymentReturnError("Payment confirmed, but we couldn't find your answers. Please run again."); return; }
    try {
      const payload = JSON.parse(stored) as StoredAnswersPayload;
      if (!payload?.answers || !payload.encodedAnswersBase64Url) { setPaymentReturnError("Payment confirmed, but we couldn't find your answers. Please run again."); return; }
      setAnswers(payload.answers);
      const evaluation = evaluatePack(definition, payload.answers);
      setResult(evaluation);
      const downloadKey = downloadFlagKey(sessionIdParam);
      const downloaded = localStorage.getItem(downloadKey);
      if (!downloaded) {
        localStorage.setItem(downloadKey, "1");
        downloadPdf(payload.encodedAnswersBase64Url, sessionIdParam);
        setDownloadMessage("PDF downloaded.");
      } else {
        setDownloadMessage("PDF downloaded.");
      }
    } catch { setPaymentReturnError("Payment confirmed, but we couldn't find your answers. Please run again."); }
  }, [definition, hasPaidSession, sessionIdParam, workspaceSlug, packSlug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  if (error === NOT_FOUND) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Not found</div>;
  if (error === UNAVAILABLE) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Server unavailable</div>;
  if (!definition || !data) return null;

  if (paymentReturnError) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
          <div className="flex justify-start"><Link href="/admin"><Button variant="ghost" size="sm">Back to Admin</Button></Link></div>
          <Card>
            <CardHeader><CardTitle>Payment confirmed</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{paymentReturnError}</p>
              <div className="flex justify-end"><Button onClick={handleStartOver}>Start over</Button></div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Email gate screen
  if (showEmailGate) {
    return <EmailGate onSubmit={handleEmailGateSubmit} onSkip={handleEmailGateSkip} />;
  }

  if (result) {
    const outcome = result.outcome;
    const status = getStatusFromOutcome(outcome, result.disqualified);
    const paidSessionId = hasPaidSession ? sessionIdParam : null;
    const pdfUrl = `/api/public/w/${workspaceSlug}/${packSlug}/pdf?answers=${encodedAnswers}${paidSessionId ? `&session_id=${encodeURIComponent(paidSessionId)}` : ""}`;
    const unlockDisabled = checkoutLoading || !stripeConfigured || !publicAppUrlConfigured;
    const actionList: Array<{ label: string; url?: string }> = [];
    if (outcome?.ctaLabel) actionList.push({ label: outcome.ctaLabel, url: outcome.ctaUrl });
    const metaActions = (outcome?.metadata as Record<string, unknown> | undefined)?.actions;
    if (Array.isArray(metaActions)) metaActions.forEach((action) => {
      if (action && typeof action === "object") {
        const label = "label" in action ? String((action as Record<string,unknown>).label ?? "") : "";
        const url = "url" in action ? String((action as Record<string,unknown>).url ?? "") : undefined;
        if (label) actionList.push({ label, url });
      }
    });

    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
          <div className="flex justify-start"><Link href="/admin"><Button variant="ghost" size="sm">Back to Admin</Button></Link></div>

          {submittedEmail ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              ✉️ Your PDF report is on its way to <strong>{submittedEmail}</strong>
            </div>
          ) : null}

          <Card>
            <CardHeader className="space-y-3">
              <Badge className={getToneClasses(status.tone)}>{status.label}</Badge>
              <CardTitle className="text-2xl">{outcome?.title ?? "Result"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {outcome?.description ? <p className="text-sm text-muted-foreground">{outcome.description}</p> : null}
              <div className="grid gap-4 text-sm">
                <div className="flex items-center justify-between rounded-md border px-4 py-3">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-medium">{result.score}</span>
                </div>
                {result.reasons.length > 0 ? (
                  <div className="rounded-md border px-4 py-3">
                    <div className="text-muted-foreground">Reasons</div>
                    <ul className="mt-2 list-disc pl-5 text-sm text-foreground">
                      {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
              {actionList.length > 0 ? (
                <div className="rounded-md border px-4 py-3">
                  <div className="text-muted-foreground">Next actions</div>
                  <ul className="mt-2 space-y-2">
                    {actionList.map((action, index) => (
                      <li key={`${action.label}-${index}`}>
                        {action.url ? <a className="text-sm font-medium text-primary hover:underline" href={action.url} target="_blank" rel="noreferrer">{action.label}</a> : <span className="text-sm font-medium">{action.label}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-md border px-4 py-3 space-y-3">
                <div className="text-muted-foreground">PDF report</div>
                {isPaidPack ? (
                  hasPaidSession ? (
                    <Button asChild><a href={pdfUrl}>Download PDF</a></Button>
                  ) : (
                    <div className="space-y-2">
                      <Button onClick={handleUnlockPdf} disabled={unlockDisabled}>{checkoutLoading ? "Opening checkout..." : "Unlock PDF"}</Button>
                      {!publicAppUrlConfigured ? <p className="text-xs text-muted-foreground">PUBLIC_APP_URL not configured.</p> : null}
                      {!stripeConfigured ? <p className="text-xs text-muted-foreground">Stripe not configured.</p> : null}
                    </div>
                  )
                ) : (
                  <Button asChild><a href={pdfUrl}>Download PDF</a></Button>
                )}
                {checkoutError ? <p className="text-xs text-destructive">{checkoutError}</p> : null}
                {downloadMessage ? <p className="text-xs text-muted-foreground">{downloadMessage}</p> : null}
              </div>
              <div className="flex justify-end"><Button onClick={handleStartOver}>Start over</Button></div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <div className="flex justify-start"><Link href="/admin"><Button variant="ghost" size="sm">Back to Admin</Button></Link></div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{data.workspace.name}</p>
          <h1 className="text-3xl font-semibold">{definition.name ?? data.pack.name}</h1>
          <p className="text-sm text-muted-foreground">{answeredCount} of {visibleQuestions.length} answered</p>
        </div>
        <div className="space-y-4">
          {visibleQuestions.map((question, index) => {
            const value = answers[question.id];
            const type = question.type;
            const isYesNo = type === "boolean" || type === "yesno";
            const isSelect = type === "single" || type === "select";
            const isNumber = type === "number";
            return (
              <Card key={question.id}>
                <CardHeader><CardTitle className="text-base">{index + 1}. {question.prompt}</CardTitle></CardHeader>
                <CardContent>
                  {isYesNo ? (
                    <RadioGroup value={value === true ? "true" : value === false ? "false" : ""} onValueChange={(next) => handleAnswerChange(question.id, next === "true")} className="grid gap-2">
                      <div className="flex items-center space-x-2"><RadioGroupItem value="true" id={`${question.id}-yes`} /><Label htmlFor={`${question.id}-yes`}>Yes</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="false" id={`${question.id}-no`} /><Label htmlFor={`${question.id}-no`}>No</Label></div>
                    </RadioGroup>
                  ) : null}
                  {isSelect ? (
                    <Select value={typeof value === "string" ? value : ""} onValueChange={(next) => handleAnswerChange(question.id, next)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select an option" /></SelectTrigger>
                      <SelectContent>{(question.options ?? []).map((option) => { const optionValue = option.value ?? option.id; return <SelectItem key={option.id} value={optionValue}>{option.label}</SelectItem>; })}</SelectContent>
                    </Select>
                  ) : null}
                  {isNumber ? (
                    <Input type="number" value={typeof value === "number" ? String(value) : ""} onChange={(event) => { const raw = event.target.value; handleAnswerChange(question.id, raw === "" ? null : Number(raw)); }} placeholder="Enter a number" />
                  ) : null}
                  {!isYesNo && !isSelect && !isNumber ? (
                    <Input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => handleAnswerChange(question.id, e.target.value)} placeholder="Enter your answer" />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Visible items may change based on your responses.</p>
          <Button onClick={handleSeeResults} disabled={visibleQuestions.length === 0}>See results</Button>
        </div>
      </div>
    </div>
  );
}
