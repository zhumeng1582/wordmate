import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,response} from './ai-fixture.ts';

const word={lemma:'cat',part_of_speech:'noun',meaning_zh:'猫'};
test('tutor generation reserves and settles existing family AI wallet once',async()=>{
 const f=await fixture(async()=>response({answer:'猫是一种常见的小动物。'}));
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const generate=await f.tx((q:any)=>f.accounts.tutor(q,f.dad,'tutor:test-success',f.family.id));
  const result=await generate(word,[]);assert.equal(result.data.data.answer,'猫是一种常见的小动物。');
  assert.equal((await f.accounts.history(f.dad)).items[0].state,'ready');
  await f.tx((q:any)=>f.accounts.settle(q,result.id));await f.tx((q:any)=>f.accounts.settle(q,result.id));
  const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,19999890);assert.equal(wallet.frozen_micros,0);
  assert.equal((await f.accounts.history(f.dad)).entries.filter((entry:any)=>entry.kind==='charge').length,1);
 }finally{await f.close();}
});
test('tutor failure releases its reservation and messages cascade on session removal',async()=>{
 const f=await fixture(async()=>response({answer:''}));
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
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
 const f=await fixture(async()=>{calls++;return response({answer:calls===1?'猫是一种小动物。':'它喜欢玩。'});});
 try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const add=async(lemma:string,meaning:string,sense:string)=>(await f.pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) VALUES($1,$2::text,lower($2::text),'noun',$3,$4,'test') RETURNING id",[f.child.id,lemma,sense,meaning])).rows[0].id;
  const wordId=await add('cat','猫','one'),sameId=await add('CAT','猫','two'),otherId=await add('cat','猫科动物','three');
  const first=await f.core.tutor.open(f.dad,f.child.id,wordId),same=await f.core.tutor.open(f.dad,f.child.id,sameId),other=await f.core.tutor.open(f.dad,f.child.id,otherId);
  assert.equal(first.id,same.id);assert.notEqual(first.id,other.id);
  await assert.rejects(f.core.tutor.get(f.mom,first.id),{code:'FAMILY_NOT_FOUND'});
  const request=randomUUID(),started=await f.core.tutor.answer(f.dad,first.id,request);assert.deepEqual(started.messages.map((m:any)=>m.role),['assistant']);
  await f.core.tutor.answer(f.dad,first.id,request);assert.equal(calls,1);
  const next=await f.core.tutor.answer(f.dad,first.id,randomUUID(),'它喜欢什么？');assert.deepEqual(next.messages.map((m:any)=>m.role),['assistant','user','assistant']);
  assert.equal((await f.core.tutor.list(f.dad,f.child.id)).items.length,2);await f.core.tutor.delete(f.dad,first.id);
  await assert.rejects(f.core.tutor.get(f.dad,first.id),{code:'TUTOR_SESSION_NOT_FOUND'});
 }finally{await f.close();}
});
