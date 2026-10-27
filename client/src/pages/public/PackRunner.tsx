import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import type { Answers, AnswerValue, PackDefinition, Outcome } from "@shared/pack";
import { evaluatePack, getVisibleQuestionIds } from "@shared/engine/interpreter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";

const NOT_FOUND = "not_found" as const;
const UNAVAILABLE = "unavailable" as const;
const STRIPE_PLACEHOLDER_PRICE = "price_TEST_PLACEHOLDER";
const downloadFlagKey = (sessionId: string) => `pdfDownloaded:${sessionId}`;

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
  emailConfigured: boolean;
  stripeConfigured: boolean;
};

type StatusTone = "pass" | "caution" | "fail";

function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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

function isBooleanQuestion(type: PackDefinition["questions"][number]["type"]) {
  return type === "boolean" || type === "yesno" || type === "yes_no" || type === "true_false";
}

function isSingleChoiceQuestion(type: PackDefinition["questions"][number]["type"]) {
  return type === "single" || type === "select" || type === "dropdown";
}

function isTextQuestion(type: PackDefinition["questions"][number]["type"]) {
  return type === "text" || type === "short_text" || type === "long_text" || type === "date";
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
  isSubmitting,
  submitError,
  isPaidPack,
}: {
  onSubmit: (email: string, firstName: string) => void;
  isSubmitting: boolean;
  submitError: string | null;
  isPaidPack: boolean;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [emailError, setEmailError] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    onSubmit(email.trim(), firstName.trim());
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary">One last step</p>
          <h2 className="text-2xl font-bold">Unlock your results</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {isPaidPack
              ? "Add your email to save your assessment and see your result. The full PDF report is available after secure checkout."
              : "Add your email to save your assessment and see your personalized results. We’ll email a PDF copy if email delivery is enabled."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-2xl p-6 shadow-sm">
          <div className="space-y-1.5">
            <label htmlFor="gate-firstname" className="text-sm font-medium">First name <span className="text-muted-foreground">(optional)</span></label>
            <Input
              id="gate-firstname"
              type="text"
              placeholder="First name"
              value={firstName}
              maxLength={100}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="gate-email" className="text-sm font-medium">
              Email address <span className="text-destructive">*</span>
            </label>
            <Input
              id="gate-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => { setEmail(event.target.value); setEmailError(""); }}
            />
            {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
          </div>
          {submitError ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{submitError}</p>
          ) : null}
          <Button type="submit" className="w-full h-11 text-base" disabled={isSubmitting}>
            {isSubmitting ? "Saving your results…" : "Get My Results"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Your details are stored securely with your assessment answers. No spam.
          </p>
        </form>
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
  const [hasStarted, setHasStarted] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [pendingResult, setPendingResult] = useState<ReturnType<typeof evaluatePack> | null>(null);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentReturnLoading, setPaymentReturnLoading] = useState(false);
  const [paymentReturnError, setPaymentReturnError] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [paymentAttempt, setPaymentAttempt] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Used to animate card transitions
  const [cardKey, setCardKey] = useState(0);

  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const paidParam = searchParams.get("paid");
  const sessionIdParam = searchParams.get("session_id");
  const submissionIdParam = searchParams.get("submission_id");
  const answersParam = searchParams.get("answers");
  const autoresParam = searchParams.get("autores");
  const isPreviewMode = searchParams.get("preview") === "1" || autoresParam === "1";
  const hasPaidSession = paidParam === "1" && Boolean(sessionIdParam);

  const prefillAnswers = useMemo(() => {
    if (!answersParam) return null;
    return decodeAnswersBase64Url(answersParam);
  }, [answersParam]);

  useEffect(() => {
    if (!workspaceSlug || !packSlug) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      setAnswers({});
      setHasStarted(false);
      setStartLoading(false);
      setStartError(null);
      setSubmissionId(null);
      setSubmitting(false);
      setSubmitError(null);
      setResult(null);
      setPendingResult(null);
      setShowEmailGate(false);
      setPaymentReturnLoading(false);
      setPaymentReturnError(null);
      setRestoreLoading(false);
      setDownloadMessage(null);
      setCurrentQuestionIndex(0);
      try {
        const previewQuery = isPreviewMode ? "?preview=1" : "";
        const response = await fetch(`/api/public/w/${workspaceSlug}/${packSlug}${previewQuery}`);
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
  }, [workspaceSlug, packSlug, isPreviewMode]);

  const definition = data?.definition ?? null;
  const pricing = definition?.pricing;
  const isPaidPack = !isPreviewMode && Boolean(pricing?.isPaid);
  const stripePriceId = typeof pricing?.stripePriceId === "string" ? pricing.stripePriceId : "";
  const stripeConfigured = Boolean(
    data?.stripeConfigured && stripePriceId.trim().length > 0 && stripePriceId !== STRIPE_PLACEHOLDER_PRICE,
  );
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

  const handleStart = async () => {
    setStartLoading(true);
    setStartError(null);
    if (isPreviewMode) {
      setHasStarted(true);
      setCurrentQuestionIndex(0);
      setStartLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/public/w/${workspaceSlug}/${packSlug}/start`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as { submissionId?: string; message?: string };
      if (!response.ok || !payload.submissionId) {
        throw new Error(payload.message ?? "Unable to start this assessment. Please try again.");
      }
      setSubmissionId(payload.submissionId);
      setHasStarted(true);
      setCurrentQuestionIndex(0);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Unable to start this assessment. Please try again.");
    } finally {
      setStartLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setSubmitError(null);
  };

  const advanceToNext = () => {
    setCardKey((key) => key + 1);
    setCurrentQuestionIndex((index) => index + 1);
  };

  const handleSelectAnswer = (questionId: string, value: AnswerValue) => {
    handleAnswerChange(questionId, value);
    if (!isLastQuestion && currentQuestion && (
      currentQuestion.type === "single" ||
      currentQuestion.type === "select" ||
      isBooleanQuestion(currentQuestion.type)
    )) {
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(advanceToNext, 320);
    }
  };

  const handleNext = () => {
    if (!currentQuestion || (currentQuestion.required !== false && !isAnswered(answers[currentQuestion.id]))) return;
    if (isLastQuestion) handleSeeResults();
    else advanceToNext();
  };

  const handleBack = () => {
    if (safeIndex > 0) {
      setCardKey((key) => key + 1);
      setCurrentQuestionIndex((index) => Math.max(0, index - 1));
    }
  };

  const handleSeeResults = () => {
    if (!definition) return;
    const evaluation = evaluatePack(definition, answers);
    if (isPreviewMode) {
      setPendingResult(null);
      setResult(evaluation);
      setShowEmailGate(false);
      return;
    }
    setPendingResult(evaluation);
    setSubmitError(null);
    setShowEmailGate(true);
  };

  const handleEmailGateSubmit = async (email: string, firstName: string) => {
    if (!pendingResult || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`/api/public/w/${workspaceSlug}/${packSlug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          email,
          firstName: firstName || null,
          answers,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        id?: string;
        success?: boolean;
        message?: string;
        evaluation?: ReturnType<typeof evaluatePack>;
        emailConfigured?: boolean;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "We couldn't save your results. Please try again.");
      }

      const savedSubmissionId = payload.id ?? submissionId ?? undefined;
      setSubmissionId(savedSubmissionId ?? null);
      setSubmittedEmail(email);
      setResult(payload.evaluation ?? pendingResult);
      setShowEmailGate(false);
      toast({
        title: "Your results are ready",
        description: isPaidPack
          ? "Your assessment is saved. Download the full PDF report after secure checkout."
          : payload.emailConfigured
            ? `A PDF copy will be emailed to ${email}.`
            : "Your assessment has been saved. Email delivery is not configured on this service.",
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We couldn't save your results. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartOver = () => {
    if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
    setAnswers({});
    setHasStarted(false);
    setStartError(null);
    setSubmissionId(null);
    setSubmitting(false);
    setSubmitError(null);
    setResult(null);
    setPendingResult(null);
    setShowEmailGate(false);
    setCheckoutError(null);
    setPaymentReturnError(null);
    setSubmittedEmail(null);
    setCurrentQuestionIndex(0);
    setCardKey((key) => key + 1);
  };

  const handleUnlockPdf = async () => {
    if (!definition || !submissionId) {
      setCheckoutError("Your saved assessment could not be found. Please take the assessment again.");
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const response = await fetch(`/api/public/w/${workspaceSlug}/${packSlug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const payload = await response.json().catch(() => ({})) as { url?: string; message?: string };
      if (!response.ok) {
        setCheckoutError(payload.message ?? "Unable to start checkout");
        return;
      }
      if (!payload.url) {
        setCheckoutError("Unable to start checkout");
        return;
      }
      window.location.href = payload.url;
    } catch {
      setCheckoutError("Unable to start checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  useEffect(() => {
    if (!definition || !hasPaidSession || !sessionIdParam) return;
    if (!submissionIdParam) {
      setPaymentReturnError("Payment return is missing its assessment reference. Please contact support.");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setPaymentReturnLoading(true);
    setPaymentReturnError(null);
    fetch(`/api/public/w/${workspaceSlug}/${packSlug}/payment-return?session_id=${encodeURIComponent(sessionIdParam)}&submission_id=${encodeURIComponent(submissionIdParam)}`, {
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        paid?: boolean;
        submissionId?: string;
        email?: string | null;
        firstName?: string | null;
        answers?: Answers;
        evaluation?: ReturnType<typeof evaluatePack>;
        message?: string;
      };
      if (!response.ok || !payload.success || !payload.paid || !payload.submissionId || !payload.answers || !payload.evaluation) {
        throw new Error(payload.message ?? "Payment could not be verified for this assessment.");
      }
      if (cancelled) return;
      setAnswers(payload.answers);
      setHasStarted(true);
      setSubmissionId(payload.submissionId);
      setSubmittedEmail(payload.email ?? null);
      setResult(payload.evaluation);
      const dlKey = downloadFlagKey(sessionIdParam);
      if (!sessionStorage.getItem(dlKey)) {
        sessionStorage.setItem(dlKey, "1");
        window.location.href = `/api/public/w/${workspaceSlug}/${packSlug}/pdf?session_id=${encodeURIComponent(sessionIdParam)}&submission_id=${encodeURIComponent(payload.submissionId)}`;
        setDownloadMessage("PDF downloaded.");
      } else {
        setDownloadMessage("Payment verified. Your report is ready to download.");
      }
    }).catch((error: unknown) => {
      if (cancelled || error instanceof DOMException && error.name === "AbortError") return;
      setPaymentReturnError(error instanceof Error ? error.message : "Payment could not be verified for this assessment.");
    }).finally(() => {
      if (!cancelled) setPaymentReturnLoading(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [definition, hasPaidSession, sessionIdParam, submissionIdParam, workspaceSlug, packSlug, paymentAttempt]);

  useEffect(() => {
    if (!definition || paidParam !== "0" || !submissionIdParam) return;
    let cancelled = false;
    const controller = new AbortController();
    setRestoreLoading(true);
    setStartError(null);
    fetch(`/api/public/w/${workspaceSlug}/${packSlug}/restore?submission_id=${encodeURIComponent(submissionIdParam)}`, {
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        submissionId?: string;
        email?: string | null;
        answers?: Answers;
        evaluation?: ReturnType<typeof evaluatePack>;
        message?: string;
      };
      if (!response.ok || !payload.success || payload.submissionId !== submissionIdParam || !payload.answers || !payload.evaluation) {
        throw new Error(payload.message ?? "Your saved assessment could not be restored.");
      }
      if (cancelled) return;
      setAnswers(payload.answers);
      setSubmissionId(payload.submissionId);
      setSubmittedEmail(payload.email ?? null);
      setHasStarted(true);
      setResult(payload.evaluation);
      setCheckoutError("Checkout was canceled. Your assessment is saved; you can retry when ready.");
    }).catch((error: unknown) => {
      if (cancelled || error instanceof DOMException && error.name === "AbortError") return;
      setStartError(`Checkout was canceled. ${error instanceof Error ? error.message : "Your assessment could not be restored."}`);
    }).finally(() => {
      if (!cancelled) setRestoreLoading(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [definition, paidParam, submissionIdParam, workspaceSlug, packSlug]);

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

  if (restoreLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-medium">Restoring your saved assessment…</p>
        </div>
      </div>
    );
  }

  if (paymentReturnLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-medium">Verifying payment securely…</p>
          <p className="text-sm text-muted-foreground">Your report will unlock as soon as Stripe confirms payment.</p>
        </div>
      </div>
    );
  }

  if (paymentReturnError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4 text-center">
          <p className="font-semibold">We couldn’t verify your payment yet</p>
          <p className="text-sm text-muted-foreground">{paymentReturnError}</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => {
              setPaymentReturnError(null);
              setDownloadMessage(null);
              setPaymentAttempt((attempt) => attempt + 1);
            }}>Retry verification</Button>
            <Button variant="outline" onClick={handleStartOver}>Start over</Button>
          </div>
        </div>
      </div>
    );
  }

  if (showEmailGate) {
    return (
      <EmailGate
        onSubmit={handleEmailGateSubmit}
        isSubmitting={submitting}
        submitError={submitError}
        isPaidPack={isPaidPack}
      />
    );
  }

  // ── Result screen ──────────────────────────────────────────────────────────

  if (result) {
    const outcome = result.outcome;
    const status = getStatusFromOutcome(outcome, result.disqualified);
    const paidSessionId = hasPaidSession ? sessionIdParam : null;
    const paidSubmissionId = submissionId ?? submissionIdParam;
    const pdfUrl = paidSessionId && paidSubmissionId
      ? `/api/public/w/${workspaceSlug}/${packSlug}/pdf?session_id=${encodeURIComponent(paidSessionId)}&submission_id=${encodeURIComponent(paidSubmissionId)}`
      : `/api/public/w/${workspaceSlug}/${packSlug}/pdf?answers=${encodedAnswers}`;
    const unlockDisabled = checkoutLoading || !stripeConfigured || !publicAppUrlConfigured || !submissionId;

    const actionList: Array<{ label: string; url?: string }> = [];
    if (outcome?.ctaLabel) actionList.push({ label: outcome.ctaLabel, url: safeExternalUrl(outcome.ctaUrl) });
    const metaActions = (outcome?.metadata as Record<string, unknown> | undefined)?.actions;
    if (Array.isArray(metaActions)) metaActions.forEach((action) => {
      if (action && typeof action === "object") {
        const label = "label" in action ? String((action as Record<string, unknown>).label ?? "") : "";
        const url = "url" in action ? safeExternalUrl((action as Record<string, unknown>).url) : undefined;
        if (label) actionList.push({ label, url });
      }
    });

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg space-y-6">

          {submittedEmail ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 text-center">
              {isPaidPack
                ? <>Your assessment is saved for <strong>{submittedEmail}</strong>. The full PDF is available after secure checkout.</>
                : data.emailConfigured
                  ? <>A PDF report will be emailed to <strong>{submittedEmail}</strong>.</>
                  : <>Your results were saved for <strong>{submittedEmail}</strong>.</>}
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
            {!isPreviewMode ? (
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
            ) : null}
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

  if (!hasStarted && autoresParam !== "1") {
    const questionCount = visibleQuestions.length;
    const estimatedMinutes = Math.max(1, Math.ceil(questionCount * 0.35));
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <Link href="/demo" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to examples
          </Link>
          <div className="rounded-3xl border bg-card shadow-xl shadow-primary/5 overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-primary via-blue-400 to-emerald-400" />
            <div className="p-7 md:p-10 space-y-8">
              <div className="space-y-4">
                <Badge variant="secondary" className="rounded-full px-3 py-1">Personalized assessment</Badge>
                <div className="space-y-3">
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{definition.name ?? data.pack.name}</h1>
                  {definition.description ? (
                    <p className="text-muted-foreground leading-relaxed">{definition.description}</p>
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">
                      Answer a few focused questions to get a result tailored to your situation, plus clear next steps.
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-muted/50 p-4">
                  <p className="text-2xl font-bold">{questionCount}</p>
                  <p className="text-sm text-muted-foreground">Questions</p>
                </div>
                <div className="rounded-2xl bg-muted/50 p-4">
                  <p className="text-2xl font-bold">{estimatedMinutes} min</p>
                  <p className="text-sm text-muted-foreground">Estimated time</p>
                </div>
              </div>
              {startError ? <p role="alert" className="text-sm text-destructive">{startError}</p> : null}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Button size="lg" onClick={handleStart} disabled={startLoading || questionCount === 0} className="h-12 px-7">
                  {startLoading ? "Preparing your assessment…" : "Start assessment"}
                  {!startLoading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                </Button>
                <p className="text-xs text-muted-foreground">Your progress is saved for this session. Results are unlocked with your email.</p>
              </div>
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground">Powered by QuizProQuo · Secure, mobile-friendly assessments</p>
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
  const canContinue = currentQuestion.required === false || hasAnswer;
  const type = currentQuestion.type;
  const isChoice = isSingleChoiceQuestion(type) || isBooleanQuestion(type);
  const isAutoAdvanceChoice = type === "single" || type === "select" || isBooleanQuestion(type);
  const isNumberInput = type === "number" || type === "percent";
  const isMultiChoice = type === "multi";
  const isLongText = type === "long_text";
  const isDateInput = type === "date";
  const isScaleInput = type === "scale_1_5" || type === "scale_1_10";

  const options = currentQuestion.options ?? [];
  const booleanLabels = type === "true_false"
    ? [
        { id: "true", label: "True", value: true as AnswerValue },
        { id: "false", label: "False", value: false as AnswerValue },
      ]
    : [
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
            {currentQuestion.section ? (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{currentQuestion.section}</p>
            ) : null}
            <h2 className="text-xl md:text-2xl font-semibold leading-snug">
              {currentQuestion.prompt}
            </h2>
            {currentQuestion.helpText ? (
              <p className="text-sm text-muted-foreground">{currentQuestion.helpText}</p>
            ) : null}

            {/* Yes/No */}
            {isBooleanQuestion(type) ? (
              <div className="grid grid-cols-2 gap-3">
                {booleanLabels.map((opt) => {
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

            {type === "dropdown" ? (
              <Select
                value={typeof currentAnswer === "string" ? currentAnswer : undefined}
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              >
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => {
                    const optValue = option.value ?? option.id;
                    return (
                      <SelectItem key={option.id} value={String(optValue)}>
                        {option.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : null}

            {isMultiChoice ? (
              <div className="flex flex-col gap-2.5">
                {options.map((option) => {
                  const optValue = String(option.value ?? option.id);
                  const selectedValues = Array.isArray(currentAnswer)
                    ? currentAnswer.map(String)
                    : [];
                  const selected = selectedValues.includes(optValue);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        const nextValues = selected
                          ? selectedValues.filter((value) => value !== optValue)
                          : [...selectedValues, optValue];
                        handleAnswerChange(currentQuestion.id, nextValues);
                      }}
                      className={`w-full text-left rounded-xl border-2 px-5 py-4 text-sm font-medium transition-all duration-150 ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={selected} />
                        <span>{option.label}</span>
                      </div>
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
                placeholder={type === "percent" ? "Enter a percentage" : "Enter a number"}
                autoFocus
              />
            ) : null}

            {isScaleInput ? (
              <Input
                type="range"
                min={1}
                max={type === "scale_1_5" ? 5 : 10}
                step={1}
                className="w-full"
                value={typeof currentAnswer === "number" ? currentAnswer : 1}
                onChange={(e) => handleAnswerChange(currentQuestion.id, Number(e.target.value))}
              />
            ) : null}

            {isScaleInput ? (
              <div className="text-center">
                <p className="text-4xl font-bold text-foreground">
                  {typeof currentAnswer === "number" ? currentAnswer : 1}
                </p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1">
                  Selected value
                </p>
              </div>
            ) : null}

            {/* Text inputs */}
            {isTextQuestion(type) && !isLongText && !isDateInput ? (
              <Input
                type="text"
                className="text-base h-12"
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                placeholder="Type your answer"
                autoFocus
              />
            ) : null}

            {isDateInput ? (
              <Input
                type="date"
                className="text-base h-12"
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                autoFocus
              />
            ) : null}

            {isLongText ? (
              <Textarea
                className="text-base min-h-32"
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
          {isAutoAdvanceChoice && isLastQuestion ? (
            <Button
              onClick={handleSeeResults}
              disabled={!canContinue}
              className="gap-1.5"
            >
              See Results
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : isAutoAdvanceChoice ? (
            <span className="text-xs text-muted-foreground">Select an option to continue</span>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canContinue}
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
