import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle2, ArrowRight, Zap, Shield, BarChart } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      <header className="h-16 border-b flex items-center justify-between px-6 lg:px-12 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2 font-bold text-xl text-primary font-display">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            Q
          </div>
          QuizProQuo
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <a href="#demo" className="hover:text-foreground transition-colors">Demo</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link href="/admin">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 lg:py-32 px-6 lg:px-12 text-center max-w-5xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            New: Stripe Paywalls for Quizzes
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-foreground font-display">
            Turn questions into <span className="text-primary">qualified leads</span>.
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The enterprise-grade quiz builder for agencies and SaaS. 
            Capture leads, segment users, and monetize content with 
            white-label quizzes and automated PDF reports.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/admin">
              <Button size="lg" className="h-12 px-8 text-base">
                Start Building Free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/quiz/compliance-check">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                Take Demo Quiz
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 bg-muted/30 border-y">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-primary">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Powerful Logic</h3>
                <p className="text-muted-foreground">
                  Create complex branching paths, scoring systems, and knockout rules 
                  to segment your audience perfectly.
                </p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Enterprise Security</h3>
                <p className="text-muted-foreground">
                  Role-based access control, SSO ready, and fully compliant 
                  data handling for your organization.
                </p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                  <BarChart className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold">Deep Analytics</h3>
                <p className="text-muted-foreground">
                  Track drop-off points, conversion rates, and individual 
                  user journeys with granular detail.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-6 lg:px-12 border-t text-center text-sm text-muted-foreground">
        <p>&copy; 2026 Quiz Pro Quo. Built for HOWstud.io.</p>
      </footer>
    </div>
  );
}
