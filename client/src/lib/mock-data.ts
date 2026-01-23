export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
}

export interface Question {
  id: string;
  text: string;
  type: 'single' | 'multiple' | 'text' | 'rating';
  options?: { id: string; text: string; value: number; nextQuestionId?: string }[];
}

export interface Quiz {
  id: string;
  orgId: string;
  title: string;
  description: string;
  slug: string;
  published: boolean;
  gateResults: boolean; // Stripe Paywall
  price: number;
  questions: Question[];
  image?: string;
}

export interface Submission {
  id: string;
  quizId: string;
  answers: Record<string, any>;
  score: number;
  email?: string;
  paid: boolean;
  completedAt: string;
}

// Seed Data
export const MOCK_ORGS: Organization[] = [
  { id: 'org-1', name: 'HOWstud.io', slug: 'howstudio', logo: '/logo.png' },
  { id: 'org-2', name: 'Acme Corp', slug: 'acme' },
];

export const MOCK_QUIZZES: Quiz[] = [
  {
    id: 'quiz-1',
    orgId: 'org-1',
    title: 'Compliance Check 2026',
    description: 'Ensure your business meets the new 2026 regulatory standards.',
    slug: 'compliance-check',
    published: true,
    gateResults: true,
    price: 49.99,
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=1000',
    questions: [
      {
        id: 'q1',
        text: 'Does your organization have a dedicated Data Protection Officer?',
        type: 'single',
        options: [
          { id: 'opt1', text: 'Yes', value: 10 },
          { id: 'opt2', text: 'No', value: 0 },
          { id: 'opt3', text: 'In Progress', value: 5 },
        ]
      },
      {
        id: 'q2',
        text: 'How often do you conduct security audits?',
        type: 'single',
        options: [
          { id: 'opt1', text: 'Quarterly', value: 10 },
          { id: 'opt2', text: 'Annually', value: 5 },
          { id: 'opt3', text: 'Never', value: 0 },
        ]
      }
    ]
  },
  {
    id: 'quiz-2',
    orgId: 'org-1',
    title: 'Product Recommender',
    description: 'Find the perfect software solution for your team based on your needs.',
    slug: 'product-recommender',
    published: true,
    gateResults: false,
    price: 0,
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1000',
    questions: [
      {
        id: 'q1',
        text: 'How large is your team?',
        type: 'single',
        options: [
          { id: 'opt1', text: '1-10', value: 1 },
          { id: 'opt2', text: '11-50', value: 2 },
          { id: 'opt3', text: '50+', value: 3 },
        ]
      }
    ]
  },
  {
    id: 'quiz-3',
    orgId: 'org-2',
    title: 'Lead Qualification',
    description: 'See if you qualify for our enterprise partnership program.',
    slug: 'lead-qual',
    published: false,
    gateResults: false,
    price: 0,
    questions: []
  }
];

export const MOCK_SUBMISSIONS: Submission[] = [
  { id: 'sub-1', quizId: 'quiz-1', answers: {}, score: 85, email: 'test@example.com', paid: true, completedAt: '2023-10-25T10:00:00Z' },
  { id: 'sub-2', quizId: 'quiz-1', answers: {}, score: 40, email: 'lead@example.com', paid: false, completedAt: '2023-10-26T14:30:00Z' },
  { id: 'sub-3', quizId: 'quiz-2', answers: {}, score: 100, email: 'customer@gmail.com', paid: true, completedAt: '2023-10-27T09:15:00Z' },
];
