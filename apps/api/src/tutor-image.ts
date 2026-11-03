import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import type {Sql,Row} from './ports.ts';import {ensure,uuid,DomainError} from './errors.ts';import {yuanMicros,settleAiCall,releaseAiCall} from './ai-wallet.ts';
type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>};type Env=Record<string,string|undefined>;
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export class TutorImage {
 private running=new Set<Promise<void>>();
 private access:Access;private env:Env;private fetcher:typeof fetch;
 constructor(access:Access,env:Env,fetcher:typeof fetch=fetch){this.access=access;this.env=env;this.fetcher=fetcher;}
 private async scope(q:Sql,actor:string,id:string){const s=await one(q,'SELECT * FROM word_tutor_sessions WHERE id=$1',[uuid(id)]);ensure(s,404,'TUTOR_SESSION_NOT_FOUND');const child=await this.access.child(q,actor,s.child_id);ensure(await one(q,'SELECT id FROM word_tutor_sessions WHERE id=$1',[id]),404,'TUTOR_SESSION_NOT_FOUND');return {s,child};}
 async start(actor:string,sessionId:string,id:string){
  uuid(id);const adapter=await import(pathToFileURL(resolve(typeof __dirname==='string'?__dirname:resolve(process.cwd(),'apps/api/src'),'../../../packages/ai/dist/tutor-image.js')).href);
  let provider:any;try{provider=adapter.createTutorImage(this.env,this.fetcher);}catch{throw new DomainError(503,'TUTOR_IMAGE_NOT_CONFIGURED');}
  let price:number;try{price=yuanMicros(this.env.TUTOR_IMAGE_YUAN_PER_IMAGE);}catch{throw new DomainError(503,'TUTOR_IMAGE_PRICE_NOT_CONFIGURED');}ensure(price>0,503,'TUTOR_IMAGE_PRICE_NOT_CONFIGURED');
  const start=await this.access.tx(async q=>{const {s,child}=await this.scope(q,actor,sessionId);await q.query('SELECT id FROM word_tutor_sessions WHERE id=$1 FOR UPDATE',[sessionId]);
   const old=await one(q,'SELECT * FROM word_tutor_images WHERE id=$1',[id]);if(old){ensure(old.session_id===sessionId&&old.actor_id===actor,409,'IDEMPOTENCY_CONFLICT');return {existing:true,state:old.state};}
   ensure(await one(q,'SELECT id FROM word_tutor_messages WHERE session_id=$1 LIMIT 1',[sessionId]),409,'TUTOR_NOT_STARTED');
   const count=await one(q,"SELECT count(*)::int n FROM ai_calls WHERE user_id=$1 AND kind='tutor_image' AND created_at>now()-interval '24 hours'",[actor]);ensure(count.n<Number(this.env.TUTOR_IMAGE_DAILY_LIMIT||10),429,'TUTOR_IMAGE_DAILY_LIMIT');
   const limit=await one(q,"SELECT count(*)::int n FROM word_tutor_images i JOIN word_tutor_sessions s ON s.id=i.session_id WHERE s.child_id=$1 AND i.state IN ('succeeded','running')",[child.id]);ensure(limit.n<100,429,'TUTOR_IMAGE_STORAGE_LIMIT');
   const wallet=await one(q,'SELECT * FROM ai_family_wallets WHERE family_id=$1 FOR UPDATE',[child.family_id]);ensure(wallet&&Number(wallet.balance_micros)-Number(wallet.frozen_micros)>=price,402,'AI_INSUFFICIENT_BALANCE');
   await q.query('SELECT pg_advisory_xact_lock(170017)');const spent=await one(q,"SELECT coalesce(sum(coalesce(cost_micros,reserved_micros)),0)::text n FROM ai_calls WHERE mode='system' AND kind<>'audio' AND created_at>now()-interval '24 hours'");ensure(Number(spent.n)+price<=Number(this.env.AI_SYSTEM_DAILY_LIMIT_MICROS||20000000),429,'AI_SYSTEM_BUDGET_EXHAUSTED');
   await q.query('UPDATE ai_family_wallets SET frozen_micros=frozen_micros+$2 WHERE family_id=$1',[child.family_id,price]);
   const bill=await one(q,"INSERT INTO ai_calls(reference,user_id,kind,mode,provider,model,settings_version,state,reserved_micros,tariff,family_id,capability) VALUES($1,$2,'tutor_image','system','qwen',$3,0,'running',$4,$5,$6,'image') RETURNING id",[`tutor-image:${id}`,actor,provider.model,price,JSON.stringify({yuan_per_image:this.env.TUTOR_IMAGE_YUAN_PER_IMAGE,size:provider.size}),child.family_id]);
   await q.query("INSERT INTO word_tutor_images(id,session_id,actor_id,billing_id,state) VALUES($1,$2,$3,$4,'running')",[id,sessionId,actor,bill.id]);return {existing:false,state:'running',bill:bill.id,word:{lemma:s.lemma,meaning_zh:s.meaning_zh}};
  });
  if(!start.existing){const task=this.generate(provider,actor,sessionId,id,start.bill!,start.word!,price);this.running.add(task);void task.finally(()=>this.running.delete(task));}
  return {id,state:start.state};
 }
 private async generate(provider:any,actor:string,sessionId:string,id:string,billing:string,word:{lemma:string;meaning_zh:string},price:number){
  try{const image=await provider.generate(word);await this.access.tx(async q=>{await this.scope(q,actor,sessionId);const row=await one(q,'SELECT * FROM word_tutor_images WHERE id=$1 FOR UPDATE',[id]);ensure(row?.state==='running',409,'IMAGE_REQUEST_EXPIRED');
   ensure(await one(q,"UPDATE ai_calls SET state='ready',cost_micros=$2,upstream_request_id=$3,updated_at=now() WHERE id=$1 AND state='running' RETURNING id",[billing,price,image.request_id??null]),409,'AI_CALL_EXPIRED');
   const message=await one(q,"INSERT INTO word_tutor_messages(session_id,role,content) VALUES($1,'assistant','这张 AI 生成的图片可以帮助理解这个单词。') RETURNING id",[sessionId]);await settleAiCall(q,billing);await q.query("UPDATE word_tutor_images SET content=$2,message_id=$3,state='succeeded',updated_at=now() WHERE id=$1",[id,image.bytes,message.id]);await q.query('UPDATE word_tutor_sessions SET updated_at=now() WHERE id=$1',[sessionId]);});
  }catch{await this.access.tx(async q=>{await releaseAiCall(q,billing,'TUTOR_IMAGE_FAILED',true);await q.query("UPDATE word_tutor_images SET state='uncertain',updated_at=now() WHERE id=$1 AND state='running'",[id]);}).catch(()=>{});}
 }
 async get(actor:string,id:string){return this.access.tx(async q=>{const row=await one(q,'SELECT id,session_id,state,created_at,billing_id FROM word_tutor_images WHERE id=$1',[uuid(id)]);ensure(row,404,'TUTOR_IMAGE_NOT_FOUND');await this.scope(q,actor,row.session_id);if(row.state==='running'&&Date.now()-new Date(row.created_at).getTime()>600000){await releaseAiCall(q,row.billing_id,'TUTOR_IMAGE_EXPIRED',true);await q.query("UPDATE word_tutor_images SET state='uncertain',updated_at=now() WHERE id=$1 AND state='running'",[id]);return {id,state:'uncertain'};}return {id,state:row.state};});}
 async content(actor:string,id:string){return this.access.tx(async q=>{const row=await one(q,'SELECT * FROM word_tutor_images WHERE id=$1',[uuid(id)]);ensure(row,404,'TUTOR_IMAGE_NOT_FOUND');await this.scope(q,actor,row.session_id);ensure(row.state==='succeeded'&&row.content,409,'TUTOR_IMAGE_NOT_READY');return Buffer.from(row.content);});}
 async drain(){await Promise.allSettled([...this.running]);}
}
