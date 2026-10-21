import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectRange,monthDays} from '../src/services/date-range.ts';
test('first start, second end, third restarts',()=>{let r=selectRange({start:'',end:''},'2026-09-30');assert.deepEqual(r,{start:'2026-09-30',end:''});r=selectRange(r,'2026-10-02');assert.deepEqual(r,{start:'2026-09-30',end:'2026-10-02'});assert.deepEqual(selectRange(r,'2026-10-10'),{start:'2026-10-10',end:''});});
test('reverse selection normalizes and same day is allowed',()=>{assert.deepEqual(selectRange({start:'2026-10-02',end:''},'2026-09-30'),{start:'2026-09-30',end:'2026-10-02'});assert.deepEqual(selectRange({start:'2026-10-02',end:''},'2026-10-02'),{start:'2026-10-02',end:'2026-10-02'});});
test('calendar respects leap years and Monday columns',()=>{assert.equal(monthDays('2024-02').count,29);assert.equal(monthDays('2025-02').count,28);assert.equal(monthDays('2026-06').offset,0);});
