import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {Core} from '../src/core.ts';
import {DevIdentity,FixtureDictionary,createScheduler} from '../src/providers.ts';
import type {Database} from '../src/ports.ts';
import type {AudioRuntime} from '../src/audio-runtime.ts';
const require=createRequire(import.meta.url),{PGlite}=require('@electric-sql/pglite');
async function fixture(){
 const pg=new PGlite();await pg.exec(readFileSync('deliverables/0.1/database/001_schema.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/002_audio.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/003_audio_preferences.sql','utf8'));await pg.exec(readFileSync('apps/api/migrations/004_voice_previews.sql','utf8'));
 const db:Database={query:(s,p)=>pg.query(s,p),transaction:fn=>pg.transaction((tx:any)=>fn({query:(s,p)=>tx.query(s,p)}))};
 const spoolDir=await mkdtemp(join(tmpdir(),'word-audio-'));
 const objects=new Map<string,Uint8Array>();let calls=0,uploadError=false,readError=false,gate:Promise<void>|undefined,now=new Date();
 const bytes=Buffer.from('ID3-offline-audio-test');
 const runtime:AudioRuntime={profile:{provider:'test',model:'test',revision:'1'},voices:[{id:'gb',accent:'en-GB',gender:'Female'},{id:'us',accent:'en-US',gender:'Female'}],storageProfile:'test-storage',stores:{'test-storage':{put:async(k,b)=>{if(uploadError)throw Object.assign(Error(),{code:'AUDIO_STORAGE_UNAVAILABLE',retryable:true});objects.set(k,b);},stat:async k=>objects.has(k)?{size:objects.get(k)!.length}:null,get:async k=>{if(readError)throw Object.assign(Error(),{code:'AUDIO_STORAGE_ACCESS_DENIED'});const b=objects.get(k);if(!b)throw Object.assign(Error(),{code:'AUDIO_OBJECT_MISSING'});return b;}}},synthesize:async()=>{calls++;await gate;return {bytes};},spoolDir,childDaily:20,userDaily:40};
 const scheduler=await createScheduler();
 const newCore=()=>new Core(db,new DevIdentity(),new FixtureDictionary(),scheduler,'test',()=>now,undefined,runtime),core=newCore();
 const dad=(await core.login('dev-dad')).user.id,mom=(await core.login('dev-mom')).user.id;
 const family=await core.createFamily(dad,'family',{name:'测试'}),child=await core.createChild(dad,'child',family.id,{nickname:'孩子'}),book=await core.createWordbook(dad,'book',child.id,{name:'词本'});
 const batch=await core.createBatch(dad,'batch',child.id,{wordbook_id:book.id,words:['apple','book']});
 await core.confirmBatch(dad,'confirm',batch.id,{expected_version:1,selections:batch.items.map((i:any)=>({item_id:i.id,action:'select',candidate_id:i.candidates[0].candidate_id}))});
 const words=(await core.words(dad,child.id)).items,request={word_id:words[0].id,content_version:1,accent:'en-GB',voice_id:'gb',speech_rate:1};
 return {pg,core,newCore,runtime,objects,bytes,dad,mom,child,words,request,calls:()=>calls,uploadFail:(v:boolean)=>uploadError=v,readFail:(v:boolean)=>readError=v,gate:(v:Promise<void>)=>gate=v,advance:(ms:number)=>now=new Date(now.getTime()+ms),close:async()=>{await pg.close();await rm(spoolDir,{recursive:true,force:true});}};
}
test('audio: cache survives service restart, accents separate, access and versions enforced',async()=>{
 const f=await fixture();try{
  const j=await f.core.audio.create(f.dad,'a',f.request);
  assert.equal((await f.core.audio.create(f.dad,'b',f.request)).job_id,j.job_id);
  await assert.rejects(f.core.audio.create(f.mom,'x',f.request),{code:'FAMILY_NOT_FOUND'});
  await f.core.audio.processOne();assert.equal((await f.core.audio.get(f.dad,j.job_id)).status,'succeeded');
  assert.deepEqual(await f.core.audio.content(f.dad,j.audio_id),f.bytes);
  assert.equal((await f.newCore().audio.create(f.dad,'c',f.request)).status,'succeeded');assert.equal(f.calls(),1);
  await assert.rejects(f.core.audio.get(f.mom,j.job_id),{code:'FAMILY_NOT_FOUND'});
  await assert.rejects(f.core.audio.content(f.mom,j.audio_id),{code:'FAMILY_NOT_FOUND'});
  const us=await f.core.audio.create(f.dad,'us',{...f.request,accent:'en-US',voice_id:'us'});assert.notEqual(us.audio_id,j.audio_id);await f.core.audio.processOne();assert.equal(f.calls(),2);
  f.runtime.synthesize=undefined;assert.deepEqual(await f.newCore().audio.content(f.dad,j.audio_id),f.bytes);
  await f.pg.query('UPDATE wordmate.child_words SET version=version+1 WHERE id=$1',[f.request.word_id]);
  await assert.rejects(f.core.audio.content(f.dad,j.audio_id),{code:'AUDIO_CONTENT_CHANGED'});
 }finally{await f.close();}
});
test('audio: concurrent workers claim once and failed upload reuses private spool without new TTS',async()=>{
 const f=await fixture();try{
  let unblock!:()=>void;f.gate(new Promise(resolve=>{unblock=resolve;}));
  const job=await f.core.audio.create(f.dad,'a',f.request);f.uploadFail(true);
  const work=f.core.audio.processOne();
  for(let n=0;n<100&&f.calls()===0;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.calls(),1);await f.newCore().audio.processOne();assert.equal(f.calls(),1);
  unblock();await work;assert.equal((await f.core.audio.get(f.dad,job.job_id)).status,'queued');
  f.uploadFail(false);f.advance(6000);await f.newCore().audio.processOne();
  assert.equal((await f.core.audio.get(f.dad,job.job_id)).status,'succeeded');assert.equal(f.calls(),1);
  assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.audio_usage_events')).rows[0].n,1);
 }finally{await f.close();}
});
test('audio: quota stops synthesis; forbidden storage access does not regenerate; missing object can retry',async()=>{
 const f=await fixture();try{
  const job=await f.core.audio.create(f.dad,'a',f.request);await f.core.audio.processOne();
  f.readFail(true);await assert.rejects(f.core.audio.content(f.dad,job.audio_id),{code:'AUDIO_STORAGE_UNAVAILABLE'});
  assert.equal((await f.core.audio.get(f.dad,job.job_id)).status,'succeeded');assert.equal(f.calls(),1);
  f.readFail(false);f.objects.clear();await assert.rejects(f.core.audio.content(f.dad,job.audio_id),{code:'AUDIO_OBJECT_MISSING'});
  assert.equal((await f.core.audio.get(f.dad,job.job_id)).status,'failed');
  await f.core.audio.retry(f.dad,'retry',job.job_id);await f.core.audio.processOne();assert.equal(f.calls(),2);
  assert.equal((await f.core.audio.get(f.dad,job.job_id)).status,'succeeded');
  f.runtime.childDaily=2;const next=await f.core.audio.create(f.dad,'next',{...f.request,word_id:f.words[1].id});await f.core.audio.processOne();
  assert.equal((await f.core.audio.get(f.dad,next.job_id)).error_code,'AUDIO_DAILY_LIMIT');assert.equal(f.calls(),2);
 }finally{await f.close();}
});
test('audio: revoked membership during synthesis cannot commit; changed sentence cannot generate',async()=>{
 const f=await fixture();try{
  let release!:()=>void;f.gate(new Promise(r=>{release=r;}));
  const job=await f.core.audio.create(f.dad,'a',f.request),work=f.core.audio.processOne();
  for(let n=0;n<100&&f.calls()===0;n++)await new Promise(r=>setTimeout(r,5));
  await f.pg.query("UPDATE wordmate.family_members SET status='removed' WHERE user_id=$1",[f.dad]);release();await work;
  const stored=(await f.pg.query('SELECT status FROM wordmate.generation_jobs WHERE id=$1',[job.job_id])).rows[0];assert.equal(stored.status,'cancelled');assert.equal(f.objects.size,0);
  await assert.rejects(f.core.audio.create(f.dad,'a',f.request),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});
test('audio: sentence content and resource versions are bound to server data',async()=>{
 const f=await fixture();try{
  const sentence=(await f.pg.query("INSERT INTO wordmate.sentences(child_id,text_en,translation_zh,level,model,prompt_version,status,created_by) VALUES($1,'I eat an apple.','我吃一个苹果。','A1','test','test','validated',$2) RETURNING id",[f.child.id,f.dad])).rows[0];
  const {word_id,...rest}=f.request,body={...rest,sentence_id:sentence.id};
  const job=await f.core.audio.create(f.dad,'sentence',body);await f.core.audio.processOne();assert.equal((await f.core.audio.get(f.dad,job.job_id)).status,'succeeded');
  await f.pg.query('UPDATE wordmate.sentences SET content_version=2 WHERE id=$1',[sentence.id]);
  await assert.rejects(f.core.audio.content(f.dad,job.audio_id),{code:'AUDIO_CONTENT_CHANGED'});
  const next=await f.core.audio.create(f.dad,'sentence2',{...body,content_version:2});assert.notEqual(next.job_id,job.job_id);
  await f.pg.query("UPDATE wordmate.sentences SET status='archived' WHERE id=$1",[sentence.id]);await f.core.audio.processOne();
  assert.equal((await f.pg.query('SELECT status FROM wordmate.generation_jobs WHERE id=$1',[next.job_id])).rows[0].status,'cancelled');assert.equal(f.calls(),1);
 }finally{await f.close();}
});
test('audio: expired worker cannot overwrite a newer successful attempt',async()=>{
 const f=await fixture();try{
  let release!:()=>void;f.gate(new Promise(r=>{release=r;}));
  const job=await f.core.audio.create(f.dad,'a',f.request),old=f.core.audio.processOne();
  for(let n=0;n<100&&f.calls()===0;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.calls(),1);f.advance(181000);f.gate(Promise.resolve());
  await f.newCore().audio.processOne();const ready=await f.core.audio.get(f.dad,job.job_id);assert.equal(ready.status,'succeeded');assert.equal(ready.attempts,2);
  release();await old;
  assert.deepEqual(await f.core.audio.get(f.dad,job.job_id),ready);assert.equal(f.objects.size,1);
 }finally{await f.close();}
});
test('audio: switching storage preserves old reads and checks membership again after storage I/O',async()=>{
 const f=await fixture();try{
  const job=await f.core.audio.create(f.dad,'a',f.request);await f.core.audio.processOne();
  const nextObjects=new Map<string,Uint8Array>();
  f.runtime.stores.next={put:async(k,b)=>{nextObjects.set(k,b);},get:async k=>nextObjects.get(k)!,stat:async k=>nextObjects.has(k)?{size:nextObjects.get(k)!.length}:null};
  f.runtime.storageProfile='next';
  assert.deepEqual(await f.newCore().audio.content(f.dad,job.audio_id),f.bytes);
  const us=await f.newCore().audio.create(f.dad,'us',{...f.request,accent:'en-US',voice_id:'us'});await f.core.audio.processOne();
  assert.equal((await f.core.audio.get(f.dad,us.job_id)).status,'succeeded');assert.equal(nextObjects.size,1);assert.equal(f.objects.size,1);
  const original=f.runtime.stores['test-storage'].get;
  f.runtime.stores['test-storage'].get=async k=>{const bytes=await original(k);await f.pg.query("UPDATE wordmate.family_members SET status='removed' WHERE user_id=$1",[f.dad]);return bytes;};
  await assert.rejects(f.core.audio.content(f.dad,job.audio_id),{code:'FAMILY_NOT_FOUND'});
 }finally{await f.close();}
});

test('account audio settings sync across sessions, isolate parents and reject conflicting writes',async()=>{
 const f=await fixture();try{
  const original=await f.core.audioSettings(f.dad);assert.equal(original.accent,'en-GB');
  const saved=await f.core.saveAudioSettings(f.dad,'settings',{accent:'en-US',voice_id:'us',expected_version:original.version});
  assert.deepEqual(await f.newCore().audioSettings(f.dad),saved);
  assert.equal((await f.newCore().audioSettings(f.mom)).accent,'en-GB');
  assert.deepEqual(await f.core.saveAudioSettings(f.dad,'settings',{accent:'en-US',voice_id:'us',expected_version:original.version}),saved);
  await assert.rejects(f.core.saveAudioSettings(f.dad,'stale',{accent:'en-GB',voice_id:'gb',expected_version:original.version}),{code:'AUDIO_SETTINGS_CHANGED'});
  await assert.rejects(f.core.saveAudioSettings(f.dad,'wrong-voice',{accent:'en-US',voice_id:'gb',expected_version:saved.version}),{code:'VOICE_ACCENT_UNAVAILABLE'});
 }finally{await f.close();}
});

test('voice preview uses unsaved choices, caches a fixed sample, and retries upload without another synthesis',async()=>{
 const f=await fixture();try{
  const original=await f.core.audioSettings(f.dad);
  const preview=await f.core.audio.previews.create(f.dad,{accent:'en-US',voice_id:'us'});
  assert.equal((await f.core.audio.previews.create(f.mom,{accent:'en-US',voice_id:'us'})).job_id,preview.job_id);
  f.uploadFail(true);await f.core.audio.previews.processOne();
  assert.equal((await f.core.audio.previews.get(f.dad,preview.job_id)).status,'failed');assert.equal(f.calls(),1);
  f.uploadFail(false);await f.core.audio.previews.create(f.dad,{accent:'en-US',voice_id:'us'});await f.newCore().audio.previews.processOne();
  assert.equal((await f.core.audio.previews.get(f.dad,preview.job_id)).status,'succeeded');assert.equal(f.calls(),1);
  assert.deepEqual(Buffer.from(await f.core.audio.previews.content(f.mom,preview.job_id)),f.bytes);
  assert.equal((await f.newCore().audio.previews.create(f.dad,{accent:'en-US',voice_id:'us'})).status,'succeeded');
  assert.deepEqual(await f.core.audioSettings(f.dad),original);
  await assert.rejects(f.core.audio.previews.create(f.dad,{accent:'en-GB',voice_id:'us'}),{code:'VOICE_ACCENT_UNAVAILABLE'});
  const gb=await f.core.audio.previews.create(f.dad,{accent:'en-GB',voice_id:'gb'});assert.notEqual(gb.job_id,preview.job_id);
 }finally{await f.close();}
});

test('voice preview serializes concurrent workers and caps repeated failures',async()=>{
 const f=await fixture();try{
  let release!:()=>void;f.gate(new Promise(r=>{release=r;}));
  const preview=await f.core.audio.previews.create(f.dad,{accent:'en-GB',voice_id:'gb'});
  f.uploadFail(true);const work=f.core.audio.previews.processOne();
  for(let n=0;n<100&&f.calls()===0;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.calls(),1);await f.newCore().audio.previews.processOne();assert.equal(f.calls(),1);
  release();await work;
  for(let i=0;i<2;i++){await f.core.audio.previews.create(f.mom,{accent:'en-GB',voice_id:'gb'});await f.core.audio.previews.processOne();}
  const exhausted=await f.core.audio.previews.create(f.dad,{accent:'en-GB',voice_id:'gb'});
  assert.equal(exhausted.attempts,3);assert.equal(exhausted.status,'failed');assert.equal(exhausted.retryable,false);assert.equal(f.calls(),1);
  await assert.rejects(f.core.audio.previews.get('00000000-0000-4000-8000-000000000000',preview.job_id),{code:'ACCOUNT_UNAVAILABLE'});
 }finally{await f.close();}
});
