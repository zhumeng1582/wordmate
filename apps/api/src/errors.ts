export class DomainError extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(code); this.status=status; this.code=code; }
}
export function ensure(value: unknown, status: number, code: string): asserts value { if (!value) throw new DomainError(status,code); }
export function text(value: unknown, max=120): string { ensure(typeof value==='string' && value.trim().length>0 && value.length<=max,422,'INVALID_TEXT'); return value.trim(); }
export function uuid(value: unknown): string { ensure(typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),422,'INVALID_ID');return value; }
export function integer(value: unknown, min=1, max=2147483647): number { ensure(Number.isInteger(value) && Number(value)>=min && Number(value)<=max,422,'INVALID_INTEGER'); return Number(value); }
