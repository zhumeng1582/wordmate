import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {fixture} from './ai-fixture.ts';
const {TutorAsr}=createRequire(import.meta.url)('../dist/tutor-asr.js');
const env={TUTOR_ASR_API_KEY:'test',TUTOR_ASR_WORKSPACE_ID:'test',TUTOR_ASR_YUAN_PER_MINUTE:'0.06'};
const audio=Buffer.from([73,68,51,4,0,0]).toString('base64');
test('ASR validates family, settles duration, replays once, and does not persist audio',async()=>{
 let calls=0;const f=await fixture();try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const session=(await f.pg.query("INSERT INTO wordmate.word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh) VALUES($1,$2,'cat','noun','猫') RETURNING id",[f.child.id,'a'.repeat(64)])).rows[0];
  const asr=new TutorAsr({tx:f.tx,child:(q:any,actor:string,id:string)=>f.core.tutorChild(q,actor,id)},env,async()=>{calls++;return Response.json({output:{text:'你好'},usage:{duration:4},request_id:'req'});});
  await assert.rejects(asr.transcribe(f.mom,session.id,randomUUID(),audio),{code:'FAMILY_NOT_FOUND'});
  const request=randomUUID();assert.deepEqual(await asr.transcribe(f.dad,session.id,request,audio),{text:'你好'});assert.deepEqual(await asr.transcribe(f.dad,session.id,request,audio),{text:'你好'});assert.equal(calls,1);
  const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,19996000);assert.equal(wallet.frozen_micros,0);
  const row=(await f.pg.query('SELECT * FROM wordmate.word_tutor_transcriptions')).rows[0];assert(!JSON.stringify(row).includes(audio));
 }finally{await f.close();}
});
test('ASR upstream failure releases reservation and does not charge',async()=>{
 const f=await fixture();try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const session=(await f.pg.query("INSERT INTO wordmate.word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh) VALUES($1,$2,'cat','noun','猫') RETURNING id",[f.child.id,'a'.repeat(64)])).rows[0];
  const asr=new TutorAsr({tx:f.tx,child:(q:any,actor:string,id:string)=>f.core.tutorChild(q,actor,id)},env,async()=>new Response('',{status:503}));
  await assert.rejects(asr.transcribe(f.dad,session.id,randomUUID(),audio),{code:'ASR_FAILED'});const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,20000000);assert.equal(wallet.frozen_micros,0);
 }finally{await f.close();}
});
