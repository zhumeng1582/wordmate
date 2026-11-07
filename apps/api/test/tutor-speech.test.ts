import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fixture} from './ai-fixture.ts';
const {TutorSpeech}=createRequire(import.meta.url)('../dist/tutor-speech.js');
test('spoken tutor reply is private, cached, billed once, and deleted with its conversation',async()=>{
 const f=await fixture();let calls=0;try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const session=(await f.pg.query("INSERT INTO wordmate.word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh) VALUES($1,$2,'cat','noun','猫') RETURNING id",[f.child.id,'a'.repeat(64)])).rows[0];
  const message=(await f.pg.query("INSERT INTO wordmate.word_tutor_messages(session_id,role,content) VALUES($1,'assistant','猫 cat') RETURNING id",[session.id])).rows[0];
  const runtime={profile:{model:'cosyvoice-v3-flash'},voices:[{id:'voice',accent:'en-GB'}],pricePer10000Characters:'1',synthesize:async(r:any)=>{calls++;assert.deepEqual(r.languageHints,['zh','en']);return {bytes:Buffer.from('ID3audio')}}};
  const service=new TutorSpeech({tx:f.tx,child:(q:any,actor:string,id:string)=>f.core.tutorChild(q,actor,id)},runtime);
  await assert.rejects(service.create(f.mom,message.id,'en-GB','voice'),{code:'FAMILY_NOT_FOUND'});
  const first=await service.create(f.dad,message.id,'en-GB','voice'),second=await service.create(f.dad,message.id,'en-GB','voice');assert.equal(first.id,second.id);assert.equal(calls,1);assert.equal((await service.content(f.dad,first.id)).toString(),'ID3audio');
  await assert.rejects(service.content(f.mom,first.id),{code:'FAMILY_NOT_FOUND'});const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,19999400);assert.equal(wallet.frozen_micros,0);
  await f.pg.query('DELETE FROM wordmate.word_tutor_sessions WHERE id=$1',[session.id]);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.word_tutor_audio')).rows[0].n,0);
 }finally{await f.close();}
});
test('speech failure releases reservation without creating playable audio',async()=>{
 const f=await fixture();try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const session=(await f.pg.query("INSERT INTO wordmate.word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh) VALUES($1,$2,'cat','noun','猫') RETURNING id",[f.child.id,'b'.repeat(64)])).rows[0];
  const message=(await f.pg.query("INSERT INTO wordmate.word_tutor_messages(session_id,role,content) VALUES($1,'assistant','猫') RETURNING id",[session.id])).rows[0];
  const service=new TutorSpeech({tx:f.tx,child:(q:any,actor:string,id:string)=>f.core.tutorChild(q,actor,id)},{profile:{model:'cosyvoice-v3-flash'},voices:[{id:'voice',accent:'en-GB'}],pricePer10000Characters:'1',synthesize:async()=>{throw Error('unavailable');}});
  await assert.rejects(service.create(f.dad,message.id,'en-GB','voice'),{code:'TUTOR_AUDIO_FAILED'});const wallet=await f.accounts.overview(f.dad);assert.equal(wallet.balance_micros,20000000);assert.equal(wallet.frozen_micros,0);
 }finally{await f.close();}
});
test('lesson example audio speaks only the English example and uses a separate cache',async()=>{
 const f=await fixture();try{
  await f.pg.exec(readFileSync('apps/api/migrations/028_word_tutor.sql','utf8'));
  const s=(await f.pg.query("INSERT INTO wordmate.word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh) VALUES($1,$2,'cat','noun','猫') RETURNING id",[f.child.id,'c'.repeat(64)])).rows[0];
  const m=(await f.pg.query("INSERT INTO wordmate.word_tutor_messages(session_id,role,content) VALUES($1,'assistant',$2) RETURNING id",[s.id,'【一句话理解】\n猫\n\n【这样用】\n小动物\n\n【看例句】\nI see a cat.\n我看见一只猫。\n\n【你来试试】\n猫怎么说？'])).rows[0];
  const texts:string[]=[];const service=new TutorSpeech({tx:f.tx,child:(q:any,actor:string,id:string)=>f.core.tutorChild(q,actor,id)},{profile:{model:'cosyvoice-v3-flash'},voices:[{id:'voice',accent:'en-GB'}],pricePer10000Characters:'1',synthesize:async(r:any)=>{texts.push(r.text);return {bytes:Buffer.from('ID3audio')};}});
  const first=await service.create(f.dad,m.id,'en-GB','voice','example');const again=await service.create(f.dad,m.id,'en-GB','voice','example');assert.equal(first.id,again.id);assert.deepEqual(texts,['I see a cat.']);
  await service.create(f.dad,m.id,'en-GB','voice');assert.equal(texts.length,2);assert.match(texts[1],/【一句话理解】/);
 }finally{await f.close();}
});
