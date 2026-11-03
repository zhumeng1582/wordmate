import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import type {Sql,Row} from './ports.ts';import {ensure,uuid,DomainError} from './errors.ts';import {yuanMicros,settleAiCall,releaseAiCall} from './ai-wallet.ts';
type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>};type Env=Record<string,string|undefined>;
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export class TutorSearch {
 private access:Access;private env:Env;private fetcher:typeof fetch;
 constructor(access:Access,env:Env,fetcher:typeof fetch=fetch){this.access=access;this.env=env;this.fetcher=fetcher;}
 private async scope(q:Sql,actor:string,id:string){const s=await one(q,'SELECT * FROM word_tutor_sessions WHERE id=$1',[uuid(id)]);ensure(s,404,'TUTOR_SESSION_NOT_FOUND');const child=await this.access.child(q,actor,s.child_id);ensure(await one(q,'SELECT id FROM word_tutor_sessions WHERE id=$1',[id]),404,'TUTOR_SESSION_NOT_FOUND');return {s,child};}
 async search(actor:string,id:string,requestId:string,question:string){
  uuid(requestId);ensure(typeof question==='string'&&question.trim().length>0&&question.length<=1000&&!/[\u0000-\u001f\u007f]/.test(question),422,'INVALID_TEXT');
  const adapter=await import(pathToFileURL(resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist/tutor-search.js')).href);
  let provider:any;try{provider=adapter.createTutorSearch(this.env,this.fetcher);}catch{throw new DomainError(503,'SEARCH_NOT_CONFIGURED');}
  let input:number,output:number,searchFee:number;try{input=yuanMicros(this.env.TUTOR_SEARCH_INPUT_YUAN_PER_MILLION);output=yuanMicros(this.env.TUTOR_SEARCH_OUTPUT_YUAN_PER_MILLION);searchFee=yuanMicros(this.env.TUTOR_SEARCH_YUAN_PER_CALL);}catch{throw new DomainError(503,'SEARCH_PRICE_NOT_CONFIGURED');}
  const reserve=Number((16000n*BigInt(input)+1000n*BigInt(output)+999999n)/1000000n)+searchFee;
  const begin=await this.access.tx(async q=>{
   const {s,child}=await this.scope(q,actor,id);await q.query('SELECT id FROM word_tutor_sessions WHERE id=$1 FOR UPDATE',[id]);
   await q.query("UPDATE word_tutor_turns SET status='failed',updated_at=now() WHERE session_id=$1 AND status='running' AND created_at<now()-interval '10 minutes'",[id]);
   const old=await one(q,'SELECT * FROM word_tutor_turns WHERE id=$1',[requestId]);if(old){ensure(old.session_id===id&&old.mode==='search'&&old.question===question,409,'IDEMPOTENCY_CONFLICT');if(old.status==='succeeded')return {done:true};ensure(false,409,old.status==='running'?'TUTOR_GENERATING':'TUTOR_RETRY_NEW_REQUEST');}
   ensure(!await one(q,"SELECT id FROM word_tutor_turns WHERE session_id=$1 AND status='running'",[id]),409,'TUTOR_GENERATING');
   ensure(await one(q,'SELECT id FROM word_tutor_messages WHERE session_id=$1 LIMIT 1',[id]),409,'TUTOR_NOT_STARTED');
   const count=await one(q,"SELECT count(*)::int n FROM ai_calls WHERE user_id=$1 AND kind='tutor_search' AND created_at>now()-interval '24 hours'",[actor]);ensure(count.n<Number(this.env.TUTOR_SEARCH_DAILY_LIMIT||100),429,'SEARCH_DAILY_LIMIT');
   const wallet=await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[child.family_id]);ensure(wallet&&Number(wallet.balance_micros)-Number(wallet.frozen_micros)>=reserve,402,'AI_INSUFFICIENT_BALANCE');
   await q.query('SELECT pg_advisory_xact_lock(170017)');const spent=await one(q,"SELECT coalesce(sum(coalesce(cost_micros,reserved_micros)),0)::text n FROM ai_calls WHERE mode='system' AND kind<>'audio' AND created_at>now()-interval '24 hours'");ensure(Number(spent.n)+reserve<=Number(this.env.AI_SYSTEM_DAILY_LIMIT_MICROS||20000000),429,'AI_SYSTEM_BUDGET_EXHAUSTED');
   await q.query('UPDATE ai_family_wallets SET frozen_micros=frozen_micros+$2 WHERE family_id=$1',[child.family_id,reserve]);
   const call=await one(q,"INSERT INTO ai_calls(reference,user_id,kind,mode,provider,model,settings_version,state,reserved_micros,tariff,family_id,capability) VALUES($1,$2,'tutor_search','system','qwen',$3,0,'running',$4,$5,$6,'text') RETURNING id",[`tutor-search:${requestId}`,actor,provider.model,reserve,JSON.stringify({input_yuan_per_million:this.env.TUTOR_SEARCH_INPUT_YUAN_PER_MILLION,output_yuan_per_million:this.env.TUTOR_SEARCH_OUTPUT_YUAN_PER_MILLION,search_yuan_per_call:this.env.TUTOR_SEARCH_YUAN_PER_CALL}),child.family_id]);
   await q.query("INSERT INTO word_tutor_turns(id,session_id,question,status,mode) VALUES($1,$2,$3,'running','search')",[requestId,id,question]);return {done:false,call:call.id,word:{lemma:s.lemma,meaning_zh:s.meaning_zh}};
  });
  const dto=async(q:Sql)=>{const {s}=await this.scope(q,actor,id);return {id:s.id,child_id:s.child_id,lemma:s.lemma,part_of_speech:s.part_of_speech,meaning_zh:s.meaning_zh,created_at:s.created_at,updated_at:s.updated_at,messages:(await q.query("SELECT m.id,m.role,m.content,m.sources,m.created_at,i.id AS image_id FROM word_tutor_messages m LEFT JOIN word_tutor_images i ON i.message_id=m.id AND i.state='succeeded' WHERE m.session_id=$1 ORDER BY m.ordinal LIMIT 500",[id])).rows};};
  if(begin.done)return this.access.tx(dto);
  try{const r=await provider.search(begin.word,question);ensure(r.usage.input<=16000&&r.usage.output<=1000,502,'SEARCH_USAGE_INVALID');const cost=Number((BigInt(r.usage.input)*BigInt(input)+BigInt(r.usage.output)*BigInt(output)+999999n)/1000000n)+searchFee;ensure(cost<=reserve,502,'SEARCH_USAGE_INVALID');
   return await this.access.tx(async q=>{await this.scope(q,actor,id);const turn=await one(q,'SELECT * FROM word_tutor_turns WHERE id=$1 FOR UPDATE',[requestId]);ensure(turn?.status==='running',409,'TUTOR_GENERATING');
    ensure(await one(q,"UPDATE ai_calls SET state='ready',cost_micros=$2,input_tokens=$3,output_tokens=$4,upstream_request_id=$5,updated_at=now() WHERE id=$1 AND state='running' RETURNING id",[begin.call,cost,r.usage.input,r.usage.output,r.request_id??null]),409,'AI_CALL_EXPIRED');
    await q.query("INSERT INTO word_tutor_messages(session_id,role,content) VALUES($1,'user',$2)",[id,question.trim()]);await q.query("INSERT INTO word_tutor_messages(session_id,role,content,sources) VALUES($1,'assistant',$2,$3)",[id,r.answer,JSON.stringify(r.sources)]);await settleAiCall(q,begin.call!);await q.query("UPDATE word_tutor_turns SET status='succeeded',updated_at=now() WHERE id=$1",[requestId]);await q.query('UPDATE word_tutor_sessions SET updated_at=now() WHERE id=$1',[id]);return dto(q);});
  }catch(e){await this.access.tx(async q=>{await releaseAiCall(q,begin.call!,'SEARCH_FAILED',true);await q.query("UPDATE word_tutor_turns SET status='failed',updated_at=now() WHERE id=$1 AND status='running'",[requestId]);});throw e instanceof DomainError?e:new DomainError(502,'SEARCH_FAILED');}
 }
}
