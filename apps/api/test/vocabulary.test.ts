import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {StoredMeaningQuizBuilder} from '../src/quiz.ts';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {Database} from '../src/ports.ts';
import type {VocabularyProvider} from '../src/vocabulary.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
const result=(word:string,i:number)=>({input_index:i,input:word,status:'ok',lemma:word,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',meaning_zh:`测试${word}`,sentence_en:`I see the ${word}.`,sentence_zh:`我看到了${word}。`,reason:null});
test('AI jobs: shared permissions, persistent dedupe, partial retry, atomic save and review eligibility',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let mode='partial',calls:string[][]=[];let now=new Date();
 const provider:VocabularyProvider={provider:'deepseek',model:'test',promptVersion:'test',generate:async words=>{calls.push(words);return {items:words.map((w,i)=>mode==='partial'&&w==='testword'?{input_index:i,input:w,status:'invalid',reason:'无法识别'}:mode==='broken'&&i===1?{...result(w,i),sentence_en:'Missing target.'}:result(w,i))};}};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'ai-test',()=>now,provider);
 try{
  const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id,other=(await core.login('dev-outsider')).user.id;
  const f=await core.createFamily(dad,'f',{name:'测试'}),c=await core.createChild(dad,'c',f.id,{nickname:'孩子'}),b=await core.createWordbook(dad,'b',c.id,{name:'词本'});
  const invite=await core.createInvite(dad,'invite',f.id);await core.claimInvite(mom,'claim',{invite_token:invite.invite_token});await core.approveInvite(dad,'approve',invite.id);
  const body={wordbook_id:b.id,words:['airport','testword'],theme:'旅行'};
  const job=await core.vocabulary.create(dad,'create',c.id,body);assert.equal(job.status,'queued');assert.equal(calls.length,0);
  assert.equal((await core.vocabulary.create(dad,'create',c.id,body)).id,job.id);
  assert.equal((await core.vocabulary.create(mom,'same-payload',c.id,body)).id,job.id);
  await assert.rejects(core.vocabulary.get(other,job.id),{code:'FAMILY_NOT_FOUND'});
  await assert.rejects(core.vocabulary.create(dad,'parallel',c.id,{...body,words:['cat']}),{code:'ACTIVE_GENERATION'});
  await core.vocabulary.processOne();let saved=await core.vocabulary.get(mom,job.id);assert.equal(saved.status,'partial');assert.equal(saved.items.filter((i:any)=>i.word_id).length,1);
  let words=(await core.words(dad,c.id)).items;assert.equal(words.length,1);assert.equal(words[0].example.text_en,'I see the airport.');assert.equal(words[0].ipa_us,'/test/');const question=new StoredMeaningQuizBuilder().build(words[0]);assert.equal(question.options.find(x=>x.id===question.correctId)?.text,words[0].meaning_zh);
  mode='valid';await core.vocabulary.retry(mom,'retry',job.id);await core.vocabulary.processOne();assert.deepEqual(calls,[['airport','testword'],['testword']]);
  saved=await core.vocabulary.get(dad,job.id);assert.equal(saved.status,'succeeded');assert.equal(saved.attempts,2);
  await core.vocabulary.processOne();assert.equal(calls.length,2);assert.equal((await pg.query('SELECT count(*)::int n FROM wordmate.sentences')).rows[0].n,2);
  assert.equal((await core.vocabulary.create(dad,'again',c.id,body)).id,job.id);assert.equal((await core.words(dad,c.id)).items.length,2);
  const session=await core.startSession(dad,'review',c.id,{source:'scheduled'});assert.equal((await core.cards(dad,session.id)).remaining,2);await core.heartbeat(dad,session.id,{lease_generation:1},true);
  // A malformed second sentence must roll back the first saved word/card/sentence.
  mode='broken';const broken=await core.vocabulary.create(dad,'broken',c.id,{...body,words:['book','dog']});await core.vocabulary.processOne();assert.equal((await core.vocabulary.get(dad,broken.id)).status,'failed');assert.equal((await core.words(dad,c.id)).items.length,2);
  mode='valid';await core.vocabulary.retry(dad,'fix',broken.id);await core.vocabulary.processOne();assert.equal((await core.words(dad,c.id)).items.length,4);
  // Restart recovery claims expired leases, and never changes the task's model snapshot.
  const restart=await core.vocabulary.create(dad,'restart',c.id,{...body,words:['school']});await pg.query("UPDATE wordmate.generation_jobs SET status='running',attempts=1,lease_until=$2 WHERE id=$1",[restart.id,new Date(now.getTime()-1)]);
  const recreated=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'ai-test',()=>now,provider);await recreated.vocabulary.processOne();assert.equal((await core.vocabulary.get(dad,restart.id)).status,'succeeded');assert.equal((await core.vocabulary.get(dad,restart.id)).attempts,2);
  const exhausted=await core.vocabulary.create(dad,'exhausted',c.id,{...body,words:['read']});await pg.query("UPDATE wordmate.generation_jobs SET status='running',attempts=3,lease_until=$2 WHERE id=$1",[exhausted.id,new Date(now.getTime()-1)]);const count=calls.length;await core.vocabulary.processOne();assert.equal(calls.length,count);assert.equal((await core.vocabulary.get(dad,exhausted.id)).retryable,false);
 }finally{await pg.close();}
});
test('AI network calls hold no transaction; membership revoked before completion prevents saving',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let finish!:(v:any)=>void,started!:()=>void;const entered=new Promise<void>(r=>started=r);
 const provider:VocabularyProvider={provider:'deepseek',model:'test',promptVersion:'test',generate:async()=>{started();return new Promise(r=>finish=r);}};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'test',()=>new Date(),provider);
 try{const dad=(await core.login('dev-dad')).user.id,f=await core.createFamily(dad,'f',{name:'测试'}),c=await core.createChild(dad,'c',f.id,{nickname:'孩子'}),b=await core.createWordbook(dad,'b',c.id,{name:'本'});
 const j=await core.vocabulary.create(dad,'job',c.id,{wordbook_id:b.id,words:['cat']});const work=core.vocabulary.processOne();await entered;
 await core.today(dad,c.id);await core.vocabulary.processOne();
 await pg.query("UPDATE wordmate.family_members SET status='removed' WHERE user_id=$1",[dad]);finish({items:[result('cat',0)]});await work;
 assert.equal((await pg.query('SELECT status FROM wordmate.generation_jobs WHERE id=$1',[j.id])).rows[0].status,'cancelled');assert.equal((await pg.query('SELECT count(*)::int n FROM wordmate.child_words')).rows[0].n,0);
 }finally{await pg.close();}
});

test('Chinese list separators are split before persistence; old malformed jobs cannot incur a retry',async()=>{
 const {splitVocabularyInput}=await import('../../miniapp/src/utils/vocabulary-input.ts');
 assert.deepEqual(splitVocabularyInput('airport、 luggage；delay;ice cream，book\r\ncat'),['airport','luggage','delay','ice cream','book','cat']);
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};let calls=0;
 const provider:VocabularyProvider={provider:'deepseek',model:'test',promptVersion:'test',generate:async words=>{calls++;assert.deepEqual(words,['airport','luggage','delay']);return {items:words.map(result)};}};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'split',()=>new Date(),provider);
 try{
  const dad=(await core.login('dev-dad')).user.id,f=await core.createFamily(dad,'f',{name:'测试'}),c=await core.createChild(dad,'c',f.id,{nickname:'孩子'}),b=await core.createWordbook(dad,'b',c.id,{name:'本'});
  const job=await core.vocabulary.create(dad,'job',c.id,{wordbook_id:b.id,words:['airport、luggage、delay']});assert.equal(job.items.length,3);
  await core.vocabulary.processOne();assert.equal((await core.vocabulary.get(dad,job.id)).status,'succeeded');assert.equal(calls,1);
  await assert.rejects(core.vocabulary.create(dad,'duplicates',c.id,{wordbook_id:b.id,words:['cat、Cat']}),{code:'DUPLICATE_WORDS'});
  await assert.rejects(core.vocabulary.create(dad,'overflow',c.id,{wordbook_id:b.id,words:[Array.from({length:31},(_,i)=>String(i)).join('、')]}),{code:'INVALID_WORD_COUNT'});
  const old=await core.vocabulary.create(dad,'old',c.id,{wordbook_id:b.id,words:['book']});
  await pg.query("UPDATE wordmate.batch_items SET raw_text='airport、luggage、delay' WHERE batch_id=$1",[old.batch_id]);await pg.query("UPDATE wordmate.generation_jobs SET status='failed' WHERE id=$1",[old.id]);
  await assert.rejects(core.vocabulary.retry(dad,'old-retry',old.id),{code:'INPUT_REENTRY_REQUIRED'});assert.equal(calls,1);
 }finally{await pg.close();}
});

test('raw text jobs preserve input, reject secrets before calls, enforce quotas and handle empty extraction',async()=>{
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 let captured='',calls=0,mode='ok';const raw='编号\t词汇\t意思\n1、cat 猫\n2｜dog 狗';
 const provider:VocabularyProvider={provider:'deepseek',model:'test',promptVersion:'test',rawPromptVersion:'raw-test',generate:async()=>{throw Error('not expected');},generateRaw:async input=>{calls++;captured=input;return mode==='empty'?{items:[],error:'NO_WORDS_FOUND'}:{items:['cat','dog'].map(result),error:null};}};
 const core=new Core(db,new DevIdentity(),new FixtureDictionary(),await createScheduler(),'raw-test',()=>new Date(),provider);
 try{
 const dad=(await core.login('dev-dad')).user.id,f=await core.createFamily(dad,'f',{name:'测试'}),c=await core.createChild(dad,'c',f.id,{nickname:'孩子'}),book=await core.createWordbook(dad,'b',c.id,{name:'本'});
 const create=(key:string,raw_text:string)=>core.vocabulary.create(dad,key,c.id,{wordbook_id:book.id,raw_text,source_type:'text'});
 await assert.rejects(create('secret','sk-'+ 'x'.repeat(24)),{code:'SENSITIVE_INPUT'});assert.equal(calls,0);
 await assert.rejects(create('control','cat\u0000'),{code:'INVALID_RAW_TEXT'});await assert.rejects(create('length','a'.repeat(8001)),{code:'INVALID_TEXT'});
 const job=await create('raw',raw);assert.equal(job.items.length,0);assert.equal(job.raw_text,raw);await core.vocabulary.processOne();assert.equal(captured,raw);assert.equal((await core.vocabulary.get(dad,job.id)).items.length,2);assert.equal((await core.words(dad,c.id)).items.length,2);
 mode='empty';const empty=await create('empty','只有说明文字');await core.vocabulary.processOne();const failed=await core.vocabulary.get(dad,empty.id);assert.equal(failed.error_code,'NO_WORDS_FOUND');assert.equal(failed.retryable,false);assert.equal((await core.words(dad,c.id)).items.length,2);
 // Simulate ten prior jobs with three attempts each, without external calls.
 await pg.query(`INSERT INTO wordmate.generation_jobs(child_id,requested_by,kind,dedupe_key,payload,status,attempts,max_attempts) SELECT $1,$2,'sentences','quota:'||n,'{"flow":"vocabulary_v1"}'::jsonb,'failed',3,3 FROM generate_series(1,10) n`,[c.id,dad]);
 const limited=await create('limit','apple');const before=calls;await core.vocabulary.processOne();assert.equal(calls,before);assert.equal((await core.vocabulary.get(dad,limited.id)).error_code,'AI_DAILY_LIMIT');
 }finally{await pg.close();}
});
