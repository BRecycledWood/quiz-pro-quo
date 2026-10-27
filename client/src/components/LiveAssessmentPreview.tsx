import { useEffect, useMemo, useState } from "react";
import { Bug, CheckCircle2, Circle, Monitor, RotateCcw, Smartphone, Sparkles } from "lucide-react";
import type { Answers, AnswerValue, PackDefinition } from "@shared/pack";
import type { Workspace } from "@shared/schema";
import { evaluatePackDetailed, getNextQuestionId, getVisibleQuestionIds } from "@shared/engine/interpreter";
import { getBrandCssVariables, resolvePackBranding } from "@shared/branding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const isBoolean = (type: string) => ["boolean", "yesno", "yes_no", "true_false"].includes(type);
const isNumber = (type: string) => ["number", "percent"].includes(type);
const isLongText = (type: string) => type === "long_text";

function isAnswered(value: AnswerValue | undefined) {
  if (value === null || value === undefined) return false;
  return Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : true;
}

function statusTone(status?: string) {
  if (status === "fail") return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200";
  if (status === "caution") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
}

function PreviewFrame({
  definition,
  workspace,
  answers,
  setAnswer,
  onReset,
}: {
  definition: PackDefinition;
  workspace?: Workspace | null;
  answers: Answers;
  setAnswer: (questionId: string, value: AnswerValue) => void;
  onReset: () => void;
}) {
  const visibleIds = useMemo(() => getVisibleQuestionIds(definition, answers), [definition, answers]);
  const visibleQuestions = definition.questions.filter((question) => visibleIds.includes(question.id));
  const evaluation = useMemo(() => evaluatePackDetailed(definition, answers), [definition, answers]);
  const [started, setStarted] = useState(false);
  const [resultShown, setResultShown] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [answerError, setAnswerError] = useState("");

  useEffect(() => {
    if (!started || resultShown) return;
    if (currentQuestionId && visibleIds.includes(currentQuestionId)) return;
    setCurrentQuestionId(visibleIds[0] ?? null);
  }, [started, resultShown, currentQuestionId, visibleIds.join("|")]);

  const question = visibleQuestions.find((item) => item.id === currentQuestionId) ?? visibleQuestions[0] ?? null;
  const questionIndex = question ? visibleQuestions.findIndex((item) => item.id === question.id) : 0;
  const nextId = question ? getNextQuestionId(definition, question.id, answers) : null;
  const required = question ? evaluation.requiredQuestionIds.includes(question.id) : false;
  const currentAnswer = question ? answers[question.id] : undefined;
  const progress = visibleQuestions.length ? (questionIndex + 1) / visibleQuestions.length * 100 : 0;
  const resolvedBranding = resolvePackBranding(workspace, definition.branding);
  const brandStyle = getBrandCssVariables(resolvedBranding) as React.CSSProperties;
  const logo = resolvedBranding.logoDataUrl ?? resolvedBranding.logoUrl;
  const sectionTitle = question?.sectionId
    ? definition.sections?.find((section) => section.id === question.sectionId)?.title ?? question.section
    : question?.section;

  const start = () => {
    setStarted(true);
    setCurrentQuestionId(visibleIds[0] ?? null);
    if (visibleIds.length === 0) setResultShown(true);
  };
  const reset = () => {
    setStarted(false);
    setResultShown(false);
    setCurrentQuestionId(null);
    setHistory([]);
    setAnswerError("");
    onReset();
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setCurrentQuestionId(previous);
    setAnswerError("");
  };
  const goNext = () => {
    if (!question) return;
    if (required && !isAnswered(currentAnswer)) {
      setAnswerError("Answer this question to continue.");
      return;
    }
    setAnswerError("");
    if (!nextId) {
      setResultShown(true);
      return;
    }
    setHistory((items) => [...items, question.id]);
    setCurrentQuestionId(nextId);
  };

  const heading = resolvedBranding.brandName || workspace?.name || definition.name || "Assessment";
  const style = resolvedBranding.progressStyle ?? "bar";

  return (
    <div className="assessment-brand h-full min-h-0 overflow-auto bg-background text-foreground" style={brandStyle} data-button-style={resolvedBranding.buttonStyle}>
      <div className="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-5 sm:px-8 sm:py-7">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? <img src={logo} alt="" className="h-9 max-w-24 object-contain" /> : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>}
            <div className="min-w-0"><p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{heading}</p><p className="truncate text-sm font-semibold">{definition.name || "Untitled assessment"}</p></div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">Draft preview</Badge>
        </header>

        {!started ? (
          <div className="my-auto rounded-[1.6rem] border bg-card p-6 shadow-sm sm:p-9">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" />{visibleQuestions.length} questions · about {Math.max(1, Math.ceil(visibleQuestions.length * 0.35))} min</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{definition.name || "Your assessment starts here"}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{definition.description || "A short, guided assessment designed to give you a useful next step."}</p>
            <Button onClick={start} className="mt-7 h-11 px-6" disabled={!visibleQuestions.length}>Begin assessment <span aria-hidden="true" className="ml-2">→</span></Button>
            <p className="mt-5 text-[11px] text-muted-foreground">Preview only. Answers stay in this browser and are discarded when you reset.</p>
          </div>
        ) : resultShown ? (
          <div className="my-auto space-y-5 rounded-[1.6rem] border bg-card p-6 shadow-sm sm:p-9">
            <div className="flex flex-wrap items-center gap-2"><Badge className={statusTone(evaluation.outcome?.status)}>{evaluation.outcome?.status ?? (evaluation.disqualified ? "fail" : "result")}</Badge><span className="text-xs text-muted-foreground">Draft evaluation · no submission created</span></div>
            <div><h2 className="text-2xl font-semibold">{evaluation.outcome?.title ?? (evaluation.disqualified ? "A rule was triggered" : "Your result")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{evaluation.outcome?.description || (evaluation.disqualified ? evaluation.reasons.join(" ") : "This is how the current draft evaluates these answers.")}</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-muted/60 p-4"><p className="text-2xl font-semibold tabular-nums">{evaluation.score}</p><p className="text-xs text-muted-foreground">Total score</p></div>{Object.entries(evaluation.categoryScores).map(([id, score]) => <div key={id} className="rounded-xl bg-muted/60 p-4"><p className="text-2xl font-semibold tabular-nums">{score}</p><p className="truncate text-xs text-muted-foreground">{definition.scoringCategories?.find((category) => category.id === id)?.label ?? id}</p></div>)}</div>
            {evaluation.reasons.length ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matched findings</p>{evaluation.reasons.map((reason) => <p key={reason} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{reason}</p>)}</div> : null}
            <Button variant="outline" onClick={reset} className="gap-2"><RotateCcw className="h-4 w-4" />Start again</Button>
          </div>
        ) : question ? (
          <div className="my-auto rounded-[1.6rem] border bg-card p-5 shadow-sm sm:p-8">
            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Question {questionIndex + 1} of {visibleQuestions.length}</span><span>{required ? "Required" : "Optional"}</span></div>
              {style === "steps" ? <div className="flex gap-1.5" aria-label={`Question ${questionIndex + 1} of ${visibleQuestions.length}`}>{visibleQuestions.map((item, index) => <span key={item.id} className={`h-1.5 flex-1 rounded-full ${index <= questionIndex ? "bg-primary" : "bg-muted"}`} />)}</div> : style === "minimal" ? <p className="text-right text-[11px] text-muted-foreground">{Math.round(progress)}% complete</p> : <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, progress)}%` }} /></div>}
              {sectionTitle ? <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">{sectionTitle}</p> : null}
              <h2 className="text-xl font-semibold leading-snug">{question.prompt || "Untitled question"}</h2>
              {question.helpText ? <p className="text-sm text-muted-foreground">{question.helpText}</p> : null}
            </div>

            <div className="space-y-2.5">
              {isBoolean(question.type) ? <div className="grid grid-cols-2 gap-2.5">{[true, false].map((value) => { const label = question.type === "true_false" ? value ? "True" : "False" : value ? "Yes" : "No"; const selected = currentAnswer === value; return <button key={String(value)} type="button" aria-pressed={selected} onClick={() => setAnswer(question.id, value)} className={`rounded-xl border-2 px-4 py-4 text-sm font-semibold transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}>{label}</button>; })}</div> : null}
              {["single", "select"].includes(question.type) ? <div className="space-y-2">{(question.options ?? []).map((option) => { const value = option.value ?? option.id; const selected = currentAnswer === value; return <button key={option.id} type="button" aria-pressed={selected} onClick={() => setAnswer(question.id, value)} className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}>{option.label}</button>; })}</div> : null}
              {question.type === "dropdown" ? <select className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" aria-label={question.prompt} value={typeof currentAnswer === "string" ? currentAnswer : ""} onChange={(event) => setAnswer(question.id, event.target.value)}><option value="">Choose an option…</option>{(question.options ?? []).map((option) => <option key={option.id} value={option.value ?? option.id}>{option.label}</option>)}</select> : null}
              {question.type === "multi" ? <div className="space-y-2">{(question.options ?? []).map((option) => { const value = String(option.value ?? option.id); const selected = Array.isArray(currentAnswer) && currentAnswer.map(String).includes(value); return <button key={option.id} type="button" aria-pressed={selected} onClick={() => { const current = Array.isArray(currentAnswer) ? currentAnswer.map(String) : []; setAnswer(question.id, selected ? current.filter((item) => item !== value) : [...current, value]); }} className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm ${selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}><Checkbox checked={selected} />{option.label}</button>; })}</div> : null}
              {isNumber(question.type) ? <Input type="number" min={question.min} max={question.max} placeholder={question.placeholder ?? "Enter a number"} value={typeof currentAnswer === "number" ? String(currentAnswer) : ""} onChange={(event) => setAnswer(question.id, event.target.value === "" ? null : Number(event.target.value))} /> : null}
              {question.type === "date" ? <Input type="date" value={typeof currentAnswer === "string" ? currentAnswer : ""} onChange={(event) => setAnswer(question.id, event.target.value)} /> : null}
              {isLongText(question.type) ? <Textarea rows={4} placeholder={question.placeholder ?? "Type your answer…"} value={typeof currentAnswer === "string" ? currentAnswer : ""} onChange={(event) => setAnswer(question.id, event.target.value)} /> : null}
              {["text", "short_text"].includes(question.type) ? <Input placeholder={question.placeholder ?? "Type your answer…"} value={typeof currentAnswer === "string" ? currentAnswer : ""} onChange={(event) => setAnswer(question.id, event.target.value)} /> : null}
              {question.type === "scale_1_5" || question.type === "scale_1_10" ? <div className="flex flex-wrap gap-2">{Array.from({ length: question.type === "scale_1_5" ? 5 : 10 }, (_, index) => index + 1).map((value) => <button key={value} type="button" aria-pressed={currentAnswer === value} onClick={() => setAnswer(question.id, value)} className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-medium ${currentAnswer === value ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}>{value}</button>)}</div> : null}
            </div>
            {answerError ? <p role="alert" className="mt-3 text-xs text-destructive">{answerError}</p> : null}
            <div className="mt-7 flex items-center justify-between gap-3">
              <Button variant="outline" onClick={goBack} disabled={history.length === 0}>Back</Button>
              <Button onClick={goNext}>{nextId ? "Continue" : "See result"}<span aria-hidden="true" className="ml-2">→</span></Button>
            </div>
          </div>
        ) : (
          <div className="my-auto rounded-2xl border border-dashed p-8 text-center"><p className="text-sm font-medium">No visible questions</p><p className="mt-1 text-xs text-muted-foreground">This path currently evaluates to an empty assessment.</p><Button variant="outline" className="mt-4" onClick={() => setResultShown(true)}>Show result</Button></div>
        )}

        {resolvedBranding.showAttribution !== false ? <p className="mt-5 text-center text-[10px] text-muted-foreground">Powered by Quiz Pro Quo · Local preview only</p> : <p className="mt-5 text-center text-[10px] text-muted-foreground">Local preview only</p>}
      </div>
    </div>
  );
}

export default function LiveAssessmentPreview({
  definition,
  workspace,
  focusMode = false,
  onToggleFocus,
}: {
  definition: PackDefinition;
  workspace?: Workspace | null;
  focusMode?: boolean;
  onToggleFocus?: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [resetVersion, setResetVersion] = useState(0);
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const [tab, setTab] = useState<"preview" | "debug">("preview");
  const evaluation = useMemo(() => evaluatePackDetailed(definition, answers), [definition, answers]);

  useEffect(() => {
    const allowed = new Set(definition.questions.map((question) => question.id));
    setAnswers((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => allowed.has(id))) as Answers);
  }, [definition.questions.map((question) => question.id).join("|")]);

  const resetAnswers = () => {
    setAnswers({});
    setResetVersion((value) => value + 1);
  };
  const setAnswer = (questionId: string, value: AnswerValue) => setAnswers((previous) => ({ ...previous, [questionId]: value }));

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#f6f7fb] dark:bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-3 dark:bg-card sm:px-4">
        <div className="flex items-center gap-1 rounded-lg bg-muted/70 p-1" role="tablist" aria-label="Preview tools">
          <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "preview" ? "bg-white shadow-sm dark:bg-card" : "text-muted-foreground"}`}><Sparkles className="mr-1.5 inline h-3.5 w-3.5" />Preview</button>
          <button type="button" role="tab" aria-selected={tab === "debug"} onClick={() => setTab("debug")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === "debug" ? "bg-white shadow-sm dark:bg-card" : "text-muted-foreground"}`}><Bug className="mr-1.5 inline h-3.5 w-3.5" />Logic trace</button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant={mode === "desktop" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-label="Desktop preview" onClick={() => setMode("desktop")}><Monitor className="h-4 w-4" /></Button>
          <Button type="button" variant={mode === "mobile" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" aria-label="Mobile preview" onClick={() => setMode("mobile")}><Smartphone className="h-4 w-4" /></Button>
          {onToggleFocus ? <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"} onClick={onToggleFocus}><span className="text-base" aria-hidden="true">{focusMode ? "⊙" : "⛶"}</span></Button> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />Draft preview · changes update instantly</div>
          {tab === "preview" ? <Button variant="ghost" size="sm" onClick={resetAnswers} className="h-7 gap-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />Reset preview</Button> : null}
        </div>
        {tab === "preview" ? (
          <div className={`mx-auto overflow-hidden rounded-2xl border bg-background shadow-xl shadow-slate-300/30 dark:shadow-black/25 ${mode === "mobile" ? "max-w-[390px]" : "max-w-4xl"}`}>
            {mode === "mobile" ? <div className="flex h-6 items-center justify-center bg-slate-900"><div className="h-1 w-14 rounded-full bg-slate-500" /></div> : null}
            <div className={`${mode === "mobile" ? "min-h-[620px]" : "min-h-[570px]"}`}>
              <PreviewFrame key={`${definition.id ?? "draft"}:${resetVersion}`} definition={definition} workspace={workspace} answers={answers} setAnswer={setAnswer} onReset={resetAnswers} />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="rounded-xl border bg-white p-4 dark:bg-card"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Evaluation snapshot</p><p className="text-xs text-muted-foreground">Calculated locally from the answers shown in the preview.</p></div><Badge variant={evaluation.diagnostics.some((item) => item.severity === "error") ? "destructive" : "secondary"}>{evaluation.diagnostics.filter((item) => item.severity === "error").length} errors · {evaluation.diagnostics.filter((item) => item.severity === "warning").length} warnings</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-muted/60 p-3"><p className="text-lg font-semibold">{evaluation.score}</p><p className="text-[10px] text-muted-foreground">Score</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="truncate text-sm font-semibold">{evaluation.outcome?.title ?? "—"}</p><p className="text-[10px] text-muted-foreground">Outcome</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="text-sm font-semibold">{evaluation.visibleQuestionIds.length}</p><p className="text-[10px] text-muted-foreground">Visible questions</p></div><div className="rounded-lg bg-muted/60 p-3"><p className="text-sm font-semibold">{Object.keys(answers).length}</p><p className="text-[10px] text-muted-foreground">Answered</p></div></div></div>
            {evaluation.diagnostics.length ? <div className="rounded-xl border bg-white p-4 dark:bg-card"><h3 className="mb-3 text-sm font-semibold">Logic diagnostics</h3><div className="space-y-2">{evaluation.diagnostics.map((item, index) => <div key={`${item.code}-${item.targetId ?? index}`} className="flex items-start gap-2 rounded-lg bg-muted/50 p-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.severity === "error" ? "bg-rose-500" : item.severity === "warning" ? "bg-amber-500" : "bg-sky-500"}`} /><div><p className="text-xs font-semibold">{item.message}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{item.severity}{item.targetId ? ` · ${item.targetId}` : ""}</p></div></div>)}</div></div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">No structural logic conflicts detected in this draft.</div>}
            <div className="rounded-xl border bg-white p-4 dark:bg-card"><h3 className="mb-3 text-sm font-semibold">Why did this happen?</h3>{evaluation.trace.length ? <div className="divide-y">{evaluation.trace.map((entry) => <div key={entry.id} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 shrink-0">{entry.fired === null ? <Circle className="h-4 w-4 text-muted-foreground" /> : entry.fired ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />}</span><div className="min-w-0"><p className="text-xs font-semibold">{entry.label}</p><p className="mt-0.5 break-words text-[11px] leading-5 text-muted-foreground">{entry.detail}</p></div></div>)}</div> : <p className="text-xs text-muted-foreground">Add logic or answer questions in the preview to see a trace.</p>}</div>
          </div>
        )}
      </div>
    </section>
  );
}
