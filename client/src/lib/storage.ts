import { MOCK_QUIZZES, MOCK_ORGS, MOCK_SUBMISSIONS, Quiz, Organization, Submission } from "./mock-data";

const STORAGE_KEYS = {
  QUIZZES: "qpq_quizzes",
  ORGS: "qpq_orgs",
  SUBMISSIONS: "qpq_submissions",
};

export const storage = {
  getQuizzes: (): Quiz[] => {
    const data = localStorage.getItem(STORAGE_KEYS.QUIZZES);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(MOCK_QUIZZES));
      return MOCK_QUIZZES;
    }
    return JSON.parse(data);
  },

  saveQuiz: (updatedQuiz: Quiz) => {
    const quizzes = storage.getQuizzes();
    const index = quizzes.findIndex((q) => q.id === updatedQuiz.id);
    if (index >= 0) {
      quizzes[index] = updatedQuiz;
    } else {
      quizzes.push(updatedQuiz);
    }
    localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(quizzes));
  },

  deleteQuiz: (quizId: string) => {
    const quizzes = storage.getQuizzes();
    const filtered = quizzes.filter((q) => q.id !== quizId);
    localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(filtered));
  },

  getOrgs: (): Organization[] => {
    const data = localStorage.getItem(STORAGE_KEYS.ORGS);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.ORGS, JSON.stringify(MOCK_ORGS));
      return MOCK_ORGS;
    }
    return JSON.parse(data);
  },

  getSubmissions: (): Submission[] => {
    const data = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(MOCK_SUBMISSIONS));
      return MOCK_SUBMISSIONS;
    }
    return JSON.parse(data);
  },

  addSubmission: (submission: Submission) => {
    const submissions = storage.getSubmissions();
    submissions.push(submission);
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(submissions));
  },
  
  // Helper to force reset (for dev)
  reset: () => {
    localStorage.clear();
    window.location.reload();
  }
};
