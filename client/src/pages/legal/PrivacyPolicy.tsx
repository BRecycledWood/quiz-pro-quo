import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>

        <h1 className="text-4xl font-bold font-display mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-12">Last updated: March 2026</p>

        <div className="prose prose-neutral max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-bold mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">
              When you complete a quiz on our platform, we collect the information you voluntarily provide,
              including your name and email address at the email gate. We also collect quiz response data
              (the answers you submit) in order to calculate your score and generate your personalised PDF report.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We may also collect standard web analytics data such as page views, browser type, and device
              type through analytics tools. This data is aggregated and not linked to individual users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li>To generate and deliver your personalised PDF assessment report via email.</li>
              <li>To notify the quiz owner of a new lead submission.</li>
              <li>To display aggregate analytics to the quiz owner (outcome distributions, completion rates).</li>
              <li>To improve the platform and fix bugs.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">3. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              Submission data (name, email, quiz responses) is retained for as long as necessary to provide
              the service to the quiz owner. Quiz owners may request deletion of their workspace data at any time
              by contacting us at <a href="mailto:hello@howstud.io" className="text-primary hover:underline">hello@howstud.io</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">4. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use browser local storage (not tracking cookies) to remember your admin key between sessions.
              No third-party tracking cookies are set by default.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">5. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may use third-party services to send transactional emails (e.g. PDF report delivery) and
              process payments (Stripe). These services have their own privacy policies and handle data
              according to their respective terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">6. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may request access to, correction of, or deletion of your personal data at any time by
              contacting us at <a href="mailto:hello@howstud.io" className="text-primary hover:underline">hello@howstud.io</a>.
              We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">7. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this policy? Email us at{" "}
              <a href="mailto:hello@howstud.io" className="text-primary hover:underline">hello@howstud.io</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
