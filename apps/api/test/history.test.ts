import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary} from '../src/providers.ts';
import {FixtureQuizBuilder} from '../src/quiz.ts';
import type {Database,Scheduler} from '../src/ports.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const scheduler:Scheduler={version:'test',parameterVersion:'test',empty:now=>({due:now}),next:(_state,rating,now)=>({state:{rating,due:new Date(now.getTime()+86400000)},label:'review',due:new Date(now.getTime()+86400000)})};
test('calendar, mixed-source mistakes, practice scheduling, quota, timezone and family isolation',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let now=new Date('2026-10-19T15:59:00Z');const core=new Core(db,new DevIdentity(),new FixtureDictionary(),scheduler,'test',()=>now);
 try{
 const dad=(await core.login('dev-dad')).user.id,outsider=(await core.login('dev-outsider')).user.id;
 const f=await core.createFamily(dad,'f',{name:'学习家庭'}),c=await core.createChild(dad,'c',f.id,{nickname:'孩子'}),book=await core.createWordbook(dad,'b',c.id,{name:'词本'});
 await pg.query('UPDATE wordmate.children SET daily_goal=2,daily_new_limit=2 WHERE id=$1',[c.id]);
 const batch=await core.createBatch(dad,'batch',c.id,{wordbook_id:book.id,words:['apple','cat','dog']});
 await core.confirmBatch(dad,'confirm',batch.id,{expected_version:1,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
 let session=await core.startSession(dad,'s',c.id,{source:'scheduled'}),cards=(await core.cards(dad,session.id)).items;assert.equal(cards.length,2);
 const answer=async(card:any,rating='again')=>core.review(dad,{session_id:session.id,lease_generation:1,card_id:card.id,expected_version:card.version,event_id:randomUUID(),rating});
 for(const card of cards)await answer(card);
 await core.heartbeat(dad,session.id,{lease_generation:1},true);
 let calendar=await core.history.calendar(dad,c.id,'2026-10');let day=calendar.days.find((d:any)=>d.date==='2026-10-19');assert.equal(day?.checked_in,true);assert.equal(day?.wrong_words,2);assert.equal(calendar.streak_days,1);
 await assert.rejects(core.history.calendar(outsider,c.id,'2026-10'),{code:'FAMILY_NOT_FOUND'});
 await assert.rejects(core.history.wrongWords(outsider,c.id),{code:'FAMILY_NOT_FOUND'});
 await assert.rejects(core.history.wrongWords(dad,c.id,{date:'2026-02-30'}),{code:'INVALID_DATE'});
 await assert.rejects(core.history.calendar(dad,c.id,'2026-11'),{code:'INVALID_MONTH'});
 const page=await core.history.wrongWords(dad,c.id,{limit:1});assert.equal(page.items.length,1);assert(page.next_cursor);const page2=await core.history.wrongWords(dad,c.id,{limit:1,cursor:page.next_cursor});assert.equal(page2.items.length,1);assert.notEqual(page.items[0].word.id,page2.items[0].word.id);assert.equal(page2.next_cursor,null);
 const before=(await pg.query('SELECT * FROM wordmate.review_cards ORDER BY id')).rows;
 session=await core.startSession(dad,'calendar',c.id,{source:'calendar',date:'2026-10-19'});let practice=(await core.cards(dad,session.id)).items;assert(practice.every((x:any)=>x.practice_only));
 now=new Date('2026-10-19T15:59:30Z');for(const card of practice){const result=await answer(card,'good');assert.equal(result.practice_only,true);assert.equal(result.version,card.version);assert.equal(result.today.completed_words,2);}
 assert.deepEqual((await pg.query('SELECT * FROM wordmate.review_cards ORDER BY id')).rows,before);
 assert((await core.history.wrongWords(dad,c.id)).items.every((x:any)=>x.correct_since_last_mistake));
 await core.heartbeat(dad,session.id,{lease_generation:1},true);
 // Quiz mistakes join the same history, but do not increment daily learning.
 let quiz=await core.quizzes.create(dad,'q',c.id,{month:'2026-10',mode:'full'});await core.quizzes.prepare(new FixtureQuizBuilder());quiz=await core.quizzes.get(dad,quiz.id);const resume=await core.quizzes.resume(dad,'qr',quiz.id,{expected_version:quiz.version});
 await core.quizzes.submit(dad,'qs',quiz.id,{expected_version:resume.quiz.version,session_id:resume.session.id,lease_generation:1,confirm_unanswered:true});
 const mixed=await core.history.wrongWords(dad,c.id);assert.equal(mixed.items.length,2);assert(mixed.items.every((x:any)=>x.wrong_count===2&&x.sources.length===2&&x.unanswered_count===1));
 assert.equal((await core.history.wrongWords(dad,c.id,{source:'monthly_quiz',quiz_id:quiz.id})).items.length,2);
 calendar=await core.history.calendar(dad,c.id,'2026-10');day=calendar.days.find((d:any)=>d.date==='2026-10-19');assert.equal(day?.studied_words,2);assert.equal(day?.mistake_count,4);assert.equal(day?.quiz_count,1);
 const newWord=(await pg.query("SELECT child_word_id FROM wordmate.review_cards WHERE state='new'")).rows[0].child_word_id;
 await assert.rejects(core.startSession(dad,'quota',c.id,{source:'manual',word_ids:[newWord]}),{code:'NEW_WORD_LIMIT'});
 // Local midnight permits another daily check-in, while the cards are still not due.
 now=new Date('2026-10-19T16:00:10Z');session=await core.startSession(dad,'nextday',c.id,{source:'quiz',quiz_id:quiz.id});practice=(await core.cards(dad,session.id,{limit:1})).items;assert.equal(practice.length,1);
 await answer(practice[0],'good');const tail=await core.cards(dad,session.id);assert.equal(tail.remaining,1);await answer(tail.items[0],'good');
 assert.equal((await core.today(dad,c.id)).streak_days,2);await core.heartbeat(dad,session.id,{lease_generation:1},true);
 // Due cards selected for extra review advance normally.
 now=new Date('2026-10-21T00:00:00Z');session=await core.startSession(dad,'due',c.id,{source:'manual',word_ids:[cards[0].child_word_id]});const due=(await core.cards(dad,session.id)).items[0];assert.equal(due.practice_only,false);assert.equal((await answer(due,'good')).version,due.version+1);
 await core.heartbeat(dad,session.id,{lease_generation:1},true);
 await pg.query('UPDATE wordmate.child_words SET archived_at=$2 WHERE id=$1',[cards[0].child_word_id,now]);
 assert((await core.history.wrongWords(dad,c.id)).items.some((x:any)=>x.word.archived_at));
 await assert.rejects(core.startSession(dad,'archived',c.id,{source:'manual',word_ids:[cards[0].child_word_id]}),{code:'WORD_UNAVAILABLE'});
 now=new Date('2026-10-24T00:00:00Z');assert.equal((await core.today(dad,c.id)).streak_days,0);
 }finally{await pg.close();}
});
