import {createHash} from 'node:crypto';
import type {QuizAccess} from './quiz.ts';
import type {AudioRuntime} from './audio-runtime.ts';
import type {Sql,Row} from './ports.ts';
import {ensure,uuid} from './errors.ts';
const SAMPLE='Hello! Let us learn something new together.';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const canonical=(v:Record<string,any>)=>JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])));
const valid=(b:Uint8Array)=>b.length>=3&&b.length<=10485760&&((b[0]===73&&b[1]===68&&b[2]===51)||(b[0]===255&&(b[1]&224)===224));
export class VoicePreviews {
 private a:QuizAccess;private runtime?:AudioRuntime;
 constructor(a:QuizAccess,runtime?:AudioRuntime){this.a=a;this.runtime=runtime;}
 private async user(q:Sql,actor:string){ensure(await one(q,"SELECT 1 FROM users WHERE id=$1 AND status='active'",[actor]),401,'ACCOUNT_UNAVAILABLE');}
 private dto(r:Row){return {job_id:r.id,status:r.status,attempts:r.attempts,retryable:r.status==='failed'&&r.attempts<3,error_code:r.error_code,sample_text:SAMPLE,resource_path:r.status==='succeeded'?`/voice-previews/${r.id}/content`:null};}
 async create(actor:string,b:any){
  const runtime=this.runtime;ensure(runtime,503,'AUDIO_NOT_CONFIGURED');
  ensure(runtime.voices.some(v=>v.id===b.voice_id&&v.accent===b.accent),422,'VOICE_ACCENT_UNAVAILABLE');
  const key=sha(JSON.stringify(['voice-preview-0.1',SAMPLE,canonical(runtime.profile),b.accent,b.voice_id,1]));
  return this.a.tx(async q=>{
   await this.user(q,actor);
   await q.query("INSERT INTO voice_previews(cache_key,profile,accent,voice_id,storage_profile) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[key,JSON.stringify(runtime.profile),b.accent,b.voice_id,runtime.storageProfile]);
   let row=await one(q,'SELECT * FROM voice_previews WHERE cache_key=$1 FOR UPDATE',[key]);
   // Another explicit tap may retry; polling never initiates synthesis. Globally capped per configured voice/profile.
   if(row.status==='failed'&&row.attempts<3)row=await one(q,"UPDATE voice_previews SET status='queued',error_code=NULL WHERE id=$1 RETURNING *",[row.id]);
   return this.dto(row);
  });
 }
 async get(actor:string,id:string){return this.a.tx(async q=>{await this.user(q,actor);const row=await one(q,'SELECT * FROM voice_previews WHERE id=$1',[uuid(id)]);ensure(row,404,'AUDIO_RESOURCE_NOT_FOUND');return this.dto(row);});}
 async content(actor:string,id:string){
  const row=await this.a.tx(async q=>{await this.user(q,actor);const r=await one(q,'SELECT * FROM voice_previews WHERE id=$1',[uuid(id)]);ensure(r,404,'AUDIO_RESOURCE_NOT_FOUND');ensure(r.status==='succeeded',409,'AUDIO_NOT_READY');return r;});
  const store=this.runtime?.stores[row.storage_profile];ensure(store,503,'AUDIO_STORAGE_PROFILE_UNAVAILABLE');
  let bytes:Uint8Array;
  try{bytes=await store.get(row.storage_key);}catch(e){
   if((e as any).code==='AUDIO_OBJECT_MISSING')await this.a.tx(q=>q.query("UPDATE voice_previews SET status='failed',error_code='AUDIO_OBJECT_MISSING' WHERE id=$1 AND status='succeeded' AND storage_key=$2",[row.id,row.storage_key]));
   ensure(false,503,'AUDIO_STORAGE_UNAVAILABLE');
  }
  if(!valid(bytes!)||sha(bytes!)!==row.sha256){
   await this.a.tx(q=>q.query("UPDATE voice_previews SET status='failed',error_code='AUDIO_INTEGRITY_FAILED' WHERE id=$1 AND status='succeeded' AND storage_key=$2",[row.id,row.storage_key]));
   ensure(false,503,'AUDIO_INTEGRITY_FAILED');
  }
  await this.a.tx(q=>this.user(q,actor));return bytes!;
 }
 async processOne(){
  const r=this.runtime;if(!r)return;
  const job=await this.a.tx(async q=>{
   const j=await one(q,"SELECT * FROM voice_previews WHERE status='queued' OR (status='running' AND lease_until<=$1) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[this.a.now()]);
   if(!j)return;
   if(j.attempts>=3){await q.query("UPDATE voice_previews SET status='failed',error_code='AUDIO_ATTEMPTS_EXHAUSTED' WHERE id=$1",[j.id]);return;}
   return one(q,"UPDATE voice_previews SET status='running',attempts=attempts+1,lease_until=$2,error_code=NULL WHERE id=$1 RETURNING *",[j.id,new Date(this.a.now().getTime()+300000)]);
  });if(!job)return;
  const owned=async(q:Sql)=>{const j=await one(q,'SELECT * FROM voice_previews WHERE id=$1 FOR UPDATE',[job.id]);ensure(j.status==='running'&&j.attempts===job.attempts&&new Date(j.lease_until)>this.a.now(),409,'AUDIO_LEASE_LOST');};
  try{
   const store=r.stores[job.storage_profile];ensure(store,503,'AUDIO_STORAGE_PROFILE_UNAVAILABLE');
   let bytes=job.pending_audio as Uint8Array|undefined;
   if(bytes)ensure(valid(bytes)&&sha(bytes)===job.sha256,503,'AUDIO_INTEGRITY_FAILED');
   if(!bytes){
    ensure(r.synthesize&&canonical(r.profile)===canonical(job.profile),503,'AUDIO_TTS_CONFIGURATION_CHANGED');
    bytes=(await r.synthesize({text:SAMPLE,accent:job.accent,voiceId:job.voice_id,rate:1})).bytes;
    ensure(valid(bytes),503,'INVALID_AUDIO_RESPONSE');
    const digest=sha(bytes);
    await this.a.tx(async q=>{await owned(q);await q.query('UPDATE voice_previews SET pending_audio=$2,sha256=$3 WHERE id=$1',[job.id,Buffer.from(bytes!),digest]);});
   }
   ensure(valid(bytes),503,'INVALID_AUDIO_RESPONSE');const digest=sha(bytes),key=`samples/${job.id}/${digest}.mp3`;
   if(!await store.stat(key))await store.put(key,bytes,'audio/mpeg');
   ensure(sha(await store.get(key))===digest,503,'AUDIO_INTEGRITY_FAILED');
   await this.a.tx(async q=>{await owned(q);await q.query("UPDATE voice_previews SET status='succeeded',storage_key=$2,sha256=$3,pending_audio=NULL,lease_until=NULL,error_code=NULL WHERE id=$1",[job.id,key,digest]);});
  }catch(e:any){
   const code=['AUDIO_STORAGE_PROFILE_UNAVAILABLE','AUDIO_TTS_CONFIGURATION_CHANGED','AUDIO_STORAGE_ACCESS_DENIED','AUDIO_STORAGE_UNAVAILABLE','INVALID_AUDIO_RESPONSE','AUDIO_INTEGRITY_FAILED'].includes(e?.code)?e.code:'AUDIO_SYNTHESIS_FAILED';
   await this.a.tx(q=>q.query("UPDATE voice_previews SET status='failed',error_code=$3,lease_until=NULL WHERE id=$1 AND attempts=$2 AND status='running'",[job.id,job.attempts,code]));
  }
 }
}
