// Generated from contracts/study-session.json; run node scripts/generate-contracts.cjs.
export type StudySessionRequest = {
  source: "scheduled";
  wordbook_id?: string;
} | {
  source: "review";
  wordbook_id?: string;
} | {
  source: "new_words";
  wordbook_id?: string;
} | {
  source: "favorites";
} | {
  source: "calendar";
  date: string;
  scope?: "studied" | "mistakes";
  mistake_source?: "review" | "monthly_quiz";
} | {
  source: "calendar";
  date_from: string;
  date_to: string;
  scope?: "studied" | "mistakes";
  mistake_source?: "review" | "monthly_quiz";
} | {
  source: "manual";
  word_ids: Array<string>;
} | {
  source: "quiz";
  quiz_id: string;
};
