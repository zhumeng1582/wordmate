import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import {FixtureQuizBuilder,grade} from '../src/quiz.ts';
import type {Database} from '../src/ports.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const month=(d:Date)=>new Date(d.getTime()+8*3600000).toISOString().slice(0,7);
test('grading uses exact integer thresholds, including rounded-display boundaries',()=>{
 for(const [right,total,expected] of [[90,100,'excellent'],[89,100,'good'],[80,100,'good'],[79,100,'pass'],[60,100,'pass'],[59,100,'needs_work'],[8999,10000,'good'],[0,1,'needs_work'],[1,1,'excellent']] as const)assert.equal(grade(right,total),expected);
});
test('monthly scope, frozen questions, leases, answer replay, grading and immutable mistakes',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let now=new Date();const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'test',()=>now),svc=core.quizzes;
 try{
  const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id,outsider=(await core.login('dev-outsider')).user.id;
  const f=await core.createFamily(dad,'f',{name:'月测家庭'}),c=await core.createChild(dad,'c',f.id,{nickname:'测试'}),book=await core.createWordbook(dad,'book',c.id,{name:'词本'});
  const invite=await core.createInvite(dad,'invite',f.id);await core.claimInvite(mom,'claim',{invite_token:invite.invite_token});await core.approveInvite(dad,'approve',invite.id);
  const batch=await core.createBatch(dad,'batch',c.id,{wordbook_id:book.id,words:['apple','book','cat','dog','school']});
  await core.confirmBatch(dad,'confirm',batch.id,{expected_version:1,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
  assert.equal((await svc.preview(dad,c.id,month(now))).eligible_count,0);
  await assert.rejects(svc.create(dad,'empty',c.id,{month:month(now),mode:'full'}),{code:'NO_STUDIED_WORDS'});
  await assert.rejects(svc.preview(dad,c.id,'2999-01'),{code:'FUTURE_MONTH'});
  const learning=await core.startSession(dad,'learn',c.id,{source:'scheduled'}),cards=(await core.cards(dad,learning.id)).items;
  for(const card of cards)await core.review(dad,{session_id:learning.id,card_id:card.id,event_id:crypto.randomUUID(),expected_version:card.version,rating:'good',lease_generation:1});
  await core.heartbeat(dad,learning.id,{lease_generation:1},true);
  await pg.query('UPDATE wordmate.child_words SET archived_at=now() WHERE id=$1',[cards[4].child_word_id]);
  const preview=await svc.preview(dad,c.id,month(now));assert.equal(preview.eligible_count,4);assert.equal(preview.excluded_count,1);
  const stateBefore=JSON.stringify((await pg.query('SELECT id,version,scheduler_state FROM wordmate.review_cards ORDER BY id')).rows),dailyBefore=JSON.stringify((await pg.query('SELECT * FROM wordmate.daily_activity')).rows);
  const request={month:month(now),mode:'sample',sample_count:10};let quiz=await svc.create(dad,'create',c.id,request);assert.equal(quiz.total_count,4);assert.equal(quiz.status,'preparing');
  assert.deepEqual(JSON.parse(JSON.stringify(await svc.create(dad,'create',c.id,request))),JSON.parse(JSON.stringify(quiz)));
  await assert.rejects(svc.create(mom,'second',c.id,request),{code:'ACTIVE_QUIZ_EXISTS'});
  await assert.rejects(svc.get(outsider,quiz.id),{code:'FAMILY_NOT_FOUND'});
  await assert.rejects(svc.items(dad,quiz.id,{},'results'),{code:'QUIZ_NOT_SUBMITTED'});
  await assert.rejects(svc.resume(dad,'early',quiz.id,{expected_version:quiz.version}),{code:'QUIZ_NOT_READY'});
  await svc.prepare(new FixtureQuizBuilder());quiz=await svc.get(dad,quiz.id);assert.equal(quiz.status,'ready');
  const page=await svc.items(dad,quiz.id,{limit:2});assert.equal(page.items.length,2);assert(page.next_cursor);const page2=await svc.items(dad,quiz.id,{limit:2,cursor:page.next_cursor});assert.equal(page2.items.length,2);assert.equal(page2.next_cursor,null);
  assert(!JSON.stringify(page).includes('correct_option_id'));assert(!JSON.stringify(page).includes('meaning_zh'));
  let started=await svc.resume(dad,'resume',quiz.id,{expected_version:quiz.version});quiz=started.quiz;let session=started.session;
  await assert.rejects(core.startSession(mom,'blocked-review',c.id,{source:'scheduled'}),{code:'CHILD_BUSY'});
  const all=[...page.items,...page2.items],answers=(await pg.query('SELECT id,correct_option_id FROM wordmate.monthly_quiz_items WHERE quiz_id=$1',[quiz.id])).rows;
  const correctId=(id:string)=>answers.find((a:any)=>a.id===id).correct_option_id;
  const b={expected_version:all[0].answer_version,session_id:session.id,lease_generation:session.lease_generation,selected_option_id:correctId(all[0].id)};
  await assert.rejects(svc.answer(dad,'badoption',quiz.id,all[0].id,{...b,selected_option_id:correctId(all[1].id)}),{code:'INVALID_OPTION'});
  const saved=await svc.answer(dad,'answer0',quiz.id,all[0].id,b);assert.deepEqual(await svc.answer(dad,'answer0',quiz.id,all[0].id,b),saved);
  await assert.rejects(svc.answer(dad,'stale',quiz.id,all[0].id,b),{code:'ANSWER_VERSION_CONFLICT'});
  quiz=await svc.get(dad,quiz.id);
  const takeover=await svc.resume(mom,'takeover',quiz.id,{expected_version:quiz.version,expected_session_id:session.id,confirmed:true},true);quiz=takeover.quiz;
  await assert.rejects(svc.answer(dad,'old-parent',quiz.id,all[1].id,{...b,expected_version:1}),{code:'SESSION_EXPIRED'});session=takeover.session;
  for(let i=1;i<3;i++){const result=await svc.answer(mom,`answer${i}`,quiz.id,all[i].id,{expected_version:1,session_id:session.id,lease_generation:session.lease_generation,selected_option_id:i===1?correctId(all[i].id):all[i].options.find((o:any)=>o.id!==correctId(all[i].id)).id});quiz.version=result.quiz_version;}
  const submit={expected_version:quiz.version,session_id:session.id,lease_generation:session.lease_generation,confirm_unanswered:false};
  await assert.rejects(svc.submit(mom,'submit-no',quiz.id,submit),{code:'CONFIRM_UNANSWERED'});
  assert.equal((await pg.query("SELECT count(*)::int n FROM wordmate.mistake_events WHERE source='monthly_quiz'")).rows[0].n,0);
  const result=await svc.submit(mom,'submit',quiz.id,{...submit,confirm_unanswered:true});assert.equal(result?.correct_count,2);assert.equal(result?.wrong_count,1);assert.equal(result?.unanswered_count,1);assert.equal(result?.grade,'needs_work');assert.equal(result?.score,50);
  assert.deepEqual(JSON.parse(JSON.stringify(await svc.submit(dad,'repeat-submit',quiz.id,submit))),JSON.parse(JSON.stringify(result)));
  const mistakes=await svc.items(dad,quiz.id,{},'mistakes');assert.equal(mistakes.items.length,2);assert(mistakes.items.some((i:any)=>i.reason==='unanswered'));
  assert.equal((await pg.query("SELECT count(*)::int n FROM wordmate.mistake_events WHERE source='monthly_quiz'")).rows[0].n,2);
  assert.equal(JSON.stringify((await pg.query('SELECT id,version,scheduler_state FROM wordmate.review_cards ORDER BY id')).rows),stateBefore);
  assert.equal(JSON.stringify((await pg.query('SELECT * FROM wordmate.daily_activity')).rows),dailyBefore);
  const full=await svc.create(dad,'full',c.id,{month:month(now),mode:'full'});assert.equal(full.total_count,4);
  await svc.abandon(dad,'abandon',full.id,{expected_version:full.version});await svc.prepare(new FixtureQuizBuilder());assert.equal((await svc.get(dad,full.id)).status,'abandoned');
  const failed=await svc.create(dad,'failed',c.id,{month:month(now),mode:'full'});await svc.prepare();assert.equal((await svc.get(dad,failed.id)).status,'failed');
  assert.equal((await svc.list(dad,c.id,{limit:1})).items.length,1);
 }finally{await pg.close();}
});
test('full test keeps all 105 eligible entries, pages safely, and expired sessions cannot answer',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let now=new Date();const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'large',()=>now),svc=core.quizzes;
 try{
  const dad=(await core.login('dev-dad')).user.id,f=await core.createFamily(dad,'family',{name:'分页测试'}),c=await core.createChild(dad,'child',f.id,{nickname:'测试'});
  // Synthetic, individually identified senses exercise pagination, not teaching quality.
  await pg.query(`WITH words AS (INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source,created_by)
   SELECT $1,'apple','apple','noun','pagination:'||n,'苹果','development-fixture',$2 FROM generate_series(1,105) n RETURNING id,child_id), cards AS (
   INSERT INTO wordmate.review_cards(child_id,child_word_id,scheduler_version,parameter_version) SELECT child_id,id,'test','test' FROM words RETURNING id,child_id,child_word_id)
   INSERT INTO wordmate.daily_word_activity(child_id,local_date,card_id,child_word_id,first_review_at,was_new) SELECT child_id,$3,id,child_word_id,$4,true FROM cards`,[c.id,dad,month(now)+'-01',now]);
  assert.equal((await svc.preview(dad,c.id,month(now))).eligible_count,105);
  let sample=await svc.create(dad,'sample',c.id,{month:month(now),mode:'sample',sample_count:20});assert.equal(sample.total_count,20);
  const sampled=(await pg.query('SELECT child_word_id FROM wordmate.monthly_quiz_items WHERE quiz_id=$1',[sample.id])).rows;assert.equal(new Set(sampled.map((r:any)=>r.child_word_id)).size,20);
  await svc.abandon(dad,'abandon-sample',sample.id,{expected_version:sample.version});
  let full=await svc.create(dad,'full',c.id,{month:month(now),mode:'full'});assert.equal(full.total_count,105);
  // Freeze means later edits cannot alter a prepared exam.
  await pg.query("UPDATE wordmate.child_words SET meaning_zh='后来修改的释义' WHERE child_id=$1",[c.id]);
  await svc.prepare(new FixtureQuizBuilder());full=await svc.get(dad,full.id);assert.equal(full.status,'ready');
  const first=await svc.items(dad,full.id,{limit:100}),last=await svc.items(dad,full.id,{limit:100,cursor:first.next_cursor});assert.equal(first.items.length,100);assert.equal(last.items.length,5);assert.equal(last.next_cursor,null);
  assert.equal(new Set([...first.items,...last.items].map((r:any)=>r.id)).size,105);
  let started=await svc.resume(dad,'resume',full.id,{expected_version:full.version});now=new Date(now.getTime()+121000);
  await assert.rejects(svc.answer(dad,'expired',full.id,first.items[0].id,{expected_version:1,session_id:started.session.id,lease_generation:1,selected_option_id:first.items[0].options[0].id}),{code:'SESSION_EXPIRED'});
  const fresh=await svc.get(dad,full.id);started=await svc.resume(dad,'resume2',full.id,{expected_version:fresh.version});
  const result=await svc.submit(dad,'submit',full.id,{expected_version:started.quiz.version,session_id:started.session.id,lease_generation:started.session.lease_generation,confirm_unanswered:true});
  assert.equal(result?.unanswered_count,105);assert.equal(result?.mistake_count,105);
  const results=await svc.items(dad,full.id,{limit:100},'results');assert.equal((results.items[0] as any).word.meaning_zh,'苹果');
 }finally{await pg.close();}
});
