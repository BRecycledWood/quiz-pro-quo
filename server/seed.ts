import { randomUUID } from "crypto";
import type { IStorage } from "./storage";
import type { PackDefinition } from "@shared/pack";

// AI Readiness Assessment definition
const aiReadinessDef: PackDefinition = {
  name: "AI Readiness Assessment",
  version: 1,
  outcomes: [
    {
      id: "ai_leader",
      title: "AI Leader",
      description: "Your business has strong foundations for AI transformation. You have the data organization, team readiness, and leadership buy-in to move fast. The next step is a strategic AI audit to identify your highest-ROI implementation opportunities.",
      status: "pass",
      ctaLabel: "Get Your Full AI Audit",
      ctaUrl: "https://airaduit.city",
    },
    {
      id: "ai_aware",
      title: "AI Ready — With Gaps",
      description: "You're in the right mindset but there are specific gaps to address before full AI adoption delivers results. An AI readiness audit will help you prioritize where to invest first and avoid the mistakes most businesses make when they rush into AI tools.",
      status: "caution",
      ctaLabel: "Get Your AI Readiness Audit",
      ctaUrl: "https://airaduit.city",
    },
    {
      id: "ai_beginner",
      title: "Building Your Foundation",
      description: "You're at the starting line — and that's actually the ideal time to get an AI assessment. Before investing in any tools, understanding your readiness gaps will save you significant time and money. Most businesses that struggle with AI adoption skipped this step.",
      status: "fail",
      ctaLabel: "Start With an AI Audit",
      ctaUrl: "https://airaduit.city",
    },
  ],
  questions: [
    { id: "ai_usage", prompt: "Does your business currently use any AI tools?", type: "single", options: [{ id: "opt_0", label: "Yes, we actively use several AI tools" }, { id: "opt_1", label: "We're experimenting with a few" }, { id: "opt_2", label: "We're aware of AI but haven't adopted it" }, { id: "opt_3", label: "No, we haven't looked into it" }] },
    { id: "data_org", prompt: "How would you describe your business data organization?", type: "single", options: [{ id: "opt_0", label: "Well-organized in dedicated systems (CRM, ERP, etc.)" }, { id: "opt_1", label: "Partially organized — some systems, some spreadsheets" }, { id: "opt_2", label: "Mostly spreadsheets and email threads" }, { id: "opt_3", label: "We don't have a consistent way of organizing data" }] },
    { id: "processes", prompt: "Are your key business workflows documented?", type: "single", options: [{ id: "opt_0", label: "Yes, fully documented and followed consistently" }, { id: "opt_1", label: "Partially — key processes are written down" }, { id: "opt_2", label: "Informal understanding across the team" }, { id: "opt_3", label: "No formal documentation" }] },
    { id: "leadership", prompt: "How does your leadership view AI adoption?", type: "single", options: [{ id: "opt_0", label: "Actively investing in AI initiatives" }, { id: "opt_1", label: "Open to it and looking for the right opportunity" }, { id: "opt_2", label: "Cautious — want to see proven ROI first" }, { id: "opt_3", label: "Skeptical or resistant to AI tools" }] },
    { id: "budget", prompt: "Do you have budget allocated for AI or technology tools?", type: "single", options: [{ id: "opt_0", label: "Yes, a dedicated AI/innovation budget" }, { id: "opt_1", label: "Part of a general technology budget" }, { id: "opt_2", label: "Ad hoc — we approve tools case by case" }, { id: "opt_3", label: "No formal technology budget" }] },
    { id: "team_readiness", prompt: "How comfortable is your team with adopting new technology?", type: "single", options: [{ id: "opt_0", label: "Very comfortable — we're early adopters" }, { id: "opt_1", label: "Mostly comfortable with proper training" }, { id: "opt_2", label: "Mixed — some enthusiasts, some resistant" }, { id: "opt_3", label: "Generally resistant to new tools" }] },
    { id: "data_privacy", prompt: "How do you currently handle data privacy and compliance?", type: "single", options: [{ id: "opt_0", label: "We have formal policies and regular audits" }, { id: "opt_1", label: "Basic policies in place but not regularly reviewed" }, { id: "opt_2", label: "We follow general best practices informally" }, { id: "opt_3", label: "We haven't formalized our data privacy approach" }] },
    { id: "pain_point", prompt: "What's your biggest operational challenge right now?", type: "single", options: [{ id: "opt_0", label: "Finding and retaining customers" }, { id: "opt_1", label: "Operational efficiency and reducing manual work" }, { id: "opt_2", label: "Scaling the team without losing quality" }, { id: "opt_3", label: "Staying competitive in a changing market" }] },
    { id: "company_size", prompt: "How many people work at your company?", type: "single", options: [{ id: "opt_0", label: "Just me" }, { id: "opt_1", label: "2–10" }, { id: "opt_2", label: "11–50" }, { id: "opt_3", label: "51–200" }, { id: "opt_4", label: "200+" }] },
    { id: "industry", prompt: "What industry are you in?", type: "single", options: [{ id: "opt_0", label: "Professional Services (consulting, legal, accounting)" }, { id: "opt_1", label: "Healthcare or Medical" }, { id: "opt_2", label: "Real Estate" }, { id: "opt_3", label: "Retail or E-commerce" }, { id: "opt_4", label: "Technology or SaaS" }, { id: "opt_5", label: "Finance or Insurance" }, { id: "opt_6", label: "Other" }] },
  ],
  scoring: [
    { id: "ai_usage_0", points: 10, when: { all: [{ questionId: "ai_usage", operator: "equals", value: "opt_0" }] } },
    { id: "ai_usage_1", points: 7, when: { all: [{ questionId: "ai_usage", operator: "equals", value: "opt_1" }] } },
    { id: "ai_usage_2", points: 3, when: { all: [{ questionId: "ai_usage", operator: "equals", value: "opt_2" }] } },
    { id: "data_org_0", points: 10, when: { all: [{ questionId: "data_org", operator: "equals", value: "opt_0" }] } },
    { id: "data_org_1", points: 7, when: { all: [{ questionId: "data_org", operator: "equals", value: "opt_1" }] } },
    { id: "data_org_2", points: 3, when: { all: [{ questionId: "data_org", operator: "equals", value: "opt_2" }] } },
    { id: "processes_0", points: 10, when: { all: [{ questionId: "processes", operator: "equals", value: "opt_0" }] } },
    { id: "processes_1", points: 7, when: { all: [{ questionId: "processes", operator: "equals", value: "opt_1" }] } },
    { id: "processes_2", points: 3, when: { all: [{ questionId: "processes", operator: "equals", value: "opt_2" }] } },
    { id: "leadership_0", points: 10, when: { all: [{ questionId: "leadership", operator: "equals", value: "opt_0" }] } },
    { id: "leadership_1", points: 7, when: { all: [{ questionId: "leadership", operator: "equals", value: "opt_1" }] } },
    { id: "leadership_2", points: 3, when: { all: [{ questionId: "leadership", operator: "equals", value: "opt_2" }] } },
    { id: "budget_0", points: 10, when: { all: [{ questionId: "budget", operator: "equals", value: "opt_0" }] } },
    { id: "budget_1", points: 7, when: { all: [{ questionId: "budget", operator: "equals", value: "opt_1" }] } },
    { id: "budget_2", points: 3, when: { all: [{ questionId: "budget", operator: "equals", value: "opt_2" }] } },
    { id: "team_0", points: 10, when: { all: [{ questionId: "team_readiness", operator: "equals", value: "opt_0" }] } },
    { id: "team_1", points: 7, when: { all: [{ questionId: "team_readiness", operator: "equals", value: "opt_1" }] } },
    { id: "team_2", points: 3, when: { all: [{ questionId: "team_readiness", operator: "equals", value: "opt_2" }] } },
    { id: "privacy_0", points: 10, when: { all: [{ questionId: "data_privacy", operator: "equals", value: "opt_0" }] } },
    { id: "privacy_1", points: 7, when: { all: [{ questionId: "data_privacy", operator: "equals", value: "opt_1" }] } },
    { id: "privacy_2", points: 3, when: { all: [{ questionId: "data_privacy", operator: "equals", value: "opt_2" }] } },
  ],
  thresholds: [
    { id: "t_beginner", minScore: 0, maxScore: 27, outcomeId: "ai_beginner" },
    { id: "t_aware", minScore: 28, maxScore: 48, outcomeId: "ai_aware" },
    { id: "t_leader", minScore: 49, maxScore: 70, outcomeId: "ai_leader" },
  ],
  pricing: { isPaid: false },
};

// Missed Calls Assessment definition
const missedCallsDef: PackDefinition = {
  name: "Is Your Business Losing Money From Missed Calls?",
  version: 1,
  outcomes: [
    {
      id: "high_impact",
      title: "High Revenue Impact",
      description: "Based on your answers, missed calls are likely costing your business significant revenue every month. Businesses with your call volume and miss rate typically recover 30–40% of those lost leads with an AI receptionist — often paying for the tool within the first week.",
      status: "pass",
      ctaLabel: "See How NeverMiss Works",
      ctaUrl: "https://nevermiss.howstud.io",
    },
    {
      id: "moderate_impact",
      title: "Moderate Revenue Impact",
      description: "There's real opportunity here. Even recovering 1–2 additional customers per month from missed calls would likely cover the cost of an AI receptionist entirely — with meaningful upside beyond that.",
      status: "caution",
      ctaLabel: "Explore NeverMiss",
      ctaUrl: "https://nevermiss.howstud.io",
    },
    {
      id: "low_impact",
      title: "Low Current Impact",
      description: "Your current setup may be handling call volume reasonably well. But as your business grows, missed call costs tend to compound quickly. Worth keeping an eye on.",
      status: "fail",
      ctaLabel: "Learn About NeverMiss",
      ctaUrl: "https://nevermiss.howstud.io",
    },
  ],
  questions: [
    { id: "call_volume", prompt: "How many inbound calls does your business receive per day?", type: "single", options: [{ id: "opt_0", label: "Under 5" }, { id: "opt_1", label: "5–20" }, { id: "opt_2", label: "20–50" }, { id: "opt_3", label: "50+" }] },
    { id: "miss_rate", prompt: "What percentage of calls do you estimate go unanswered or to voicemail?", type: "single", options: [{ id: "opt_0", label: "Less than 10%" }, { id: "opt_1", label: "10–25%" }, { id: "opt_2", label: "25–50%" }, { id: "opt_3", label: "More than 50%" }] },
    { id: "current_solution", prompt: "Do you currently have a receptionist or answering service?", type: "single", options: [{ id: "opt_0", label: "Full-time receptionist" }, { id: "opt_1", label: "Part-time receptionist" }, { id: "opt_2", label: "Third-party answering service" }, { id: "opt_3", label: "Nothing — calls go to voicemail" }] },
    { id: "missed_impact", prompt: "What typically happens when a call goes unanswered?", type: "single", options: [{ id: "opt_0", label: "They usually call back" }, { id: "opt_1", label: "They leave a voicemail and we call back" }, { id: "opt_2", label: "They often move on to a competitor" }, { id: "opt_3", label: "We lose that lead entirely" }] },
    { id: "customer_value", prompt: "What's the approximate value of a new customer to your business?", type: "single", options: [{ id: "opt_0", label: "Under $100" }, { id: "opt_1", label: "$100–$500" }, { id: "opt_2", label: "$500–$2,000" }, { id: "opt_3", label: "Over $2,000" }] },
    { id: "industry", prompt: "What's your industry?", type: "single", options: [{ id: "opt_0", label: "Medical or Dental" }, { id: "opt_1", label: "Legal" }, { id: "opt_2", label: "Real Estate" }, { id: "opt_3", label: "Home Services (plumbing, HVAC, etc.)" }, { id: "opt_4", label: "Hospitality or Food & Beverage" }, { id: "opt_5", label: "Other" }] },
  ],
  scoring: [
    { id: "cv_0", points: 0, when: { all: [{ questionId: "call_volume", operator: "equals", value: "opt_0" }] } },
    { id: "cv_1", points: 5, when: { all: [{ questionId: "call_volume", operator: "equals", value: "opt_1" }] } },
    { id: "cv_2", points: 10, when: { all: [{ questionId: "call_volume", operator: "equals", value: "opt_2" }] } },
    { id: "cv_3", points: 15, when: { all: [{ questionId: "call_volume", operator: "equals", value: "opt_3" }] } },
    { id: "mr_0", points: 0, when: { all: [{ questionId: "miss_rate", operator: "equals", value: "opt_0" }] } },
    { id: "mr_1", points: 8, when: { all: [{ questionId: "miss_rate", operator: "equals", value: "opt_1" }] } },
    { id: "mr_2", points: 15, when: { all: [{ questionId: "miss_rate", operator: "equals", value: "opt_2" }] } },
    { id: "mr_3", points: 20, when: { all: [{ questionId: "miss_rate", operator: "equals", value: "opt_3" }] } },
    { id: "cs_0", points: 0, when: { all: [{ questionId: "current_solution", operator: "equals", value: "opt_0" }] } },
    { id: "cs_1", points: 5, when: { all: [{ questionId: "current_solution", operator: "equals", value: "opt_1" }] } },
    { id: "cs_2", points: 8, when: { all: [{ questionId: "current_solution", operator: "equals", value: "opt_2" }] } },
    { id: "cs_3", points: 15, when: { all: [{ questionId: "current_solution", operator: "equals", value: "opt_3" }] } },
    { id: "mi_0", points: 0, when: { all: [{ questionId: "missed_impact", operator: "equals", value: "opt_0" }] } },
    { id: "mi_1", points: 5, when: { all: [{ questionId: "missed_impact", operator: "equals", value: "opt_1" }] } },
    { id: "mi_2", points: 12, when: { all: [{ questionId: "missed_impact", operator: "equals", value: "opt_2" }] } },
    { id: "mi_3", points: 20, when: { all: [{ questionId: "missed_impact", operator: "equals", value: "opt_3" }] } },
    { id: "cval_0", points: 0, when: { all: [{ questionId: "customer_value", operator: "equals", value: "opt_0" }] } },
    { id: "cval_1", points: 5, when: { all: [{ questionId: "customer_value", operator: "equals", value: "opt_1" }] } },
    { id: "cval_2", points: 10, when: { all: [{ questionId: "customer_value", operator: "equals", value: "opt_2" }] } },
    { id: "cval_3", points: 20, when: { all: [{ questionId: "customer_value", operator: "equals", value: "opt_3" }] } },
  ],
  thresholds: [
    { id: "t_low", minScore: 0, maxScore: 24, outcomeId: "low_impact" },
    { id: "t_mod", minScore: 25, maxScore: 54, outcomeId: "moderate_impact" },
    { id: "t_high", minScore: 55, maxScore: 90, outcomeId: "high_impact" },
  ],
  pricing: { isPaid: false },
};

// Insurance Pre-Qualification definition
const insurancePrequalDef: PackDefinition = {
  name: "Property Insurance Pre-Qualification",
  version: 1,
  outcomes: [
    {
      id: "preferred",
      title: "Preferred Risk",
      description: "Based on your profile, you qualify for preferred rates. A licensed advisor will review your details and follow up within 24 hours with coverage options and pricing.",
      status: "pass",
      ctaLabel: "Schedule a Call With an Advisor",
      ctaUrl: "#",
    },
    {
      id: "standard",
      title: "Standard Review Required",
      description: "You're likely eligible for coverage, but we'll need to review a few details before confirming your rate. Expect a call from a licensed advisor within 1 business day.",
      status: "caution",
      ctaLabel: "Schedule a Call",
      ctaUrl: "#",
    },
    {
      id: "nonstandard",
      title: "Specialized Coverage",
      description: "Standard coverage may not be the best fit for your profile, but we have specialized options that may work well. Let's talk through the details.",
      status: "caution",
      ctaLabel: "Talk to an Advisor",
      ctaUrl: "#",
    },
    {
      id: "disqualified",
      title: "Non-Standard Market Required",
      description: "Based on your claims history or coverage history, standard market coverage isn't available through most carriers. However, non-standard and surplus lines options may still provide the coverage you need.",
      status: "fail",
      ctaLabel: "Explore Options",
      ctaUrl: "#",
    },
  ],
  questions: [
    { id: "coverage_type", prompt: "What type of coverage are you looking for?", type: "single", options: [{ id: "opt_0", label: "Homeowners Insurance" }, { id: "opt_1", label: "Renters Insurance" }, { id: "opt_2", label: "Commercial Property" }, { id: "opt_3", label: "Auto Insurance" }, { id: "opt_4", label: "I'm not sure yet" }] },
    { id: "claims_history", prompt: "Have you had any insurance claims in the past 3 years?", type: "single", options: [{ id: "opt_0", label: "No claims" }, { id: "opt_1", label: "1 claim" }, { id: "opt_2", label: "2 claims" }, { id: "opt_3", label: "3 or more claims" }] },
    { id: "prior_cancellation", prompt: "Has your insurance ever been cancelled or non-renewed by an insurer?", type: "single", options: [{ id: "opt_0", label: "No" }, { id: "opt_1", label: "Yes" }] },
    { id: "property_value", prompt: "What is the approximate value of the property or asset you're insuring?", type: "single", options: [{ id: "opt_0", label: "Under $100,000" }, { id: "opt_1", label: "$100,000–$500,000" }, { id: "opt_2", label: "$500,000–$1,000,000" }, { id: "opt_3", label: "Over $1,000,000" }] },
    { id: "current_coverage", prompt: "Do you currently have active insurance coverage?", type: "single", options: [{ id: "opt_0", label: "Yes, currently insured" }, { id: "opt_1", label: "Coverage lapsed recently" }, { id: "opt_2", label: "Never been insured" }] },
    { id: "ownership", prompt: "Are you the owner of the property or asset?", type: "single", options: [{ id: "opt_0", label: "Yes, I'm the owner" }, { id: "opt_1", label: "No, I'm renting or leasing" }, { id: "opt_2", label: "Partial ownership / shared" }] },
    { id: "motivation", prompt: "What's driving you to look for new coverage today?", type: "single", options: [{ id: "opt_0", label: "Looking for better rates" }, { id: "opt_1", label: "My current coverage is ending" }, { id: "opt_2", label: "I just acquired this property" }, { id: "opt_3", label: "First time getting insurance" }, { id: "opt_4", label: "Unsatisfied with current insurer" }] },
    { id: "zip_code", prompt: "What's your ZIP code?", type: "text" },
  ],
  disqualifiers: [
    { id: "dq_claims", reason: "3 or more claims in past 3 years — non-standard market required.", when: { all: [{ questionId: "claims_history", operator: "equals", value: "opt_3" }] } },
    { id: "dq_cancel", reason: "Prior cancellation or non-renewal — non-standard market required.", when: { all: [{ questionId: "prior_cancellation", operator: "equals", value: "opt_1" }] } },
  ],
  scoring: [
    { id: "claims_0", points: 30, when: { all: [{ questionId: "claims_history", operator: "equals", value: "opt_0" }] } },
    { id: "claims_1", points: 18, when: { all: [{ questionId: "claims_history", operator: "equals", value: "opt_1" }] } },
    { id: "claims_2", points: 8, when: { all: [{ questionId: "claims_history", operator: "equals", value: "opt_2" }] } },
    { id: "cov_0", points: 20, when: { all: [{ questionId: "current_coverage", operator: "equals", value: "opt_0" }] } },
    { id: "cov_1", points: 10, when: { all: [{ questionId: "current_coverage", operator: "equals", value: "opt_1" }] } },
    { id: "cov_2", points: 5, when: { all: [{ questionId: "current_coverage", operator: "equals", value: "opt_2" }] } },
    { id: "own_0", points: 15, when: { all: [{ questionId: "ownership", operator: "equals", value: "opt_0" }] } },
    { id: "own_1", points: 10, when: { all: [{ questionId: "ownership", operator: "equals", value: "opt_1" }] } },
    { id: "own_2", points: 10, when: { all: [{ questionId: "ownership", operator: "equals", value: "opt_2" }] } },
  ],
  thresholds: [
    { id: "t_nonstandard", minScore: 0, maxScore: 19, outcomeId: "nonstandard" },
    { id: "t_standard", minScore: 20, maxScore: 42, outcomeId: "standard" },
    { id: "t_preferred", minScore: 43, maxScore: 65, outcomeId: "preferred" },
  ],
  pricing: { isPaid: false },
};

// Score calculation helpers
function calcAiScore(answers: Record<string, string>): { score: number; outcomeId: string; outcomeLabel: string } {
  const pts: Record<string, number> = { opt_0: 10, opt_1: 7, opt_2: 3, opt_3: 0 };
  const scoredKeys = ["ai_usage", "data_org", "processes", "leadership", "budget", "team_readiness", "data_privacy"];
  const score = scoredKeys.reduce((s, k) => s + (pts[answers[k] ?? "opt_3"] ?? 0), 0);
  if (score >= 49) return { score, outcomeId: "ai_leader", outcomeLabel: "AI Leader" };
  if (score >= 28) return { score, outcomeId: "ai_aware", outcomeLabel: "AI Ready — With Gaps" };
  return { score, outcomeId: "ai_beginner", outcomeLabel: "Building Your Foundation" };
}

function calcCallsScore(answers: Record<string, string>): { score: number; outcomeId: string; outcomeLabel: string } {
  const cvPts: Record<string, number> = { opt_0: 0, opt_1: 5, opt_2: 10, opt_3: 15 };
  const mrPts: Record<string, number> = { opt_0: 0, opt_1: 8, opt_2: 15, opt_3: 20 };
  const csPts: Record<string, number> = { opt_0: 0, opt_1: 5, opt_2: 8, opt_3: 15 };
  const miPts: Record<string, number> = { opt_0: 0, opt_1: 5, opt_2: 12, opt_3: 20 };
  const cvalPts: Record<string, number> = { opt_0: 0, opt_1: 5, opt_2: 10, opt_3: 20 };
  const score = (cvPts[answers.call_volume ?? "opt_0"] ?? 0) + (mrPts[answers.miss_rate ?? "opt_0"] ?? 0) + (csPts[answers.current_solution ?? "opt_0"] ?? 0) + (miPts[answers.missed_impact ?? "opt_0"] ?? 0) + (cvalPts[answers.customer_value ?? "opt_0"] ?? 0);
  if (score >= 55) return { score, outcomeId: "high_impact", outcomeLabel: "High Revenue Impact" };
  if (score >= 25) return { score, outcomeId: "moderate_impact", outcomeLabel: "Moderate Revenue Impact" };
  return { score, outcomeId: "low_impact", outcomeLabel: "Low Current Impact" };
}

function calcInsuranceScore(answers: Record<string, string>): { score: number; outcomeId: string; outcomeLabel: string; disqualified: boolean } {
  if (answers.claims_history === "opt_3" || answers.prior_cancellation === "opt_1") {
    return { score: 0, outcomeId: "disqualified", outcomeLabel: "Non-Standard Market Required", disqualified: true };
  }
  const claimsPts: Record<string, number> = { opt_0: 30, opt_1: 18, opt_2: 8 };
  const covPts: Record<string, number> = { opt_0: 20, opt_1: 10, opt_2: 5 };
  const ownPts: Record<string, number> = { opt_0: 15, opt_1: 10, opt_2: 10 };
  const score = (claimsPts[answers.claims_history ?? "opt_0"] ?? 0) + (covPts[answers.current_coverage ?? "opt_0"] ?? 0) + (ownPts[answers.ownership ?? "opt_0"] ?? 0);
  if (score >= 43) return { score, outcomeId: "preferred", outcomeLabel: "Preferred Risk", disqualified: false };
  if (score >= 20) return { score, outcomeId: "standard", outcomeLabel: "Standard Review Required", disqualified: false };
  return { score, outcomeId: "nonstandard", outcomeLabel: "Specialized Coverage", disqualified: false };
}

// Random date within last N days, weighted toward weekdays
function randomDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  // Slightly weight toward weekdays by shifting weekends
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1);
  if (dow === 6) d.setDate(d.getDate() - 1);
  d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

const firstNames = ["Sarah", "Mike", "Jessica", "Tom", "Anna", "David", "Emily", "Chris", "Rachel", "James", "Megan", "Kevin", "Lisa", "Brian", "Stephanie", "Mark", "Amy", "Jason", "Jennifer", "Ryan"];
const lastNames = ["Chen", "Torres", "Park", "Bradley", "Williams", "Johnson", "Martinez", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Lee", "Walker"];
const companies = ["riverstone-realty", "brightsmile-dental", "summitlaw", "apexroofing", "coastalmed", "primeinsure", "nexustech", "bluehorizon-advisory", "silvergate-finance", "mountainpeak-hr", "clearwater-consulting", "redwood-realty", "harvest-health", "sterling-solutions", "pinnacle-group"];

function fakeEmail(firstName: string, lastName: string): string {
  const company = companies[Math.floor(Math.random() * companies.length)];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company}.com`;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function seedDemoData(storage: IStorage): Promise<void> {
  try {
    // Find or create demo workspace
    let demoWorkspace = await storage.getWorkspaceBySlug("demo");
    if (!demoWorkspace) {
      demoWorkspace = await storage.createWorkspace({ name: "Demo Workspace", slug: "demo", primaryColor: "#0f766e", secondaryColor: "#0f172a" });
    }

    // Check if already seeded
    const existingCount = await storage.countSubmissionsByWorkspace(demoWorkspace.id);
    if (existingCount > 0) {
      console.log("[seed] Demo workspace already has submissions — skipping seed");
      return;
    }

    console.log("[seed] Seeding demo data...");

    // Create or find AI Readiness pack
    let aiPack = await storage.getPackBySlug(demoWorkspace.id, "ai-readiness-assessment");
    if (!aiPack) {
      aiPack = await storage.createPack({ workspaceId: demoWorkspace.id, name: "AI Readiness Assessment", slug: "ai-readiness-assessment", isPaid: false });
    }
    if (!aiPack.publishedVersionId) {
      const v = await storage.createPackVersion({ packId: aiPack.id, version: 1, definition: aiReadinessDef });
      await storage.publishVersion(aiPack.id, v.id);
      aiPack = (await storage.getPack(aiPack.id))!;
    }

    // Create or find Missed Calls pack
    let callsPack = await storage.getPackBySlug(demoWorkspace.id, "missed-calls-assessment");
    if (!callsPack) {
      callsPack = await storage.createPack({ workspaceId: demoWorkspace.id, name: "Is Your Business Losing Money From Missed Calls?", slug: "missed-calls-assessment", isPaid: false });
    }
    if (!callsPack.publishedVersionId) {
      const v = await storage.createPackVersion({ packId: callsPack.id, version: 1, definition: missedCallsDef });
      await storage.publishVersion(callsPack.id, v.id);
      callsPack = (await storage.getPack(callsPack.id))!;
    }

    // Create or find Insurance pack
    let insurancePack = await storage.getPackBySlug(demoWorkspace.id, "insurance-pre-qualification");
    if (!insurancePack) {
      insurancePack = await storage.createPack({ workspaceId: demoWorkspace.id, name: "Property Insurance Pre-Qualification", slug: "insurance-pre-qualification", isPaid: false });
    }
    if (!insurancePack.publishedVersionId) {
      const v = await storage.createPackVersion({ packId: insurancePack.id, version: 1, definition: insurancePrequalDef });
      await storage.publishVersion(insurancePack.id, v.id);
      insurancePack = (await storage.getPack(insurancePack.id))!;
    }

    // AI answer sets (varied)
    const aiAnswerSets: Record<string, string>[] = [
      { ai_usage: "opt_0", data_org: "opt_0", processes: "opt_0", leadership: "opt_0", budget: "opt_0", team_readiness: "opt_0", data_privacy: "opt_0", pain_point: "opt_1", company_size: "opt_2", industry: "opt_0" },
      { ai_usage: "opt_1", data_org: "opt_1", processes: "opt_1", leadership: "opt_1", budget: "opt_1", team_readiness: "opt_1", data_privacy: "opt_1", pain_point: "opt_0", company_size: "opt_1", industry: "opt_4" },
      { ai_usage: "opt_2", data_org: "opt_2", processes: "opt_2", leadership: "opt_2", budget: "opt_2", team_readiness: "opt_2", data_privacy: "opt_2", pain_point: "opt_2", company_size: "opt_1", industry: "opt_2" },
      { ai_usage: "opt_3", data_org: "opt_3", processes: "opt_3", leadership: "opt_3", budget: "opt_3", team_readiness: "opt_3", data_privacy: "opt_3", pain_point: "opt_3", company_size: "opt_0", industry: "opt_6" },
      { ai_usage: "opt_0", data_org: "opt_1", processes: "opt_0", leadership: "opt_0", budget: "opt_1", team_readiness: "opt_0", data_privacy: "opt_1", pain_point: "opt_0", company_size: "opt_3", industry: "opt_1" },
      { ai_usage: "opt_1", data_org: "opt_0", processes: "opt_1", leadership: "opt_2", budget: "opt_0", team_readiness: "opt_1", data_privacy: "opt_0", pain_point: "opt_1", company_size: "opt_2", industry: "opt_5" },
      { ai_usage: "opt_2", data_org: "opt_1", processes: "opt_2", leadership: "opt_1", budget: "opt_2", team_readiness: "opt_3", data_privacy: "opt_3", pain_point: "opt_3", company_size: "opt_1", industry: "opt_3" },
    ];

    const callsAnswerSets: Record<string, string>[] = [
      { call_volume: "opt_3", miss_rate: "opt_3", current_solution: "opt_3", missed_impact: "opt_3", customer_value: "opt_3", industry: "opt_0" },
      { call_volume: "opt_2", miss_rate: "opt_2", current_solution: "opt_2", missed_impact: "opt_2", customer_value: "opt_2", industry: "opt_1" },
      { call_volume: "opt_1", miss_rate: "opt_1", current_solution: "opt_1", missed_impact: "opt_1", customer_value: "opt_1", industry: "opt_2" },
      { call_volume: "opt_0", miss_rate: "opt_0", current_solution: "opt_0", missed_impact: "opt_0", customer_value: "opt_0", industry: "opt_3" },
      { call_volume: "opt_2", miss_rate: "opt_3", current_solution: "opt_3", missed_impact: "opt_2", customer_value: "opt_3", industry: "opt_4" },
      { call_volume: "opt_1", miss_rate: "opt_2", current_solution: "opt_1", missed_impact: "opt_2", customer_value: "opt_2", industry: "opt_0" },
    ];

    const insuranceAnswerSets: Record<string, string>[] = [
      { coverage_type: "opt_0", claims_history: "opt_0", prior_cancellation: "opt_0", property_value: "opt_1", current_coverage: "opt_0", ownership: "opt_0", motivation: "opt_0", zip_code: "90210" },
      { coverage_type: "opt_2", claims_history: "opt_1", prior_cancellation: "opt_0", property_value: "opt_2", current_coverage: "opt_0", ownership: "opt_0", motivation: "opt_4", zip_code: "10001" },
      { coverage_type: "opt_0", claims_history: "opt_2", prior_cancellation: "opt_0", property_value: "opt_0", current_coverage: "opt_1", ownership: "opt_1", motivation: "opt_1", zip_code: "60601" },
      { coverage_type: "opt_1", claims_history: "opt_0", prior_cancellation: "opt_0", property_value: "opt_0", current_coverage: "opt_2", ownership: "opt_1", motivation: "opt_3", zip_code: "77001" },
      { coverage_type: "opt_3", claims_history: "opt_3", prior_cancellation: "opt_0", property_value: "opt_3", current_coverage: "opt_0", ownership: "opt_0", motivation: "opt_0", zip_code: "85001" },
      { coverage_type: "opt_0", claims_history: "opt_0", prior_cancellation: "opt_1", property_value: "opt_1", current_coverage: "opt_0", ownership: "opt_2", motivation: "opt_2", zip_code: "33101" },
    ];

    let paidCount = 0;
    const paidLimit = 15;

    // Generate 25 AI submissions
    for (let i = 0; i < 25; i++) {
      const fName = firstNames[i % firstNames.length];
      const lName = lastNames[(i + 3) % lastNames.length];
      const answers = aiAnswerSets[i % aiAnswerSets.length];
      const { score, outcomeId, outcomeLabel } = calcAiScore(answers);
      const createdAt = randomDate(30);
      const hasEmail = Math.random() > 0.15;
      const isPaid = paidCount < paidLimit && Math.random() > 0.7;
      if (isPaid) paidCount++;
      await storage.createSubmission({
        workspaceId: demoWorkspace.id,
        packId: aiPack.id,
        packVersionId: aiPack.publishedVersionId!,
        email: hasEmail ? fakeEmail(fName, lName) : null,
        firstName: hasEmail ? fName : null,
        answers: answers as Record<string, unknown>,
        score,
        outcomeId,
        outcomeLabel,
        paid: isPaid,
        pdfSent: hasEmail,
        completedAt: Math.random() > 0.2 ? new Date(createdAt.getTime() + 5 * 60 * 1000) : null,
        createdAt,
      });
    }

    // Generate 20 Missed Calls submissions
    for (let i = 0; i < 20; i++) {
      const fName = firstNames[(i + 5) % firstNames.length];
      const lName = lastNames[(i + 7) % lastNames.length];
      const answers = callsAnswerSets[i % callsAnswerSets.length];
      const { score, outcomeId, outcomeLabel } = calcCallsScore(answers);
      const createdAt = randomDate(30);
      const hasEmail = Math.random() > 0.15;
      const isPaid = paidCount < paidLimit && Math.random() > 0.75;
      if (isPaid) paidCount++;
      await storage.createSubmission({
        workspaceId: demoWorkspace.id,
        packId: callsPack.id,
        packVersionId: callsPack.publishedVersionId!,
        email: hasEmail ? fakeEmail(fName, lName) : null,
        firstName: hasEmail ? fName : null,
        answers: answers as Record<string, unknown>,
        score,
        outcomeId,
        outcomeLabel,
        paid: isPaid,
        pdfSent: hasEmail,
        completedAt: Math.random() > 0.2 ? new Date(createdAt.getTime() + 4 * 60 * 1000) : null,
        createdAt,
      });
    }

    // Generate 15 Insurance submissions
    for (let i = 0; i < 15; i++) {
      const fName = firstNames[(i + 10) % firstNames.length];
      const lName = lastNames[(i + 12) % lastNames.length];
      const answers = insuranceAnswerSets[i % insuranceAnswerSets.length];
      const { score, outcomeId, outcomeLabel } = calcInsuranceScore(answers);
      const createdAt = randomDate(30);
      const hasEmail = Math.random() > 0.15;
      const isPaid = paidCount < paidLimit && Math.random() > 0.8;
      if (isPaid) paidCount++;
      await storage.createSubmission({
        workspaceId: demoWorkspace.id,
        packId: insurancePack.id,
        packVersionId: insurancePack.publishedVersionId!,
        email: hasEmail ? fakeEmail(fName, lName) : null,
        firstName: hasEmail ? fName : null,
        answers: answers as Record<string, unknown>,
        score,
        outcomeId,
        outcomeLabel,
        paid: isPaid,
        pdfSent: hasEmail,
        completedAt: Math.random() > 0.2 ? new Date(createdAt.getTime() + 3 * 60 * 1000) : null,
        createdAt,
      });
    }

    console.log(`[seed] Done — created 60 submissions across 3 packs`);
  } catch (err) {
    console.error("[seed] Failed:", err);
  }
}
