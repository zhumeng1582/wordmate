// Generated from contracts/quiz-create.json; run node scripts/generate-contracts.cjs.
export type QuizCreateRequest = {
  scope?: "month" | "favorites";
  month: string;
  mode: "sample" | "full";
  sample_count?: 10 | 20 | 30 | 50;
};
