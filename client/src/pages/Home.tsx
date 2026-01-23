import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  CheckCircle2, ArrowRight, Zap, Shield, BarChart, 
  Layout, Play, Settings, Users, CreditCard, FileText, ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
          <a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
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
        {/* Hero Section */}
        <section className="py-20 lg:py-24 px-6 lg:px-12 overflow-hidden relative">
          <div className="absolute inset-0 bg-primary/5 -skew-y-3 transform origin-top-left scale-110 z-0"></div>
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center relative z-10">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                New: Stripe Paywalls for Quizzes
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-foreground font-display leading-[1.1]">
                Turn questions into <br/>
                <span className="text-primary">qualified leads</span>.
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
                The enterprise-grade quiz builder for agencies and SaaS. 
                Capture leads, segment users, and monetize content with 
                white-label quizzes and automated PDF reports.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <Link href="/admin">
                  <Button size="lg" className="h-14 px-8 text-base shadow-lg shadow-primary/20 w-full sm:w-auto">
                    View Demo Dashboard
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/quiz/compliance-check">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base w-full sm:w-auto">
                    See Example Quiz
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-6 pt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>14-day free trial</span>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border bg-background">
                <img 
                  src="/dashboard-hero.png" 
                  alt="Dashboard Preview" 
                  className="w-full h-auto object-cover"
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl"></div>
              </div>
              {/* Floating UI Elements */}
              <div className="absolute -bottom-6 -left-6 bg-card p-4 rounded-lg shadow-xl border animate-in slide-in-from-bottom-10 fade-in duration-1000 hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">New Payment</p>
                    <p className="text-xs text-muted-foreground">+$49.00 from Stripe</p>
                  </div>
                </div>
              </div>
              <div className="absolute -top-6 -right-6 bg-card p-4 rounded-lg shadow-xl border animate-in slide-in-from-top-10 fade-in duration-1000 delay-200 hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-primary">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">New Lead</p>
                    <p className="text-xs text-muted-foreground">quiz_lead@acme.com</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Value Props */}
        <section className="py-20 bg-background">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl font-bold font-display">Why Agencies Choose QuizProQuo</h2>
              <p className="text-muted-foreground text-lg">
                Stop using toy quiz builders. Build complex, data-driven assessments that actually drive revenue.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: "High-Converting Logic",
                  desc: "Create complex branching paths and scoring systems that segment your audience perfectly."
                },
                {
                  icon: CreditCard,
                  title: "Monetize Directly",
                  desc: "Built-in Stripe integration lets you gate results or PDF reports behind a paywall."
                },
                {
                  icon: FileText,
                  title: "Automated PDF Reports",
                  desc: "Generate personalized, white-labeled PDF reports for every submission automatically."
                }
              ].map((item, i) => (
                <Card key={i} className="border-none shadow-none bg-muted/30 hover:bg-muted/50 transition-colors">
                  <CardContent className="pt-8 px-8 pb-8 space-y-4">
                    <div className="w-12 h-12 bg-background rounded-xl border flex items-center justify-center text-primary shadow-sm">
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section id="use-cases" className="py-24 border-t">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <h2 className="text-4xl font-bold font-display">Built for any industry.</h2>
                <p className="text-lg text-muted-foreground">
                  From lead qualification to compliance checks, our platform adapts to your specific needs.
                </p>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    "Lead Qualification", "Compliance Checks", "Product Recommenders", 
                    "Onboarding Flows", "Risk Assessments", "Interactive ROI Calculators"
                  ].map((useCase) => (
                    <div key={useCase} className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:border-primary/50 transition-colors">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      <span className="font-medium">{useCase}</span>
                    </div>
                  ))}
                </div>
                
                <Button variant="outline" size="lg" className="mt-4">
                  Explore All Use Cases
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-primary/5 border-primary/20 transform translate-y-8">
                  <CardContent className="p-6 flex flex-col items-center justify-center text-center h-48 space-y-3">
                    <Shield className="w-10 h-10 text-primary" />
                    <span className="font-bold">Compliance</span>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/50 border-secondary">
                  <CardContent className="p-6 flex flex-col items-center justify-center text-center h-48 space-y-3">
                    <Users className="w-10 h-10 text-foreground" />
                    <span className="font-bold">Recruiting</span>
                  </CardContent>
                </Card>
                <Card className="bg-accent/50 border-accent">
                  <CardContent className="p-6 flex flex-col items-center justify-center text-center h-48 space-y-3">
                    <BarChart className="w-10 h-10 text-foreground" />
                    <span className="font-bold">Finance</span>
                  </CardContent>
                </Card>
                <Card className="bg-muted border-border transform translate-y-8">
                  <CardContent className="p-6 flex flex-col items-center justify-center text-center h-48 space-y-3">
                    <Layout className="w-10 h-10 text-muted-foreground" />
                    <span className="font-bold">SaaS</span>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Stack */}
        <section className="py-24 bg-primary text-primary-foreground text-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <h2 className="text-3xl font-bold font-display mb-12">Everything you need to scale</h2>
            <div className="flex flex-wrap justify-center gap-3">
              {[
                "Landing Page Builder", "Visual Quiz Editor", "Branching Logic", 
                "Scoring Engine", "Result Pages", "PDF Generation", 
                "Stripe Payments", "White Labeling", "Team Management", "API Access"
              ].map((feature) => (
                <div key={feature} className="px-6 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20 font-medium">
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics Strip */}
        <section className="py-16 border-b">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { label: "Quizzes Created", value: "10,000+" },
                { label: "Leads Captured", value: "2.5M+" },
                { label: "Completion Rate", value: "68%" },
                { label: "Revenue Generated", value: "$12M+" },
              ].map((stat, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-3xl md:text-4xl font-bold text-foreground font-display">{stat.value}</div>
                  <div className="text-sm text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-background">
          <div className="max-w-4xl mx-auto px-6 lg:px-12 text-center space-y-8">
            <h2 className="text-4xl font-bold font-display">Ready to build your revenue engine?</h2>
            <p className="text-xl text-muted-foreground">
              Join thousands of agencies and businesses using QuizProQuo to qualify and convert leads.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/admin">
                <Button size="lg" className="h-14 px-10 text-lg w-full sm:w-auto">
                  Get Started for Free
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-10 text-lg w-full sm:w-auto">
                Contact Sales
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-6 lg:px-12 border-t bg-muted/20">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-xl text-primary font-display">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
                Q
              </div>
              QuizProQuo
            </div>
            <p className="text-sm text-muted-foreground">
              The enterprise quiz platform for modern businesses.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Features</li>
              <li>Pricing</li>
              <li>Case Studies</li>
              <li>Enterprise</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Blog</li>
              <li>Documentation</li>
              <li>Community</li>
              <li>Help Center</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Privacy</li>
              <li>Terms</li>
              <li>Security</li>
            </ul>
          </div>
        </div>
        <div className="text-center text-sm text-muted-foreground pt-8 border-t border-border">
          <p>&copy; 2026 Quiz Pro Quo. Built for HOWstud.io.</p>
        </div>
      </footer>
    </div>
  );
}
