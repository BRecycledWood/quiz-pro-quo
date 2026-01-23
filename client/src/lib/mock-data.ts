export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
}

export type QuestionType = 
  | 'yes_no' | 'true_false' 
  | 'single' | 'multi' | 'dropdown' 
  | 'number' | 'percent' | 'scale_1_5' | 'scale_1_10'
  | 'short_text' | 'long_text' | 'date';

export type Severity = 'info' | 'warn' | 'critical';

export interface AnswerOption {
  id: string;
  label: string;
  value: string | number;
  points?: number;
  severity?: Severity;
}

export interface BranchingRule {
  id: string;
  condition: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal';
  value: any;
  targetQuestionId: string; // 'finish' or question ID
}

export interface CalculatedField {
  id: string;
  key: string; // snake_case
  label: string;
  type: 'number' | 'boolean' | 'text';
  expression: string;
  description?: string;
}

export interface Outcome {
  id: string;
  type: 'knockout' | 'threshold';
  label: string;
  message: string;
  severity: 'pass' | 'caution' | 'fail';
  // For knockout
  condition?: string;
  // For threshold
  metric?: string; // 'score' or calculated field key
  threshold?: number;
  operator?: '>' | '>=' | '<' | '<=' | '==';
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  key: string; // snake_case variable name
  helpText?: string;
  category?: string;
  required?: boolean;
  options?: AnswerOption[];
  branchingRules?: BranchingRule[];
  defaultNextQuestionId?: string; // If no rules match
}

export interface Quiz {
  id: string;
  orgId: string;
  title: string;
  description: string;
  slug: string;
  published: boolean;
  gateResults: boolean;
  price: number;
  discountEnabled?: boolean;
  originalPrice?: number;
  
  questions: Question[];
  calculatedFields: CalculatedField[];
  outcomes: Outcome[]; // Rules/Knockouts
  
  image?: string;
  views?: number;
}

export interface Submission {
  id: string;
  quizId: string;
  answers: Record<string, any>;
  calculatedValues: Record<string, any>;
  score: number;
  outcome?: {
    label: string;
    severity: 'pass' | 'caution' | 'fail';
    message: string;
  };
  email?: string;
  paid: boolean;
  status: 'started' | 'completed';
  startedAt: string;
  completedAt?: string;
}

// Seed Data
export const MOCK_ORGS: Organization[] = [
  { id: 'org-1', name: 'HOWstud.io', slug: 'howstudio', logo: '/logo.png' },
  { id: 'org-2', name: 'Acme Corp', slug: 'acme' },
];

export const MOCK_QUIZZES: Quiz[] = [
  {
    id: 'quiz-demo',
    orgId: 'org-1',
    title: 'Short-Term Rental Feasibility',
    description: 'Determine if your property is suitable for short-term rental arbitrage.',
    slug: 'str-feasibility',
    published: true,
    gateResults: false,
    price: 0,
    questions: [
      {
        id: 'q1',
        type: 'number',
        text: 'Total number of units in the building?',
        key: 'building_unit_count',
        required: true,
        defaultNextQuestionId: 'q2'
      },
      {
        id: 'q2',
        type: 'number',
        text: 'How many active STR listings are already in this building?',
        key: 'active_str_count',
        required: true,
        defaultNextQuestionId: 'finish'
      }
    ],
    calculatedFields: [
      {
        id: 'c1',
        key: 'str_ratio',
        label: 'STR Saturation Ratio',
        type: 'number',
        expression: 'active_str_count / building_unit_count',
        description: 'Percentage of units that are already STRs'
      }
    ],
    outcomes: [
      {
        id: 'rule1',
        type: 'knockout',
        label: 'Saturation High',
        message: 'This building has too many short-term rentals already. Management is unlikely to approve more.',
        severity: 'fail',
        condition: 'str_ratio > 0.25'
      },
      {
        id: 'rule2',
        type: 'threshold',
        label: 'Feasible',
        message: 'This building looks like a great candidate!',
        severity: 'pass',
        metric: 'str_ratio',
        operator: '<=',
        threshold: 0.25
      }
    ]
  }
];

export const MOCK_SUBMISSIONS: Submission[] = [];
