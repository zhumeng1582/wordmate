import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
import type {Database,Scheduler} from '../src/ports.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const scheduler:Scheduler={version:'test',parameterVersion:'test',empty:now=>({due:now}),next:(_state,rating,now)=>({state:{rating,due:new Date(now.getTime()+86400000)},label:'review',due:new Date(now.getTime()+86400000)})};

test('15-day actual streak earns one credit and makeup restores continuity without inventing study',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
 await pg.exec("ALTER TABLE wordmate.idempotency_keys ALTER COLUMN created_at SET DEFAULT '2026-10-15T12:00:00Z'::timestamptz");
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let now=new Date('2026-10-15T12:00:00Z');const core=new Core(db,new DevIdentity(),new FixtureDictionary(),scheduler,'makeup-test',()=>now);
 try{
  const actor=(await core.login('dev-dad')).user.id,family=await core.createFamily(actor,'family',{name:'家庭'}),child=await core.createChild(actor,'child',family.id,{nickname:'孩子'});
  await pg.query('UPDATE wordmate.children SET daily_goal=1,daily_new_limit=5 WHERE id=$1',[child.id]);
  for(let i=1;i<=14;i++){const date=`2026-10-${String(i).padStart(2,'0')}`;await pg.query("INSERT INTO wordmate.daily_activity(child_id,local_date,distinct_words,goal_snapshot,timezone_snapshot) VALUES($1,$2,1,1,'Asia/Shanghai')",[child.id,date]);}
  const legacyChild=await core.createChild(actor,'legacy-child',family.id,{nickname:'另一个孩子'});
  for(let i=1;i<=15;i++){const date=`2026-08-${String(i).padStart(2,'0')}`;await pg.query("INSERT INTO wordmate.daily_activity(child_id,local_date,distinct_words,goal_snapshot,timezone_snapshot) VALUES($1,$2,1,1,'Asia/Shanghai')",[legacyChild.id,date]);}
  await pg.exec(readFileSync('apps/api/migrations/012_checkin_makeup.sql','utf8'));
  assert.equal(Number((await pg.query('SELECT count(*)::int n FROM wordmate.checkin_makeup_credits WHERE child_id=$1',[legacyChild.id])).rows[0].n),1);
  const book=await core.createWordbook(actor,'book',child.id,{name:'词本'}),batch=await core.createBatch(actor,'batch',child.id,{wordbook_id:book.id,words:['apple']});
  await core.confirmBatch(actor,'confirm',batch.id,{expected_version:1,selections:batch.items.map((item:any)=>({item_id:item.id,action:'select',candidate_id:item.candidates[0].candidate_id}))});
  let session=await core.startSession(actor,'learn',child.id,{source:'new_words'}),card=(await core.cards(actor,session.id)).items[0];
  await core.review(actor,{session_id:session.id,card_id:card.id,event_id:randomUUID(),expected_version:card.version,lease_generation:1,rating:'good'});
  assert.equal((await core.today(actor,child.id)).makeup_credits,1);
  const awarded=(await pg.query('SELECT milestone_days,milestone_date FROM wordmate.checkin_makeup_credits WHERE child_id=$1',[child.id])).rows[0];
  assert.equal(awarded.milestone_days,15);assert.equal(new Date(awarded.milestone_date).toISOString().slice(0,10),'2026-10-15');

  now=new Date('2026-10-17T12:00:00Z');
  await pg.query("INSERT INTO wordmate.daily_activity(child_id,local_date,distinct_words,goal_snapshot,timezone_snapshot) VALUES($1,'2026-10-17',1,1,'Asia/Shanghai')",[child.id]);
  const restored=await core.useCheckinMakeup(actor,'makeup-16',child.id,{date:'2026-10-16'});
  assert.equal(restored.makeup_credits,0);assert.equal(restored.streak_days,17);
  const calendar=await core.history.calendar(actor,child.id,'2026-10'),day=calendar.days.find((item:any)=>item.date==='2026-10-16');
  assert.equal(day.checked_in,true);assert.equal(day.makeup,true);assert.equal(day.studied_words,0);assert.equal(calendar.makeup_credits,0);
  const use=(await pg.query('SELECT used_by,used_for_date FROM wordmate.checkin_makeup_credits WHERE child_id=$1',[child.id])).rows[0];assert.equal(use.used_by,actor);assert.equal(new Date(use.used_for_date).toISOString().slice(0,10),'2026-10-16');
  await assert.rejects(core.useCheckinMakeup(actor,'duplicate-use',child.id,{date:'2026-10-16'}),{code:'CHECKIN_ALREADY_COMPLETE'});
  await assert.rejects(core.useCheckinMakeup(actor,'future-use',child.id,{date:'2026-10-18'}),{code:'MAKEUP_DATE_NOT_PAST'});
 }finally{await pg.close();}
});
