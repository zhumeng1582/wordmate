import {yuanMicros,settleAiCall,releaseAiCall} from './ai-wallet.ts';
import {configuredAudioPrice} from './audio-tariff.ts';
export {yuanMicros} from './ai-wallet.ts';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import type {Database,Sql,Row} from './ports.ts';
import {ensure,DomainError,uuid} from './errors.ts';
import {vocabularyProvider,type VocabularyProvider} from './vocabulary.ts';
import {imageReader,type ImageReader} from './import-files.ts';

type Env=Record<string,string|undefined>;
export type AiPriceTier={up_to_input_tokens:number;input_yuan_per_million:string;output_yuan_per_million:string;cached_yuan_per_million?:string};
export type AiModel={id:string;provider:'qwen'|'deepseek'|'openai';model:string;label:string;vision?:boolean;base_url?:string;input_yuan_per_million?:string;output_yuan_per_million?:string;cached_yuan_per_million?:string;max_input_tokens?:number;pricing_tiers?:AiPriceTier[]|null};
export type AiCapability='text'|'vision';
export type AiSelection={capability:AiCapability;family_id?:string;mode:'system'|'byok';model_id:string;provider:string;model:string;version:number;tariff?:Pick<AiModel,'input_yuan_per_million'|'output_yuan_per_million'|'cached_yuan_per_million'|'max_input_tokens'|'pricing_tiers'>};
type Selected={selection:AiSelection;model:AiModel;env:Env};
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
// Monetary values are integer millionths of CNY, never floating point balances.
export function tokenUsage(raw:any){
 const input=raw?.input_tokens??raw?.prompt_tokens,output=raw?.output_tokens??raw?.completion_tokens,cached=raw?.input_tokens_details?.cached_tokens??raw?.prompt_tokens_details?.cached_tokens??0;
 ensure([input,output,cached].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000)&&cached<=input,502,'AI_USAGE_MISSING');return {input,output,cached};
}
export function usageCost(usage:{input:number;output:number;cached:number},m:AiModel){
 const price=m.pricing_tiers?.find(t=>usage.input<=t.up_to_input_tokens)??m;ensure(!m.pricing_tiers||price!==m,503,'AI_PRICE_NOT_CONFIGURED');const a=BigInt(yuanMicros(price.input_yuan_per_million)),b=BigInt(yuanMicros(price.output_yuan_per_million)),c=BigInt(yuanMicros(price.cached_yuan_per_million??price.input_yuan_per_million));
 return Number((BigInt(usage.input-usage.cached)*a+BigInt(usage.output)*b+BigInt(usage.cached)*c+999999n)/1000000n);
}
function safeCode(e:unknown){const code=(e as any)?.code;return typeof code==='string'&&/^[A-Z_]{2,64}$/.test(code)?code:'AI_REQUEST_FAILED';}

export class AiAccounts{
 private db:Database;private env:Env;private fetcher:typeof fetch;private key?:Buffer;
 readonly models:AiModel[];
 constructor(db:Database,env:Env,fetcher:typeof fetch=fetch){
  this.db=db;this.env=env;this.fetcher=fetcher;
  if(env.AI_CREDENTIAL_KEY){ensure(/^[a-fA-F0-9]{64}$/.test(env.AI_CREDENTIAL_KEY),500,'AI_ENCRYPTION_CONFIGURATION_INVALID');this.key=Buffer.from(env.AI_CREDENTIAL_KEY,'hex');}
  let models:AiModel[];
  try{models=env.AI_MODEL_CATALOG?JSON.parse(env.AI_MODEL_CATALOG):(['qwen','deepseek','openai'] as const).flatMap<AiModel>(provider=>{
   const p=provider.toUpperCase(),model=env[`${p}_MODEL`]||(provider==='qwen'?env.OCR_MODEL:undefined);if(!model)return [];
   return [{id:provider,provider,model,label:`${provider} · ${model}`,vision:provider==='qwen'&&model===env.OCR_MODEL,base_url:provider==='qwen'?(env.QWEN_BASE_URL||(env.OCR_WORKSPACE_ID?`https://${env.OCR_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`:'https://dashscope.aliyuncs.com/compatible-mode/v1')):undefined}];
  }).concat(env.OCR_MODEL?[{id:'qwen-vision',provider:'qwen',model:env.OCR_MODEL,label:`图片 · ${env.OCR_MODEL}`,vision:true,base_url:env.OCR_WORKSPACE_ID?`https://${env.OCR_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`:env.QWEN_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1'}]:[]);}catch{throw new DomainError(500,'AI_CATALOG_INVALID');}
  ensure(Array.isArray(models)&&models.length<=30,500,'AI_CATALOG_INVALID');
  for(const m of models){ensure(m&&m.id!=='custom'&&/^[a-zA-Z0-9_-]{1,60}$/.test(m.id)&&['qwen','deepseek','openai'].includes(m.provider)&&typeof m.model==='string'&&m.model.length>0&&m.model.length<=120&&typeof m.label==='string',500,'AI_CATALOG_INVALID');
   if(m.provider==='qwen'){const u=new URL(m.base_url||'https://dashscope.aliyuncs.com/compatible-mode/v1');ensure(u.protocol==='https:'&&/^([a-zA-Z0-9-]+\.)*aliyuncs\.com$/.test(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname.endsWith('/compatible-mode/v1'),500,'AI_CATALOG_INVALID');m.base_url=u.href;}
   // Verified 2026-10-26: official Beijing tariff for this exact pinned model only.
   if(!env.AI_MODEL_CATALOG&&m.provider==='qwen'&&m.model==='qwen3.7-flash-2026-07-15'&&(new URL(m.base_url!).hostname==='dashscope.aliyuncs.com'||new URL(m.base_url!).hostname.endsWith('.cn-beijing.maas.aliyuncs.com'))){m.input_yuan_per_million='0.2';m.output_yuan_per_million='0.8';m.cached_yuan_per_million='0.2';m.pricing_tiers=[{up_to_input_tokens:32768,input_yuan_per_million:'0.2',output_yuan_per_million:'0.8',cached_yuan_per_million:'0.2'},{up_to_input_tokens:262144,input_yuan_per_million:'0.6',output_yuan_per_million:'2.4',cached_yuan_per_million:'0.6'},{up_to_input_tokens:1048576,input_yuan_per_million:'1.2',output_yuan_per_million:'4.8',cached_yuan_per_million:'1.2'}];}
   if(m.pricing_tiers){ensure(Array.isArray(m.pricing_tiers)&&m.pricing_tiers.length>0&&m.pricing_tiers.length<=10&&m.pricing_tiers.every((t,i)=>Number.isSafeInteger(t.up_to_input_tokens)&&t.up_to_input_tokens>(i?m.pricing_tiers![i-1].up_to_input_tokens:0)&&typeof t.input_yuan_per_million==='string'&&typeof t.output_yuan_per_million==='string')&&m.pricing_tiers[m.pricing_tiers.length-1].up_to_input_tokens>=(m.max_input_tokens??65536),500,'AI_CATALOG_INVALID');for(const t of m.pricing_tiers){yuanMicros(t.input_yuan_per_million);yuanMicros(t.output_yuan_per_million);if(t.cached_yuan_per_million!==undefined)yuanMicros(t.cached_yuan_per_million);}}
   ensure(!m.vision||['qwen','openai'].includes(m.provider),500,'AI_CATALOG_INVALID');ensure(m.max_input_tokens===undefined||Number.isInteger(m.max_input_tokens)&&m.max_input_tokens>=8192&&m.max_input_tokens<=131072,500,'AI_CATALOG_INVALID');
  }
  ensure(new Set(models.map(m=>m.id)).size===models.length,500,'AI_CATALOG_INVALID');this.models=models;
 }
 private tx<T>(fn:(q:Sql)=>Promise<T>){return this.db.transaction(async q=>{await q.query('SET LOCAL search_path TO wordmate,public');return fn(q);});}
 private async user(q:Sql,actor:string){ensure(await one(q,"SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",[actor]),401,'ACCOUNT_UNAVAILABLE');}
 private encrypt(actor:string,value:{provider:string;key:string}){
  ensure(this.key,503,'AI_KEY_STORAGE_UNAVAILABLE');const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key!,nonce);cipher.setAAD(Buffer.from(actor));
  return Buffer.concat([nonce,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64');
 }
 private decrypt(actor:string,value:string):{provider:string;key:string}{
  ensure(this.key,503,'AI_KEY_STORAGE_UNAVAILABLE');try{const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',this.key!,b.subarray(0,12));cipher.setAAD(Buffer.from(actor));cipher.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([cipher.update(b.subarray(12,-16)),cipher.final()]).toString());}catch{throw new DomainError(503,'AI_KEY_STORAGE_UNAVAILABLE');}
 }
 private defaultModel(capability:AiCapability='text'){if(capability==='vision')return this.models.find(m=>m.id===this.env.AI_SYSTEM_VISION_MODEL_ID&&m.vision)??this.models.find(m=>m.vision);return this.models.find(m=>m.id===this.env.AI_SYSTEM_MODEL_ID)??this.models.find(m=>m.provider===(this.env.LLM_PROVIDER||'qwen'));}
 private priced(m:AiModel){try{yuanMicros(m.input_yuan_per_million);yuanMicros(m.output_yuan_per_million);if(m.cached_yuan_per_million!==undefined)yuanMicros(m.cached_yuan_per_million);return true;}catch{return false;}}
 canStoreCredentials(){return !!this.key;}
 sealPaymentIdentity(actor:string,openId:string){return this.encrypt(actor,{provider:'wechat-payment',key:openId});}
 openPaymentIdentity(actor:string,cipher:string){const value=this.decrypt(actor,cipher);ensure(value.provider==='wechat-payment',503,'AI_KEY_STORAGE_UNAVAILABLE');return value.key;}
 systemReady(){return this.models.some(m=>!!this.systemKey(m)&&this.priced(m));}
 private reserveCost(m:AiModel){const cap=m.max_input_tokens??65536,limits=[cap,...(m.pricing_tiers??[]).map(t=>Math.min(t.up_to_input_tokens,cap))];return Math.max(...limits.flatMap(input=>[usageCost({input,output:8192,cached:0},m),usageCost({input,output:8192,cached:input},m)]));}
 async family(q:Sql,actor:string,id?:string,required=false):Promise<Row|undefined>{
  if(id)uuid(id);const rows=(await q.query("SELECT f.id,f.name FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 AND m.status='active' AND f.status='active' ORDER BY f.id",[actor])).rows;
  const f=id?rows.find(f=>f.id===id):rows.length===1?rows[0]:undefined;
  ensure(!id||f,404,'FAMILY_NOT_FOUND');ensure(!required||f,422,'AI_FAMILY_REQUIRED');
  if(f){ensure(await one(q,"SELECT id FROM families WHERE id=$1 AND status='active' FOR UPDATE",[f.id]),404,'FAMILY_NOT_FOUND');ensure(await one(q,"SELECT 1 FROM family_members WHERE family_id=$1 AND user_id=$2 AND status='active'",[f.id,actor]),404,'FAMILY_NOT_FOUND');}
  return f;
 }
 async overview(actor:string,familyId?:string,capability:AiCapability='text'){return this.tx(async q=>{
  const family=await this.family(q,actor,familyId);await this.user(q,actor);const row=await one(q,'SELECT * FROM ai_capability_settings WHERE user_id=$1 AND capability=$2',[actor,capability]),wallet=family?await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1',[family.id]):undefined;const selected=row?.custom_model??this.models.find(m=>m.id===row?.model_id)??this.defaultModel(capability);
  const families=(await q.query("SELECT f.id,f.name FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 AND m.status='active' AND f.status='active' ORDER BY f.created_at",[actor])).rows;
  const legacy=await one(q,'SELECT balance_micros FROM ai_wallets WHERE user_id=$1',[actor]);
  return {capability,family_id:family?.id??null,family_name:family?.name??null,families,mode:row?.mode??'system',model_id:selected?.id??null,version:row?.version??0,has_key:!!row?.credential,key_hint:row?.credential?'已加密保存':null,byok_available:!!this.key,custom_provider:row?.custom_model?.provider??null,custom_model:row?.custom_model?.model??null,
   balance_micros:Number(wallet?.balance_micros??0),frozen_micros:Number(wallet?.frozen_micros??0),available_micros:Number(wallet?.balance_micros??0)-Number(wallet?.frozen_micros??0),gift_remaining_micros:Number(wallet?.gift_remaining_micros??0),welcome_credit_micros:20000000,legacy_balance_micros:Number(legacy?.balance_micros??0),currency:'CNY',audio_model:this.env.COSYVOICE_MODEL||'cosyvoice-v3-flash',audio_yuan_per_10000_characters:configuredAudioPrice(this.env)??null,tutor_prices:{asr_yuan_per_minute:this.env.TUTOR_ASR_YUAN_PER_MINUTE??null,search_yuan_per_call:this.env.TUTOR_SEARCH_YUAN_PER_CALL??null,search_input_yuan_per_million:this.env.TUTOR_SEARCH_INPUT_YUAN_PER_MILLION??null,search_output_yuan_per_million:this.env.TUTOR_SEARCH_OUTPUT_YUAN_PER_MILLION??null,image_yuan_per_image:this.env.TUTOR_IMAGE_YUAN_PER_IMAGE??null},
   models:[...this.models,...(row?.custom_model?[row.custom_model]:[])].filter(m=>capability==='text'||m.vision).map(m=>({id:m.id,label:m.label,provider:m.provider,model:m.model,vision:!!m.vision,system_available:!!this.systemKey(m,capability)&&this.priced(m),input_yuan_per_million:m.input_yuan_per_million??null,output_yuan_per_million:m.output_yuan_per_million??null,cached_yuan_per_million:m.cached_yuan_per_million??m.input_yuan_per_million??null,pricing_tiers:m.pricing_tiers??null,max_charge_micros:this.priced(m)?this.reserveCost(m):null})),
   other_services:'文字与图片模型独立配置，默认使用系统模型。每个家庭一次性获赠 20 元，家庭成员共享余额；私有 Key 各自保管。语音新生成按输入字符从家庭余额结算，已生成音频重复播放不扣费，打卡鼓励语使用免费精选文案。'};
 });}
 async save(actor:string,b:{mode:'system'|'byok';model_id:string;expected_version:number;api_key?:string;custom_provider?:string;custom_model?:string;capability?:AiCapability;family_id?:string}){
  const capability=b.capability??'text';ensure(['text','vision'].includes(capability),422,'INVALID_REQUEST_BODY');
  ensure(['system','byok'].includes(b.mode),422,'INVALID_REQUEST_BODY');let m=this.models.find(m=>m.id===b.model_id);if(b.model_id==='custom'){ensure(b.mode==='byok'&&['qwen','deepseek','openai'].includes(b.custom_provider??'')&&typeof b.custom_model==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(b.custom_model),422,'AI_MODEL_UNAVAILABLE');m={id:'custom',provider:b.custom_provider as AiModel['provider'],model:b.custom_model!,label:`${b.custom_provider} · ${b.custom_model}`,vision:capability==='vision'&&b.custom_provider!=='deepseek'};}ensure(m,422,'AI_MODEL_UNAVAILABLE');ensure(capability==='text'||m!.vision,422,'AI_VISION_UNAVAILABLE');
  await this.tx(async q=>{
   await this.family(q,actor,b.family_id);await this.user(q,actor);const old=await one(q,'SELECT * FROM ai_capability_settings WHERE user_id=$1 AND capability=$2 FOR UPDATE',[actor,capability]);ensure((old?.version??0)===b.expected_version,409,'AI_SETTINGS_CHANGED');
   ensure(!await one(q,"SELECT 1 FROM generation_jobs WHERE requested_by=$1 AND payload ? 'ai_selection' AND status IN ('queued','running')",[actor])&&!await one(q,"SELECT 1 FROM ai_calls WHERE user_id=$1 AND kind<>'audio' AND state IN ('running','ready')",[actor]),409,'AI_CONFIGURATION_BUSY');
   let credential=old?.credential??null;
   if(b.api_key!==undefined){ensure(b.mode==='byok'&&/^[\x21-\x7e]{8,512}$/.test(b.api_key),422,'INVALID_AI_KEY');credential=this.encrypt(actor,{provider:m!.provider,key:b.api_key});}
   if(b.mode==='byok'){ensure(credential,422,'AI_KEY_REQUIRED');ensure(this.decrypt(actor,credential).provider===m!.provider,422,'AI_KEY_REQUIRED');}
   if(b.mode==='system')ensure(!!this.systemKey(m!,capability)&&this.priced(m!),503,'AI_PRICE_NOT_CONFIGURED');
   await q.query('INSERT INTO ai_capability_settings(user_id,mode,model_id,credential,custom_model,capability,version) VALUES($1,$2,$3,$4,$5,$6,1) ON CONFLICT(user_id,capability) DO UPDATE SET mode=excluded.mode,model_id=excluded.model_id,credential=excluded.credential,custom_model=excluded.custom_model,version=ai_capability_settings.version+1,updated_at=now()',[actor,b.mode,b.model_id,credential,b.model_id==='custom'?JSON.stringify(m):null,capability]);
  });return this.overview(actor,b.family_id,capability);
 }
 async deleteKey(actor:string,expected:number,capability:AiCapability='text',familyId?:string){await this.tx(async q=>{await this.family(q,actor,familyId);await this.user(q,actor);const s=await one(q,'SELECT * FROM ai_capability_settings WHERE user_id=$1 AND capability=$2 FOR UPDATE',[actor,capability]);ensure((s?.version??0)===expected,409,'AI_SETTINGS_CHANGED');ensure(!await one(q,"SELECT 1 FROM ai_calls WHERE user_id=$1 AND kind<>'audio' AND state IN ('running','ready')",[actor]),409,'AI_CONFIGURATION_BUSY');
  if(s)await q.query('UPDATE ai_capability_settings SET credential=NULL,version=version+1,updated_at=now() WHERE user_id=$1 AND capability=$2',[actor,capability]);
 });return this.overview(actor,familyId,capability);}
 private systemKey(m:AiModel,capability:AiCapability='text'){if(capability==='vision')return this.env[`${m.provider.toUpperCase()}_VISION_API_KEY`]||(m.provider==='qwen'?this.env.OCR_API_KEY:undefined)||this.env[`${m.provider.toUpperCase()}_API_KEY`];return this.env[`${m.provider.toUpperCase()}_API_KEY`]||(m.provider==='qwen'?this.env.OCR_API_KEY:undefined);}
 async select(q:Sql,actor:string,snapshot?:AiSelection,capability:AiCapability='text',familyId?:string):Promise<Selected>{
  const family=await this.family(q,actor,familyId??snapshot?.family_id);await this.user(q,actor);const s=await one(q,'SELECT * FROM ai_capability_settings WHERE user_id=$1 AND capability=$2',[actor,capability]),m:AiModel|undefined=s?.custom_model??this.models.find(m=>m.id===(s?.model_id??this.defaultModel(capability)?.id));ensure(m,503,'AI_MODEL_UNAVAILABLE');
  ensure(capability==='text'||m!.vision,422,'AI_VISION_UNAVAILABLE');const selection:AiSelection={capability,...(family?{family_id:family.id}:{}),mode:s?.mode??'system',model_id:m!.id,provider:m!.provider,model:m!.model,version:s?.version??0};
  const effectiveModel={...m!,...(snapshot?.tariff??{})};if(selection.mode==='system')selection.tariff=snapshot?.tariff??{input_yuan_per_million:m!.input_yuan_per_million,output_yuan_per_million:m!.output_yuan_per_million,cached_yuan_per_million:m!.cached_yuan_per_million??m!.input_yuan_per_million,max_input_tokens:m!.max_input_tokens??65536,pricing_tiers:m!.pricing_tiers??null};
  if(snapshot)ensure((['capability','family_id','mode','model_id','provider','model','version'] as const).every(k=>selection[k]===snapshot[k]),409,'AI_CONFIGURATION_CHANGED');
  let key:string|undefined;
  if(selection.mode==='byok'){ensure(s?.credential,422,'AI_KEY_REQUIRED');const secret=this.decrypt(actor,s.credential);ensure(secret.provider===m!.provider,422,'AI_KEY_REQUIRED');key=secret.key;}
  else{key=this.systemKey(m!,capability);ensure(key&&this.priced(effectiveModel),503,'AI_PRICE_NOT_CONFIGURED');}
  const prefix=m!.provider.toUpperCase(),env:Env={LLM_PROVIDER:m!.provider,[`${prefix}_API_KEY`]:key,[`${prefix}_MODEL`]:m!.model};
  if(m!.provider==='qwen')env.QWEN_BASE_URL=m!.base_url||'https://dashscope.aliyuncs.com/compatible-mode/v1';
  return {selection,model:effectiveModel,env};
 }
 async vocabulary(q:Sql,actor:string,snapshot?:AiSelection,reference?:string,familyId?:string,prepared=false):Promise<VocabularyProvider>{
  if(prepared){const family=await this.family(q,actor,familyId??snapshot?.family_id,true),p=await vocabularyProvider({LLM_PROVIDER:'qwen',QWEN_API_KEY:'unused-prepared-content',QWEN_MODEL:'prepared-content',QWEN_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1'});return {...p!,selection:{capability:'vision',family_id:family!.id,mode:'system',model_id:'prepared-content',provider:'qwen',model:'prepared-content',version:0},generate:async()=>{throw new DomainError(500,'PREPARED_MODEL_CALL_FORBIDDEN');}};}
  const selected=await this.select(q,actor,snapshot,'text',familyId);const observed=this.observer();const p=await vocabularyProvider(selected.env,observed.fetcher);ensure(p,503,'AI_NOT_CONFIGURED');
  const wrap=async<T>(fn:()=>Promise<T>)=>{ensure(reference,500,'AI_REFERENCE_REQUIRED');return this.run(actor,'vocabulary',reference!,selected,observed,fn);};
  return {...p!,selection:selected.selection,generate:async(...args)=>{const r=await wrap(()=>p!.generate(...args));return {...r.data,billing_id:r.id};},generateRaw:async(...args)=>{const r=await wrap(()=>p!.generateRaw!(...args));return {...r.data,billing_id:r.id};}};
 }
 async tutor(q:Sql,actor:string,reference:string,familyId:string){
  const selected=await this.select(q,actor,undefined,'text',familyId),observed=this.observer();
  const adapter=await import(pathToFileURL(resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist/index.js')).href);
  const tutor=await import(pathToFileURL(resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist/word-tutor.js')).href);
  return async(word:any,history:any[],question?:string)=>this.run(actor,'word_tutor',reference,selected,observed,()=>tutor.generateTutorAnswer(adapter.createTextGenerator(selected.env,observed.fetcher),word,history,question));
 }
 async reader(q:Sql,actor:string,familyId?:string):Promise<ImageReader>{
  const s=await this.select(q,actor,undefined,'vision',familyId);ensure(s.model.vision&&['qwen','openai'].includes(s.model.provider),422,'AI_VISION_UNAVAILABLE');
  const observed=this.observer(),reader=imageReader({OCR_PROVIDER:s.model.provider,OCR_API_KEY:s.env[`${s.model.provider.toUpperCase()}_API_KEY`],OCR_MODEL:s.model.model,OCR_BASE_URL:s.env.QWEN_BASE_URL},observed.fetcher);ensure(reader,503,'OCR_NOT_CONFIGURED');
  return {profile:`${actor}:${s.selection.version}:${reader!.profile}`,read:reader!.read,readVocabulary:async(...args)=>{const r=await this.run(actor,'vision',`vision:${randomUUID()}`,s,observed,()=>reader!.readVocabulary!(...args));return {...r.data,billing_id:r.id};}};
 }
 private observer(){
  const observed:{usage?:unknown;request_id?:string;sent:boolean;fetcher:typeof fetch}={sent:false,fetcher:async(input,init)=>{
   // Known adapters send one JSON request. Limit its size before sending credentials.
   const body=typeof init?.body==='string'?init.body:'';ensure(Buffer.byteLength(body)<=7000000,422,'AI_REQUEST_TOO_LARGE');observed.sent=true;
   const response=await this.fetcher(input,init);if(response.ok){try{const raw:any=await response.clone().json();observed.usage=raw.usage;const id=raw.id??raw.request_id;observed.request_id=typeof id==='string'?id.slice(0,128):undefined;}catch{/* Unknown usage is never invented. */}}
   return response;
  }};return observed;
 }
 private async run<T>(actor:string,kind:'vocabulary'|'vision'|'connection_test'|'word_tutor',reference:string,selected:Selected,observed:ReturnType<AiAccounts['observer']>,fn:()=>Promise<T>){
  const familyId=selected.selection.family_id;ensure(kind==='connection_test'||familyId,422,'AI_FAMILY_REQUIRED');
  const reserve=selected.selection.mode==='system'?this.reserveCost(selected.model):0;
  const id=await this.tx(async q=>{
   // Recheck credentials/version immediately before reserving, after worker claims.
   await this.select(q,actor,selected.selection,selected.selection.capability,familyId);
   const w=familyId?await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[familyId]):undefined;ensure(!await one(q,'SELECT 1 FROM ai_calls WHERE reference=$1',[reference]),409,'AI_CALL_ALREADY_STARTED');
   if(kind!=='vocabulary'){const count=await one(q,"SELECT count(*)::int n FROM ai_calls WHERE user_id=$1 AND kind NOT IN ('audio','vocabulary') AND created_at>now()-interval '24 hours'",[actor]);ensure(count.n<Number(this.env.AI_USER_DAILY_CALLS||100),429,'AI_DAILY_LIMIT');}
   if(selected.selection.mode==='system'){
    // Serialize the global cap across users, processes and workers.
    await q.query("SELECT pg_advisory_xact_lock(170017)");
    const spent=await one(q,"SELECT coalesce(sum(coalesce(cost_micros,reserved_micros)),0)::text n FROM ai_calls WHERE mode='system' AND kind<>'audio' AND created_at>now()-interval '24 hours'");
    ensure(Number(spent.n)+reserve<=Number(this.env.AI_SYSTEM_DAILY_LIMIT_MICROS||20000000),429,'AI_SYSTEM_BUDGET_EXHAUSTED');
    ensure(w&&Number(w.balance_micros)-Number(w.frozen_micros)>=reserve,402,'AI_INSUFFICIENT_BALANCE');
    await q.query('UPDATE ai_family_wallets SET frozen_micros=frozen_micros+$2 WHERE family_id=$1',[familyId,reserve]);
   }
   return (await one(q,"INSERT INTO ai_calls(reference,user_id,kind,mode,provider,model,settings_version,state,reserved_micros,tariff,family_id,capability) VALUES($1,$2,$3,$4,$5,$6,$7,'running',$8,$9,$10,$11) RETURNING id",[reference,actor,kind,selected.selection.mode,selected.model.provider,selected.model.model,selected.selection.version,reserve,JSON.stringify(selected.model),familyId??null,selected.selection.capability])).id as string;
  });
  try{
   const data=await fn();const u=tokenUsage(observed.usage),cost=this.priced(selected.model)?usageCost(u,selected.model):null;
   if(selected.selection.mode==='system')ensure(cost!==null&&cost<=reserve,502,'AI_USAGE_OVER_RESERVATION');
   await this.tx(async q=>{await this.user(q,actor);const row=await one(q,"SELECT state FROM ai_calls WHERE id=$1 FOR UPDATE",[id]);ensure(row?.state==='running',409,'AI_CALL_EXPIRED');await q.query("UPDATE ai_calls SET state='ready',cost_micros=$2,input_tokens=$3,output_tokens=$4,cached_tokens=$5,upstream_request_id=$6,updated_at=now() WHERE id=$1",[id,cost,u.input,u.output,u.cached,observed.request_id??null]);});
   return {id,data};
  }catch(e){
   await this.tx(async q=>{
    let cost:number|null=null;let u:ReturnType<typeof tokenUsage>|undefined;try{u=tokenUsage(observed.usage);cost=this.priced(selected.model)?usageCost(u,selected.model):null;}catch{}
    if(familyId)await q.query('SELECT family_id FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[familyId]);
    const requestId=(e as any)?.requestId??observed.request_id;await q.query("UPDATE ai_calls SET cost_micros=$2,input_tokens=$3,output_tokens=$4,cached_tokens=$5,upstream_request_id=coalesce($6,upstream_request_id) WHERE id=$1",[id,cost,u?.input??null,u?.output??null,u?.cached??null,typeof requestId==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId)?requestId:null]);await this.release(q,id,safeCode(e),observed.sent&&cost===null&&!['AI_SERVICE_NOT_ACTIVATED','AI_PROVIDER_BILLING_UNAVAILABLE'].includes(safeCode(e)));
   });throw e;
  }
 }
 async settle(q:Sql,id:string){return settleAiCall(q,id);}
 private async release(q:Sql,id:string,code:string,uncertain=false){return releaseAiCall(q,id,code,uncertain);}
 async releaseInTransaction(q:Sql,reference:string){const c=await one(q,'SELECT id FROM ai_calls WHERE reference=$1',[reference]);if(c)await this.release(q,c.id,'AI_CALL_EXPIRED',true);}
 async failId(id:string){await this.tx(q=>this.release(q,id,'GENERATION_FAILED'));}
 async failReference(reference:string,code='GENERATION_FAILED'){await this.tx(async q=>{const c=await one(q,'SELECT id FROM ai_calls WHERE reference=$1',[reference]);if(c)await this.release(q,c.id,code,true);});}
 async sweep(){await this.tx(async q=>{const calls=(await q.query("SELECT id FROM ai_calls WHERE state IN ('running','ready') AND created_at<now()-interval '10 minutes' ORDER BY user_id,id")).rows;for(const c of calls)await this.release(q,c.id,'AI_CALL_EXPIRED',true);});}
 async history(actor:string,familyId?:string){return this.tx(async q=>{const f=await this.family(q,actor,familyId);await this.user(q,actor);return {family_id:f?.id??null,items:(await q.query("SELECT id,user_id,family_id,capability,kind,mode,provider,model,state,input_tokens,output_tokens,cached_tokens,billable_characters,tariff->>'yuan_per_10000_characters' audio_yuan_per_10000_characters,charge_micros,error_code,created_at FROM ai_calls WHERE (family_id=$2 AND mode='system') OR (user_id=$1 AND (family_id=$2 OR family_id IS NULL)) ORDER BY created_at DESC,id DESC LIMIT 50",[actor,f?.id??null])).rows.map(r=>({...r,charge_micros:Number(r.charge_micros)})),entries:f?(await q.query('SELECT id,user_id,kind,amount_micros,gift_used_micros,created_at FROM ai_family_wallet_entries WHERE family_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[f.id])).rows.map(r=>({...r,amount_micros:Number(r.amount_micros),gift_used_micros:Number(r.gift_used_micros)})):[]};});}
 async test(actor:string,capability:AiCapability='text',familyId?:string){
  const ref=`test:${randomUUID()}`,selected=await this.tx(q=>this.select(q,actor,undefined,capability,familyId));ensure(selected.selection.mode==='byok',422,'AI_TEST_BYOK_ONLY');
  const observed=this.observer(),adapter=await import(pathToFileURL(resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist/index.js')).href);
  let r;try{r=await this.run(actor,'connection_test',ref,selected,observed,()=>adapter.createTextGenerator(selected.env,observed.fetcher).generate({...(capability==='vision'?{images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC']}:{}),name:'connection_test',instructions:'Return {"ok":true}.',input:'Connection test. No user information.',schema:{type:'object',additionalProperties:false,required:['ok'],properties:{ok:{type:'boolean'}}},validate:(v:any)=>{ensure(v?.ok===true,502,'GENERATED_CONTENT_REJECTED');return true;}}));}catch(e){throw new DomainError(502,safeCode(e));}
  await this.tx(q=>this.settle(q,r.id));return {connected:true,provider:selected.model.provider,model:selected.model.model};
 }
 // Trusted server use only. No client route accepts arbitrary credits or amounts.
 async creditLegacy(q:Sql,actor:string,reference:string,micros:number){
  ensure(Number.isSafeInteger(micros)&&micros>0&&micros<=1000000000000,422,'INVALID_CREDIT');await q.query('INSERT INTO ai_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING',[actor]);await q.query('SELECT user_id FROM ai_wallets WHERE user_id=$1 FOR UPDATE',[actor]);
  const inserted=await one(q,"INSERT INTO ai_wallet_entries(user_id,kind,reference,amount_micros) VALUES($1,'credit',$2,$3) ON CONFLICT(kind,reference) DO NOTHING RETURNING id",[actor,reference,micros]);if(!inserted){const old=await one(q,"SELECT user_id,amount_micros FROM ai_wallet_entries WHERE kind='credit' AND reference=$1",[reference]);ensure(old?.user_id===actor&&Number(old.amount_micros)===micros,409,'IDEMPOTENCY_CONFLICT');}if(inserted)await q.query('UPDATE ai_wallets SET balance_micros=balance_micros+$2 WHERE user_id=$1',[actor,micros]);
 }
 async credit(q:Sql,actor:string,reference:string,micros:number,familyId?:string){
  ensure(Number.isSafeInteger(micros)&&micros>0&&micros<=1000000000000,422,'INVALID_CREDIT');
  const fid=familyId??(await this.family(q,actor,undefined,true))!.id;
  ensure(await one(q,'SELECT family_id FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[fid]),404,'FAMILY_NOT_FOUND');
  const inserted=await one(q,"INSERT INTO ai_family_wallet_entries(family_id,user_id,kind,reference,amount_micros) VALUES($1,$2,'credit',$3,$4) ON CONFLICT(kind,reference) DO NOTHING RETURNING id",[fid,actor,reference,micros]);
  if(!inserted){const old=await one(q,"SELECT family_id,user_id,amount_micros FROM ai_family_wallet_entries WHERE kind='credit' AND reference=$1",[reference]);ensure(old?.family_id===fid&&old.user_id===actor&&Number(old.amount_micros)===micros,409,'IDEMPOTENCY_CONFLICT');}
  if(inserted)await q.query('UPDATE ai_family_wallets SET balance_micros=balance_micros+$2 WHERE family_id=$1',[fid,micros]);
 }
}
