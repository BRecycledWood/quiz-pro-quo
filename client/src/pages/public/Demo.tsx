import { Link } from "wouter";
import { CheckCircle, Mail, BarChart3, Zap, FileText, Users, ArrowRight } from "lucide-react";
import DemoDashboardPreview from "@/components/DemoDashboardPreview";

const CONTACT_MAILTO =
  "mailto:hello@howstud.io?subject=Quiz%20Pro%20Quo%20Demo%20Request&body=Hi%2C%20I%27d%20love%20to%20learn%20more%20about%20Quiz%20Pro%20Quo%20for%20my%20business.";

const DEMO_QUIZZES = [
  {
    title: "AI Readiness Check",
    description: "Is your business ready to adopt AI? Find out in 5 questions.",
    slug: "ai-readiness-assessment",
    tag: "Technology",
  },
  {
    title: "Missed Calls Audit",
    description: "Discover how much revenue your missed calls are costing you.",
    slug: "missed-calls-assessment",
    tag: "Revenue",
  },
  {
    title: "Insurance Pre-Qual",
    description: "Quick qualification for life insurance coverage options.",
    slug: "insurance-pre-qualification",
    tag: "Finance",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Build your assessment",
    description:
      "Use the visual quiz builder to create scored questions with branching logic and outcome tiers.",
  },
  {
    step: "2",
    title: "Capture leads with an email gate",
    description:
      "Before showing results, collect the visitor's email and name. Every result triggers a personalised PDF report.",
  },
  {
    step: "3",
    title: "Analyse and follow up",
    description:
      "View your analytics dashboard to track completion rates, outcome distributions, and individual leads.",
  },
];

export default function Demo() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-muted/40 to-background">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-4">
            Product Tour
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Turn assessments into qualified leads
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Quiz Pro Quo lets you build scored quizzes that capture emails, deliver personalised PDF
            reports, and feed a real-time analytics dashboard — no code required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/w/demo/ai-readiness-assessment"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border font-semibold hover:bg-muted transition-colors"
            >
              Try a Live Quiz
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live examples — moved up so visitors can try before reading feature details */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 text-primary mb-3">
              <Users className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Live Examples</span>
            </div>
            <h2 className="text-2xl font-bold mb-3">Try these demo quizzes</h2>
            <p className="text-muted-foreground">
              These are fully functional quizzes running on the platform right now.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {DEMO_QUIZZES.map((quiz) => (
              <Link
                key={quiz.slug}
                href={`/w/demo/${quiz.slug}`}
                className="block bg-card border rounded-xl p-6 hover:shadow-md transition-shadow group"
              >
                <span className="inline-block text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary mb-3">
                  {quiz.tag}
                </span>
                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors">
                  {quiz.title}
                </h3>
                <p className="text-sm text-muted-foreground">{quiz.description}</p>
                <p className="text-xs text-primary font-medium mt-4">Take the quiz →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Feature: Assessment engine */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex items-center gap-2 text-primary mb-3">
              <Zap className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                Assessment Engine
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-4">Scoring logic built in</h2>
            <p className="text-muted-foreground mb-6">
              Define weighted scoring rules per answer, set outcome thresholds (e.g. "High
              Potential" ≥ 70%, "Needs Work" 40–69%), and add custom CTAs for each outcome. The
              engine evaluates responses instantly with no backend call needed.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Weighted single-choice questions",
                "Outcome tiers with score thresholds",
                "Custom CTA labels and URLs per outcome",
                "Branching logic (coming soon)",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          {/* Mockup */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-3">
            <p className="text-sm font-medium">Question 2 of 5</p>
            <p className="font-semibold">How do you currently handle AI tools?</p>
            {[
              { label: "We use AI daily across the team", pts: "+3" },
              { label: "A few people experiment with it", pts: "+2" },
              { label: "We've tried it but haven't adopted it", pts: "+1" },
              { label: "We haven't explored it yet", pts: "+0" },
            ].map((opt, i) => (
              <button
                key={i}
                disabled
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                  i === 1 ? "border-primary bg-primary/10 text-primary font-medium" : "border-border bg-muted/30"
                }`}
              >
                <span className="flex justify-between">
                  {opt.label}
                  <span className="text-xs text-muted-foreground">{opt.pts} pts</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Feature: Email gate + PDF */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* Mockup */}
          <div className="bg-card border rounded-xl p-6 shadow-sm order-2 md:order-1">
            <p className="text-sm text-muted-foreground mb-1">You scored</p>
            <p className="text-3xl font-bold mb-1">74%</p>
            <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold mb-4">
              High Potential
            </span>
            <div className="border rounded-lg p-4 bg-muted/30 text-sm space-y-1 mb-4">
              <p className="font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Enter your email to get your full report
              </p>
              <input
                disabled
                placeholder="you@example.com"
                className="w-full mt-2 px-3 py-2 rounded border bg-background text-sm"
              />
            </div>
            <button
              disabled
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
            >
              Get My Results →
            </button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              You'll receive a personalised PDF report
            </p>
          </div>
          <div className="order-1 md:order-2">
            <div className="flex items-center gap-2 text-primary mb-3">
              <FileText className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                Email Gate + PDF Reports
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-4">Every result generates a lead</h2>
            <p className="text-muted-foreground mb-6">
              After completing a quiz, visitors are prompted to enter their email before seeing
              their outcome. We instantly generate a branded PDF report and email it to them —
              while notifying you with a lead summary.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Email gate before results (skippable)",
                "Server-side PDF generation via PDFKit",
                "Outcome badge + score in the email",
                "Lead notification to your inbox",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Feature: Analytics dashboard */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 text-primary mb-3">
              <BarChart3 className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                Analytics Dashboard
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-3">Real-time lead intelligence</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Track submission volume, outcome distributions, and per-quiz completion rates from a
              single dashboard. Export any view to CSV for your CRM.
            </p>
          </div>
          {/* Live demo data preview */}
          <div className="bg-card border rounded-xl p-6 shadow-sm">
            <DemoDashboardPreview />
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            ↑ Sample data from 3 demo quizzes — your dashboard will show your own leads
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 px-4 text-center bg-primary/5 border-t">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Ready to capture more qualified leads?</h2>
          <p className="text-muted-foreground mb-8">
            Get in touch and we'll set up a custom quiz for your business — usually within 24
            hours.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-lg bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-colors"
            >
              Open the Admin Panel
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href={CONTACT_MAILTO}
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg border font-semibold text-lg hover:bg-muted transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
