import {createHash,randomUUID} from 'node:crypto';
import type {Sql,Row} from './ports.ts';
import type {AudioRuntime} from './audio-runtime.ts';
import {audioTariff} from './audio-tariff.ts';
import {reserveAudio} from './audio-billing.ts';
import {settleAiCall,releaseAiCall} from './ai-wallet.ts';
import {ensure,uuid,DomainError} from './errors.ts';
type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>};
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export class TutorSpeech {
 private access:Access;private runtime?:AudioRuntime;
 constructor(access:Access,runtime?:AudioRuntime){this.access=access;this.runtime=runtime;}
 private async message(q:Sql,actor:string,id:string){const m=await one(q,"SELECT m.*,s.child_id FROM word_tutor_messages m JOIN word_tutor_sessions s ON s.id=m.session_id WHERE m.id=$1 AND m.role='assistant'",[uuid(id)]);ensure(m,404,'TUTOR_MESSAGE_NOT_FOUND');await this.access.child(q,actor,m.child_id);ensure(await one(q,'SELECT id FROM word_tutor_messages WHERE id=$1',[id]),404,'TUTOR_MESSAGE_NOT_FOUND');return m;}
 async create(actor:string,id:string,accent:'en-GB'|'en-US',voiceId:string){
  const runtime=this.runtime;ensure(runtime?.synthesize,503,'AUDIO_NOT_CONFIGURED');ensure(runtime.voices.some(v=>v.id===voiceId&&v.accent===accent),422,'VOICE_ACCENT_UNAVAILABLE');
  const profileKey=createHash('sha256').update(JSON.stringify([runtime.profile,'tutor-zh-en-v1'])).digest('hex');
  const initial=await this.access.tx(async q=>{const m=await this.message(q,actor,id);ensure(m.content.length<=1000,422,'TUTOR_AUDIO_TOO_LONG');
   let a=await one(q,'SELECT * FROM word_tutor_audio WHERE message_id=$1 AND voice_id=$2 AND accent=$3 AND profile_key=$4 FOR UPDATE',[id,voiceId,accent,profileKey]);
   if(a?.state==='succeeded')return {ready:true,id:a.id};
   if(a?.state==='running'){ensure(Date.now()-new Date(a.updated_at).getTime()>600000,409,'TUTOR_AUDIO_GENERATING');if(a.billing_id)await releaseAiCall(q,a.billing_id,'AUDIO_REQUEST_EXPIRED',true);await q.query("UPDATE word_tutor_audio SET state='failed',updated_at=now() WHERE id=$1",[a.id]);}
   if(!a)a=await one(q,"INSERT INTO word_tutor_audio(message_id,voice_id,accent,profile_key,state) VALUES($1,$2,$3,$4,'running') RETURNING *",[id,voiceId,accent,profileKey]);
   else await q.query("UPDATE word_tutor_audio SET state='running',updated_at=now() WHERE id=$1",[a.id]);
   const tariff=audioTariff(String(runtime.profile.model),runtime.pricePer10000Characters),billing=await reserveAudio(q,actor,m.child_id,a.id,m.content,tariff),attempt=randomUUID();await q.query('UPDATE word_tutor_audio SET billing_id=$2,attempt_id=$3 WHERE id=$1',[a.id,billing,attempt]);return {ready:false,id:a.id,billing,attempt,text:m.content};
  });
  if(initial.ready)return {id:initial.id,resource_path:`/word-tutor-audio/${initial.id}/content`};
  try{const result=await runtime.synthesize!({text:initial.text!,accent,voiceId,rate:1,languageHints:['zh','en']});const bytes=Buffer.from(result.bytes);
   ensure(bytes.length>=3&&bytes.length<=2097152&&(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255&&(bytes[1]&224)===224),502,'INVALID_AUDIO_RESPONSE');
   return await this.access.tx(async q=>{await this.message(q,actor,id);const row=await one(q,'SELECT * FROM word_tutor_audio WHERE id=$1 FOR UPDATE',[initial.id]);ensure(row?.state==='running'&&row.billing_id===initial.billing&&row.attempt_id===initial.attempt,409,'AUDIO_REQUEST_EXPIRED');
    ensure(await one(q,"UPDATE ai_calls SET state='ready',updated_at=now() WHERE id=$1 AND state='running' RETURNING id",[initial.billing]),409,'AUDIO_REQUEST_EXPIRED');await settleAiCall(q,initial.billing!);await q.query("UPDATE word_tutor_audio SET content=$2,state='succeeded',updated_at=now() WHERE id=$1",[initial.id,bytes]);return {id:initial.id,resource_path:`/word-tutor-audio/${initial.id}/content`};});
  }catch(e){await this.access.tx(async q=>{const row=await one(q,'SELECT state,attempt_id FROM word_tutor_audio WHERE id=$1 FOR UPDATE',[initial.id]);if(!row||row.state==='running'&&row.attempt_id===initial.attempt){await releaseAiCall(q,initial.billing!,'TUTOR_AUDIO_FAILED',true);await q.query("UPDATE word_tutor_audio SET state='failed',updated_at=now() WHERE id=$1 AND state='running' AND attempt_id=$2",[initial.id,initial.attempt]);}});throw e instanceof DomainError?e:new DomainError(502,'TUTOR_AUDIO_FAILED');}
 }
 async content(actor:string,id:string){return this.access.tx(async q=>{const a=await one(q,'SELECT * FROM word_tutor_audio WHERE id=$1',[uuid(id)]);ensure(a,404,'AUDIO_RESOURCE_NOT_FOUND');await this.message(q,actor,a.message_id);ensure(a.state==='succeeded'&&a.content,409,'AUDIO_NOT_READY');return Buffer.from(a.content);});}
}
