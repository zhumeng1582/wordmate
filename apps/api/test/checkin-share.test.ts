import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
import {CURATED,validateEncouragement} from '../src/checkin-share.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
test('share is scoped, historical, cached, anonymous and falls back safely',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/006_checkin_shares.sql','utf8'));
 const db={query:(s:string,p?:any[])=>pg.query(s,p),transaction:(fn:any)=>pg.transaction((q:any)=>fn({query:(s:string,p?:any[])=>q.query(s,p)}))};
 let calls=0,fail=false,actorToRevoke='';const payloads:any[]=[];
 const now=new Date(Date.now()+86400000),today=now.toISOString().slice(0,10),previous=(n:number)=>new Date(Date.parse(today)-n*86400000).toISOString().slice(0,10);
 const provider=async(input:any)=>{calls++;payloads.push(input);if(actorToRevoke)await pg.query("UPDATE wordmate.family_members SET status='removed' WHERE user_id=$1",[actorToRevoke]);if(fail)throw Error('timeout');return CURATED;};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),{} as any,'test',()=>now,undefined,undefined,provider);
 try{
 const dad=(await core.login('dev-dad')).user.id,other=(await core.login('dev-outsider')).user.id;
 const family=await core.createFamily(dad,'f',{name:'private'}),child=await core.createChild(dad,'c',family.id,{nickname:'PRIVATE CHILD'});
 for(const [date,words] of [[previous(3),10],[previous(2),10],[previous(1),4],[today,0]] as const)await pg.query('INSERT INTO wordmate.daily_activity(child_id,local_date,distinct_words,goal_snapshot,timezone_snapshot) VALUES($1,$2,$3,10,\'Asia/Shanghai\')',[child.id,date,words]);
 const snapshot=JSON.stringify((await pg.query('SELECT * FROM wordmate.daily_activity ORDER BY local_date')).rows);
 await assert.rejects(core.checkinShare.create(other,child.id,{date:previous(2)}),{code:'FAMILY_NOT_FOUND'});assert.equal(calls,0);
 await assert.rejects(core.checkinShare.create(dad,child.id,{date:today}),{code:'NO_LEARNING_TO_SHARE'});
 const results=await Promise.all([core.checkinShare.create(dad,child.id,{date:previous(2)}),core.checkinShare.create(dad,child.id,{date:previous(2)})]);assert.equal(calls,1);
 const shared=await core.checkinShare.create(dad,child.id,{date:previous(2)});assert.equal(shared.checked_in,true);assert.equal(shared.streak_days,2);assert.equal(shared.studied_words,10);assert.equal(shared.copy_source,'ai');assert.equal(calls,1);assert(!JSON.stringify(shared).includes('PRIVATE'));assert(!('child_id' in shared));assert.deepEqual(payloads,[{checked_in:true}]);
 fail=true;const partial=await core.checkinShare.create(dad,child.id,{date:previous(1)});assert.equal(partial.checked_in,false);assert.equal(partial.copy_source,'curated');assert.equal(partial.streak_days,0);assert.equal(calls,2);await core.checkinShare.create(dad,child.id,{date:previous(1)});assert.equal(calls,2);
 actorToRevoke=dad;await assert.rejects(core.checkinShare.create(dad,child.id,{date:previous(3)}),{code:'FAMILY_NOT_FOUND'});
 assert.equal(JSON.stringify((await pg.query('SELECT * FROM wordmate.daily_activity ORDER BY local_date')).rows),snapshot);
 }finally{await pg.close();}
});
test('generated copy rejects unsafe, numeric or malformed content',()=>{
 assert.deepEqual(validateEncouragement({safe:true,quotes:CURATED}),CURATED);
 for(const value of [{safe:false,quotes:CURATED},{safe:true,quotes:[...CURATED.slice(1),{en:'You learned 20 words today.',zh:'你今天学习了20个词。'}]},{safe:true,quotes:[{en:'You are a stupid loser.',zh:'你是笨蛋。'},...CURATED.slice(1)]}])assert.throws(()=>validateEncouragement(value));
});
