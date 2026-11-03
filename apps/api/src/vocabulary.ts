import type {AiAccounts,AiSelection} from './ai-accounts.ts';
import {usageBudget,recordUsage} from './usage-budget.ts';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Sql,Row,Scheduler} from './ports.ts';
import type {QuizAccess} from './quiz.ts';
import {ensure,text,uuid} from './errors.ts';
import {MAX_IMPORT_WORDS,MAX_IMPORT_TEXT,VOCABULARY_IMPORT_PLAN_VERSION,vocabularyImportChunks} from './vocabulary-import.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const VOCABULARY_VALIDATION_REVISION='2026-10-31-noun-plurals';
const terminalInputErrors=['NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT'];
const validationRecovery=(job:Row)=>job.status==='failed'&&job.error_code==='GENERATED_CONTENT_REJECTED'&&job.attempts>=job.max_attempts&&job.max_attempts<5&&job.payload.validation_revision!==VOCABULARY_VALIDATION_REVISION;
const retryable=(job:Row)=>!terminalInputErrors.includes(job.error_code)&&(job.attempts<job.max_attempts||validationRecovery(job));
export interface VocabularyProvider {
 provider:string;model:string;promptVersion:string;rawPromptVersion?:string;selection?:AiSelection;
 generateRaw?(raw:string,theme:string,level:string):Promise<{items:Row[];error:string|null;billing_id?:string}>;
 generate(words:string[],theme:string,level:string):Promise<{items:Row[];billing_id?:string}>;
 validate?(words:string[],items:unknown,theme:string,level:string):{items:Row[]};
 locateTarget?(sentence:string,lemma:string,partOfSpeech:string):{surface:string;start:number;end:number}|null;
}
export async function vocabularyProvider(env:Record<string,string|undefined>,fetcher:typeof fetch=fetch):Promise<VocabularyProvider|undefined>{
 const provider=env.LLM_PROVIDER||'qwen',prefix=({deepseek:'DEEPSEEK',openai:'OPENAI',qwen:'QWEN'} as Record<string,string>)[provider];
 const apiKey=provider==='qwen'?(env.QWEN_API_KEY||env.OCR_API_KEY):(prefix?env[`${prefix}_API_KEY`]:undefined),model=provider==='qwen'?(env.QWEN_MODEL||env.OCR_MODEL):(prefix?env[`${prefix}_MODEL`]:undefined);
 if(!prefix||!apiKey||!model)return undefined;
 const base=resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist');
 const adapter=await import(pathToFileURL(resolve(base,'index.js')).href),vocabulary=await import(pathToFileURL(resolve(base,'vocabulary.js')).href);
 const generator=adapter.createTextGenerator(env,fetcher);
 return {provider,model:env[`${prefix}_MODEL`]!,promptVersion:vocabulary.VOCABULARY_PROMPT_VERSION,rawPromptVersion:vocabulary.RAW_VOCABULARY_PROMPT_VERSION,generateRaw:async(raw,theme,level)=>(await vocabulary.generateRawVocabulary(generator,raw,theme,level)).data,generate:async(words,theme,level)=>(await vocabulary.generateVocabulary(generator,words,theme,level)).data,validate:(words,items,theme,level)=>vocabulary.validateVocabularyItems(words,items,theme,level),locateTarget:vocabulary.locateVocabularyTarget};
}
export class Vocabulary {
 private a:QuizAccess;private scheduler:Scheduler;private provider?:VocabularyProvider;private accounts?:AiAccounts;
 constructor(a:QuizAccess,scheduler:Scheduler,provider?:VocabularyProvider,accounts?:AiAccounts){this.a=a;this.scheduler=scheduler;this.provider=provider;this.accounts=accounts;}
 private async scope(q:Sql,actor:string,id:string){const job=await one(q,"SELECT * FROM generation_jobs WHERE id=$1 AND kind='sentences' AND payload->>'flow' IN ('vocabulary_v1','vocabulary_bulk_v1')",[uuid(id)]);ensure(job,404,'GENERATION_NOT_FOUND');const c=await this.a.child(q,actor,job.child_id);return {c,job:await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[id])};}
 private async dto(q:Sql,j:Row):Promise<Row>{if(j.payload.flow==='vocabulary_bulk_v1')return this.bulkDto(q,j);return {id:j.id,input_type:j.payload.input_type??'words',raw_text:j.payload.raw_text??null,wordbook_id:j.payload.wordbook_id,theme:j.payload.theme,batch_id:j.payload.batch_id,status:j.status,attempts:j.attempts,max_attempts:j.max_attempts,error_code:j.error_code,provider_error:j.result?.provider_error??null,validation_error:j.result?.validation_error??null,provider:j.payload.provider,model:j.payload.model,retryable:['failed','partial'].includes(j.status)&&retryable(j),items:(await q.query('SELECT ordinal,raw_text,status,child_word_id,candidates FROM batch_items WHERE batch_id=$1 ORDER BY ordinal',[j.payload.batch_id])).rows.map(r=>({ordinal:r.ordinal,input:r.raw_text,status:r.status,word_id:r.child_word_id,reason:r.candidates[0]?.reason??null}))};}
 private async bulkDto(q:Sql,j:Row):Promise<Row>{
  const jobs=(await q.query("SELECT * FROM generation_jobs WHERE payload->>'bulk_parent_id'=$1 ORDER BY (payload->>'bulk_index')::int",[j.id])).rows;
  const counts=await one(q,"SELECT count(*)::int total,count(*) FILTER(WHERE i.child_word_id IS NOT NULL)::int saved,count(*) FILTER(WHERE i.status='invalid')::int invalid FROM batch_items i JOIN generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE g.payload->>'bulk_parent_id'=$1",[j.id]);
  const items=(await q.query("SELECT i.*,((g.payload->>'bulk_index')::int*30+i.ordinal) global_ordinal FROM batch_items i JOIN generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE g.payload->>'bulk_parent_id'=$1 ORDER BY (i.child_word_id IS NULL) DESC,(g.payload->>'bulk_index')::int,i.ordinal LIMIT 60",[j.id])).rows;
  const active=jobs.some(job=>['queued','running'].includes(job.status)),failures=jobs.filter(job=>['failed','partial'].includes(job.status)),error=failures.find(job=>job.error_code&&job.error_code!=='BULK_PAUSED');
  const status=active?'running':jobs.every(job=>job.status==='succeeded')?'succeeded':counts.saved?'partial':jobs.every(job=>job.status==='cancelled')?'cancelled':'failed';
  return {id:j.id,is_bulk:true,input_type:j.payload.input_type,raw_text:j.payload.raw_text?.slice(0,1000)??null,wordbook_id:j.payload.wordbook_id,theme:j.payload.theme,batch_id:j.payload.batch_id,status,attempts:Math.max(0,...jobs.map(job=>job.attempts)),max_attempts:Math.max(3,...jobs.map(job=>job.max_attempts)),error_code:error?.error_code??null,provider_error:error?.result?.provider_error??null,validation_error:error?.result?.validation_error??null,provider:j.payload.provider,model:j.payload.model,retryable:!active&&failures.some(retryable),total_count:counts.total,saved_count:counts.saved,invalid_count:counts.invalid,bulk:{total_parts:jobs.length,completed_parts:jobs.filter(job=>job.status==='succeeded').length,failed_parts:failures.length},items:items.map(item=>({ordinal:item.global_ordinal,input:item.raw_text,status:item.status,word_id:item.child_word_id,reason:item.candidates[0]?.reason??null}))};
 }
 private async syncBulk(q:Sql,id:string){
  const parent=await one(q,'SELECT * FROM generation_jobs WHERE id=$1',[id]);if(!parent)return;
  const data=await this.bulkDto(q,parent);
  await q.query('UPDATE generation_jobs SET status=$2,error_code=$3,result=$4,updated_at=$5 WHERE id=$1',[id,data.status,data.error_code,JSON.stringify({saved:data.saved_count,total:data.total_count,...data.bulk,provider_error:data.provider_error,validation_error:data.validation_error}),this.a.now()]);
 }
 private async createBulk(q:Sql,actor:string,child:string,b:Row,batch:string,provider:VocabularyProvider,theme:string,level:string,words:string[],rawChunks:string[],prepared:Row[]|undefined,dedupe:string,edited:Row|null){
  const common={...(provider.selection?{ai_selection:provider.selection}:{}),validation_revision:VOCABULARY_VALIDATION_REVISION,wordbook_id:b.wordbook_id,theme,level,provider:provider.provider,model:provider.model,prompt_version:provider.promptVersion,input_type:rawChunks.length?'text':prepared?'prepared':'words',raw_prompt_version:provider.rawPromptVersion};
  const payload={...common,flow:'vocabulary_bulk_v1',import_plan_version:VOCABULARY_IMPORT_PLAN_VERSION,batch_id:batch,raw_text:b.raw_text??words.join('\n')};
  let parent:Row;
  if(edited)parent=await one(q,"UPDATE generation_jobs SET payload=$2,dedupe_key=$3,status='queued',attempts=0,error_code=NULL,lease_until=NULL,run_after=$4,updated_at=$4,requested_by=$5 WHERE id=$1 RETURNING *",[edited.id,JSON.stringify(payload),dedupe,this.a.now(),actor]);
  else parent=await one(q,"INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload,max_attempts,run_after) VALUES($1,$2,'sentences',$3,$4,3,$5) RETURNING *",[child,actor,dedupe,JSON.stringify(payload),this.a.now()]);
  const parts=rawChunks.length||Math.ceil(words.length/30);
  for(let index=0;index<parts;index++){
   const target=await one(q,'INSERT INTO batches(child_id,wordbook_id,theme,created_by) VALUES($1,$2,$3,$4) RETURNING id',[child,b.wordbook_id,theme,actor]);
   const inputs=words.slice(index*30,index*30+30);
   if(inputs.length)await q.query("INSERT INTO batch_items(batch_id,child_id,ordinal,raw_text,status) SELECT $1,$2,n::int,value,'ready' FROM unnest($3::text[]) WITH ORDINALITY AS t(value,n)",[target.id,child,inputs]);
   const part={...common,flow:'vocabulary_v1',bulk_parent_id:parent.id,bulk_index:index,batch_id:target.id,schema_version:rawChunks.length?'vocabulary-raw-0.1-1':'vocabulary-0.1-1',...(rawChunks.length?{raw_text:rawChunks[index]}:prepared?{raw_text:inputs.join('\n'),prepared_items:prepared.slice(index*30,index*30+30).map((item,input_index)=>({...item,input_index}))}:{})};
   await q.query("INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload,max_attempts,run_after) VALUES($1,$2,'sentences',$3,$4,3,$5)",[child,actor,`vocabulary:bulk:${parent.id}:${index}`,JSON.stringify(part),this.a.now()]);
  }
  return this.bulkDto(q,parent);
 }
 async replace(actor:string,key:string,id:string,b:any){
  return this.create(actor,key,(await this.a.tx(q=>this.scope(q,actor,id))).job.child_id,b,id);
 }
 async create(actor:string,key:string,child:string,b:any,editId?:string){return this.a.write(actor,key,editId?`vocabulary:replace:${editId}`:`vocabulary:create:${child}`,b,q=>this.a.child(q,actor,child),async(q,c)=>{
  const edited=editId?(await this.scope(q,actor,editId)).job:null;
  if(edited){
   ensure(edited.payload.flow!=='vocabulary_bulk_v1',409,'GENERATION_NOT_EDITABLE');
   ensure(edited.status==='failed'&&edited.attempts<edited.max_attempts&&edited.attempts===b.expected_attempts,409,'GENERATION_NOT_EDITABLE');
   ensure(!await one(q,'SELECT 1 FROM batch_items WHERE batch_id=$1 AND child_word_id IS NOT NULL',[edited.payload.batch_id]),409,'GENERATION_NOT_EDITABLE');
  }
  const isPrepared=b.prepared_items!==undefined,isRaw=b.raw_text!==undefined&&!isPrepared;const provider=this.accounts?await this.accounts.vocabulary(q,actor,undefined,undefined,c.family_id,isPrepared):this.provider;ensure(provider,503,'AI_NOT_CONFIGURED');
  if(isPrepared){ensure(b.words===undefined&&b.source_type==='vision'&&provider!.validate,422,'INVALID_INPUT_TYPE');text(b.raw_text,MAX_IMPORT_TEXT);ensure(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.raw_text),422,'INVALID_RAW_TEXT');ensure(!/sk-[a-zA-Z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(b.raw_text+String(b.theme??'')),422,'SENSITIVE_INPUT');ensure(Array.isArray(b.prepared_items)&&b.prepared_items.length>0&&b.prepared_items.length<=MAX_IMPORT_WORDS,422,'INVALID_WORD_COUNT');}
  else if(isRaw){ensure(b.words===undefined&&(!b.source_type||b.source_type==='text')&&provider!.generateRaw,422,'INVALID_INPUT_TYPE');text(b.raw_text,MAX_IMPORT_TEXT);ensure(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.raw_text),422,'INVALID_RAW_TEXT');ensure(!/sk-[a-zA-Z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(b.raw_text+String(b.theme??'')),422,'SENSITIVE_INPUT');}
  else ensure(Array.isArray(b.words)&&b.words.length>0&&b.words.length<=MAX_IMPORT_WORDS,422,'INVALID_WORD_COUNT');
  const theme=b.theme===undefined?'':String(b.theme).trim();let words=isPrepared?b.prepared_items.map((i:Row)=>text(i?.input,120)):isRaw?[]:b.words.flatMap((w:unknown)=>text(w,120).split(/[\r\n,，、;；]+/).map(x=>x.trim()).filter(Boolean));ensure(isRaw||words.length>0&&words.length<=MAX_IMPORT_WORDS,422,'INVALID_WORD_COUNT');ensure(theme.length<=80,422,'INVALID_THEME');ensure(new Set(words.map((w:string)=>w.toLowerCase())).size===words.length,422,'DUPLICATE_WORDS');
  let preparedItems:Row[]|undefined; if(isPrepared){try{preparedItems=[];for(let offset=0;offset<words.length;offset+=30){const source=b.prepared_items.slice(offset,offset+30);ensure(source.every((item:Row,index:number)=>item.input_index===offset+index),422,'GENERATED_CONTENT_REJECTED');preparedItems.push(...provider!.validate!(words.slice(offset,offset+30),source.map((item:Row,input_index:number)=>({...item,input_index})),theme,c.level).items.map((item:Row)=>({...item,input_index:item.input_index+offset})));}}catch{ensure(false,422,'GENERATED_CONTENT_REJECTED');}const source=String(b.raw_text).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');for(const item of preparedItems!)ensure(source.includes(String(item.input).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ')),422,'GENERATED_CONTENT_REJECTED');}
  ensure(!/sk-[a-zA-Z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test((isRaw?b.raw_text:words.join('\n'))+theme),422,'SENSITIVE_INPUT');
  ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL AND read_only=false',[uuid(b.wordbook_id),child]),404,'WORDBOOK_NOT_FOUND');
  const dedupe=`vocabulary:${digest({wordbook:b.wordbook_id,...(isRaw?{raw_text:b.raw_text,input_type:'text'}:isPrepared?{raw_text:b.raw_text,prepared_items:preparedItems,input_type:'vision'}:{words:words.map((w:string)=>w.toLowerCase())}),theme,level:c.level})}`;
  const existing=await one(q,"SELECT * FROM generation_jobs WHERE child_id=$1 AND kind='sentences' AND dedupe_key=$2",[child,dedupe]);if(existing&&existing.id!==editId){ensure(!editId,409,'DUPLICATE_GENERATION');return this.dto(q,existing);}
  ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE child_id=$1 AND payload->>'flow'='vocabulary_v1' AND status IN ('queued','running')",[child]),409,'ACTIVE_GENERATION');
  if(edited)await q.query('DELETE FROM batch_items WHERE batch_id=$1',[edited.payload.batch_id]);
  let rawChunks:string[]=[];if(isRaw){try{rawChunks=vocabularyImportChunks(b.raw_text);}catch(e){ensure(false,422,(e as Error).message);}}
  const batch=edited?{id:edited.payload.batch_id}:await one(q,'INSERT INTO batches(child_id,wordbook_id,theme,created_by) VALUES($1,$2,$3,$4) RETURNING id',[child,b.wordbook_id,theme,actor]);
  if(rawChunks.length>1||words.length>30)return this.createBulk(q,actor,child,b,batch.id,provider!,theme,c.level,words,rawChunks,preparedItems,dedupe,edited);
  for(let i=0;i<words.length;i++)await q.query("INSERT INTO batch_items(batch_id,child_id,ordinal,raw_text,status) VALUES($1,$2,$3,$4,'ready')",[batch.id,child,i+1,words[i]]);
  const payload=JSON.stringify({...(provider!.selection?{ai_selection:provider!.selection}:{}),validation_revision:VOCABULARY_VALIDATION_REVISION,flow:'vocabulary_v1',batch_id:batch.id,wordbook_id:b.wordbook_id,theme,level:c.level,provider:provider!.provider,model:provider!.model,prompt_version:provider!.promptVersion,schema_version:isRaw?'vocabulary-raw-0.1-1':'vocabulary-0.1-1',input_type:isRaw?'text':isPrepared?'prepared':'words',...(isRaw?{raw_text:b.raw_text,raw_prompt_version:provider!.rawPromptVersion}:isPrepared?{raw_text:b.raw_text,prepared_items:preparedItems}: {})});
  if(edited){
   await q.query("UPDATE batches SET wordbook_id=$2,theme=$3,status='draft',version=version+1 WHERE id=$1",[batch.id,b.wordbook_id,theme]);
   return this.dto(q,await one(q,"UPDATE generation_jobs SET payload=$2,dedupe_key=$3,status='queued',error_code=NULL,lease_until=NULL,run_after=$4,updated_at=$4,requested_by=$5 WHERE id=$1 RETURNING *",[editId,payload,dedupe,this.a.now(),actor]));
  }
  const job=await one(q,"INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload,max_attempts,run_after) VALUES($1,$2,'sentences',$3,$4,3,$5) RETURNING *",[child,actor,dedupe,payload,this.a.now()]);return this.dto(q,job);
 });}
 async get(actor:string,id:string){return this.a.tx(async q=>this.dto(q,(await this.scope(q,actor,id)).job));}
 async list(actor:string,child:string){return this.a.tx(async q=>{await this.a.child(q,actor,child);return {items:await Promise.all((await q.query("SELECT * FROM generation_jobs WHERE child_id=$1 AND payload->>'flow' IN ('vocabulary_v1','vocabulary_bulk_v1') AND payload->>'bulk_parent_id' IS NULL ORDER BY created_at DESC,id DESC LIMIT 20",[child])).rows.map(j=>this.dto(q,j)))};});}
 private async prepareRetry(q:Sql,job:Row,provider:VocabularyProvider){
  const recover=validationRecovery(job),previous=job.payload.validation_revision??'legacy';
  job.payload.validation_revision=VOCABULARY_VALIDATION_REVISION;
  if(this.accounts)job.payload.ai_selection=provider.selection;
  // A validation fix grants one attempt on user retry; prior attempts and
  // billing references remain intact. The revision prevents repeated grants.
  if(recover){job.max_attempts++;job.payload.validation_recovery_from=previous;}
  await q.query('UPDATE generation_jobs SET payload=$2,max_attempts=$3 WHERE id=$1',[job.id,JSON.stringify(job.payload),job.max_attempts]);
 }
 async retry(actor:string,key:string,id:string){return this.a.write(actor,key,`vocabulary:retry:${id}`,{},q=>this.scope(q,actor,id),async(q,{job:j,c})=>{
  ensure(!this.accounts||j.requested_by===actor,403,'AI_BILLING_OWNER_REQUIRED');const provider=this.accounts?await this.accounts.vocabulary(q,actor,undefined,undefined,c.family_id,j.payload.input_type==='prepared'):this.provider;ensure(provider&&provider.provider===j.payload.provider&&provider.model===j.payload.model&&provider.promptVersion===j.payload.prompt_version,503,'AI_CONFIGURATION_CHANGED');
  if(this.accounts){ensure(provider?.selection?.mode===j.payload.ai_selection?.mode,409,'AI_CONFIGURATION_CHANGED');j.payload.ai_selection=provider!.selection;await q.query('UPDATE generation_jobs SET payload=$2 WHERE id=$1',[j.id,JSON.stringify(j.payload)]);}
  if(j.payload.flow==='vocabulary_bulk_v1'){
   const summary=await this.bulkDto(q,j);ensure(summary.retryable,409,'GENERATION_NOT_RETRYABLE');
   ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE child_id=$1 AND payload->>'flow'='vocabulary_v1' AND status IN ('queued','running')",[j.child_id]),409,'ACTIVE_GENERATION');
   // Replan a legacy import only before any output exists. Keep its old jobs
   // for audit, and leave the original import ID/material available to retry.
   if(j.payload.input_type==='text'&&j.payload.import_plan_version!==VOCABULARY_IMPORT_PLAN_VERSION&&summary.total_count===0){
    const old=(await q.query("SELECT * FROM generation_jobs WHERE payload->>'bulk_parent_id'=$1 ORDER BY (payload->>'bulk_index')::int",[j.id])).rows,chunks=vocabularyImportChunks(j.payload.raw_text);
    if(old.every(part=>part.status==='failed'&&part.attempts<part.max_attempts&&!['NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT'].includes(part.error_code))&&(chunks.length!==old.length||chunks.some((chunk,index)=>chunk!==old[index].payload.raw_text))){
     await q.query("UPDATE generation_jobs SET status='cancelled',payload=(payload-'bulk_parent_id')||jsonb_build_object('flow','vocabulary_superseded_v1','superseded_bulk_parent_id',$1::text),dedupe_key=dedupe_key||':superseded:'||id::text,updated_at=$2 WHERE payload->>'bulk_parent_id'=$1",[j.id,this.a.now()]);
     return this.createBulk(q,actor,j.child_id,j.payload,j.payload.batch_id,provider,j.payload.theme,j.payload.level,[],chunks,undefined,j.dedupe_key,j);
    }
   }
   const parts=(await q.query("SELECT * FROM generation_jobs WHERE payload->>'bulk_parent_id'=$1 AND status IN ('failed','partial')",[j.id])).rows.filter(retryable);
   for(const part of parts){
    ensure(!await one(q,"SELECT 1 FROM batch_items WHERE batch_id=$1 AND child_word_id IS NULL AND raw_text ~ '[,，、;；\\r\\n]'",[part.payload.batch_id]),422,'INPUT_REENTRY_REQUIRED');
    await this.prepareRetry(q,part,provider!);
    await q.query("UPDATE batch_items SET status='ready' WHERE batch_id=$1 AND child_word_id IS NULL",[part.payload.batch_id]);
    await q.query("UPDATE generation_jobs SET status='queued',requested_by=$2,error_code=NULL,run_after=$3,lease_until=NULL,updated_at=$3 WHERE id=$1",[part.id,actor,this.a.now()]);
   }
   await this.syncBulk(q,j.id);return this.bulkDto(q,j);
  }
  ensure(!['NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT'].includes(j.error_code),422,'INPUT_REENTRY_REQUIRED');
  ensure(!await one(q,"SELECT 1 FROM batch_items WHERE batch_id=$1 AND child_word_id IS NULL AND raw_text ~ '[,，、;；\\r\\n]'",[j.payload.batch_id]),422,'INPUT_REENTRY_REQUIRED');
  ensure(['failed','partial'].includes(j.status)&&retryable(j),409,'GENERATION_NOT_RETRYABLE');
  ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE child_id=$1 AND id<>$2 AND payload->>'flow'='vocabulary_v1' AND status IN ('queued','running')",[j.child_id,id]),409,'ACTIVE_GENERATION');
  await this.prepareRetry(q,j,provider!);
  await q.query("UPDATE batch_items SET status='ready' WHERE batch_id=$1 AND child_word_id IS NULL",[j.payload.batch_id]);
  return this.dto(q,await one(q,"UPDATE generation_jobs SET status='queued',requested_by=$2,error_code=NULL,run_after=$3,lease_until=NULL,updated_at=$3 WHERE id=$1 RETURNING *",[id,actor,this.a.now()]));
 });}
 // Claim in a short transaction, perform network I/O without database locks, then commit atomically.
 async processOne(){
  const candidate=await this.a.tx(q=>one(q,`SELECT j.id FROM generation_jobs j LEFT JOIN generation_jobs parent ON parent.id=(j.payload->>'bulk_parent_id')::uuid
   WHERE j.payload->>'flow'='vocabulary_v1' AND ((j.status='queued' AND j.run_after<=$1) OR (j.status='running' AND j.lease_until<=$1))
   AND (j.payload->>'bulk_parent_id' IS NULL OR NOT EXISTS(SELECT 1 FROM generation_jobs earlier WHERE earlier.payload->>'bulk_parent_id'=j.payload->>'bulk_parent_id' AND (earlier.payload->>'bulk_index')::int<(j.payload->>'bulk_index')::int AND earlier.status IN ('queued','running')))
   ORDER BY coalesce(parent.updated_at,j.created_at),j.created_at,coalesce((j.payload->>'bulk_index')::int,0),j.id LIMIT 1`,[this.a.now()]));if(!candidate)return;
  let j:Row|undefined;let provider:VocabularyProvider|undefined;
  try{j=await this.a.tx(async q=>{
   const first=await one(q,'SELECT * FROM generation_jobs WHERE id=$1',[candidate.id]);const jobChild=await this.a.child(q,first.requested_by,first.child_id);
   const job=await one(q,'SELECT * FROM generation_jobs WHERE id=$1 FOR UPDATE',[candidate.id]);
   if(!(job.status==='queued'||job.status==='running'&&new Date(job.lease_until)<=this.a.now()))return;
   if(job.attempts>=job.max_attempts){if(this.accounts)await this.accounts.releaseInTransaction(q,`vocabulary:${job.id}:${job.attempts}`);await q.query("UPDATE generation_jobs SET status='failed',error_code='GENERATION_ATTEMPTS_EXHAUSTED',lease_until=NULL WHERE id=$1",[job.id]);if(job.payload.bulk_parent_id){await q.query("UPDATE generation_jobs SET status='failed',error_code='BULK_PAUSED' WHERE payload->>'bulk_parent_id'=$1 AND status='queued'",[job.payload.bulk_parent_id]);await this.syncBulk(q,job.payload.bulk_parent_id);}return;}
   ensure(!this.accounts||job.payload.ai_selection,503,'AI_CONFIGURATION_CHANGED');provider=this.accounts?await this.accounts.vocabulary(q,job.requested_by,job.payload.ai_selection,`vocabulary:${job.id}:${job.attempts+1}`,jobChild.family_id,job.payload.input_type==='prepared'):this.provider;ensure(provider&&provider.provider===job.payload.provider&&provider.model===job.payload.model&&provider.promptVersion===job.payload.prompt_version,503,'AI_CONFIGURATION_CHANGED');
   ensure(await one(q,'SELECT 1 FROM wordbooks WHERE id=$1 AND child_id=$2 AND archived_at IS NULL',[job.payload.wordbook_id,job.child_id]),404,'WORDBOOK_NOT_FOUND');
   if(job.payload.input_type==='text')ensure(provider.generateRaw&&provider.rawPromptVersion===job.payload.raw_prompt_version,503,'AI_CONFIGURATION_CHANGED');
   const usage=await usageBudget(q,job.requested_by,job.child_id,'vocabulary',this.a.now());
   if(!this.accounts&&!job.payload.bulk_parent_id)ensure(usage.child_count<30&&usage.user_count<60,429,'AI_DAILY_LIMIT');
   const items=(await q.query('SELECT id,ordinal,raw_text FROM batch_items WHERE batch_id=$1 AND child_word_id IS NULL ORDER BY ordinal',[job.payload.batch_id])).rows;
   if(this.accounts&&job.attempts>0)await this.accounts.releaseInTransaction(q,`vocabulary:${job.id}:${job.attempts}`);
   job.payload.validation_revision=VOCABULARY_VALIDATION_REVISION;
   const claimed=await one(q,"UPDATE generation_jobs SET status='running',attempts=attempts+1,lease_until=$2,error_code=NULL,updated_at=$3,payload=$4 WHERE id=$1 RETURNING *",[job.id,new Date(this.a.now().getTime()+120000),this.a.now(),JSON.stringify(job.payload)]);await recordUsage(q,'vocabulary',job.id,claimed.attempts,usage.key,job.child_id,this.a.now());return {...claimed,items};
  });}catch(e){await this.fail(candidate.id,undefined,e);return;}
  if(!j)return;const job=j;
  try{
   const rawPass=job.payload.input_type==='text'&&job.items.length===0;
   const data:{items:Row[];billing_id?:string;error?:string|null}=job.payload.input_type==='prepared'?{items:job.payload.prepared_items}:rawPass?await provider!.generateRaw!(job.payload.raw_text,job.payload.theme,job.payload.level):await provider!.generate(job.items.map((i:Row)=>i.raw_text),job.payload.theme,job.payload.level);
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
     ensure(new Set(data.items.map((r:Row)=>String(r.input).toLowerCase())).size===data.items.length,422,'GENERATED_CONTENT_REJECTED');
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
     const escaped=r.lemma.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),match=provider!.locateTarget?null:new RegExp(`(^|[^a-z])(${escaped})(?=[^a-z]|$)`,'i').exec(r.sentence_en);
     const target=provider!.locateTarget?provider!.locateTarget(r.sentence_en,r.lemma,r.part_of_speech):match?{surface:match[2],start:match.index+match[1].length,end:match.index+match[1].length+match[2].length}:null;
     ensure(target&&Number.isInteger(target.start)&&Number.isInteger(target.end)&&target.start>=0&&target.end>target.start&&target.end<=r.sentence_en.length&&r.sentence_en.slice(target.start,target.end)===target.surface,422,'GENERATED_CONTENT_REJECTED');
     await q.query('INSERT INTO sentence_targets(child_id,sentence_id,child_word_id,surface,start_utf16,end_utf16) VALUES($1,$2,$3,$4,$5,$6)',[job.child_id,sentence.id,word.id,target!.surface,target!.start,target!.end]);
     await q.query("UPDATE batch_items SET status='confirmed',child_word_id=$2,candidates='[]' WHERE id=$1",[item.id,word.id]);
    }
    if(job.payload.bulk_parent_id)ensure(Number((await one(q,"SELECT count(*)::int n FROM batch_items i JOIN generation_jobs g ON i.batch_id=(g.payload->>'batch_id')::uuid WHERE g.payload->>'bulk_parent_id'=$1",[job.payload.bulk_parent_id])).n)<=MAX_IMPORT_WORDS,422,'TOO_MANY_WORDS');
    const counts=await one(q,'SELECT count(*) FILTER(WHERE child_word_id IS NOT NULL)::int saved,count(*) FILTER(WHERE child_word_id IS NULL)::int missing FROM batch_items WHERE batch_id=$1',[job.payload.batch_id]);
    await q.query("UPDATE batches SET status='confirmed',version=version+1 WHERE id=$1",[job.payload.batch_id]);
    if(data.billing_id)await this.accounts?.settle(q,data.billing_id);
    await q.query('UPDATE generation_jobs SET status=$2,result=$3,error_code=NULL,lease_until=NULL,updated_at=$4 WHERE id=$1',[job.id,counts.missing?'partial':'succeeded',JSON.stringify(counts),this.a.now()]);
    if(job.payload.bulk_parent_id)await this.syncBulk(q,job.payload.bulk_parent_id);
   });
  }catch(e){await this.accounts?.failReference(`vocabulary:${job.id}:${job.attempts}`);await this.fail(job.id,job.attempts,e);}
 }
 private async fail(id:string,attempt:number|undefined,e:unknown){
  const code=(e as any)?.code;const allowed=['AI_KEY_REQUIRED','AI_VISION_UNAVAILABLE','AI_MODEL_UNAVAILABLE','AI_PRICE_NOT_CONFIGURED','AI_INSUFFICIENT_BALANCE','AI_SYSTEM_BUDGET_EXHAUSTED','AI_USAGE_MISSING','AI_USAGE_OVER_RESERVATION','AI_CALL_ALREADY_STARTED','AI_DAILY_LIMIT','AI_SERVICE_NOT_ACTIVATED','AI_PROVIDER_BILLING_UNAVAILABLE','NO_WORDS_FOUND','TOO_MANY_WORDS','UNSAFE_INPUT','AI_CONFIGURATION_CHANGED','GENERATED_CONTENT_REJECTED','UPSTREAM_NETWORK_OR_TIMEOUT','UPSTREAM_HTTP_ERROR','UPSTREAM_INVALID_JSON','INVALID_GENERATED_JSON','INCOMPLETE_GENERATION','MODEL_REFUSAL'];
  const upstream=e as any,safe=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value)?value:undefined,diagnostic:Row={};
  if(Number.isInteger(upstream?.status)&&upstream.status>=400&&upstream.status<=599)diagnostic.provider_error={http_status:upstream.status,code:safe(upstream.upstreamCode),request_id:safe(upstream.requestId)};
  const issue=upstream?.validationIssue;if(issue&&typeof issue.field==='string'&&/^[a-z_]{1,40}$/.test(issue.field))diagnostic.validation_error={field:issue.field,...(Number.isInteger(issue.index)&&issue.index>=0&&issue.index<30?{index:issue.index}:{}),request_id:safe(upstream.requestId)};
  const details=Object.keys(diagnostic).length?JSON.stringify(diagnostic):null;
  const accessLost=['FAMILY_NOT_FOUND','CHILD_NOT_FOUND','WORDBOOK_NOT_FOUND'].includes(code);
  await this.a.tx(async q=>{
   const changed=await one(q,`UPDATE generation_jobs SET status=$2,error_code=$3,lease_until=NULL,updated_at=$4,result=CASE WHEN $6::jsonb IS NULL THEN result ELSE coalesce(result,'{}'::jsonb)||$6::jsonb END WHERE id=$1 AND status IN ('queued','running') AND (($5::int IS NOT NULL AND attempts=$5) OR ($5::int IS NULL AND (status='queued' OR lease_until<=$4))) RETURNING payload`,[id,accessLost?'cancelled':'failed',accessLost?'GENERATION_SCOPE_UNAVAILABLE':allowed.includes(code)?code:'GENERATION_FAILED',this.a.now(),attempt??null,details]);
   const parent=changed?.payload.bulk_parent_id;if(parent){await q.query("UPDATE generation_jobs SET status=$2,error_code=$3,updated_at=$4 WHERE payload->>'bulk_parent_id'=$1 AND status='queued'",[parent,accessLost?'cancelled':'failed',accessLost?'GENERATION_SCOPE_UNAVAILABLE':'BULK_PAUSED',this.a.now()]);await this.syncBulk(q,parent);}
  });
 }
}
