import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle2, ArrowRight, Zap, CreditCard, FileText, Users, ShieldCheck, TrendingUp, GitBranch, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const DEMO_MAILTO = "mailto:hello@howstud.io?subject=Custom%20Demo%20Request&body=Hi%2C%20I%27d%20like%20to%20request%20a%20custom%20demo.%0A%0ACompany%3A%20%0AUse%20case%3A%20%0AIndustry%3A%20";

const ACTIVE_FEATURES = [
  "Visual Quiz Editor",
  "Branching Logic",
  "Scoring Engine",
  "Outcome Pages",
  "Disqualifier Rules",
  "Version History",
  "PDF Report Generation",
  "Stripe Paywalls",
  "White Labeling",
  "Multi-Workspace Support",
  "Email Lead Capture",
  "Analytics Dashboard",
  "Lead Export (CSV)",
];

const COMING_SOON_FEATURES = [
  "Embeddable Widget",
  "Webhook / Zapier Integration",
  "Quiz Templates",
  "Custom Domains",
  "Team Management",
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      <header className="h-16 border-b flex items-center justify-between px-6 lg:px-12 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2 font-bold text-xl text-primary font-display">
          <img src="/logo.png" alt="QuizProQuo" className="h-8 w-auto" />
          QuizProQuo
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a>
          <Link href="/demo" className="hover:text-foreground transition-colors">Demo</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm">Admin</Button>
          </Link>
          <Link href="/demo">
            <Button size="sm">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 lg:py-24 px-6 lg:px-12 overflow-hidden relative">
          <div className="absolute inset-0 bg-primary/5 -skew-y-3 transform origin-top-left scale-110 z-0" />
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center relative z-10">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Email Lead Capture + PDF Reports
              </div>

              <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-foreground font-display leading-[1.1]">
                Turn questions into <br />
                <span className="text-primary">qualified leads</span>.
              </h1>

              <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
                The enterprise-grade quiz builder for agencies and SaaS. Build scored assessments, capture emails, and auto-deliver branded PDF reports.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <Link href="/demo">
                  <Button size="lg" className="h-14 px-8 text-base shadow-lg shadow-primary/20 w-full sm:w-auto">
                    See the Demo
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/admin">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base w-full sm:w-auto">
                    Admin
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-6 pt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /><span>No credit card required</span></div>
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /><span>Free to start</span></div>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border bg-background">
                <img src="/dashboard-hero.png" alt="Dashboard Preview" className="w-full h-auto object-cover" />
                <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl" />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-card p-4 rounded-lg shadow-xl border hidden md:block">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">New Lead Captured</p>
                    <p className="text-xs text-muted-foreground">PDF report emailed ✓</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Agencies Choose QuizProQuo */}
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
                { icon: Zap, title: "High-Converting Logic", desc: "Create complex branching paths and scoring systems that segment your audience perfectly." },
                { icon: CreditCard, title: "Monetize Directly", desc: "Built-in Stripe integration lets you gate results or PDF reports behind a paywall." },
                { icon: FileText, title: "Automated PDF Reports", desc: "Generate personalized, white-labeled PDF reports and email them to every lead automatically." },
              ].map((item, i) => (
                <Card key={i} className="border-none shadow-none bg-muted/30 hover:bg-muted/50 transition-colors">
                  <CardContent className="pt-8 px-8 pb-8 space-y-4">
                    <div className="w-12 h-12 bg-background rounded-xl border flex items-center justify-center text-primary shadow-sm">
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Stack — moved up, accurate */}
        <section id="features" className="py-24 bg-primary text-primary-foreground">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <h2 className="text-3xl font-bold font-display mb-4 text-center">Everything you need to scale</h2>
            <p className="text-primary-foreground/70 text-center mb-12 max-w-xl mx-auto">What's live now — and what's coming next.</p>

            <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary-foreground/60 mb-4">Available Now</p>
                <div className="flex flex-col gap-2">
                  {ACTIVE_FEATURES.map((f) => (
                    <div key={f} className="flex items-center gap-3 px-4 py-2.5 bg-white/10 rounded-lg border border-white/15">
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                      <span className="font-medium">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary-foreground/60 mb-4">Coming Soon</p>
                <div className="flex flex-col gap-2">
                  {COMING_SOON_FEATURES.map((f) => (
                    <div key={f} className="flex items-center gap-3 px-4 py-2.5 bg-white/5 rounded-lg border border-white/10 opacity-70">
                      <div className="w-4 h-4 rounded-full border border-white/30 shrink-0" />
                      <span className="font-medium">{f}</span>
                      <Badge className="ml-auto bg-white/10 text-white/70 text-[10px] border-0 px-2">Soon</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section id="use-cases" className="py-24 border-t">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
              <h2 className="text-4xl font-bold font-display">Built for any industry.</h2>
              <p className="text-lg text-muted-foreground">From lead qualification to compliance checks, our platform adapts to your specific needs.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                { icon: Users, title: "Lead Qualification", desc: "Score and segment prospects by fit before your team picks up the phone." },
                { icon: ShieldCheck, title: "Compliance Checks", desc: "Automate regulated checklists with outcome-based guidance and audit trails." },
                { icon: TrendingUp, title: "Product Recommenders", desc: "Guide customers to the right product in minutes with scored branching logic." },
                { icon: GitBranch, title: "Onboarding Flows", desc: "Personalise the new user journey based on role, goals, and experience level." },
                { icon: Zap, title: "Risk Assessments", desc: "Quantify exposure with weighted scoring and tiered outcomes that act on results." },
                { icon: Calculator, title: "ROI Calculators", desc: "Show prospects the exact value they're leaving on the table — before they leave." },
              ].map((item) => (
                <Card key={item.title} className="border hover:border-primary/50 hover:shadow-md transition-all bg-background">
                  <CardContent className="pt-6 px-6 pb-6 space-y-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-base">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-background">
          <div className="max-w-4xl mx-auto px-6 lg:px-12 text-center space-y-8">
            <h2 className="text-4xl font-bold font-display">Ready to build your revenue engine?</h2>
            <p className="text-xl text-muted-foreground">Start free. No credit card required.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/demo">
                <Button size="lg" className="h-14 px-10 text-lg w-full sm:w-auto">Get Started for Free</Button>
              </Link>
              <a href={DEMO_MAILTO}>
                <Button size="lg" variant="outline" className="h-14 px-10 text-lg w-full sm:w-auto">Request Custom Demo</Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-6 lg:px-12 border-t bg-muted/20">
        <div className="max-w-7xl mx-auto grid md:grid-cols-5 gap-8 mb-12">
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-2 font-bold text-xl text-primary font-display">
              <img src="/logo.png" alt="QuizProQuo" className="h-8 w-auto" />
              QuizProQuo
            </div>
            <p className="text-sm text-muted-foreground">The enterprise quiz platform for modern businesses.</p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/demo" className="hover:text-foreground transition-colors">Demo</Link></li>
              <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
              <li><a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href={DEMO_MAILTO} className="hover:text-foreground transition-colors">Request Demo</a></li>
              <li><a href="mailto:hello@howstud.io" className="hover:text-foreground transition-colors">hello@howstud.io</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
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
