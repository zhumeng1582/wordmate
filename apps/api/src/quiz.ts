import {randomInt,randomUUID} from 'node:crypto';
import type {Sql,Row} from './ports.ts';
import {ensure,integer,uuid} from './errors.ts';
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export function grade(correct:number,total:number){ensure(Number.isInteger(total)&&total>0&&Number.isInteger(correct)&&correct>=0&&correct<=total,422,'INVALID_SCORE');return correct*100>=total*90?'excellent':correct*100>=total*80?'good':correct*100>=total*60?'pass':'needs_work';}
function shuffle<T>(items:T[]):T[]{const out=[...items];for(let i=out.length-1;i>0;i--){const j=randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
const monthText=(v:any)=>v instanceof Date?`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`:String(v).slice(0,7);
const wordSnapshot=(w:Row)=>({id:w.id,lemma:w.lemma,part_of_speech:w.part_of_speech,sense_key:w.sense_key,meaning_zh:w.meaning_zh,version:w.version,dictionary_source:w.dictionary_source});
export interface QuizAccess {
 tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;
 write(actor:string,key:string,op:string,payload:any,scope:(q:Sql)=>Promise<any>,fn:(q:Sql,s:any)=>Promise<any>):Promise<any>;
 child(q:Sql,actor:string,id:string):Promise<Row>;
 now():Date; day(q:Sql,c:Row):Promise<string>;
}
export interface QuizBuilder {build(word:Row):{prompt:string;options:{id:string;text:string}[];correctId:string}}
// Explicit local fixture, never used as a production dictionary/question supplier.
export class FixtureQuizBuilder implements QuizBuilder {
 build(w:Row){
  const known:Record<string,string>={apple:'苹果',airport:'机场',luggage:'行李',delay:'延迟',book:'书',read:'阅读',cat:'猫',dog:'狗',school:'学校',travel:'旅行'};
  ensure(w.dictionary_source==='development-fixture'&&known[w.lemma]===w.meaning_zh,503,'QUIZ_QUESTION_PROVIDER_REQUIRED');
  const correctId=randomUUID();const distractors=shuffle(Object.values(known).filter(v=>v!==w.meaning_zh)).slice(0,3);
  return {prompt:`“${w.lemma}”的中文意思是？`,correctId,options:shuffle([{id:correctId,text:w.meaning_zh},...distractors.map(text=>({id:randomUUID(),text}))])};
 }
}
export class MonthlyQuizzes {
 private a:QuizAccess;constructor(a:QuizAccess){this.a=a;}
 private async scope(q:Sql,actor:string,id:string){const initial=await one(q,'SELECT child_id FROM monthly_quizzes WHERE id=$1',[uuid(id)]);ensure(initial,404,'QUIZ_NOT_FOUND');const child=await this.a.child(q,actor,initial.child_id);const quiz=await one(q,'SELECT * FROM monthly_quizzes WHERE id=$1 FOR UPDATE',[id]);return {child,quiz};}
 private async month(q:Sql,c:Row,value:unknown){ensure(typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01',422,'INVALID_MONTH');ensure(value<=(await this.a.day(q,c)).slice(0,7),422,'FUTURE_MONTH');return value;}
 private async candidates(q:Sql,child:string,month:string){return (await q.query(`SELECT w.* FROM child_words w WHERE w.child_id=$1 AND EXISTS(SELECT 1 FROM daily_word_activity d WHERE d.child_id=w.child_id AND d.child_word_id=w.id AND d.local_date >= $2::date AND d.local_date < ($2::date + interval '1 month')) ORDER BY w.id`,[child,month+'-01'])).rows;}
 private result(r:Row){if(r.status!=='submitted')return null;return {quiz_id:r.id,month:monthText(r.month),mode:r.mode,eligible_count:r.eligible_count,total_count:r.total_count,correct_count:r.correct_count,wrong_count:r.total_count-r.correct_count-r.unanswered_count,unanswered_count:r.unanswered_count,score:Math.round(r.correct_count*1000/r.total_count)/10,grade:r.grade,coverage_percent:Math.round(r.total_count*1000/r.eligible_count)/10,submitted_at:r.submitted_at,mistake_count:r.total_count-r.correct_count};}
 private async dto(q:Sql,r:Row){const count=await one(q,'SELECT count(*)::int n FROM monthly_quiz_items WHERE quiz_id=$1 AND selected_option_id IS NOT NULL',[r.id]);const job=await one(q,"SELECT id FROM generation_jobs WHERE child_id=$1 AND kind='quiz_prepare' AND dedupe_key=$2",[r.child_id,`quiz:${r.id}`]);return {id:r.id,child_id:r.child_id,month:monthText(r.month),mode:r.mode,eligible_count:r.eligible_count,excluded_count:r.excluded_count,total_count:r.total_count,answered_count:count.n,status:r.status,version:r.version,created_at:r.created_at,job_id:job.id,result:this.result(r)};}
 async preview(actor:string,child:string,month:unknown){return this.a.tx(async q=>{const c=await this.a.child(q,actor,child),m=await this.month(q,c,month),all=await this.candidates(q,child,m),active=await one(q,"SELECT id FROM monthly_quizzes WHERE child_id=$1 AND status IN ('preparing','ready','in_progress')",[child]);return {month:m,eligible_count:all.filter(w=>!w.archived_at).length,excluded_count:all.filter(w=>w.archived_at).length,sample_sizes:[10,20,30,50],active_quiz_id:active?.id??null};});}
 async create(actor:string,key:string,child:string,b:any){return this.a.write(actor,key,`quiz:create:${child}`,b,q=>this.a.child(q,actor,child),async(q,c)=>{
  const m=await this.month(q,c,b.month);ensure(['sample','full'].includes(b.mode),422,'INVALID_QUIZ_MODE');ensure(b.mode==='sample'?[10,20,30,50].includes(b.sample_count):b.sample_count===undefined,422,'INVALID_SAMPLE_COUNT');
  ensure(!await one(q,"SELECT 1 FROM monthly_quizzes WHERE child_id=$1 AND status IN ('preparing','ready','in_progress')",[child]),409,'ACTIVE_QUIZ_EXISTS');
  const used=await one(q,`SELECT count(*)::int n FROM monthly_quizzes WHERE child_id=$1 AND (created_at AT TIME ZONE $2)::date=($3::timestamptz AT TIME ZONE $2)::date`,[child,c.timezone,this.a.now()]);ensure(used.n<5,429,'QUIZ_DAILY_LIMIT');
  const all=await this.candidates(q,child,m),eligible=all.filter(w=>!w.archived_at);ensure(eligible.length>0,422,'NO_STUDIED_WORDS');ensure(eligible.length<=10000,422,'QUIZ_TOO_LARGE');
  const chosen=shuffle(eligible).slice(0,b.mode==='full'?eligible.length:Math.min(b.sample_count,eligible.length));
  const r=await one(q,`INSERT INTO monthly_quizzes(child_id,month,timezone_snapshot,mode,requested_count,candidate_word_ids,eligible_count,excluded_count,total_count,grading_rule_snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[child,m+'-01',c.timezone,b.mode,b.mode==='sample'?b.sample_count:null,JSON.stringify(eligible.map(w=>w.id)),eligible.length,all.length-eligible.length,chosen.length,JSON.stringify({excellent:90,good:80,pass:60,needs_work:0,unanswered:'incorrect',version:1}),actor]);
  for(let i=0;i<chosen.length;i++)await q.query('INSERT INTO monthly_quiz_items(quiz_id,child_id,child_word_id,ordinal,word_snapshot) VALUES($1,$2,$3,$4,$5)',[r.id,child,chosen[i].id,i+1,JSON.stringify(wordSnapshot(chosen[i]))]);
  await q.query("INSERT INTO generation_jobs(child_id,requested_by,kind,dedupe_key,payload) VALUES($1,$2,'quiz_prepare',$3,$4)",[child,actor,`quiz:${r.id}`,JSON.stringify({quiz_id:r.id})]);return this.dto(q,r);
 });}
 // Deterministic local work occurs fully inside one DB transaction; a crash rolls back the whole preparation.
 // No network calls under locks. A remote provider must use an external leased worker before production.
 async prepare(builder?:QuizBuilder){
  const pending=await this.a.tx(q=>q.query("SELECT id,child_id FROM monthly_quizzes WHERE status='preparing' ORDER BY created_at LIMIT 5"));
  for(const pendingQuiz of pending.rows)await this.a.tx(async q=>{
   const c0=await one(q,'SELECT family_id FROM children WHERE id=$1',[pendingQuiz.child_id]);if(!c0)return;
   const family=await one(q,"SELECT * FROM families WHERE id=$1 FOR UPDATE",[c0.family_id]);const c=await one(q,'SELECT * FROM children WHERE id=$1 FOR UPDATE',[pendingQuiz.child_id]);
   const r=await one(q,'SELECT * FROM monthly_quizzes WHERE id=$1 FOR UPDATE',[pendingQuiz.id]);if(!r||r.status!=='preparing')return;
   const job=await one(q,"SELECT * FROM generation_jobs WHERE child_id=$1 AND kind='quiz_prepare' AND dedupe_key=$2 FOR UPDATE",[r.child_id,`quiz:${r.id}`]);
   let prepared:{item:Row;question:ReturnType<QuizBuilder['build']>}[]=[];let failure:string|null=null;
   if(!family||family.status!=='active'||c.archived_at)failure='QUIZ_TARGET_UNAVAILABLE';
   else if(!builder)failure='QUIZ_QUESTION_PROVIDER_REQUIRED';
   else{try{const items=(await q.query('SELECT * FROM monthly_quiz_items WHERE quiz_id=$1 ORDER BY ordinal',[r.id])).rows;ensure(items.length===r.total_count,409,'QUIZ_INCOMPLETE');prepared=items.map(item=>{const question=builder.build(item.word_snapshot);ensure(question.prompt&&question.options.length===4&&new Set(question.options.map(o=>o.id)).size===4&&new Set(question.options.map(o=>o.text.trim())).size===4&&question.options.some(o=>o.id===question.correctId&&o.text===item.word_snapshot.meaning_zh),422,'QUIZ_INVALID_OPTIONS');return {item,question};});}catch{failure='QUIZ_QUESTION_PREPARATION_FAILED';}}
   if(failure){await q.query("UPDATE monthly_quizzes SET status='failed',version=version+1 WHERE id=$1",[r.id]);await q.query("UPDATE generation_jobs SET status='failed',attempts=attempts+1,error_code=$2,updated_at=now() WHERE id=$1",[job.id,failure]);return;}
   for(const {item,question} of prepared)await q.query('UPDATE monthly_quiz_items SET prompt_snapshot=$2,options_snapshot=$3,correct_option_id=$4 WHERE id=$1',[item.id,question.prompt,JSON.stringify(question.options),question.correctId]);
   await q.query("UPDATE monthly_quizzes SET status='ready',version=version+1 WHERE id=$1",[r.id]);await q.query("UPDATE generation_jobs SET status='succeeded',attempts=attempts+1,result=$2,updated_at=now() WHERE id=$1",[job.id,JSON.stringify({quiz_id:r.id})]);
  });
 }
 async get(actor:string,id:string){return this.a.tx(async q=>this.dto(q,(await this.scope(q,actor,id)).quiz));}
 async list(actor:string,child:string,query:any){return this.a.tx(async q=>{const c=await this.a.child(q,actor,child);const limit=integer(Number(query.limit??20),1,100),month=query.month?await this.month(q,c,query.month):null;
  let boundary:Row|undefined;if(query.cursor){boundary=await one(q,'SELECT created_at,id FROM monthly_quizzes WHERE id=$1 AND child_id=$2',[uuid(query.cursor),child]);ensure(boundary,422,'INVALID_CURSOR');}
  const rows=(await q.query(`SELECT * FROM monthly_quizzes WHERE child_id=$1 AND ($2::date IS NULL OR month=$2::date) AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,[child,month?month+'-01':null,boundary?.created_at??null,boundary?.id??null,limit+1])).rows;
  return {items:await Promise.all(rows.slice(0,limit).map(r=>this.dto(q,r))),next_cursor:rows.length>limit?rows[limit-1].id:null};
 });}
 private async lease(q:Sql,actor:string,r:Row,b:any){const s=await one(q,'SELECT * FROM study_sessions WHERE id=$1 AND child_id=$2',[uuid(b.session_id),r.child_id]);ensure(s&&s.actor_user_id===actor&&s.quiz_id===r.id&&s.status==='active'&&new Date(s.expires_at)>this.a.now()&&s.lease_generation===integer(b.lease_generation),409,'SESSION_EXPIRED');return s;}
 async resume(actor:string,key:string,id:string,b:any,takeover=false){return this.a.write(actor,key,`quiz:${takeover?'takeover':'resume'}:${id}`,b,q=>this.scope(q,actor,id),async(q,{quiz:r})=>{
  ensure(['ready','in_progress'].includes(r.status),409,'QUIZ_NOT_READY');ensure(r.version===integer(b.expected_version),409,'QUIZ_VERSION_CONFLICT');const now=this.a.now();
  await q.query("UPDATE study_sessions SET status='expired',ended_at=$2 WHERE child_id=$1 AND status='active' AND expires_at<=$2",[r.child_id,now]);
  let s:Row|undefined=await one(q,"SELECT * FROM study_sessions WHERE child_id=$1 AND status='active'",[r.child_id]);let generation=1;
  if(takeover){ensure(b.confirmed===true&&s&&s.id===uuid(b.expected_session_id)&&s.quiz_id===id,409,'SESSION_CHANGED');generation=s.lease_generation+1;await q.query("UPDATE study_sessions SET status='taken_over',ended_at=$2 WHERE id=$1",[s.id,now]);s=undefined;}
  if(s)ensure(s.actor_user_id===actor&&s.quiz_id===id,409,'CHILD_BUSY');
  else s=await one(q,"INSERT INTO study_sessions(child_id,actor_user_id,started_at,expires_at,purpose,review_source,quiz_id,lease_generation) VALUES($1,$2,$3,$4,'quiz','quiz',$5,$6) RETURNING *",[r.child_id,actor,now,new Date(now.getTime()+120000),id,generation]);
  r=await one(q,"UPDATE monthly_quizzes SET status='in_progress',started_at=coalesce(started_at,$2),version=version+1 WHERE id=$1 RETURNING *",[id,now]);
  return {quiz:await this.dto(q,r),session:{id:s.id,child_id:r.child_id,actor:await one(q,'SELECT id,display_name FROM users WHERE id=$1',[actor]),purpose:'quiz',source:'quiz',quiz_id:id,expires_at:s.expires_at,lease_generation:s.lease_generation,status:s.status}};
 });}
 private item(r:Row){return {id:r.id,ordinal:r.ordinal,prompt:r.prompt_snapshot,options:r.options_snapshot,selected_option_id:r.selected_option_id,answer_version:r.answer_version,flagged:r.flagged};}
 async items(actor:string,id:string,query:any,kind:'items'|'results'|'mistakes'='items'){return this.a.tx(async q=>{
  const {quiz:r}=await this.scope(q,actor,id);ensure(kind==='items'?['ready','in_progress','submitted'].includes(r.status):r.status==='submitted',409,kind==='items'?'QUIZ_NOT_READY':'QUIZ_NOT_SUBMITTED');
  const limit=integer(Number(query.limit??50),1,100),after=query.cursor?integer(Number(query.cursor),0,10000):0;
  const rows=(await q.query(`SELECT * FROM monthly_quiz_items WHERE quiz_id=$1 AND ordinal>$2 ${kind==='mistakes'?'AND is_correct=false':''} ORDER BY ordinal LIMIT $3`,[id,after,limit+1])).rows;
  return {items:rows.slice(0,limit).map(i=>kind==='items'?this.item(i):{item:this.item(i),word:Object.fromEntries(['lemma','part_of_speech','meaning_zh','sense_key','version'].map(k=>[k,i.word_snapshot[k]])),correct_option_id:i.correct_option_id,is_correct:i.is_correct,reason:i.selected_option_id===null?'unanswered':i.is_correct?'correct':'incorrect'}),next_cursor:rows.length>limit?String(rows[limit-1].ordinal):null};
 });}
 async answer(actor:string,key:string,id:string,itemId:string,b:any){return this.a.write(actor,key,`quiz:answer:${id}:${itemId}`,b,q=>this.scope(q,actor,id),async(q,{quiz:r})=>{
  ensure(r.status==='in_progress',409,'QUIZ_NOT_IN_PROGRESS');await this.lease(q,actor,r,b);const i=await one(q,'SELECT * FROM monthly_quiz_items WHERE id=$1 AND quiz_id=$2 FOR UPDATE',[uuid(itemId),id]);ensure(i,404,'QUIZ_ITEM_NOT_FOUND');ensure(i.answer_version===integer(b.expected_version),409,'ANSWER_VERSION_CONFLICT');
  ensure('selected_option_id'in b||'flagged'in b,422,'EMPTY_ANSWER');const selected='selected_option_id'in b?b.selected_option_id:i.selected_option_id;ensure(selected===null||i.options_snapshot.some((o:any)=>o.id===selected),422,'INVALID_OPTION');if('flagged'in b)ensure(typeof b.flagged==='boolean',422,'INVALID_FLAG');
  const updated=await one(q,'UPDATE monthly_quiz_items SET selected_option_id=$2,flagged=$3,answer_version=answer_version+1,answered_at=$4 WHERE id=$1 RETURNING *',[itemId,selected,b.flagged??i.flagged,selected===null?null:this.a.now()]);
  const v=await one(q,'UPDATE monthly_quizzes SET version=version+1 WHERE id=$1 RETURNING version',[id]);const answered=await one(q,'SELECT count(*)::int n FROM monthly_quiz_items WHERE quiz_id=$1 AND selected_option_id IS NOT NULL',[id]);return {item:this.item(updated),quiz_version:v.version,answered_count:answered.n};
 });}
 async submit(actor:string,key:string,id:string,b:any){return this.a.write(actor,key,`quiz:submit:${id}`,b,q=>this.scope(q,actor,id),async(q,{child:c,quiz:r})=>{
  if(r.status==='submitted')return this.result(r);ensure(r.status==='in_progress',409,'QUIZ_NOT_IN_PROGRESS');ensure(r.version===integer(b.expected_version),409,'QUIZ_VERSION_CONFLICT');const s=await this.lease(q,actor,r,b);
  const items=(await q.query('SELECT * FROM monthly_quiz_items WHERE quiz_id=$1 ORDER BY ordinal',[id])).rows;ensure(items.length===r.total_count&&items.every(i=>i.correct_option_id&&i.options_snapshot?.length===4),409,'QUIZ_INCOMPLETE');const unanswered=items.filter(i=>i.selected_option_id===null).length;ensure(!unanswered||b.confirm_unanswered===true,422,'CONFIRM_UNANSWERED');
  const correct=items.filter(i=>i.selected_option_id===i.correct_option_id).length,now=this.a.now(),day=await this.a.day(q,{...c,timezone:r.timezone_snapshot});
  for(const i of items){const right=i.selected_option_id===i.correct_option_id;await q.query('UPDATE monthly_quiz_items SET is_correct=$2 WHERE id=$1',[i.id,right]);if(!right)await q.query("INSERT INTO mistake_events(child_id,child_word_id,source,quiz_item_id,reason,occurred_at,local_date,timezone_snapshot,word_snapshot,answer_snapshot) VALUES($1,$2,'monthly_quiz',$3,$4,$5,$6,$7,$8,$9)",[r.child_id,i.child_word_id,i.id,i.selected_option_id===null?'unanswered':'incorrect',now,day,r.timezone_snapshot,JSON.stringify(i.word_snapshot),JSON.stringify({selected_option_id:i.selected_option_id,correct_option_id:i.correct_option_id,options:i.options_snapshot})]);}
  r=await one(q,"UPDATE monthly_quizzes SET status='submitted',version=version+1,correct_count=$2,unanswered_count=$3,grade=$4,submitted_at=$5,submitted_local_date=$6 WHERE id=$1 RETURNING *",[id,correct,unanswered,grade(correct,r.total_count),now,day]);
  await q.query("UPDATE study_sessions SET status='ended',ended_at=$2 WHERE id=$1",[s.id,now]);return this.result(r);
 });}
 async abandon(actor:string,key:string,id:string,b:any){return this.a.write(actor,key,`quiz:abandon:${id}`,b,q=>this.scope(q,actor,id),async(q,{quiz:r})=>{
  ensure(['preparing','ready','failed','in_progress'].includes(r.status),409,'QUIZ_CANNOT_ABANDON');ensure(r.version===integer(b.expected_version),409,'QUIZ_VERSION_CONFLICT');
  if(r.status==='in_progress'){const s=await one(q,"SELECT * FROM study_sessions WHERE quiz_id=$1 AND status='active' AND expires_at>$2",[id,this.a.now()]);ensure(s?.actor_user_id===actor,409,'RESUME_QUIZ_FIRST');}
  await q.query("UPDATE study_sessions SET status='ended',ended_at=$2 WHERE quiz_id=$1 AND status='active'",[id,this.a.now()]);await q.query("UPDATE generation_jobs SET status='cancelled' WHERE child_id=$1 AND kind='quiz_prepare' AND dedupe_key=$2 AND status IN ('queued','running','failed')",[r.child_id,`quiz:${id}`]);r=await one(q,"UPDATE monthly_quizzes SET status='abandoned',version=version+1 WHERE id=$1 RETURNING *",[id]);return this.dto(q,r);
 });}
}
