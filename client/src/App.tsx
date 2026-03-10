import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import PacksAdmin from "@/pages/admin/PacksAdmin";
import QuizList from "@/pages/admin/QuizList";
import QuizBuilder from "@/pages/admin/QuizBuilder";
import QuizDashboard from "@/pages/admin/QuizDashboard";
import CompareQuizzes from "@/pages/admin/CompareQuizzes";
import QuizRunner from "@/pages/public/QuizRunner";
import PackRunner from "@/pages/public/PackRunner";
import TopNav from "@/components/layout/TopNav";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />

      {/* Admin Routes */}
      <Route path="/admin" component={PacksAdmin} />
      <Route path="/admin/quizzes" component={QuizList} />
      <Route path="/admin/quizzes/compare" component={CompareQuizzes} />
      <Route path="/admin/quizzes/new">
        <QuizBuilder isNew />
      </Route>
      <Route path="/admin/quizzes/:id">
        <QuizBuilder />
      </Route>
      <Route path="/admin/quiz/:id/dashboard" component={QuizDashboard} />

      {/* Public Routes */}
      <Route path="/w/:workspaceSlug/:packSlug" component={PackRunner} />
      <Route path="/quiz/:slug" component={QuizRunner} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <div className="min-h-screen bg-background text-foreground">
          <TopNav />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
