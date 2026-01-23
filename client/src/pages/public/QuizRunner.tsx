import { useState, useEffect, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Lock, Download, ChevronRight, Clock, HelpCircle, ArrowRight, AlertOctagon, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Quiz, Question, Submission, Outcome } from "@/lib/mock-data";

export default function QuizRunner() {
  const [, params] = useRoute("/quiz/:slug");
  const slug = params?.slug;
  
  // Data State
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentQId, setCurrentQId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [calculatedValues, setCalculatedValues] = useState<Record<string, any>>({});
  const [quizOutcome, setQuizOutcome] = useState<Outcome | null>(null);
  
  // UI State
  const [status, setStatus] = useState<'landing' | 'running' | 'paywall' | 'results' | 'knockout'>('landing');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = storage.getQuizzes().find(q => q.slug === slug);
    if (q) {
      setQuiz(q);
      if (q.questions.length > 0) setCurrentQId(q.questions[0].id);
    }
  }, [slug]);

  if (!quiz) return <div className="min-h-screen flex items-center justify-center">Quiz not found</div>;

  const currentQ = quiz.questions.find(q => q.id === currentQId);
  const progress = quiz.questions.findIndex(q => q.id === currentQId) / quiz.questions.length * 100;

  // --- Logic Engine ---

  const evaluateExpression = (expr: string, context: any) => {
    try {
      // Very naive safe eval replacement for demo. 
      // In prod use a proper parser. 
      // Replacing variables with values from context.
      
      const keys = Object.keys(context).sort((a, b) => b.length - a.length); // match longest keys first
      let parsed = expr;
      
      keys.forEach(k => {
        let val = context[k];
        if (typeof val === 'string' && isNaN(Number(val))) val = `"${val}"`; 
        // Handle undefined/null as 0 for math
        if (val === undefined || val === null) val = 0;
        parsed = parsed.replaceAll(k, String(val));
      });

      // eslint-disable-next-line no-new-func
      return new Function(`return ${parsed}`)();
    } catch (err) {
      console.error(`Error evaluating ${expr}:`, err);
      return null;
    }
  };

  const getContext = () => {
    // Map answer values to keys
    const context: Record<string, any> = {};
    
    quiz.questions.forEach(q => {
      const val = answers[q.id];
      if (q.key) {
        // If option based, try to resolve value number if possible, else raw
        if (['single','dropdown','yes_no','true_false'].includes(q.type)) {
           const opt = q.options?.find(o => o.value == val); // loose equality
           if (opt) {
             // If option value is numeric string, convert
             context[q.key] = !isNaN(Number(opt.value)) ? Number(opt.value) : opt.value;
           } else {
             context[q.key] = !isNaN(Number(val)) ? Number(val) : val;
           }
        } else {
           context[q.key] = !isNaN(Number(val)) ? Number(val) : val;
        }
      }
    });

    // Add calculated fields already computed? 
    // We compute them at the end usually, but for branching we might need them live? 
    // For this version, let's assume Calc fields are end-of-quiz. Branching uses raw answers.
    return context;
  };

  const computeResults = () => {
    // 1. Calculate Fields
    const context = getContext();
    const computed: Record<string, any> = {};
    
    quiz.calculatedFields.forEach(cf => {
      const val = evaluateExpression(cf.expression, { ...context, ...computed });
      computed[cf.key] = val;
    });
    setCalculatedValues(computed);

    // 2. Evaluate Rules (Outcomes/Knockouts)
    let finalOutcome: Outcome | null = null;
    const finalContext = { ...context, ...computed };

    // Find first matching rule
    for (const rule of quiz.outcomes) {
      if (rule.type === 'knockout' && rule.condition) {
        if (evaluateExpression(rule.condition, finalContext)) {
          finalOutcome = rule;
          break;
        }
      } else if (rule.type === 'threshold' && rule.metric) {
        const val = finalContext[rule.metric];
        const threshold = rule.threshold || 0;
        let match = false;
        
        switch (rule.operator) {
          case '>': match = val > threshold; break;
          case '>=': match = val >= threshold; break;
          case '<': match = val < threshold; break;
          case '<=': match = val <= threshold; break;
          case '==': match = val == threshold; break;
        }
        
        if (match) {
          finalOutcome = rule;
          break; // First match wins logic
        }
      }
    }

    setQuizOutcome(finalOutcome);
    
    // Save Submission
    const subId = `sub-${Date.now()}`;
    const submission: Submission = {
      id: subId,
      quizId: quiz.id,
      answers,
      calculatedValues: computed,
      score: 0, // todo: calc score if needed
      outcome: finalOutcome ? {
        label: finalOutcome.label,
        severity: finalOutcome.severity,
        message: finalOutcome.message
      } : undefined,
      paid: !quiz.gateResults,
      status: 'completed',
      startedAt: new Date().toISOString(), // Mock
      completedAt: new Date().toISOString()
    };
    storage.addSubmission(submission);

    // Navigate
    if (finalOutcome?.type === 'knockout') {
      setStatus('knockout');
    } else if (quiz.gateResults) {
      setStatus('paywall');
    } else {
      setStatus('results');
    }
  };

  const handleNext = () => {
    if (!currentQ) return;

    // Check Branching
    let nextId = currentQ.defaultNextQuestionId === 'finish' ? null : (currentQ.defaultNextQuestionId || 'next');
    
    if (currentQ.branchingRules) {
      for (const rule of currentQ.branchingRules) {
        const ans = answers[currentQ.id];
        let match = false;
        // Naive comparisons
        if (rule.condition === 'equals') match = ans == rule.value;
        if (rule.condition === 'not_equals') match = ans != rule.value;
        if (rule.condition === 'greater_than') match = Number(ans) > Number(rule.value);
        if (rule.condition === 'less_than') match = Number(ans) < Number(rule.value);
        if (rule.condition === 'contains') match = String(ans).includes(rule.value);

        if (match) {
          nextId = rule.targetQuestionId === 'finish' ? null : rule.targetQuestionId;
          break;
        }
      }
    }

    if (nextId === 'next') {
      const idx = quiz.questions.findIndex(q => q.id === currentQ.id);
      if (idx < quiz.questions.length - 1) {
        setCurrentQId(quiz.questions[idx + 1].id);
      } else {
        computeResults();
      }
    } else if (nextId) {
      setCurrentQId(nextId);
    } else {
      computeResults();
    }
  };

  // --- Renderers ---

  const renderInput = () => {
    if (!currentQ) return null;
    const val = answers[currentQ.id];

    switch (currentQ.type) {
      case 'yes_no':
      case 'true_false':
        return (
          <div className="grid grid-cols-2 gap-4">
            {['Yes', 'No'].map(opt => (
              <Button 
                key={opt} 
                variant={val === (opt === 'Yes') ? 'default' : 'outline'} 
                className="h-16 text-lg"
                onClick={() => setAnswers(p => ({...p, [currentQ.id]: opt === 'Yes'}))}
              >
                {opt}
              </Button>
            ))}
          </div>
        );
      
      case 'single':
        return (
          <RadioGroup value={val} onValueChange={v => setAnswers(p => ({...p, [currentQ.id]: v}))}>
            <div className="space-y-3">
              {currentQ.options?.map(opt => (
                <div key={opt.id} className={cn("flex items-center space-x-2 border p-4 rounded-lg cursor-pointer hover:bg-muted/50", val === opt.value && "border-primary bg-primary/5")}>
                  <RadioGroupItem value={String(opt.value)} id={opt.id} />
                  <Label htmlFor={opt.id} className="flex-1 cursor-pointer">{opt.label}</Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        );

      case 'multi':
        return (
          <div className="space-y-3">
            {currentQ.options?.map(opt => {
              const selected = (val || []) as any[];
              const isSel = selected.includes(opt.value);
              return (
                <div 
                  key={opt.id} 
                  className={cn("flex items-center space-x-2 border p-4 rounded-lg cursor-pointer hover:bg-muted/50", isSel && "border-primary bg-primary/5")}
                  onClick={() => {
                    const newSel = isSel ? selected.filter(s => s !== opt.value) : [...selected, opt.value];
                    setAnswers(p => ({...p, [currentQ.id]: newSel}));
                  }}
                >
                  <Checkbox checked={isSel} />
                  <Label className="flex-1 cursor-pointer">{opt.label}</Label>
                </div>
              );
            })}
          </div>
        );

      case 'dropdown':
        return (
          <Select value={val} onValueChange={v => setAnswers(p => ({...p, [currentQ.id]: v}))}>
            <SelectTrigger className="h-12"><SelectValue placeholder="Select an option"/></SelectTrigger>
            <SelectContent>
              {currentQ.options?.map(opt => (
                <SelectItem key={opt.id} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'short_text':
      case 'date':
        return <Input 
          type={currentQ.type === 'date' ? 'date' : 'text'} 
          value={val || ''} 
          onChange={e => setAnswers(p => ({...p, [currentQ.id]: e.target.value}))} 
          className="h-12 text-lg"
        />;

      case 'long_text':
        return <Textarea 
          value={val || ''} 
          onChange={e => setAnswers(p => ({...p, [currentQ.id]: e.target.value}))} 
          className="min-h-[150px] text-lg"
        />;

      case 'number':
      case 'percent':
        return (
          <div className="relative">
            <Input 
              type="number" 
              value={val || ''} 
              onChange={e => setAnswers(p => ({...p, [currentQ.id]: parseFloat(e.target.value)}))} 
              className="h-16 text-2xl text-center"
              placeholder="0"
            />
            {currentQ.type === 'percent' && <div className="absolute right-4 top-1/2 -translate-y-1/2 font-bold">%</div>}
          </div>
        );

      case 'scale_1_5':
      case 'scale_1_10':
        const max = currentQ.type === 'scale_1_5' ? 5 : 10;
        return (
          <div className="space-y-6">
            <div className="text-center text-4xl font-bold text-primary">{val || 1}</div>
            <Slider 
              min={1} max={max} step={1} 
              value={[val || 1]} 
              onValueChange={v => setAnswers(p => ({...p, [currentQ.id]: v[0]}))}
            />
            <div className="flex justify-between text-xs text-muted-foreground uppercase">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        );
    }
  };

  // --- Views ---

  if (status === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-2xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="text-5xl font-display font-bold">{quiz.title}</h1>
          <p className="text-xl text-muted-foreground">{quiz.description}</p>
          <div className="flex justify-center gap-8 py-8">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold">{quiz.questions.length}</span>
              <span className="text-xs uppercase text-muted-foreground">Questions</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold">{Math.ceil(quiz.questions.length * 0.5)}m</span>
              <span className="text-xs uppercase text-muted-foreground">Time</span>
            </div>
          </div>
          <Button size="lg" className="h-16 px-12 text-xl rounded-full" onClick={() => setStatus('running')}>
            Start Quiz <ArrowRight className="ml-2"/>
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'running' && currentQ) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/10">
        <div className="h-2 bg-muted w-full"><motion.div className="h-full bg-primary" initial={{width: 0}} animate={{width: `${progress}%`}} /></div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentQ.id}
              initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                {currentQ.category && <span className="text-xs font-bold text-primary tracking-widest uppercase">{currentQ.category}</span>}
                <h2 className="text-3xl font-medium">{currentQ.text}</h2>
                {currentQ.helpText && <p className="text-muted-foreground">{currentQ.helpText}</p>}
              </div>
              
              <div className="py-4">
                {renderInput()}
              </div>

              <div className="flex justify-end pt-8">
                <Button size="lg" className="px-8" onClick={handleNext} disabled={currentQ.required && (answers[currentQ.id] === undefined || answers[currentQ.id] === "")}>
                  Next <ChevronRight className="ml-2 w-4 h-4"/>
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  if (status === 'knockout' || status === 'results') {
    const isKnockout = status === 'knockout';
    const severityColor = quizOutcome?.severity === 'fail' ? 'text-red-600 bg-red-50' : quizOutcome?.severity === 'caution' ? 'text-yellow-600 bg-yellow-50' : 'text-green-600 bg-green-50';
    
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-xl w-full shadow-2xl border-t-8 border-t-primary">
          <CardContent className="pt-12 pb-12 px-8 text-center space-y-8">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${severityColor}`}>
              {isKnockout ? <AlertOctagon className="w-12 h-12"/> : <CheckCircle2 className="w-12 h-12"/>}
            </div>
            
            <div>
              <h2 className="text-4xl font-bold font-display mb-2">{quizOutcome?.label || "Result"}</h2>
              <p className="text-xl text-muted-foreground">{quizOutcome?.message}</p>
            </div>

            {!isKnockout && (
              <div className="grid grid-cols-2 gap-4 text-left bg-muted/30 p-6 rounded-lg">
                {Object.entries(calculatedValues).map(([key, val]) => (
                  <div key={key}>
                    <div className="text-xs text-muted-foreground uppercase">{key}</div>
                    <div className="text-xl font-mono font-bold">{typeof val === 'number' ? val.toFixed(2) : val}</div>
                  </div>
                ))}
              </div>
            )}

            <Link href="/">
              <Button variant="outline" className="mt-8">Return Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <div>Loading...</div>;
}
