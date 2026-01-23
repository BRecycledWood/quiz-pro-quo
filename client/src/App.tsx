import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Dashboard from "@/pages/admin/Dashboard";
import QuizList from "@/pages/admin/QuizList";
import QuizBuilder from "@/pages/admin/QuizBuilder";
import QuizRunner from "@/pages/public/QuizRunner";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      
      {/* Admin Routes */}
      <Route path="/admin" component={Dashboard} />
      <Route path="/admin/quizzes" component={QuizList} />
      <Route path="/admin/quizzes/:id" component={QuizBuilder} />
      
      {/* Public Routes */}
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
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
