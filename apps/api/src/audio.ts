import {VoicePreviews} from './voice-previews.ts';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {QuizAccess} from './quiz.ts';
import type {Sql,Row} from './ports.ts';
import type {AudioRuntime} from './audio-runtime.ts';
import {ensure,uuid} from './errors.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const canonical=(v:Record<string,any>)=>JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])));
const mp3=(b:Uint8Array)=>b.length>=3&&b.length<=10*1024*1024&&((b[0]===73&&b[1]===68&&b[2]===51)||(b[0]===255&&(b[1]&224)===224));
export class AudioService {
 readonly previews:VoicePreviews;
 private a:QuizAccess;private runtime?:AudioRuntime;private cleanedAt=0;
 constructor(a:QuizAccess,runtime?:AudioRuntime){this.a=a;this.runtime=runtime;this.previews=new VoicePreviews(a,runtime);}
 async voices(accent?:unknown){ensure(accent===undefined||['en-GB','en-US'].includes(String(accent)),422,'INVALID_ACCENT');return {items:(this.runtime?.voices??[]).filter(v=>accent===undefined||v.accent===accent),available:!!this.runtime?.synthesize};}
 private async source(q:Sql,actor:string,b:any){
  ensure(await one(q,"SELECT 1 FROM users WHERE id=$1 AND status='active'",[actor]),401,'ACCOUNT_UNAVAILABLE');
  ensure(Boolean(b.word_id)!==Boolean(b.sentence_id),422,'INVALID_AUDIO_RESOURCE');
  const id=uuid(b.word_id||b.sentence_id),word=!!b.word_id;
  const query=word?'SELECT * FROM child_words WHERE id=$1 AND archived_at IS NULL':"SELECT * FROM sentences WHERE id=$1 AND status='validated'";
  const initial=await one(q,query,[id]);ensure(initial,404,'AUDIO_RESOURCE_NOT_FOUND');
  await this.a.child(q,actor,initial.child_id);
  // Re-read after the scope lock: a concurrent content edit may have committed while waiting.
  const row=await one(q,query,[id]);ensure(row,404,'AUDIO_RESOURCE_NOT_FOUND');
  ensure((word?row.version:row.content_version)===b.content_version,409,'AUDIO_CONTENT_CHANGED');
  const text=word?row.lemma:row.text_en;ensure(text.length>0&&text.length<=1000,422,'INVALID_SPEECH_REQUEST');
  return {child:row.child_id,text:text.normalize('NFC').trim(),pronunciation:word?JSON.stringify([row.part_of_speech,row.sense_key,row.ipa_gb,row.ipa_us]):''};
 }
 private async scope(q:Sql,actor:string,id:string){
  const job=await one(q,"SELECT * FROM generation_jobs WHERE id=$1 AND kind='audio' AND payload->>'flow'='audio_0.1'",[uuid(id)]);ensure(job,404,'AUDIO_JOB_NOT_FOUND');
  await this.a.child(q,actor,job.child_id);const current=await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[id]);
  await this.source(q,actor,current.payload.request);return current;
 }
 private async dto(q:Sql,j:Row){const asset=await one(q,'SELECT * FROM audio_assets WHERE id=$1',[j.payload.audio_id]);return {job_id:j.id,status:j.status,attempts:j.attempts,retryable:j.status==='failed'&&j.attempts<j.max_attempts,error_code:j.error_code,poll_after_ms:2000,audio_id:asset.id,resource_path:j.status==='succeeded'?`/audio/${asset.id}/content`:null};}
 async create(actor:string,key:string,b:any){return this.a.write(actor,key,'audio:create',b,q=>this.source(q,actor,b),async(q,s)=>{
  const runtime=this.runtime;ensure(runtime,503,'AUDIO_NOT_CONFIGURED');
  ensure(['en-GB','en-US'].includes(b.accent)&&typeof b.voice_id==='string'&&Number.isFinite(b.speech_rate)&&b.speech_rate>=0.5&&b.speech_rate<=1.5,422,'INVALID_SPEECH_REQUEST');
  const profile=runtime.profile,profileKey=hash(canonical(profile));
  const cache=hash(JSON.stringify([s.child,b.word_id||b.sentence_id,b.content_version,s.text,s.pronunciation,profileKey,b.accent,b.voice_id,b.speech_rate]));
  const existing=await one(q,"SELECT * FROM generation_jobs WHERE child_id=$1 AND kind='audio' AND dedupe_key=$2",[s.child,cache]);if(existing)return this.dto(q,existing);
  ensure(runtime.synthesize,503,'AUDIO_NOT_CONFIGURED');ensure(runtime.voices.some(v=>v.id===b.voice_id&&v.accent===b.accent),422,'VOICE_ACCENT_UNAVAILABLE');
  const asset=await one(q,"INSERT INTO audio_assets(child_id,child_word_id,sentence_id,content_version,content_hash,pronunciation_key,accent,voice_id,speech_rate,provider,provider_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",[s.child,b.word_id??null,b.sentence_id??null,b.content_version,cache,s.pronunciation,b.accent,b.voice_id,b.speech_rate,profile.provider,profileKey]);
  const job=await one(q,"INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload,max_attempts,run_after) VALUES($1,$2,'audio',$3,$4,3,$5) RETURNING *",[s.child,actor,cache,JSON.stringify({flow:'audio_0.1',audio_id:asset.id,request:b,profile,storage_profile:runtime.storageProfile,text:s.text}),this.a.now()]);return this.dto(q,job);
 });}
 async get(actor:string,id:string){return this.a.tx(async q=>this.dto(q,await this.scope(q,actor,id)));}
 async retry(actor:string,key:string,id:string){return this.a.write(actor,key,`audio:retry:${id}`,{},q=>this.scope(q,actor,id),async(q,j)=>{
  ensure(j.status==='failed'&&j.attempts<j.max_attempts,409,'AUDIO_NOT_RETRYABLE');
  await q.query("UPDATE audio_assets SET status='queued',error_code=NULL WHERE id=$1",[j.payload.audio_id]);
  return this.dto(q,await one(q,"UPDATE generation_jobs SET status='queued',error_code=NULL,run_after=$2,updated_at=$2 WHERE id=$1 RETURNING *",[id,this.a.now()]));
 });}
 async content(actor:string,id:string){
  const asset=await this.a.tx(async q=>{const r=await one(q,'SELECT * FROM audio_assets WHERE id=$1',[uuid(id)]);ensure(r,404,'AUDIO_RESOURCE_NOT_FOUND');await this.source(q,actor,{word_id:r.child_word_id,sentence_id:r.sentence_id,content_version:r.content_version});ensure(r.status==='succeeded',409,'AUDIO_NOT_READY');return r;});
  const store=this.runtime?.stores[asset.storage_profile_id];ensure(store,503,'AUDIO_STORAGE_PROFILE_UNAVAILABLE');
  let bytes:Uint8Array;
  try{bytes=await store.get(asset.storage_key);}catch(e){
   if((e as any).code==='AUDIO_OBJECT_MISSING')await this.invalidate(asset);
   ensure(false,503,(e as any).code==='AUDIO_OBJECT_MISSING'?'AUDIO_OBJECT_MISSING':'AUDIO_STORAGE_UNAVAILABLE');
  }
  if(!mp3(bytes!)||hash(bytes!)!==asset.sha256){await this.invalidate(asset);ensure(false,503,'AUDIO_INTEGRITY_FAILED');}
  // Membership may change while storage I/O is in progress.
  await this.a.tx(q=>this.source(q,actor,{word_id:asset.child_word_id,sentence_id:asset.sentence_id,content_version:asset.content_version}));return bytes!;
 }
 private async invalidate(asset:Row){await this.a.tx(async q=>{
  const job=await one(q,"SELECT * FROM generation_jobs WHERE kind='audio' AND payload->>'audio_id'=$1 FOR UPDATE",[asset.id]);
  if(!job||job.status!=='succeeded')return;
  const current=await one(q,'SELECT * FROM audio_assets WHERE id=$1 FOR UPDATE',[asset.id]);
  if(current.storage_key!==asset.storage_key||current.storage_profile_id!==asset.storage_profile_id)return;
  await q.query("UPDATE audio_assets SET status='failed',error_code='AUDIO_OBJECT_MISSING' WHERE id=$1",[asset.id]);
  await q.query("UPDATE generation_jobs SET status='failed',error_code='AUDIO_OBJECT_MISSING',updated_at=$2 WHERE id=$1",[job.id,this.a.now()]);
 });}
 private spool(j:Row){return join(this.runtime!.spoolDir,`${j.id}-${j.payload.spool_attempt??j.attempts}.mp3`);}
 private async cachedSpool(j:Row){if(!j.payload.spool_sha)return null;try{const file=this.spool(j);if((await stat(file)).size>10*1024*1024)return null;const bytes=await readFile(file);return mp3(bytes)&&hash(bytes)===j.payload.spool_sha?bytes:null;}catch{return null;}}
 private async cleanup(){const r=this.runtime!;if(Date.now()-this.cleanedAt<3600000)return;this.cleanedAt=Date.now();await mkdir(r.spoolDir,{recursive:true,mode:0o700});for(const name of await readdir(r.spoolDir)){if(!/^[0-9a-f-]{36}-[1-5]\.mp3$/.test(name))continue;const path=join(r.spoolDir,name);try{if(Date.now()-(await stat(path)).mtimeMs>86400000)await unlink(path);}catch{}}}
 async processOne(){
  if(!this.runtime)return;const r=this.runtime;await this.cleanup();
  const candidate=await this.a.tx(q=>one(q,"SELECT id FROM generation_jobs WHERE kind='audio' AND payload->>'flow'='audio_0.1' AND ((status='queued' AND run_after<=$1) OR (status='running' AND lease_until<=$1)) ORDER BY created_at LIMIT 1",[this.a.now()]));if(!candidate)return;
  let job:Row|undefined;
  try{job=await this.a.tx(async q=>{
   const j=await this.scope(q,(await one(q,'SELECT requested_by FROM generation_jobs WHERE id=$1',[candidate.id])).requested_by,candidate.id);
   if(!(j.status==='queued'&&new Date(j.run_after)<=this.a.now()||j.status==='running'&&new Date(j.lease_until)<=this.a.now()))return;
   ensure(j.attempts<j.max_attempts,409,'AUDIO_ATTEMPTS_EXHAUSTED');ensure(r.stores[j.payload.storage_profile],503,'AUDIO_STORAGE_PROFILE_UNAVAILABLE');
   const claimed=await one(q,"UPDATE generation_jobs SET status='running',attempts=attempts+1,lease_until=$2,updated_at=$3,error_code=NULL WHERE id=$1 RETURNING *",[j.id,new Date(this.a.now().getTime()+180000),this.a.now()]);await q.query("UPDATE audio_assets SET status='running',error_code=NULL WHERE id=$1",[j.payload.audio_id]);return claimed;
  });}catch(e){await this.fail(candidate.id,undefined,e);return;}
  if(!job)return;const j=job;
  let renewing:Promise<any>|undefined;
  const timer=setInterval(()=>{if(renewing)return;renewing=this.a.tx(q=>q.query("UPDATE generation_jobs SET lease_until=$3 WHERE id=$1 AND attempts=$2 AND status='running' AND lease_until>$4",[j.id,j.attempts,new Date(this.a.now().getTime()+180000),this.a.now()])).catch(()=>{}).finally(()=>{renewing=undefined;});},30000);timer.unref();
  try{
   let bytes=await this.cachedSpool(j);
   if(!bytes){
    ensure(r.synthesize&&canonical(r.profile)===canonical(j.payload.profile),503,'AUDIO_TTS_CONFIGURATION_CHANGED');
    await this.a.tx(async q=>{const current=await this.scope(q,j.requested_by,j.id);this.owned(current,j);await q.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[j.requested_by]);const since=new Date(this.a.now().getTime()-86400000);const usage=await one(q,'SELECT count(*) FILTER(WHERE child_id=$1)::int child_count,count(*) FILTER(WHERE actor_id=$2)::int user_count FROM audio_usage_events WHERE created_at>=$3',[j.child_id,j.requested_by,since]);ensure(usage.child_count<r.childDaily&&usage.user_count<r.userDaily,429,'AUDIO_DAILY_LIMIT');await q.query('INSERT INTO audio_usage_events(job_id,child_id,actor_id,attempt,characters,created_at) VALUES($1,$2,$3,$4,$5,$6)',[j.id,j.child_id,j.requested_by,j.attempts,j.payload.text.length,this.a.now()]);});
    const b=j.payload.request;const result=await r.synthesize!({text:j.payload.text,accent:b.accent,voiceId:b.voice_id,rate:b.speech_rate});ensure(mp3(result.bytes),503,'INVALID_AUDIO_RESPONSE');bytes=Buffer.from(result.bytes);
    j.payload.spool_attempt=j.attempts;j.payload.spool_sha=hash(bytes);
    await writeFile(this.spool(j),bytes,{mode:0o600});
    await this.a.tx(async q=>{this.owned(await this.scope(q,j.requested_by,j.id),j);await q.query('UPDATE generation_jobs SET payload=$2 WHERE id=$1',[j.id,JSON.stringify(j.payload)]);});
   }
   const key=`private/${j.child_id}/${j.id}/${j.payload.spool_attempt}.mp3`,store=r.stores[j.payload.storage_profile];
   const existing=await store.stat(key);if(!existing)await store.put(key,bytes,'audio/mpeg');
   ensure(hash(await store.get(key))===j.payload.spool_sha,503,'AUDIO_INTEGRITY_FAILED');
   await this.a.tx(async q=>{this.owned(await this.scope(q,j.requested_by,j.id),j);await q.query("UPDATE audio_assets SET status='succeeded',storage_key=$2,storage_profile_id=$3,sha256=$4,size_bytes=$5,mime_type='audio/mpeg',error_code=NULL WHERE id=$1",[j.payload.audio_id,key,j.payload.storage_profile,j.payload.spool_sha,bytes!.length]);await q.query("UPDATE generation_jobs SET status='succeeded',result=$2,lease_until=NULL,updated_at=$3,error_code=NULL WHERE id=$1",[j.id,JSON.stringify({audio_id:j.payload.audio_id}),this.a.now()]);});
   await unlink(this.spool(j)).catch(()=>{});
  }catch(e){await this.fail(j.id,j.attempts,e);}finally{clearInterval(timer);await renewing;}
 }
 private owned(current:Row,claimed:Row){ensure(current.status==='running'&&current.attempts===claimed.attempts&&new Date(current.lease_until)>this.a.now(),409,'AUDIO_LEASE_LOST');}
 private async fail(id:string,attempt:number|undefined,e:any){
  const allowed=['ACCOUNT_UNAVAILABLE','FAMILY_NOT_FOUND','CHILD_NOT_FOUND','AUDIO_CONTENT_CHANGED','AUDIO_RESOURCE_NOT_FOUND','AUDIO_ATTEMPTS_EXHAUSTED','AUDIO_STORAGE_PROFILE_UNAVAILABLE','AUDIO_TTS_CONFIGURATION_CHANGED','AUDIO_DAILY_LIMIT','INVALID_AUDIO_RESPONSE','AUDIO_STORAGE_ACCESS_DENIED','AUDIO_STORAGE_UNAVAILABLE','AUDIO_INTEGRITY_FAILED'];
  if(e?.code==='AUDIO_LEASE_LOST')return;
  const code=allowed.includes(e?.code)?e.code:'AUDIO_SYNTHESIS_FAILED';
  await this.a.tx(async q=>{const j=await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[id]);if(!j||attempt!==undefined&&(j.attempts!==attempt||j.status!=='running')||attempt===undefined&&!(j.status==='queued'&&new Date(j.run_after)<=this.a.now()||j.status==='running'&&new Date(j.lease_until)<=this.a.now()))return;
   const cancelled=['ACCOUNT_UNAVAILABLE','FAMILY_NOT_FOUND','CHILD_NOT_FOUND','AUDIO_CONTENT_CHANGED','AUDIO_RESOURCE_NOT_FOUND'].includes(code);
   const auto=!cancelled&&e?.retryable===true&&j.attempts<j.max_attempts;
   await q.query("UPDATE generation_jobs SET status=$2,error_code=$3,lease_until=NULL,run_after=$4,updated_at=$5 WHERE id=$1",[id,cancelled?'cancelled':auto?'queued':'failed',code,new Date(this.a.now().getTime()+(j.attempts===1?5000:30000)),this.a.now()]);await q.query("UPDATE audio_assets SET status=$2,error_code=$3 WHERE id=$1",[j.payload.audio_id,auto?'queued':'failed',code]);
  });
 }
}
