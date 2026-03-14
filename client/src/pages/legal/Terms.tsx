import { Link } from "wouter";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
        </div>

        <h1 className="text-4xl font-bold font-display mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-12">Last updated: March 2026</p>

        <div className="prose prose-neutral max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-bold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Quiz Pro Quo (the "Service"), you agree to be bound by these Terms of Service.
              If you do not agree, do not use the Service. The Service is operated by HOWstud.io.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">2. Use of the Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              You may use the Service to create, deploy, and analyse scored assessments and lead-capture quizzes.
              You are responsible for all content you create on the platform, including quiz questions, outcomes,
              and any communications sent to quiz respondents.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              You must not use the Service to collect data in violation of applicable privacy laws, send
              unsolicited communications, or create quizzes that are deceptive, harmful, or illegal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">3. Accounts and Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Access to the admin panel requires an admin key. You are responsible for keeping your admin key
              confidential. Notify us immediately at{" "}
              <a href="mailto:hello@howstud.io" className="text-primary hover:underline">hello@howstud.io</a>{" "}
              if you believe your key has been compromised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">4. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service, including its design, code, and branding, is owned by HOWstud.io. You retain ownership
              of the content you create (quiz questions, outcome text, etc.). By using the Service, you grant
              HOWstud.io a limited licence to store and process that content solely to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">5. Payments</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you enable paid assessments via Stripe, you are responsible for compliance with Stripe's terms
              and applicable consumer protection laws. HOWstud.io is not liable for payment disputes between
              you and your quiz respondents.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">6. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" without warranty of any kind. To the fullest extent permitted
              by law, HOWstud.io shall not be liable for any indirect, incidental, or consequential damages
              arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">7. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update these terms from time to time. Continued use of the Service after changes are posted
              constitutes acceptance of the revised terms. Material changes will be communicated via email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-3">8. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about these terms? Email us at{" "}
              <a href="mailto:hello@howstud.io" className="text-primary hover:underline">hello@howstud.io</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
