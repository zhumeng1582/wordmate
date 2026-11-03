import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Core} from '../src/core.ts';
import {validateBody} from '../src/validation.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
import type {Database,Scheduler} from '../src/ports.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const scheduler:Scheduler={version:'round-test',parameterVersion:'round-test',empty:now=>({due:now}),next:(_state,rating,now)=>({state:{rating},label:'review',due:new Date(now.getTime()+86400000)})};
async function fixture(count:number){
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/016_security_integrity.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let now=new Date();const core=new Core(db,new DevIdentity(),new FixtureDictionary(),scheduler,'rounds',()=>now),actor=(await core.login('dev-dad')).user.id,outsider=(await core.login('dev-outsider')).user.id;
 const family=await core.createFamily(actor,randomUUID(),{name:'轮次测试'}),child=await core.createChild(actor,randomUUID(),family.id,{nickname:'孩子'});
 await pg.query('UPDATE wordmate.children SET daily_goal=10,daily_new_limit=10 WHERE id=$1',[child.id]);
 await pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) SELECT $1,'word'||n,'word'||n,'noun','fixture:'||n,'测试'||n,'fixture' FROM generate_series(1,$2::int) n",[child.id,count]);
 await pg.query("INSERT INTO wordmate.review_cards(child_id,child_word_id,scheduler_state,scheduler_version,parameter_version,due_at) SELECT child_id,id,'{}','round-test','round-test',$2 FROM wordmate.child_words WHERE child_id=$1",[child.id,now]);
 const answer=(session:any,card:any,rating='good',event_id=randomUUID())=>core.review(actor,{session_id:session.id,card_id:card.id,event_id,expected_version:card.version,rating,lease_generation:session.lease_generation});
 const end=(session:any)=>core.heartbeat(actor,session.id,{lease_generation:session.lease_generation},true);
 return {pg,core,actor,outsider,child,answer,end,setNow:(date:Date)=>{now=date;},now:()=>now};
}
test('selected wordbook scopes home counts, study queues and review response',async()=>{
 const f=await fixture(0);try{
  const {core,actor,child,pg}=f,a=await core.createWordbook(actor,randomUUID(),child.id,{name:'第一本'}),b=await core.createWordbook(actor,randomUUID(),child.id,{name:'第二本'});
  const words=(await pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) SELECT $1,'item'||n,'item'||n,'noun','test:'||n,'释义'||n,'test' FROM generate_series(1,4) n RETURNING id,lemma",[child.id])).rows;
  for(let i=0;i<words.length;i++){await pg.query("INSERT INTO wordmate.review_cards(child_id,child_word_id,scheduler_state,scheduler_version,parameter_version,due_at,state) VALUES($1,$2,'{}','round-test','round-test',$3,$4)",[child.id,words[i].id,f.now(),i===1?'review':'new']);await pg.query('INSERT INTO wordmate.wordbook_words(child_id,wordbook_id,child_word_id) VALUES($1,$2,$3)',[child.id,i<2?a.id:b.id,words[i].id]);}
  assert.equal((await core.today(actor,child.id,a.id)).new_count,1);assert.equal((await core.today(actor,child.id,a.id)).due_count,1);assert.equal((await core.today(actor,child.id,b.id)).new_count,2);assert.equal((await core.today(actor,child.id,b.id)).due_count,0);assert.equal((await core.today(actor,child.id)).new_count,3);
  assert.deepEqual((await core.today(actor,child.id,a.id)).wordbook,{id:a.id,name:'第一本'});assert.deepEqual((await core.today(actor,child.id,b.id)).wordbook,{id:b.id,name:'第二本'});assert.equal((await core.today(actor,child.id)).wordbook,null);
  const session=await core.startSession(actor,randomUUID(),child.id,{source:'new_words',wordbook_id:a.id}),cards=(await core.cards(actor,session.id)).items;assert.equal(cards.length,1);assert.equal(cards[0].lemma,'item1');
  const response=await core.review(actor,{session_id:session.id,card_id:cards[0].id,event_id:randomUUID(),expected_version:cards[0].version,lease_generation:session.lease_generation,rating:'good',wordbook_id:a.id});assert.equal(response.today.new_count,0);await f.end(session);
  const review=await core.startSession(actor,randomUUID(),child.id,{source:'review',wordbook_id:a.id});assert.equal((await core.cards(actor,review.id)).items[0].lemma,'item2');await f.end(review);
  await assert.rejects(core.today(actor,child.id,randomUUID()),{code:'WORDBOOK_NOT_FOUND'});
 }finally{await f.pg.close();}
});
test('10 + 10 + 3 new words can be learned on the same day with durable, distinct progress',async()=>{
 const f=await fixture(23);try{
  const {core,actor,child}=f,seen=new Set<string>();let saved=0;
  for(const size of [10,10,3]){
   const key=randomUUID(),session=await core.startSession(actor,key,child.id,{source:'new_words'});assert.equal(session.total,size);assert.deepEqual(await core.startSession(actor,key,child.id,{source:'new_words'}),JSON.parse(JSON.stringify(session)));
   const cards=(await core.cards(actor,session.id)).items;assert.equal(cards.length,size);
   await assert.rejects(core.startSession(actor,randomUUID(),child.id,{source:'new_words'}),{code:'CHILD_BUSY'});
   for(const card of cards){assert(!seen.has(card.id));seen.add(card.id);const event=randomUUID(),reply=await f.answer(session,card,'good',event);saved++;assert.equal(reply.today.new_words,saved);assert.equal(reply.today.completed_words,saved);assert.deepEqual(await f.answer(session,card,'good',event),reply);}
   await f.end(session);const today=await core.today(actor,child.id);assert.equal(today.goal,10);assert.equal(today.new_group_size,Math.min(10,23-saved));assert.equal(today.goal_reached,true);
  }
  assert.equal(seen.size,23);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.review_logs')).rows[0].n,23);
  await assert.rejects(core.startSession(actor,randomUUID(),child.id,{source:'new_words'}),{code:'EMPTY_NEW_QUEUE'});
  await assert.rejects(core.startSession(f.outsider,randomUUID(),child.id,{source:'new_words'}),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.pg.close();}
});
test('calendar studied scope includes correct answers, preserves practice scheduling and isolates dates and children',async()=>{
 const f=await fixture(23);try{
  const {core,actor,child}=f,session=await core.startSession(actor,randomUUID(),child.id,{source:'new_words'}),cards=(await core.cards(actor,session.id)).items;
  for(let i=0;i<cards.length;i++)await f.answer(session,cards[i],i===0?'again':'good');await f.end(session);
  const day=(await core.history.calendar(actor,child.id)).today;
  const history=await core.history.calendar(actor,child.id),row=history.days.find((d:any)=>d.date===day);assert.equal(row.studied_words,10);assert.equal(row.reviewable_words,10);assert.equal(row.wrong_words,1);
  const before=(await f.pg.query('SELECT * FROM wordmate.review_cards ORDER BY id')).rows;
  const source={source:'calendar',date:day,scope:'studied'};validateBody(['children',child.id,'study-sessions'],'POST',source);
  const extra=await core.startSession(actor,randomUUID(),child.id,source),all=(await core.cards(actor,extra.id)).items;assert.equal(all.length,10);assert(all.every((c:any)=>c.practice_only));
  for(const card of all){const reply=await f.answer(extra,card);assert.equal(reply.today.completed_words,10);assert.equal(reply.practice_only,true);}await f.end(extra);
  assert.deepEqual((await f.pg.query('SELECT * FROM wordmate.review_cards ORDER BY id')).rows,before);
  const mistakes=await core.startSession(actor,randomUUID(),child.id,{source:'calendar',date:day}),wrong=(await core.cards(actor,mistakes.id)).items;assert.equal(wrong.length,1);await f.end(mistakes);
  const previous=new Date(Date.parse(day)-86400000).toISOString().slice(0,10),future=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
  await assert.rejects(core.startSession(actor,randomUUID(),child.id,{source:'calendar',date:previous,scope:'studied'}),{code:'EMPTY_HISTORY_QUEUE'});
  await assert.rejects(core.startSession(actor,randomUUID(),child.id,{source:'calendar',date:future,scope:'studied'}),{code:'INVALID_DATE'});
  await assert.rejects(core.startSession(f.outsider,randomUUID(),child.id,source),{code:'FAMILY_NOT_FOUND'});
  await f.pg.query('UPDATE wordmate.child_words SET archived_at=$2 WHERE id=$1',[cards[1].child_word_id,f.now()]);await f.pg.query('UPDATE wordmate.review_cards SET suspended_at=$2 WHERE id=$1',[cards[2].id,f.now()]);
  const available=(await core.history.calendar(actor,child.id)).days.find((d:any)=>d.date===day);assert.equal(available.studied_words,10);assert.equal(available.reviewable_words,8);
  f.setNow(new Date(f.now().getTime()+2*86400000));const later=await core.startSession(actor,randomUUID(),child.id,source),due=(await core.cards(actor,later.id)).items;assert.equal(due.length,8);assert(due.every((c:any)=>!c.practice_only));
  const reply=await f.answer(later,due[0]);assert.equal(reply.version,due[0].version+1);assert.equal(reply.today.completed_words,1);
 }finally{await f.pg.close();}
});
test('history sessions paginate beyond 100 and their unanswered words can be resumed without truncation',async()=>{
 const f=await fixture(105);try{
  const day=(await f.core.history.calendar(f.actor,f.child.id)).today;
  await f.pg.query("UPDATE wordmate.review_cards SET state='review',due_at=$2 WHERE child_id=$1",[f.child.id,new Date(f.now().getTime()+86400000)]);
  await f.pg.query('INSERT INTO wordmate.daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) SELECT child_id,$2,id,child_word_id,$3,true FROM wordmate.review_cards WHERE child_id=$1',[f.child.id,day,f.now()]);
  const session=await f.core.startSession(f.actor,randomUUID(),f.child.id,{source:'calendar',date:day,scope:'studied'});assert.equal(session.total,105);
  const first=await f.core.cards(f.actor,session.id,{limit:100}),last=await f.core.cards(f.actor,session.id,{limit:100,cursor:first.next_cursor});assert.equal(first.items.length,100);assert.equal(last.items.length,5);assert.equal(last.next_cursor,null);assert.equal(new Set([...first.items,...last.items].map(c=>c.id)).size,105);
  await f.end(session);const body={source:'manual',word_ids:[...first.items,...last.items].map(c=>c.child_word_id)};validateBody(['children',f.child.id,'study-sessions'],'POST',body);
  const resumed=await f.core.startSession(f.actor,randomUUID(),f.child.id,body);assert.equal(resumed.total,105);
 }finally{await f.pg.close();}
});
test('cross-month history ranges deduplicate words and keep study and mistake filters separate',async()=>{
 const f=await fixture(23);try{
  const current=new Date(),firstDay=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+2,0,4)),secondDay=new Date(firstDay.getTime()+86400000),day1=firstDay.toISOString().slice(0,10),day2=secondDay.toISOString().slice(0,10),month=day1.slice(0,7),dayBefore=new Date(firstDay.getTime()-86400000).toISOString().slice(0,10),dayAfter=new Date(secondDay.getTime()+86400000).toISOString().slice(0,10);
  f.setNow(firstDay);
  const first=await f.core.startSession(f.actor,randomUUID(),f.child.id,{source:'new_words'}),cards=(await f.core.cards(f.actor,first.id)).items;
  for(let i=0;i<cards.length;i++)await f.answer(first,cards[i],i===0?'again':'good');await f.end(first);
  f.setNow(secondDay);
  const newWord=(await f.pg.query("SELECT child_word_id FROM wordmate.review_cards WHERE child_id=$1 AND state='new' LIMIT 1",[f.child.id])).rows[0].child_word_id;
  const second=await f.core.startSession(f.actor,randomUUID(),f.child.id,{source:'manual',word_ids:[cards[0].child_word_id,newWord]}),later=(await f.core.cards(f.actor,second.id)).items;
  for(const card of later)await f.answer(second,card,card.child_word_id===newWord?'good':'again');await f.end(second);
  const range={date_from:day1,date_to:day2,scope:'studied'};
  assert.equal((await f.core.history.range(f.actor,f.child.id,range)).count,11);
  assert.equal((await f.core.history.range(f.actor,f.child.id,{...range,scope:'mistakes'})).count,1);
  assert.equal((await f.core.history.range(f.actor,f.child.id,{...range,scope:'mistakes',source:'monthly_quiz'})).count,0);
  assert.equal((await f.core.history.calendar(f.actor,f.child.id,month,'review')).days.find((d:any)=>d.date===day1).wrong_words,1);
  assert.equal((await f.core.history.calendar(f.actor,f.child.id,month,'monthly_quiz')).days.find((d:any)=>d.date===day1).wrong_words,0);
  const body={source:'calendar',...range};validateBody(['children',f.child.id,'study-sessions'],'POST',body);
  const before=(await f.core.today(f.actor,f.child.id)).completed_words,session=await f.core.startSession(f.actor,randomUUID(),f.child.id,body),selected=(await f.core.cards(f.actor,session.id)).items;
  assert.equal(session.date_from,range.date_from);assert.equal(session.date_to,range.date_to);assert.equal(selected.length,11);assert.equal(new Set(selected.map((c:any)=>c.child_word_id)).size,11);assert.equal((await f.core.today(f.actor,f.child.id)).completed_words,before);await f.end(session);
  const wrong=await f.core.startSession(f.actor,randomUUID(),f.child.id,{source:'calendar',...range,scope:'mistakes',mistake_source:'review'});assert.equal(wrong.total,1);await f.end(wrong);
  const other=await f.core.createChild(f.actor,randomUUID(),f.child.family_id,{nickname:'另一个孩子'});assert.equal((await f.core.history.range(f.actor,other.id,range)).count,0);
  await assert.rejects(f.core.history.range(f.outsider,f.child.id,range),{code:'FAMILY_NOT_FOUND'});
  for(const query of [{...range,date_to:dayBefore},{...range,date:day1},{...range,date_from:undefined}])await assert.rejects(f.core.history.range(f.actor,f.child.id,query));
  await assert.rejects(f.core.history.range(f.actor,f.child.id,{...range,date_to:dayAfter}),{code:'INVALID_DATE'});
  await assert.rejects(f.core.history.range(f.actor,f.child.id,{...range,source:'monthly_quiz'}),{code:'INVALID_SOURCE'});
  await assert.rejects(f.core.history.range(f.actor,f.child.id,{...range,scope:'mistakes',source:['review']}),{code:'INVALID_SOURCE'});
  await assert.rejects(f.core.startSession(f.actor,randomUUID(),f.child.id,{...body,date:day1}),{code:'INVALID_DATE_RANGE'});
 }finally{await f.pg.close();}
});
