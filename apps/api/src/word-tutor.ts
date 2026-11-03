import {createHash} from 'node:crypto';
import type {Sql,Row} from './ports.ts';
import {ensure,uuid} from './errors.ts';
import type {AiAccounts} from './ai-accounts.ts';

type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>};
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
const senseKey=(w:Row)=>createHash('sha256').update(JSON.stringify([w.lemma.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' '),w.part_of_speech.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' '),w.meaning_zh.normalize('NFKC').trim().replace(/\s+/g,' ')])).digest('hex');
export class WordTutor {
 private access:Access;private accounts?:AiAccounts;
 constructor(access:Access,accounts?:AiAccounts){this.access=access;this.accounts=accounts;}
 private async session(q:Sql,actor:string,id:string){const s=await one(q,'SELECT * FROM word_tutor_sessions WHERE id=$1',[uuid(id)]);ensure(s,404,'TUTOR_SESSION_NOT_FOUND');await this.access.child(q,actor,s.child_id);const current=await one(q,'SELECT * FROM word_tutor_sessions WHERE id=$1',[id]);ensure(current,404,'TUTOR_SESSION_NOT_FOUND');return current;}
 async open(actor:string,child:string,wordId:string){return this.access.tx(async q=>{
  await this.access.child(q,actor,child);
  const w=await one(q,"SELECT w.lemma,w.part_of_speech,w.meaning_zh,(SELECT s.text_en FROM sentences s JOIN sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=w.id AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1) example_en,(SELECT s.translation_zh FROM sentences s JOIN sentence_targets t ON t.sentence_id=s.id WHERE t.child_word_id=w.id AND s.status='validated' ORDER BY s.created_at DESC,s.id DESC LIMIT 1) example_zh FROM child_words w WHERE w.id=$1 AND w.child_id=$2 AND w.archived_at IS NULL",[uuid(wordId),child]);ensure(w,404,'WORD_NOT_FOUND');
  const key=senseKey(w);let s=await one(q,'SELECT * FROM word_tutor_sessions WHERE child_id=$1 AND sense_key=$2 ORDER BY updated_at DESC,id DESC LIMIT 1',[child,key]);
  if(!s)s=await one(q,'INSERT INTO word_tutor_sessions(child_id,sense_key,lemma,part_of_speech,meaning_zh,example_en,example_zh) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[child,key,w.lemma,w.part_of_speech,w.meaning_zh,w.example_en??'',w.example_zh??'']);
  return this.dto(q,s);
 });}
 private async dto(q:Sql,s:Row){return {id:s.id,child_id:s.child_id,lemma:s.lemma,part_of_speech:s.part_of_speech,meaning_zh:s.meaning_zh,created_at:s.created_at,updated_at:s.updated_at,messages:(await q.query("SELECT m.id,m.role,m.content,m.sources,m.created_at,i.id AS image_id FROM word_tutor_messages m LEFT JOIN word_tutor_images i ON i.message_id=m.id AND i.state='succeeded' WHERE m.session_id=$1 ORDER BY m.ordinal LIMIT 500",[s.id])).rows};}
 async answer(actor:string,id:string,turnId:string,question?:string){
  uuid(turnId);ensure(this.accounts,503,'AI_NOT_CONFIGURED');
  if(question!==undefined)ensure(typeof question==='string'&&question.trim().length>0&&question.length<=1000&&!/[\u0000-\u001f\u007f]/.test(question),422,'INVALID_TEXT');
  const initial=await this.access.tx(async q=>{
   const session=await this.session(q,actor,id);await q.query('SELECT id FROM word_tutor_sessions WHERE id=$1 FOR UPDATE',[id]);
   await q.query("UPDATE word_tutor_turns SET status='failed',updated_at=now() WHERE session_id=$1 AND status='running' AND created_at<now()-interval '10 minutes'",[id]);
   const existing=await one(q,'SELECT * FROM word_tutor_turns WHERE id=$1',[turnId]);
   if(existing){ensure(existing.session_id===id&&existing.mode==='chat'&&existing.question===(question??null),409,'IDEMPOTENCY_CONFLICT');if(existing.status==='succeeded')return {done:true,session:await this.dto(q,session)};ensure(existing.status!=='running',409,'TUTOR_GENERATING');ensure(false,409,'TUTOR_RETRY_NEW_REQUEST');}
   ensure(!await one(q,"SELECT id FROM word_tutor_turns WHERE session_id=$1 AND status='running'",[id]),409,'TUTOR_GENERATING');
   const history=(await q.query('SELECT role,content FROM word_tutor_messages WHERE session_id=$1 ORDER BY ordinal DESC LIMIT 12',[id])).rows.reverse().map(r=>({role:r.role,text:r.content}));
   ensure(question!==undefined||history.length===0,409,'TUTOR_ALREADY_STARTED');ensure(question===undefined||history.length>0,409,'TUTOR_NOT_STARTED');
   const child=await this.access.child(q,actor,session.child_id);
   await q.query("INSERT INTO word_tutor_turns(id,session_id,question,status) VALUES($1,$2,$3,'running')",[turnId,id,question??null]);
   const generate=await this.accounts!.tutor(q,actor,`word-tutor:${turnId}`,child.family_id);
   return {done:false,session,history,generate};
  });
  if(initial.done)return initial.session;
  let billingId:string|undefined;
  try{
   const s=initial.session as Row,result=await initial.generate!({lemma:s.lemma,part_of_speech:s.part_of_speech,meaning_zh:s.meaning_zh,example_en:s.example_en,example_zh:s.example_zh},initial.history!,question);billingId=result.id;
   return await this.access.tx(async q=>{
    const current=await this.session(q,actor,id);const turn=await one(q,"SELECT * FROM word_tutor_turns WHERE id=$1 FOR UPDATE",[turnId]);ensure(turn?.status==='running',409,'TUTOR_GENERATING');
    if(question!==undefined)await q.query("INSERT INTO word_tutor_messages(session_id,role,content) VALUES($1,'user',$2)",[id,question.trim()]);
    await q.query("INSERT INTO word_tutor_messages(session_id,role,content) VALUES($1,'assistant',$2)",[id,(result.data as any).data.answer]);
    await this.accounts!.settle(q,billingId!);await q.query("UPDATE word_tutor_turns SET status='succeeded',updated_at=now() WHERE id=$1",[turnId]);await q.query('UPDATE word_tutor_sessions SET updated_at=now() WHERE id=$1',[id]);return this.dto(q,current);
   });
  }catch(error){if(billingId)await this.accounts!.failId(billingId);await this.access.tx(q=>q.query("UPDATE word_tutor_turns SET status='failed',updated_at=now() WHERE id=$1 AND status='running'",[turnId]));throw error;}
 }
 async get(actor:string,id:string){return this.access.tx(async q=>this.dto(q,await this.session(q,actor,id)));}
 async list(actor:string,child:string){return this.access.tx(async q=>{await this.access.child(q,actor,child);return {items:(await q.query('SELECT id,lemma,part_of_speech,meaning_zh,created_at,updated_at FROM word_tutor_sessions WHERE child_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100',[child])).rows};});}
 async delete(actor:string,id:string){return this.access.tx(async q=>{await this.session(q,actor,id);await q.query('DELETE FROM word_tutor_sessions WHERE id=$1',[id]);return {id,deleted:true};});}
}
