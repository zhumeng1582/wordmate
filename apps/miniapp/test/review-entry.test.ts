import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enterReview} from '../src/services/review-entry.ts';
function setup(existing:any,error?:string){
 const calls:string[]=[];let stored=existing;
 const deps={read:()=>stored,clear:()=>{calls.push('clear');stored=null;},heartbeat:async()=>{calls.push('heartbeat');if(error)throw Error(error);},create:async()=>{calls.push('create');return {id:'new'};},save:(s:any)=>{calls.push('save');stored=s;}};
 return {deps,calls,stored:()=>stored};
}
test('first entry creates and stores one session',async()=>{const x=setup(null);assert.deepEqual(await enterReview(x.deps),{id:'new'});assert.deepEqual(x.calls,['create','save']);});
test('returning entry resumes without creating another session',async()=>{const x=setup({id:'old'});assert.deepEqual(await enterReview(x.deps),{id:'old'});assert.deepEqual(x.calls,['heartbeat']);});
for(const code of ['SESSION_EXPIRED','SESSION_NOT_FOUND'])test(code+' permits replacement',async()=>{const x=setup({id:'old'},code);await enterReview(x.deps);assert.deepEqual(x.calls,['heartbeat','clear','create','save']);});
for(const code of ['NETWORK_ERROR','SESSION_NOT_OWNED','CHILD_BUSY'])test(code+' preserves session for retry',async()=>{const x=setup({id:'old'},code);await assert.rejects(enterReview(x.deps),new RegExp(code));assert.deepEqual(x.stored(),{id:'old'});assert.deepEqual(x.calls,['heartbeat']);});
test('session is saved before card loading can fail',async()=>{const x=setup(null);await enterReview(x.deps);await enterReview(x.deps);assert.deepEqual(x.calls,['create','save','heartbeat']);});
