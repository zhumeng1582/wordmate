import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Sql,Row} from './ports.ts';
import {ensure,uuid,DomainError} from './errors.ts';
import {yuanMicros,settleAiCall,releaseAiCall} from './ai-wallet.ts';

type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>};
type Env=Record<string,string|undefined>;
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export class TutorAsr {
 private access:Access;private env:Env;private fetcher:typeof fetch;
 constructor(access:Access,env:Env,fetcher:typeof fetch=fetch){this.access=access;this.env=env;this.fetcher=fetcher;}
 private async scope(q:Sql,actor:string,id:string){const s=await one(q,'SELECT id,child_id FROM word_tutor_sessions WHERE id=$1',[uuid(id)]);ensure(s,404,'TUTOR_SESSION_NOT_FOUND');const child=await this.access.child(q,actor,s.child_id);ensure(await one(q,'SELECT id FROM word_tutor_sessions WHERE id=$1',[id]),404,'TUTOR_SESSION_NOT_FOUND');return child;}
 async transcribe(actor:string,sessionId:string,requestId:string,base64:string){
  uuid(requestId);ensure(typeof base64==='string'&&base64.length>0&&base64.length<=800000&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64),422,'INVALID_ASR_AUDIO');
  const bytes=Buffer.from(base64,'base64');ensure(bytes.length>=4&&(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255&&(bytes[1]&224)===224),422,'INVALID_ASR_AUDIO');
  const hash=createHash('sha256').update(bytes).digest('hex');
  const adapter=await import(pathToFileURL(resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist/tutor-asr.js')).href);
  let provider:any;try{provider=adapter.createTutorAsr(this.env,this.fetcher);}catch{throw new DomainError(503,'ASR_NOT_CONFIGURED');}
  let price:number;try{price=yuanMicros(this.env.TUTOR_ASR_YUAN_PER_MINUTE);}catch{throw new DomainError(503,'ASR_PRICE_NOT_CONFIGURED');}ensure(price>0,503,'ASR_PRICE_NOT_CONFIGURED');const reserve=price*5;
  const start=await this.access.tx(async q=>{
   const child=await this.scope(q,actor,sessionId);
   const old=await one(q,'SELECT * FROM word_tutor_transcriptions WHERE id=$1',[requestId]);
   if(old){ensure(old.session_id===sessionId&&old.actor_id===actor&&old.audio_sha256===hash,409,'IDEMPOTENCY_CONFLICT');if(old.state==='succeeded')return {done:true,text:old.result};ensure(false,409,old.state==='running'?'ASR_IN_PROGRESS':'ASR_RETRY_NEW_REQUEST');}
   const count=await one(q,"SELECT count(*)::int n FROM ai_calls WHERE user_id=$1 AND kind='tutor_asr' AND created_at>now()-interval '24 hours'",[actor]);ensure(count.n<Number(this.env.TUTOR_ASR_DAILY_LIMIT||100),429,'ASR_DAILY_LIMIT');
   const wallet=await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[child.family_id]);ensure(wallet&&Number(wallet.balance_micros)-Number(wallet.frozen_micros)>=reserve,402,'AI_INSUFFICIENT_BALANCE');
   await q.query('SELECT pg_advisory_xact_lock(170017)');const spent=await one(q,"SELECT coalesce(sum(coalesce(cost_micros,reserved_micros)),0)::text n FROM ai_calls WHERE mode='system' AND kind<>'audio' AND created_at>now()-interval '24 hours'");ensure(Number(spent.n)+reserve<=Number(this.env.AI_SYSTEM_DAILY_LIMIT_MICROS||20000000),429,'AI_SYSTEM_BUDGET_EXHAUSTED');
   await q.query('UPDATE ai_family_wallets SET frozen_micros=frozen_micros+$2 WHERE family_id=$1',[child.family_id,reserve]);
   const call=await one(q,"INSERT INTO ai_calls(reference,user_id,kind,mode,provider,model,settings_version,state,reserved_micros,tariff,family_id,capability) VALUES($1,$2,'tutor_asr','system','qwen',$3,0,'running',$4,$5,$6,'audio') RETURNING id",[`tutor-asr:${requestId}`,actor,provider.model,reserve,JSON.stringify({yuan_per_minute:this.env.TUTOR_ASR_YUAN_PER_MINUTE,unit:'duration_seconds'}),child.family_id]);
   await q.query("INSERT INTO word_tutor_transcriptions(id,session_id,actor_id,audio_sha256,state,billing_id) VALUES($1,$2,$3,$4,'running',$5)",[requestId,sessionId,actor,hash,call.id]);return {done:false,billing:call.id};
  });
  if(start.done)return {text:start.text};
  try{
   const result=await provider.transcribe(bytes);const cost=Number((BigInt(Math.ceil(result.duration_seconds*1000))*BigInt(price)+59999n)/60000n);ensure(cost<=reserve,502,'ASR_USAGE_INVALID');
   return await this.access.tx(async q=>{await this.scope(q,actor,sessionId);const row=await one(q,"SELECT * FROM word_tutor_transcriptions WHERE id=$1 FOR UPDATE",[requestId]);ensure(row?.state==='running',409,'ASR_REQUEST_EXPIRED');
    const call=await one(q,"UPDATE ai_calls SET state='ready',cost_micros=$2,upstream_request_id=$3,updated_at=now() WHERE id=$1 AND state='running' RETURNING id",[start.billing,cost,result.request_id??null]);ensure(call,409,'ASR_REQUEST_EXPIRED');await settleAiCall(q,call.id);await q.query("UPDATE word_tutor_transcriptions SET state='succeeded',result=$2,updated_at=now() WHERE id=$1",[requestId,result.text]);return {text:result.text};});
  }catch(error){await this.access.tx(async q=>{await releaseAiCall(q,start.billing,'ASR_FAILED',true);await q.query("UPDATE word_tutor_transcriptions SET state='uncertain',updated_at=now() WHERE id=$1 AND state='running'",[requestId]);});throw error instanceof DomainError?error:new DomainError(502,'ASR_FAILED');}
 }
}
