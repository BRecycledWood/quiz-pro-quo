import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import type { Answers, AnswerValue, PackDefinition, Outcome } from "@shared/pack";
import { evaluatePack, getVisibleQuestionIds } from "@shared/engine/interpreter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";

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

function getStatusFromOutcome(outcome: Outcome | null, disqualified: boolean): {
  label: string;
  tone: StatusTone;
} {
  const explicit = outcome?.status;
  if (explicit === "pass" || explicit === "caution" || explicit === "fail") {
    return { label: explicit.charAt(0).toUpperCase() + explicit.slice(1), tone: explicit };
  }
  if (disqualified) return { label: "Fail", tone: "fail" };
  const meta = outcome?.metadata as Record<string, unknown> | undefined;
  const raw = typeof meta?.status === "string" ? meta.status : undefined;
  const candidate = raw ?? outcome?.title ?? outcome?.id ?? "";
  const normalized = candidate.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("ineligible")) return { label: "Fail", tone: "fail" };
  if (normalized.includes("caution") || normalized.includes("review")) return { label: "Caution", tone: "caution" };
  if (normalized.includes("pass") || normalized.includes("eligible")) return { label: "Pass", tone: "pass" };
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
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

// ─── Email Gate ──────────────────────────────────────────────────────────────

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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">You're almost done.</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Enter your details to unlock your personalised results and receive your PDF report by email.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-2xl p-6">
          <div className="space-y-1.5">
            <label htmlFor="gate-firstname" className="text-sm font-medium">First name</label>
            <Input
              id="gate-firstname"
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gate-email" className="text-sm font-medium">
              Work email <span className="text-destructive">*</span>
            </label>
            <Input
              id="gate-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
            />
            {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
          </div>
          <Button type="submit" className="w-full h-11 text-base">
            Get My Results →
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No spam. Your report is sent once, immediately.
          </p>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Skip — view results without report
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.max(4, value)}%` }}
      />
    </div>
  );
}

// ─── Main PackRunner ──────────────────────────────────────────────────────────

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [pendingResult, setPendingResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentReturnError, setPaymentReturnError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Used to animate card transitions
  const [cardKey, setCardKey] = useState(0);

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
      setCurrentQuestionIndex(0);
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

  // Clamp index when branching changes the visible list
  const safeIndex = Math.min(currentQuestionIndex, Math.max(0, visibleQuestions.length - 1));
  const currentQuestion = visibleQuestions[safeIndex] ?? null;
  const isLastQuestion = safeIndex >= visibleQuestions.length - 1;
  const progress = visibleQuestions.length > 0
    ? ((safeIndex + 1) / visibleQuestions.length) * 100
    : 0;

  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const advanceToNext = () => {
    setCardKey((k) => k + 1);
    setCurrentQuestionIndex((prev) => prev + 1);
  };

  const handleSelectAnswer = (questionId: string, value: AnswerValue) => {
    handleAnswerChange(questionId, value);
    // Auto-advance for single-choice on non-last questions
    if (!isLastQuestion) {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        advanceToNext();
      }, 320);
    }
  };

  const handleNext = () => {
    if (!currentQuestion) return;
    if (isLastQuestion) {
      handleSeeResults();
    } else {
      advanceToNext();
    }
  };

  const handleBack = () => {
    if (safeIndex > 0) {
      setCardKey((k) => k + 1);
      setCurrentQuestionIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const downloadPdf = (encoded: string, sessionId: string | null) => {
    if (!encoded) return;
    if (isPaidPack && !sessionId) return;
    const pdfUrl = `/api/public/w/${workspaceSlug}/${packSlug}/pdf?answers=${encoded}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ""}`;
    window.location.href = pdfUrl;
  };

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
    setCurrentQuestionIndex(0);
    setCardKey((k) => k + 1);
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
      if (!payload?.answers || !payload.encodedAnswersBase64Url) {
        setPaymentReturnError("Payment confirmed, but we couldn't find your answers. Please run again.");
        return;
      }
      setAnswers(payload.answers);
      const evaluation = evaluatePack(definition, payload.answers);
      setResult(evaluation);
      const dlKey = downloadFlagKey(sessionIdParam);
      if (!localStorage.getItem(dlKey)) {
        localStorage.setItem(dlKey, "1");
        downloadPdf(payload.encodedAnswersBase64Url, sessionIdParam);
        setDownloadMessage("PDF downloaded.");
      } else {
        setDownloadMessage("PDF downloaded.");
      }
    } catch { setPaymentReturnError("Payment confirmed, but we couldn't find your answers. Please run again."); }
  }, [definition, hasPaidSession, sessionIdParam, workspaceSlug, packSlug]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading quiz…</p>
        </div>
      </div>
    );
  }

  if (error === NOT_FOUND) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-lg font-semibold">Quiz not found</p>
        <p className="text-sm text-muted-foreground">This quiz doesn't exist or hasn't been published yet.</p>
        <Link href="/demo"><Button variant="outline">See demo quizzes</Button></Link>
      </div>
    );
  }

  if (error === UNAVAILABLE) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-lg font-semibold">Temporarily unavailable</p>
        <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
      </div>
    );
  }

  if (!definition || !data) return null;

  if (paymentReturnError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4 text-center">
          <p className="font-semibold">Payment confirmed</p>
          <p className="text-sm text-muted-foreground">{paymentReturnError}</p>
          <Button onClick={handleStartOver}>Start over</Button>
        </div>
      </div>
    );
  }

  if (showEmailGate) {
    return <EmailGate onSubmit={handleEmailGateSubmit} onSkip={handleEmailGateSkip} />;
  }

  // ── Result screen ──────────────────────────────────────────────────────────

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
        const label = "label" in action ? String((action as Record<string, unknown>).label ?? "") : "";
        const url = "url" in action ? String((action as Record<string, unknown>).url ?? "") : undefined;
        if (label) actionList.push({ label, url });
      }
    });

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg space-y-6">

          {submittedEmail ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 text-center">
              ✉️ Your PDF report is on its way to <strong>{submittedEmail}</strong>
            </div>
          ) : null}

          {/* Score card */}
          <div className="bg-card border rounded-2xl p-8 space-y-6 shadow-sm">
            <div className="text-center space-y-3">
              <Badge className={`${getToneClasses(status.tone)} text-sm px-4 py-1`}>
                {status.label}
              </Badge>
              <h1 className="text-2xl font-bold">{outcome?.title ?? "Your Result"}</h1>
              {outcome?.description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">{outcome.description}</p>
              ) : null}
            </div>

            {/* Score visual */}
            <div className="flex items-center justify-center">
              <div className="text-center bg-muted/40 rounded-xl px-8 py-4">
                <p className="text-4xl font-bold text-foreground">{result.score}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Score</p>
              </div>
            </div>

            {result.reasons.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key findings</p>
                <ul className="space-y-1.5">
                  {result.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {actionList.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next steps</p>
                <div className="flex flex-col gap-2">
                  {actionList.map((action, index) => (
                    action.url
                      ? <a key={`${action.label}-${index}`} href={action.url} target="_blank" rel="noreferrer">
                          <Button className="w-full">{action.label}</Button>
                        </a>
                      : <Button key={`${action.label}-${index}`} variant="outline" className="w-full">{action.label}</Button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* PDF */}
            <div className="pt-2 border-t space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF Report</p>
              {isPaidPack ? (
                hasPaidSession
                  ? <Button asChild className="w-full"><a href={pdfUrl}>Download PDF</a></Button>
                  : <div className="space-y-2">
                      <Button className="w-full" onClick={handleUnlockPdf} disabled={unlockDisabled}>
                        {checkoutLoading ? "Opening checkout…" : "Unlock PDF Report"}
                      </Button>
                      {!stripeConfigured ? <p className="text-xs text-muted-foreground text-center">Stripe not configured.</p> : null}
                    </div>
              ) : (
                <Button asChild className="w-full"><a href={pdfUrl}>Download PDF Report</a></Button>
              )}
              {checkoutError ? <p className="text-xs text-destructive text-center">{checkoutError}</p> : null}
              {downloadMessage ? <p className="text-xs text-muted-foreground text-center">{downloadMessage}</p> : null}
            </div>
          </div>

          <button
            onClick={handleStartOver}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Take again
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz card screen ───────────────────────────────────────────────────────

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        No questions available.
      </div>
    );
  }

  const currentAnswer = answers[currentQuestion.id];
  const hasAnswer = isAnswered(currentAnswer);
  const type = currentQuestion.type;
  const isChoice = type === "single" || type === "select" || type === "boolean" || type === "yesno";
  const isNumberInput = type === "number";

  const options = currentQuestion.options ?? [];
  const yesNoOptions = [
    { id: "yes", label: "Yes", value: true as AnswerValue },
    { id: "no", label: "No", value: false as AnswerValue },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Top bar */}
      <div className="w-full px-4 pt-6 pb-4 max-w-xl mx-auto space-y-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{definition.name ?? data.pack.name}</span>
          <span>{safeIndex + 1} / {visibleQuestions.length}</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* Question card */}
      <div className="flex-1 flex items-start justify-center px-4 pt-8 pb-24">
        <div
          key={cardKey}
          className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-3 duration-300"
        >
          <div className="space-y-6">
            <h2 className="text-xl md:text-2xl font-semibold leading-snug">
              {currentQuestion.prompt}
            </h2>

            {/* Yes/No */}
            {(type === "boolean" || type === "yesno") ? (
              <div className="grid grid-cols-2 gap-3">
                {yesNoOptions.map((opt) => {
                  const selected = currentAnswer === opt.value;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectAnswer(currentQuestion.id, opt.value)}
                      className={`rounded-xl border-2 px-6 py-5 text-base font-semibold transition-all duration-150 ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Single choice / select */}
            {(type === "single" || type === "select") ? (
              <div className="flex flex-col gap-2.5">
                {options.map((option) => {
                  const optValue = option.value ?? option.id;
                  const selected = currentAnswer === optValue;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectAnswer(currentQuestion.id, optValue)}
                      className={`w-full text-left rounded-xl border-2 px-5 py-4 text-sm font-medium transition-all duration-150 ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Number */}
            {isNumberInput ? (
              <Input
                type="number"
                className="text-base h-12"
                value={typeof currentAnswer === "number" ? String(currentAnswer) : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  handleAnswerChange(currentQuestion.id, raw === "" ? null : Number(raw));
                }}
                placeholder="Enter a number"
                autoFocus
              />
            ) : null}

            {/* Text fallback */}
            {!isChoice && !isNumberInput ? (
              <Input
                type="text"
                className="text-base h-12"
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                placeholder="Type your answer"
                autoFocus
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur border-t">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={safeIndex === 0}
            className="gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {/* For choice questions that auto-advance, show a subtle indicator on last question */}
          {isChoice && isLastQuestion ? (
            <Button
              onClick={handleSeeResults}
              disabled={!hasAnswer}
              className="gap-1.5"
            >
              See Results
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : isChoice ? (
            <span className="text-xs text-muted-foreground">Select an option to continue</span>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!hasAnswer}
              className="gap-1.5"
            >
              {isLastQuestion ? "See Results" : "Next"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
