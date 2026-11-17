import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suspendAccount,establishAccount} from '../src/services/session-storage.ts';
test('an interrupted session migration can recover queues already moved to a previous login token',()=>{
 const data=new Map<string,any>([['account_user_id','parent'],['access_token','token-old'],['family_id','family'],['child_id','child'],['study_pending:token-old:child',{event_id:'durable'}],['study_resume:token-old:child',{phase:'test'}]]);
 let fail=true;
 const storage={get:(key:string)=>data.get(key),set:(key:string,value:any)=>{if(fail&&key==='study_resume:token-first:child')throw Error('storage full');data.set(key,value);},remove:(key:string)=>{data.delete(key);},keys:()=>[...data.keys()],clear:()=>data.clear()};
 suspendAccount(storage);assert.throws(()=>establishAccount(storage,'parent','token-first',[]),/storage full/);
 assert(data.has('study_pending:token-first:child'));fail=false;
 establishAccount(storage,'parent','token-second',[]);
 assert.deepEqual(data.get('study_pending:token-second:child'),{event_id:'durable'});assert.deepEqual(data.get('study_resume:token-second:child'),{phase:'test'});
 assert.equal(data.get('child_id'),'child');assert.equal(data.get('access_token'),'token-second');assert(!data.has('expired_account'));
});
