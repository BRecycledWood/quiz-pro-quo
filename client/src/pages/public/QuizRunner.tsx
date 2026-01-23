import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Lock, Download, ChevronRight, Clock, HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function QuizRunner() {
  const [, params] = useRoute("/quiz/:slug");
  const slug = params?.slug;
  const [quiz, setQuiz] = useState(storage.getQuizzes().find(q => q.slug === slug));

  const [started, setStarted] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const [paid, setPaid] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Sync quiz data (for previewing edits live)
  useEffect(() => {
    const q = storage.getQuizzes().find(q => q.slug === slug);
    if (q) setQuiz(q);
  }, [slug]);

  // Track views
  useEffect(() => {
    if (quiz && !started && !finished) {
       // Ideally we debounce or only count unique sessions, but for mock:
       // We won't auto-increment here to avoid infinite loop if we were writing to same storage object that triggers re-render.
       // In a real app, backend handles this.
    }
  }, [quiz]);

  if (!quiz) return <div className="min-h-screen flex items-center justify-center">Quiz not found</div>;

  const currentQuestion = quiz.questions[currentQuestionIdx];
  const progress = ((currentQuestionIdx + 1) / quiz.questions.length) * 100;
  
  // Calculate potential score
  const score = Object.entries(answers).reduce((acc, [qId, optId]) => {
    const q = quiz.questions.find(q => q.id === qId);
    const opt = q?.options?.find(o => o.id === optId);
    return acc + (opt?.value || 0);
  }, 0);

  const handleStart = () => {
    setStarted(true);
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

  const handleAnswer = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
  };

  const handleNext = () => {
    if (currentQuestionIdx < quiz.questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
    } else {
      handleFinish();
    }
  };
  
  const handleFinish = () => {
    setFinished(true);
    // Update submission
    // Since we don't have a partial update method in storage mock, we just add a new one or we'd need to find and update.
    // For simplicity in this mock, let's just assume we can 'complete' it. 
    // In a real app: PATCH /api/submissions/:id
    
    // We'll just complete the paid status if no gate
    if (!quiz.gateResults) {
      setPaid(true);
    }
  };

  const handlePay = () => {
    // Mock Stripe Checkout
    setTimeout(() => {
      setPaid(true);
      // Update submission to paid
      if (submissionId) {
         // storage.updateSubmission(submissionId, { paid: true }); 
         // Implementation detail left out for brevity in mock storage
      }
    }, 1500);
  };

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
            
            <div className="flex items-center justify-center gap-4 opacity-50 grayscale">
               {/* Placeholders for logos */}
               <div className="h-6 w-10 bg-current rounded" />
               <div className="h-6 w-10 bg-current rounded" />
               <div className="h-6 w-10 bg-current rounded" />
            </div>
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
                    <h3 className="text-3xl font-bold mb-2">Result: <span className="text-primary">Action Required</span></h3>
                    <p className="text-muted-foreground text-lg leading-relaxed">
                      Based on your score of {score}, your organization needs immediate attention regarding compliance protocols. We recommend starting with a data audit.
                    </p>
                  </div>
                  <div className="space-y-3 pt-4">
                     <h4 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">What to do next:</h4>
                     <ul className="space-y-3">
                       <li className="flex items-start gap-3">
                         <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                         <span>Download your PDF report</span>
                       </li>
                       <li className="flex items-start gap-3">
                         <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                         <span>Schedule a consultation with our team</span>
                       </li>
                     </ul>
                  </div>
                  <Button className="w-full md:w-auto h-12 text-base" size="lg">
                    <Download className="mr-2 w-5 h-5" />
                    Download PDF Report
                  </Button>
                </div>
                
                <div className="bg-muted/30 p-8 rounded-2xl border space-y-6">
                  <div className="flex justify-between text-lg font-medium">
                    <span>Risk Score</span>
                    <span className="font-bold">{score} / 100</span>
                  </div>
                  <Progress value={score} className="h-4" />
                  
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="p-4 bg-background rounded-lg border text-center">
                       <div className="text-2xl font-bold text-primary">High</div>
                       <div className="text-xs text-muted-foreground uppercase">Urgency</div>
                    </div>
                    <div className="p-4 bg-background rounded-lg border text-center">
                       <div className="text-2xl font-bold text-primary">3</div>
                       <div className="text-xs text-muted-foreground uppercase">Critical Gaps</div>
                    </div>
                  </div>
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
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between items-center pt-8 border-t">
            <Button 
               variant="ghost" 
               disabled={currentQuestionIdx === 0}
               onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
               className="text-muted-foreground"
            >
               Back
            </Button>
            <Button 
              size="lg" 
              onClick={handleNext} 
              disabled={!answers[currentQuestion.id]}
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
