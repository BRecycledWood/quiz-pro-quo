import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Lock, Download, ChevronRight, Clock, HelpCircle, ArrowRight, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function QuizRunner() {
  const [, params] = useRoute("/quiz/:slug");
  const slug = params?.slug;
  const [quiz, setQuiz] = useState(storage.getQuizzes().find(q => q.slug === slug));

  const [started, setStarted] = useState(false);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [finished, setFinished] = useState(false);
  const [paid, setPaid] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [knockoutMessage, setKnockoutMessage] = useState<string | null>(null);

  // Sync quiz data (for previewing edits live)
  useEffect(() => {
    const q = storage.getQuizzes().find(q => q.slug === slug);
    if (q) {
      setQuiz(q);
      if (!currentQuestionId && q.questions.length > 0) {
        setCurrentQuestionId(q.questions[0].id);
      }
    }
  }, [slug]);

  if (!quiz) return <div className="min-h-screen flex items-center justify-center">Quiz not found</div>;

  const currentQuestionIdx = quiz.questions.findIndex(q => q.id === currentQuestionId);
  const currentQuestion = quiz.questions[currentQuestionIdx];
  const progress = ((currentQuestionIdx + 1) / quiz.questions.length) * 100;
  
  // Calculate potential score
  const score = Object.entries(answers).reduce((acc, [qId, val]) => {
    const q = quiz.questions.find(q => q.id === qId);
    if (!q) return acc;
    
    // For single/multi select, val is option ID(s)
    if (q.type === 'single' || q.type === 'yes_no') {
      const opt = q.options?.find(o => o.id === val);
      return acc + (opt?.value || 0);
    }
    // Logic for other types would go here (e.g. number value itself)
    return acc;
  }, 0);

  const handleStart = () => {
    setStarted(true);
    setCurrentQuestionId(quiz.questions[0].id);
    // Create submission record
    const subId = `sub-${Date.now()}`;
    setSubmissionId(subId);
    storage.addSubmission({
      id: subId,
      quizId: quiz.id,
      answers: {},
      score: 0,
      paid: false,
      status: 'started',
      startedAt: new Date().toISOString()
    });
  };

  const handleAnswer = (value: any) => {
    if (!currentQuestion) return;
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
  };

  const evaluateFormula = (formula: string, currentAnswers: Record<string, any>) => {
    try {
      // Replace variables with values
      let expression = formula;
      quiz.questions.forEach(q => {
        if (q.variableName) {
           // Get raw value or option value if applicable
           let val = currentAnswers[q.id];
           
           // If it's an option ID, we might need to look up its value or text? 
           // For simple math, let's assume we want the option 'value' property if it exists, or the raw input if it's a number.
           if (['single', 'yes_no'].includes(q.type)) {
             const opt = q.options?.find(o => o.id === val);
             val = opt?.value || 0;
           }
           
           expression = expression.replace(new RegExp(q.variableName, 'g'), String(Number(val) || 0));
        }
      });
      
      // Safety check: only allow basic math
      if (!/^[0-9+\-*/().\s]*$/.test(expression)) return 0;
      
      // eslint-disable-next-line no-new-func
      return new Function(`return ${expression}`)();
    } catch (e) {
      console.error("Formula error", e);
      return 0;
    }
  };

  const checkKnockoutRules = (newAnswers: Record<string, any>) => {
    if (!quiz.knockoutRules) return null;

    for (const rule of quiz.knockoutRules) {
      try {
        let condition = rule.logic;
        // Replace question variables
        quiz.questions.forEach(q => {
          if (q.variableName) {
            let val = newAnswers[q.id];
            // Resolve option values
            if (['single', 'yes_no'].includes(q.type)) {
               const opt = q.options?.find(o => o.id === val);
               val = opt?.value || 0;
            }
            condition = condition.replace(new RegExp(q.variableName, 'g'), String(Number(val) || 0));
          }
        });
        
        // Resolve calculated fields
        quiz.calculatedFields?.forEach(cf => {
           const val = evaluateFormula(cf.formula, newAnswers);
           condition = condition.replace(new RegExp(cf.variable, 'g'), String(val));
        });

        // Evaluate
        // eslint-disable-next-line no-new-func
        const result = new Function(`return ${condition}`)();
        if (result) return rule.message;

      } catch (e) {
        console.error("Knockout logic error", e);
      }
    }
    return null;
  };

  const getNextQuestionId = () => {
    if (!currentQuestion) return null;
    
    // 1. Check Branching Rules
    if (currentQuestion.branchingRules && currentQuestion.branchingRules.length > 0) {
       for (const rule of currentQuestion.branchingRules) {
          const answer = answers[currentQuestion.id];
          let match = false;
          
          if (rule.condition === 'equals') match = answer == rule.value;
          if (rule.condition === 'not_equals') match = answer != rule.value;
          if (rule.condition === 'greater_than') match = Number(answer) > Number(rule.value);
          if (rule.condition === 'less_than') match = Number(answer) < Number(rule.value);
          
          if (match) return rule.nextQuestionId === 'finish' ? null : rule.nextQuestionId;
       }
    }

    // 2. Default Next
    const idx = quiz.questions.findIndex(q => q.id === currentQuestion.id);
    if (idx < quiz.questions.length - 1) {
      return quiz.questions[idx + 1].id;
    }
    return null;
  };

  const handleNext = () => {
    // Check knockout
    const koMsg = checkKnockoutRules(answers);
    if (koMsg) {
      setKnockoutMessage(koMsg);
      setFinished(true);
      return;
    }

    const nextId = getNextQuestionId();
    if (nextId) {
      setCurrentQuestionId(nextId);
    } else {
      handleFinish();
    }
  };
  
  const handleFinish = () => {
    setFinished(true);
    if (!quiz.gateResults) {
      setPaid(true);
    }
  };

  const handlePay = () => {
    setTimeout(() => {
      setPaid(true);
    }, 1500);
  };

  // --- RENDERERS ---

  const renderQuestionInput = () => {
    if (!currentQuestion) return null;

    switch (currentQuestion.type) {
      case 'single':
      case 'yes_no':
        return (
          <RadioGroup onValueChange={handleAnswer} value={answers[currentQuestion.id]}>
            <div className="space-y-4">
              {currentQuestion.options?.map((option) => (
                <Label
                  key={option.id}
                  htmlFor={option.id}
                  className={cn(
                    "flex items-center space-x-4 border-2 p-6 rounded-2xl cursor-pointer transition-all hover:bg-background hover:border-primary/50",
                    answers[currentQuestion.id] === option.id 
                      ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20" 
                      : "bg-white border-transparent shadow-sm hover:shadow-md"
                  )}
                >
                  <RadioGroupItem value={option.id} id={option.id} className="w-6 h-6 border-2" />
                  <span className="text-xl font-medium">{option.text}</span>
                </Label>
              ))}
            </div>
          </RadioGroup>
        );
      
      case 'multiple':
        return (
           <div className="space-y-4">
              {currentQuestion.options?.map((option) => {
                 const currentVal = (answers[currentQuestion.id] || []) as string[];
                 const isChecked = currentVal.includes(option.id);
                 return (
                    <div 
                      key={option.id}
                      className={cn(
                        "flex items-center space-x-4 border-2 p-6 rounded-2xl cursor-pointer transition-all hover:bg-background hover:border-primary/50",
                        isChecked
                          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20" 
                          : "bg-white border-transparent shadow-sm hover:shadow-md"
                      )}
                      onClick={() => {
                         const newVal = isChecked 
                            ? currentVal.filter(id => id !== option.id) 
                            : [...currentVal, option.id];
                         handleAnswer(newVal);
                      }}
                    >
                      <Checkbox checked={isChecked} className="w-6 h-6 border-2" />
                      <span className="text-xl font-medium">{option.text}</span>
                    </div>
                 );
              })}
           </div>
        );

      case 'short_text':
        return (
          <Input 
             className="text-lg p-6 h-16" 
             placeholder="Type your answer here..." 
             value={answers[currentQuestion.id] || ''}
             onChange={(e) => handleAnswer(e.target.value)}
          />
        );

      case 'long_text':
        return (
          <Textarea 
             className="text-lg p-6 min-h-[150px]" 
             placeholder="Type your answer here..." 
             value={answers[currentQuestion.id] || ''}
             onChange={(e) => handleAnswer(e.target.value)}
          />
        );

      case 'number':
      case 'percent':
        return (
          <div className="relative">
             <Input 
               type="number"
               className="text-2xl p-6 h-20 text-center font-bold" 
               placeholder="0" 
               value={answers[currentQuestion.id] || ''}
               onChange={(e) => handleAnswer(e.target.value)}
            />
            {currentQuestion.type === 'percent' && (
               <div className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xl">%</div>
            )}
          </div>
        );

      case 'scale':
        return (
          <div className="space-y-6">
             <div className="text-center text-4xl font-bold text-primary">
                {answers[currentQuestion.id] || 5}
             </div>
             <Slider 
                min={1} 
                max={10} 
                step={1} 
                value={[Number(answers[currentQuestion.id] || 5)]}
                onValueChange={(vals) => handleAnswer(vals[0])}
                className="py-4"
             />
             <div className="flex justify-between text-muted-foreground text-sm font-medium uppercase tracking-wide">
                <span>Not Likely</span>
                <span>Very Likely</span>
             </div>
          </div>
        );

      default:
        return <div>Unsupported Question Type</div>;
    }
  };

  // --- VIEWS ---

  // Landing Page View
  if (!started) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Background blobs */}
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-400/10 blur-3xl" />
        
        <div className="max-w-3xl w-full space-y-10 text-center relative z-10">
          {quiz.image && (
            <div className="w-full h-80 rounded-2xl overflow-hidden shadow-2xl mb-8 border-4 border-background ring-1 ring-black/5 mx-auto max-w-2xl">
              <img src={quiz.image} alt={quiz.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
            </div>
          )}
          
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-primary font-display leading-tight">
              {quiz.title}
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              {quiz.description}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-lg mx-auto py-6">
            <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border">
              <HelpCircle className="w-6 h-6 text-primary mb-2" />
              <span className="font-bold text-lg">{quiz.questions.length}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Questions</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border">
              <Clock className="w-6 h-6 text-primary mb-2" />
              <span className="font-bold text-lg">{Math.ceil(quiz.questions.length * 0.5)} min</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Time</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-muted/30 rounded-lg border col-span-2 md:col-span-1">
              <Download className="w-6 h-6 text-primary mb-2" />
              <span className="font-bold text-lg">PDF</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Report</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            {quiz.gateResults && quiz.discountEnabled && quiz.originalPrice && (
               <div className="flex items-center gap-3 bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100">
                  <span className="text-sm font-bold">Limited Offer:</span>
                  <span className="text-sm line-through opacity-70">${quiz.originalPrice}</span>
                  <span className="text-lg font-bold">${quiz.price}</span>
               </div>
            )}
            
            <Button size="lg" className="h-16 px-12 text-xl w-full sm:w-auto shadow-xl shadow-primary/20 rounded-xl" onClick={handleStart}>
              Start Assessment
              <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Knockout View
  if (knockoutMessage) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-2 border-orange-500/20 shadow-2xl">
          <CardContent className="pt-10 pb-10 px-8 text-center space-y-6">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto text-orange-600">
              <AlertOctagon className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Not Qualified</h2>
              <p className="text-muted-foreground mt-4 text-lg">
                {knockoutMessage}
              </p>
            </div>
            <Link href="/">
               <Button variant="outline" className="mt-4">Return Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Paywall View
  if (finished && !paid && quiz.gateResults) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full border-2 border-primary/20 shadow-2xl overflow-hidden">
          <div className="h-2 bg-primary w-full" />
          <CardContent className="pt-10 pb-10 px-8 text-center space-y-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary animate-pulse">
              <Lock className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold font-display">Unlock Your Results</h2>
              <p className="text-muted-foreground text-lg">
                Your detailed analysis is ready. Pay a one-time fee to access your personalized report and PDF download.
              </p>
            </div>
            
            <div className="py-6 bg-muted/30 rounded-xl border border-dashed border-primary/20">
               {quiz.discountEnabled && quiz.originalPrice && (
                 <div className="text-muted-foreground line-through text-lg mb-1">
                   ${quiz.originalPrice}
                 </div>
               )}
               <div className="text-5xl font-bold text-primary">
                 ${quiz.price}
               </div>
               <div className="text-sm text-green-600 font-medium mt-2">
                 One-time payment • Secure Checkout
               </div>
            </div>

            <Button size="lg" className="w-full h-14 text-lg font-bold" onClick={handlePay}>
              Unlock Now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Results View
  if (finished && (paid || !quiz.gateResults)) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-10 pt-10">
          <div className="text-center space-y-6">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-6 animate-in zoom-in duration-500 shadow-lg shadow-green-100">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <h1 className="text-5xl font-bold font-display">Assessment Complete</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Thank you for completing the {quiz.title}. Here is your personalized breakdown.
            </p>
          </div>

          <Card className="border-t-4 border-t-primary shadow-2xl overflow-hidden">
            <CardContent className="pt-10 pb-10 px-8">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-3xl font-bold mb-2">Result: <span className="text-primary">Processed</span></h3>
                    <p className="text-muted-foreground text-lg leading-relaxed">
                      We have analyzed your answers. Your data indicates specific opportunities for improvement.
                    </p>
                  </div>
                  <Button className="w-full md:w-auto h-12 text-base" size="lg">
                    <Download className="mr-2 w-5 h-5" />
                    Download PDF Report
                  </Button>
                </div>
                
                <div className="bg-muted/30 p-8 rounded-2xl border space-y-6">
                  <div className="flex justify-between text-lg font-medium">
                    <span>Computed Score</span>
                    <span className="font-bold">{score}</span>
                  </div>
                  <Progress value={Math.min(score, 100)} className="h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-center pb-12">
             <Link href="/">
               <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                 Return Home
               </Button>
             </Link>
          </div>
        </div>
      </div>
    );
  }

  // Question Runner View
  return (
    <div className="min-h-screen bg-muted/10 flex flex-col">
      <div className="h-2 bg-muted w-full">
        <motion.div 
          className="h-full bg-primary" 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                 <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Question {currentQuestionIdx + 1} of {quiz.questions.length}</span>
                 <h2 className="text-3xl md:text-4xl font-medium leading-tight font-display text-foreground">
                   {currentQuestion.text}
                 </h2>
              </div>

              {renderQuestionInput()}

            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between items-center pt-8 border-t">
            <Button 
               variant="ghost" 
               disabled={currentQuestionIdx === 0}
               onClick={() => {
                   // This is tricky with branching logic, 'back' might not mean previous index. 
                   // For now, simpler implementation: just go back index (might be confusing if skipped)
                   // Proper way: keep history stack.
                   // Mock impl:
                   const prevIdx = Math.max(0, currentQuestionIdx - 1);
                   setCurrentQuestionId(quiz.questions[prevIdx].id);
               }}
               className="text-muted-foreground"
            >
               Back
            </Button>
            <Button 
              size="lg" 
              onClick={handleNext} 
              disabled={!answers[currentQuestion.id] && answers[currentQuestion.id] !== 0}
              className="px-10 h-12 text-lg rounded-xl shadow-lg shadow-primary/20"
            >
              {currentQuestionIdx === quiz.questions.length - 1 ? "Finish" : "Next"}
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
