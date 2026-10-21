import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Sql,Row,Scheduler} from './ports.ts';
import type {QuizAccess} from './quiz.ts';
import {ensure,text,uuid} from './errors.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface VocabularyProvider {
 provider:string;model:string;promptVersion:string;rawPromptVersion?:string;
 generateRaw?(raw:string,theme:string,level:string):Promise<{items:Row[];error:string|null}>;
 generate(words:string[],theme:string,level:string):Promise<{items:Row[]}>;
}
export async function vocabularyProvider(env:Record<string,string|undefined>):Promise<VocabularyProvider|undefined>{
 const provider=env.LLM_PROVIDER||'deepseek',prefix=({deepseek:'DEEPSEEK',openai:'OPENAI',qwen:'QWEN'} as Record<string,string>)[provider];
 if(!prefix||!env[`${prefix}_API_KEY`]||!env[`${prefix}_MODEL`])return undefined;
 const base=resolve(__dirname,'../../../packages/ai/dist');
 const adapter=await import(pathToFileURL(resolve(base,'index.js')).href),vocabulary=await import(pathToFileURL(resolve(base,'vocabulary.js')).href);
 const generator=adapter.createTextGenerator(env);
 return {provider,model:env[`${prefix}_MODEL`]!,promptVersion:vocabulary.VOCABULARY_PROMPT_VERSION,rawPromptVersion:vocabulary.RAW_VOCABULARY_PROMPT_VERSION,generateRaw:async(raw,theme,level)=>(await vocabulary.generateRawVocabulary(generator,raw,theme,level)).data,generate:async(words,theme,level)=>(await vocabulary.generateVocabulary(generator,words,theme,level)).data};
}
export class Vocabulary {
 private a:QuizAccess;private scheduler:Scheduler;private provider?:VocabularyProvider;
 constructor(a:QuizAccess,scheduler:Scheduler,provider?:VocabularyProvider){this.a=a;this.scheduler=scheduler;this.provider=provider;}
 private async scope(q:Sql,actor:string,id:string){const job=await one(q,"SELECT * FROM generation_jobs WHERE id=$1 AND kind='sentences' AND payload->>'flow'='vocabulary_v1'",[uuid(id)]);ensure(job,404,'GENERATION_NOT_FOUND');const c=await this.a.child(q,actor,job.child_id);return {c,job:await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[id])};}
 private async dto(q:Sql,j:Row){return {id:j.id,input_type:j.payload.input_type??'words',raw_text:j.payload.raw_text??null,wordbook_id:j.payload.wordbook_id,theme:j.payload.theme,batch_id:j.payload.batch_id,status:j.status,attempts:j.attempts,max_attempts:j.max_attempts,error_code:j.error_code,provider:j.payload.provider,model:j.payload.model,retryable:['failed','partial'].includes(j.status)&&j.attempts<j.max_attempts&&!['NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT'].includes(j.error_code),items:(await q.query('SELECT ordinal,raw_text,status,child_word_id,candidates FROM batch_items WHERE batch_id=$1 ORDER BY ordinal',[j.payload.batch_id])).rows.map(r=>({ordinal:r.ordinal,input:r.raw_text,status:r.status,word_id:r.child_word_id,reason:r.candidates[0]?.reason??null}))};}
 async replace(actor:string,key:string,id:string,b:any){
  return this.create(actor,key,(await this.a.tx(q=>this.scope(q,actor,id))).job.child_id,b,id);
 }
 async create(actor:string,key:string,child:string,b:any,editId?:string){return this.a.write(actor,key,editId?`vocabulary:replace:${editId}`:`vocabulary:create:${child}`,b,q=>this.a.child(q,actor,child),async(q,c)=>{
  const edited=editId?(await this.scope(q,actor,editId)).job:null;
  if(edited){
   ensure(edited.status==='failed'&&edited.attempts<edited.max_attempts&&edited.attempts===b.expected_attempts,409,'GENERATION_NOT_EDITABLE');
   ensure(!await one(q,'SELECT 1 FROM batch_items WHERE batch_id=$1 AND child_word_id IS NOT NULL',[edited.payload.batch_id]),409,'GENERATION_NOT_EDITABLE');
  }
  ensure(this.provider,503,'AI_NOT_CONFIGURED');const isRaw=b.raw_text!==undefined;
  if(isRaw){ensure(b.words===undefined&&(!b.source_type||b.source_type==='text')&&this.provider.generateRaw,422,'INVALID_INPUT_TYPE');text(b.raw_text,8000);ensure(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.raw_text),422,'INVALID_RAW_TEXT');ensure(!/sk-[a-zA-Z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(b.raw_text+String(b.theme??'')),422,'SENSITIVE_INPUT');}
  else ensure(Array.isArray(b.words)&&b.words.length>0&&b.words.length<=30,422,'INVALID_WORD_COUNT');
  const words=isRaw?[]:b.words.flatMap((w:unknown)=>text(w,120).split(/[\r\n,，、;；]+/).map(x=>x.trim()).filter(Boolean)),theme=b.theme===undefined?'':String(b.theme).trim();ensure(isRaw||words.length>0&&words.length<=30,422,'INVALID_WORD_COUNT');ensure(theme.length<=80,422,'INVALID_THEME');ensure(new Set(words.map((w:string)=>w.toLowerCase())).size===words.length,422,'DUPLICATE_WORDS');
  ensure(!/sk-[a-zA-Z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test((isRaw?b.raw_text:words.join('\n'))+theme),422,'SENSITIVE_INPUT');
  ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[uuid(b.wordbook_id),child]),404,'WORDBOOK_NOT_FOUND');
  const dedupe=`vocabulary:${digest({wordbook:b.wordbook_id,...(isRaw?{raw_text:b.raw_text,input_type:'text'}:{words:words.map((w:string)=>w.toLowerCase())}),theme,level:c.level})}`;
  const existing=await one(q,"SELECT * FROM generation_jobs WHERE child_id=$1 AND kind='sentences' AND dedupe_key=$2",[child,dedupe]);if(existing&&existing.id!==editId){ensure(!editId,409,'DUPLICATE_GENERATION');return this.dto(q,existing);}
  ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE child_id=$1 AND payload->>'flow'='vocabulary_v1' AND status IN ('queued','running')",[child]),409,'ACTIVE_GENERATION');
  if(edited)await q.query('DELETE FROM batch_items WHERE batch_id=$1',[edited.payload.batch_id]);
  const batch=edited?{id:edited.payload.batch_id}:await one(q,'INSERT INTO batches(child_id,wordbook_id,theme,created_by) VALUES($1,$2,$3,$4) RETURNING id',[child,b.wordbook_id,theme,actor]);
  for(let i=0;i<words.length;i++)await q.query("INSERT INTO batch_items(batch_id,child_id,ordinal,raw_text,status) VALUES($1,$2,$3,$4,'ready')",[batch.id,child,i+1,words[i]]);
  const payload=JSON.stringify({flow:'vocabulary_v1',batch_id:batch.id,wordbook_id:b.wordbook_id,theme,level:c.level,provider:this.provider.provider,model:this.provider.model,prompt_version:this.provider.promptVersion,schema_version:isRaw?'vocabulary-raw-0.1-1':'vocabulary-0.1-1',input_type:isRaw?'text':'words',...(isRaw?{raw_text:b.raw_text,raw_prompt_version:this.provider.rawPromptVersion}: {})});
  if(edited){
   await q.query("UPDATE batches SET wordbook_id=$2,theme=$3,status='draft',version=version+1 WHERE id=$1",[batch.id,b.wordbook_id,theme]);
   return this.dto(q,await one(q,"UPDATE generation_jobs SET payload=$2,dedupe_key=$3,status='queued',error_code=NULL,lease_until=NULL,run_after=$4,updated_at=$4 WHERE id=$1 RETURNING *",[editId,payload,dedupe,this.a.now()]));
  }
  const job=await one(q,"INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload,max_attempts,run_after) VALUES($1,$2,'sentences',$3,$4,3,$5) RETURNING *",[child,actor,dedupe,payload,this.a.now()]);return this.dto(q,job);
 });}
 async get(actor:string,id:string){return this.a.tx(async q=>this.dto(q,(await this.scope(q,actor,id)).job));}
 async list(actor:string,child:string){return this.a.tx(async q=>{await this.a.child(q,actor,child);return {items:await Promise.all((await q.query("SELECT * FROM generation_jobs WHERE child_id=$1 AND payload->>'flow'='vocabulary_v1' ORDER BY created_at DESC,id DESC LIMIT 20",[child])).rows.map(j=>this.dto(q,j)))};});}
 async retry(actor:string,key:string,id:string){return this.a.write(actor,key,`vocabulary:retry:${id}`,{},q=>this.scope(q,actor,id),async(q,{job:j})=>{
  ensure(this.provider&&this.provider.provider===j.payload.provider&&this.provider.model===j.payload.model&&this.provider.promptVersion===j.payload.prompt_version,503,'AI_CONFIGURATION_CHANGED');
  ensure(!['NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT'].includes(j.error_code),422,'INPUT_REENTRY_REQUIRED');
  ensure(!await one(q,"SELECT 1 FROM batch_items WHERE batch_id=$1 AND child_word_id IS NULL AND raw_text ~ '[,，、;；\\r\\n]'",[j.payload.batch_id]),422,'INPUT_REENTRY_REQUIRED');
  ensure(['failed','partial'].includes(j.status)&&j.attempts<j.max_attempts,409,'GENERATION_NOT_RETRYABLE');
  ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE child_id=$1 AND id<>$2 AND payload->>'flow'='vocabulary_v1' AND status IN ('queued','running')",[j.child_id,id]),409,'ACTIVE_GENERATION');
  await q.query("UPDATE batch_items SET status='ready' WHERE batch_id=$1 AND child_word_id IS NULL",[j.payload.batch_id]);
  return this.dto(q,await one(q,"UPDATE generation_jobs SET status='queued',requested_by=$2,error_code=NULL,run_after=$3,lease_until=NULL,updated_at=$3 WHERE id=$1 RETURNING *",[id,actor,this.a.now()]));
 });}
 // Claim in a short transaction, perform network I/O without database locks, then commit atomically.
 async processOne(){
  const candidate=await this.a.tx(q=>one(q,"SELECT id FROM generation_jobs WHERE payload->>'flow'='vocabulary_v1' AND ((status='queued' AND run_after<=$1) OR (status='running' AND lease_until<=$1)) ORDER BY created_at LIMIT 1",[this.a.now()]));if(!candidate)return;
  let j:Row|undefined;
  try{j=await this.a.tx(async q=>{
   const first=await one(q,'SELECT * FROM generation_jobs WHERE id=$1',[candidate.id]);await this.a.child(q,first.requested_by,first.child_id);
   const job=await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[candidate.id]);
   if(!(job.status==='queued'||job.status==='running'&&new Date(job.lease_until)<=this.a.now()))return;
   if(job.attempts>=job.max_attempts){await q.query("UPDATE generation_jobs SET status='failed',error_code='GENERATION_ATTEMPTS_EXHAUSTED',lease_until=NULL WHERE id=$1",[job.id]);return;}
   ensure(this.provider&&this.provider.provider===job.payload.provider&&this.provider.model===job.payload.model&&this.provider.promptVersion===job.payload.prompt_version,503,'AI_CONFIGURATION_CHANGED');
   ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[job.payload.wordbook_id,job.child_id]),404,'WORDBOOK_NOT_FOUND');
   if(job.payload.input_type==='text')ensure(this.provider.generateRaw&&this.provider.rawPromptVersion===job.payload.raw_prompt_version,503,'AI_CONFIGURATION_CHANGED');
   await q.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[job.requested_by]);
   const usage=await one(q,`SELECT coalesce(sum(attempts) FILTER(WHERE child_id=$1),0)::int child_attempts,coalesce(sum(attempts) FILTER(WHERE requested_by=$2),0)::int actor_attempts FROM generation_jobs WHERE payload->>'flow'='vocabulary_v1' AND updated_at>=$3`,[job.child_id,job.requested_by,new Date(this.a.now().getTime()-86400000)]);
   ensure(usage.child_attempts<30&&usage.actor_attempts<60,429,'AI_DAILY_LIMIT');
   const items=(await q.query('SELECT id,ordinal,raw_text FROM batch_items WHERE batch_id=$1 AND child_word_id IS NULL ORDER BY ordinal',[job.payload.batch_id])).rows;
   const claimed=await one(q,"UPDATE generation_jobs SET status='running',attempts=attempts+1,lease_until=$2,error_code=NULL,updated_at=$3 WHERE id=$1 RETURNING *",[job.id,new Date(this.a.now().getTime()+120000),this.a.now()]);return {...claimed,items};
  });}catch(e){await this.fail(candidate.id,undefined,e);return;}
  if(!j)return;const job=j;
  try{
   const rawPass=job.payload.input_type==='text'&&job.items.length===0;
   const data=rawPass?await this.provider!.generateRaw!(job.payload.raw_text,job.payload.theme,job.payload.level):await this.provider!.generate(job.items.map((i:Row)=>i.raw_text),job.payload.theme,job.payload.level);
   const error=(data as any).error;if(error)ensure(false,422,['NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT'].includes(error)?error:'GENERATED_CONTENT_REJECTED');
   ensure(Array.isArray(data.items)&&data.items.length>0&&data.items.length<=30,422,'GENERATED_CONTENT_REJECTED');
   if(!rawPass)ensure(data.items.length===job.items.length,422,'GENERATED_CONTENT_REJECTED');

   await this.a.tx(async q=>{
    await this.a.child(q,job.requested_by,job.child_id);
    const current=await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[job.id]);
    if(current.status!=='running'||current.attempts!==job.attempts||new Date(current.lease_until)<=this.a.now())return;
    ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[job.payload.wordbook_id,job.child_id]),404,'WORDBOOK_NOT_FOUND');
    if(rawPass){
     ensure(!await one(q,'SELECT 1 FROM batch_items WHERE batch_id=$1',[job.payload.batch_id]),409,'GENERATED_CONTENT_REJECTED');
     ensure(new Set(data.items.map(r=>String(r.input).toLowerCase())).size===data.items.length,422,'GENERATED_CONTENT_REJECTED');
     job.items=[];
     for(let n=0;n<data.items.length;n++)job.items.push(await one(q,"INSERT INTO batch_items(batch_id,child_id,ordinal,raw_text,status) VALUES($1,$2,$3,$4,'ready') RETURNING id,raw_text",[job.payload.batch_id,job.child_id,n+1,text(data.items[n].input,120)]));
    }
    for(let n=0;n<data.items.length;n++){
     const r=data.items[n],item=job.items[n];ensure(r.input_index===n&&r.input===item.raw_text,422,'GENERATED_CONTENT_REJECTED');
     if(r.status==='invalid'){await q.query("UPDATE batch_items SET status='invalid',candidates=$2 WHERE id=$1",[item.id,JSON.stringify([{reason:r.reason}])]);continue;}
     ensure(r.status==='ok',422,'GENERATED_CONTENT_REJECTED');
     const sense=`ai:${digest([r.part_of_speech,r.meaning_zh.normalize('NFKC').trim()])}`;
     const word=await one(q,`INSERT INTO child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source,ipa_gb,ipa_us,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(child_id,normalized_lemma,part_of_speech,sense_key) DO UPDATE SET normalized_lemma=excluded.normalized_lemma RETURNING *`,[job.child_id,r.lemma,r.lemma.toLowerCase(),r.part_of_speech,sense,r.meaning_zh,`ai:${job.payload.provider}:${job.payload.model}`,r.ipa_gb,r.ipa_us,job.requested_by]);
     if(word.archived_at){await q.query("UPDATE batch_items SET status='invalid',candidates=$2 WHERE id=$1",[item.id,JSON.stringify([{reason:'该义项已归档，请先恢复后再添加。'}])]);continue;}
     await q.query('INSERT INTO wordbook_words(child_id,wordbook_id,child_word_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[job.child_id,job.payload.wordbook_id,word.id]);
     await q.query('INSERT INTO review_cards(child_id,child_word_id,scheduler_state,scheduler_version,parameter_version,due_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[job.child_id,word.id,JSON.stringify(this.scheduler.empty(this.a.now())),this.scheduler.version,this.scheduler.parameterVersion,this.a.now()]);
     const sentence=await one(q,"INSERT INTO sentences(child_id,batch_id,text_en,translation_zh,level,model,prompt_version,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'validated',$8) RETURNING id",[job.child_id,job.payload.batch_id,r.sentence_en,r.sentence_zh,job.payload.level,`${job.payload.provider}:${job.payload.model}`,job.payload.prompt_version,job.requested_by]);
     const escaped=r.lemma.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=new RegExp(`(^|[^a-z])(${escaped})(?=[^a-z]|$)`,'i').exec(r.sentence_en);ensure(match,422,'GENERATED_CONTENT_REJECTED');const start=match.index+match[1].length;
     await q.query('INSERT INTO sentence_targets(child_id,sentence_id,child_word_id,surface,start_utf16,end_utf16) VALUES($1,$2,$3,$4,$5,$6)',[job.child_id,sentence.id,word.id,match[2],start,start+match[2].length]);
     await q.query("UPDATE batch_items SET status='confirmed',child_word_id=$2,candidates='[]' WHERE id=$1",[item.id,word.id]);
    }
    const counts=await one(q,'SELECT count(*) FILTER(WHERE child_word_id IS NOT NULL)::int saved,count(*) FILTER(WHERE child_word_id IS NULL)::int missing FROM batch_items WHERE batch_id=$1',[job.payload.batch_id]);
    await q.query("UPDATE batches SET status='confirmed',version=version+1 WHERE id=$1",[job.payload.batch_id]);
    await q.query('UPDATE generation_jobs SET status=$2,result=$3,error_code=NULL,lease_until=NULL,updated_at=$4 WHERE id=$1',[job.id,counts.missing?'partial':'succeeded',JSON.stringify(counts),this.a.now()]);
   });
  }catch(e){await this.fail(job.id,job.attempts,e);}
 }
 private async fail(id:string,attempt:number|undefined,e:unknown){
  const code=(e as any)?.code;const allowed=['AI_DAILY_LIMIT','NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT','AI_CONFIGURATION_CHANGED','GENERATED_CONTENT_REJECTED','UPSTREAM_NETWORK_OR_TIMEOUT','UPSTREAM_HTTP_ERROR','UPSTREAM_INVALID_JSON','INVALID_GENERATED_JSON','INCOMPLETE_GENERATION','MODEL_REFUSAL'];
  const accessLost=['FAMILY_NOT_FOUND','CHILD_NOT_FOUND','WORDBOOK_NOT_FOUND'].includes(code);
  await this.a.tx(q=>q.query(`UPDATE generation_jobs SET status=$2,error_code=$3,lease_until=NULL,updated_at=$4 WHERE id=$1 AND status IN ('queued','running') AND (($5::int IS NOT NULL AND attempts=$5) OR ($5::int IS NULL AND (status='queued' OR lease_until<=$4)))`,[id,accessLost?'cancelled':'failed',accessLost?'GENERATION_SCOPE_UNAVAILABLE':allowed.includes(code)?code:'GENERATION_FAILED',this.a.now(),attempt??null]));
 }
}
