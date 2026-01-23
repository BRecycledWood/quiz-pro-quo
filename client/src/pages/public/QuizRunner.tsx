import { useState } from "react";
import { useRoute, Link } from "wouter";
import { MOCK_QUIZZES } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Lock, Download, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function QuizRunner() {
  const [, params] = useRoute("/quiz/:slug");
  const slug = params?.slug;
  const quiz = MOCK_QUIZZES.find(q => q.slug === slug);

  const [started, setStarted] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const [paid, setPaid] = useState(!quiz?.gateResults); // If no gate, they are "paid"

  if (!quiz) return <div className="min-h-screen flex items-center justify-center">Quiz not found</div>;

  const currentQuestion = quiz.questions[currentQuestionIdx];
  const progress = ((currentQuestionIdx + 1) / quiz.questions.length) * 100;

  const handleStart = () => setStarted(true);

  const handleAnswer = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
  };

  const handleNext = () => {
    if (currentQuestionIdx < quiz.questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
    } else {
      setFinished(true);
    }
  };

  const handlePay = () => {
    // Mock Stripe Checkout
    setTimeout(() => {
      setPaid(true);
    }, 1500);
  };

  // Landing Page View
  if (!started) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-8 text-center">
          {quiz.image && (
            <div className="w-full h-64 rounded-xl overflow-hidden shadow-2xl mb-8">
              <img src={quiz.image} alt={quiz.title} className="w-full h-full object-cover" />
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-primary font-display">
            {quiz.title}
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            {quiz.description}
          </p>
          <Button size="lg" className="h-14 px-8 text-lg w-full sm:w-auto" onClick={handleStart}>
            Start Assessment
            <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  // Paywall View
  if (finished && !paid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-2 border-primary/20 shadow-2xl">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
              <Lock className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Unlock Your Results</h2>
              <p className="text-muted-foreground mt-2">
                Your detailed analysis is ready. Pay a one-time fee to access your personalized report.
              </p>
            </div>
            <div className="text-3xl font-bold text-primary">
              ${quiz.price}
            </div>
            <Button size="lg" className="w-full" onClick={handlePay}>
              Unlock Now
            </Button>
            <p className="text-xs text-muted-foreground">
              Secure payment via Stripe. 100% Money-back guarantee.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Results View
  if (finished && paid) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-8 pt-10">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-6 animate-in zoom-in duration-500">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold font-display">Assessment Complete</h1>
            <p className="text-xl text-muted-foreground">
              Here is your personalized breakdown.
            </p>
          </div>

          <Card className="border-t-4 border-t-primary shadow-lg">
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold">Your Score: High Risk</h3>
                  <p className="text-muted-foreground">
                    Based on your answers, your organization needs immediate attention regarding compliance protocols.
                  </p>
                  <Button className="w-full md:w-auto" variant="outline">
                    <Download className="mr-2 w-4 h-4" />
                    Download PDF Report
                  </Button>
                </div>
                <div className="bg-muted p-6 rounded-lg space-y-4">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Risk Score</span>
                    <span>85/100</span>
                  </div>
                  <Progress value={85} className="h-3" />
                  <ul className="space-y-2 text-sm text-muted-foreground mt-4">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Missing Data Officer
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                      Infrequent Audits
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-center">
             <Link href="/">
               <Button variant="ghost">Return Home</Button>
             </Link>
          </div>
        </div>
      </div>
    );
  }

  // Question Runner View
  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      <div className="h-2 bg-muted w-full">
        <motion.div 
          className="h-full bg-primary" 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <h2 className="text-2xl md:text-3xl font-medium leading-tight">
                {currentQuestion.text}
              </h2>

              <RadioGroup onValueChange={handleAnswer} value={answers[currentQuestion.id]}>
                <div className="space-y-4">
                  {currentQuestion.options?.map((option) => (
                    <Label
                      key={option.id}
                      htmlFor={option.id}
                      className={cn(
                        "flex items-center space-x-3 border p-4 rounded-xl cursor-pointer transition-all hover:bg-background hover:border-primary/50",
                        answers[currentQuestion.id] === option.id ? "border-primary bg-primary/5 shadow-sm" : "bg-white border-border"
                      )}
                    >
                      <RadioGroupItem value={option.id} id={option.id} />
                      <span className="text-lg font-medium">{option.text}</span>
                    </Label>
                  ))}
                </div>
              </RadioGroup>
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-end pt-8">
            <Button 
              size="lg" 
              onClick={handleNext} 
              disabled={!answers[currentQuestion.id]}
              className="px-8"
            >
              {currentQuestionIdx === quiz.questions.length - 1 ? "Finish" : "Next"}
              <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
