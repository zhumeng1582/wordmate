export type Row = Record<string, any>;
export interface Sql { query<T extends Row = Row>(sql: string, params?: any[]): Promise<{ rows: T[] }> }
export interface Database extends Sql { transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> }
export interface Scheduler {
  version: string; parameterVersion: string;
  empty(now: Date): any;
  next(state: any, rating: 'again'|'hard'|'good'|'easy', now: Date): { state: any; label: string; due: Date };
}
export type Candidate = { candidate_id: string; lemma: string; part_of_speech: string; sense_key: string; meaning_zh: string; source: string; ipa_gb: string|null; ipa_us: string|null };
export interface Dictionary { lookup(text: string): Promise<Candidate[]> }
export interface Identity { exchange(code: string): Promise<{ openId: string; displayName: string }> }
