import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,response} from './ai-fixture.ts';

const word={lemma:'cat',part_of_speech:'noun',meaning_zh:'猫'};
const lesson={meaning:'猫是一种常见的小动物。',usage:'看到猫时可以说 cat。',example_en:'I see a cat.',example_zh:'我看见一只猫。',exercise:'猫用英语怎么说？'};
test('tutor generation reserves and settles existing family AI wallet once',async()=>{
 const f=await fixture(async()=>response(lesson));
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));await f.pg.exec(readFileSync('apps/api/migrations/029_tutor_learning.sql','utf8'));
  const generate=await f.tx((q:any)=>f.accounts.tutor(q,f.dad,'tutor:test-success',f.family.id));
  const result=await generate(word,[]);assert.match(result.data.data.answer,/【一句话理解】\n猫是一种常见的小动物。/);
  assert.equal((await f.accounts.history(f.dad)).items[0].state,'ready');
  await f.tx((q:any)=>f.accounts.settle(q,result.id));await f.tx((q:any)=>f.accounts.settle(q,result.id));
  const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,19999890);assert.equal(wallet.frozen_micros,0);
  assert.equal((await f.accounts.history(f.dad)).entries.filter((entry:any)=>entry.kind==='charge').length,1);
 }finally{await f.close();}
});
test('tutor failure releases its reservation and messages cascade on session removal',async()=>{
 const f=await fixture(async()=>response({answer:''}));
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));await f.pg.exec(readFileSync('apps/api/migrations/029_tutor_learning.sql','utf8'));
  const generate=await f.tx((q:any)=>f.accounts.tutor(q,f.dad,'tutor:test-failure',f.family.id));
  await assert.rejects(generate(word,[]));
  const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,20000000);assert.equal(wallet.frozen_micros,0);
  const session=(await f.pg.query("INSERT INTO wordmate.word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh) VALUES($1,$2,'cat','noun','猫') RETURNING id",[f.child.id,'a'.repeat(64)])).rows[0];
  await f.pg.query("INSERT INTO wordmate.word_tutor_messages(session_id,role,content) VALUES($1,'user','你好')",[session.id]);
  await f.pg.query('DELETE FROM wordmate.word_tutor_sessions WHERE id=$1',[session.id]);
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.word_tutor_messages')).rows[0].n,0);
 }finally{await f.close();}
});

test('conversation opens by child and sense, generates once, replays and protects family scope',async()=>{
 const {randomUUID}=await import('node:crypto');let calls=0;
 const f=await fixture(async()=>{calls++;return response(calls===1?lesson:{answer:'它喜欢玩。'});});
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));await f.pg.exec(readFileSync('apps/api/migrations/029_tutor_learning.sql','utf8'));
  const add=async(lemma:string,meaning:string,sense:string)=>(await f.pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) VALUES($1,$2::text,lower($2::text),'noun',$3,$4,'test') RETURNING id",[f.child.id,lemma,sense,meaning])).rows[0].id;
  const wordId=await add('cat','猫','one'),sameId=await add('CAT','猫','two'),otherId=await add('cat','猫科动物','three');
  const first=await f.core.tutor.open(f.dad,f.child.id,wordId),same=await f.core.tutor.open(f.dad,f.child.id,sameId),other=await f.core.tutor.open(f.dad,f.child.id,otherId);
  assert.equal(first.id,same.id);assert.notEqual(first.id,other.id);
  await assert.rejects(f.core.tutor.get(f.mom,first.id),{code:'FAMILY_NOT_FOUND'});
  const request=randomUUID(),started=await f.core.tutor.answer(f.dad,first.id,request);assert.deepEqual(started.messages.map((m:any)=>m.role),['assistant']);
  await f.core.tutor.answer(f.dad,first.id,request);assert.equal(calls,1);
  const next=await f.core.tutor.answer(f.dad,first.id,randomUUID(),'它喜欢什么？');assert.deepEqual(next.messages.map((m:any)=>m.role),['assistant','user','assistant']);
  await assert.rejects(f.core.tutor.learningEvent(f.dad,first.id,randomUUID(),'exercise_completed'),{code:'TUTOR_EXERCISE_NOT_ATTEMPTED'});
  const attempt=randomUUID();await f.core.tutor.learningEvent(f.dad,first.id,attempt,'exercise_answered');await f.core.tutor.learningEvent(f.dad,first.id,attempt,'exercise_answered');
  await assert.rejects(f.core.tutor.learningEvent(f.dad,first.id,attempt,'exercise_started'),{code:'IDEMPOTENCY_CONFLICT'});
  await f.core.tutor.learningEvent(f.dad,first.id,randomUUID(),'exercise_completed');
  await f.core.tutor.learningEvent(f.dad,first.id,randomUUID(),'feedback_wrong',started.messages[0].id);
  assert.equal((await f.core.tutor.get(f.dad,first.id)).exercise_completed,true);
  await assert.rejects(f.core.tutor.learningEvent(f.mom,first.id,randomUUID(),'lesson_opened'),{code:'FAMILY_NOT_FOUND'});
  assert.equal((await f.core.tutor.list(f.dad,f.child.id)).items.length,2);await f.core.tutor.delete(f.dad,first.id);
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.word_tutor_learning_events WHERE session_id=$1',[first.id])).rows[0].n,0);
  await assert.rejects(f.core.tutor.get(f.dad,first.id),{code:'TUTOR_SESSION_NOT_FOUND'});
 }finally{await f.close();}
});
test('only an explicitly enabled supported school grade reaches the tutor',async()=>{
 const {randomUUID}=await import('node:crypto');const inputs:any[]=[];
 const f=await fixture(async(_url,init)=>{const body=JSON.parse(String(init!.body)),input=JSON.parse(body.messages[1].content);inputs.push(input);return response(input.question===null?lesson:{answer:'再试一试。'});});
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/009_child_profiles.sql','utf8'));await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));await f.pg.exec(readFileSync('apps/api/migrations/029_tutor_learning.sql','utf8'));
  await f.pg.query("UPDATE wordmate.children SET school_grade='小学三年级' WHERE id=$1",[f.child.id]);
  const w=(await f.pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) VALUES($1,'cat','cat','noun','one','猫','test') RETURNING id",[f.child.id])).rows[0];
  const session=await f.core.tutor.open(f.dad,f.child.id,w.id);await f.core.tutor.answer(f.dad,session.id,randomUUID());await f.core.tutor.answer(f.dad,session.id,randomUUID(),'Suit.',true,true);
  assert.equal(inputs[0].word.school_grade,'');assert.equal(inputs[1].word.school_grade,'小学三年级');assert.equal(inputs[1].question,'Suit.');assert.equal(inputs[1].interaction,'exercise_answer');
 }finally{await f.close();}
});
