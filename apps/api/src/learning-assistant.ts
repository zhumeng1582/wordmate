import {saveTutorSuggestions,tutorMessages} from './tutor-suggestions.ts';
import type {Sql,Row} from './ports.ts';
import type {AiAccounts} from './ai-accounts.ts';
import {ensure,uuid} from './errors.ts';
import {validDate} from './history.ts';
import {displayWordSenses} from './word-senses.ts';
type Access={tx<T>(fn:(q:Sql)=>Promise<T>):Promise<T>;child(q:Sql,actor:string,id:string):Promise<Row>;day(q:Sql,c:Row):Promise<string>};
const one=async(q:Sql,s:string,p:any[]=[]) => (await q.query(s,p)).rows[0];
export function assistantRange(from:string,to:string,today:string){validDate(from);validDate(to);ensure(from<=to&&to<=today&&(Date.parse(to)-Date.parse(from))/86400000<90,422,'INVALID_DATE_RANGE');return {date_from:from,date_to:to};}
export function articleWords(article:any,words:any[]){const text=article.paragraphs.map((p:any)=>p.en).join(' ');return words.filter(w=>new RegExp(`(^|[^a-z])${w.lemma.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z])`,'i').test(text));}
const publicQuiz=(state:any)=>state.quiz?{id:state.quiz.id,index:state.quiz.index,total:state.quiz.questions.length,score:state.quiz.score,question:state.quiz.index<state.quiz.questions.length?{question:state.quiz.questions[state.quiz.index].question,options:state.quiz.questions[state.quiz.index].options}:null}:null;
export class LearningAssistant{
 private access:Access;private accounts?:AiAccounts;
 constructor(access:Access,accounts?:AiAccounts){this.access=access;this.accounts=accounts;}
 private async session(q:Sql,actor:string,id:string,lock=false){const s=await one(q,`SELECT * FROM learning_assistant_sessions WHERE id=$1${lock?' FOR UPDATE':''}`,[uuid(id)]);ensure(s,404,'TUTOR_SESSION_NOT_FOUND');const child=await this.access.child(q,actor,s.child_id);return {s,child};}
 private async dto(q:Sql,s:Row){return {id:s.id,child_id:s.child_id,range:s.state.range??null,quiz:publicQuiz(s.state),messages:await tutorMessages(q,'assistant',(await q.query('SELECT id,role,content,payload,created_at FROM (SELECT * FROM learning_assistant_messages WHERE session_id=$1 ORDER BY ordinal DESC LIMIT 100) m ORDER BY ordinal',[s.id])).rows)};}
 async forTutor(actor:string,id:string){return this.access.tx(async q=>{
  const tutor=await one(q,'SELECT * FROM word_tutor_sessions WHERE id=$1',[uuid(id)]);ensure(tutor,404,'TUTOR_SESSION_NOT_FOUND');await this.access.child(q,actor,tutor.child_id);
  const history=(await q.query('SELECT role,content FROM word_tutor_messages WHERE session_id=$1 ORDER BY ordinal DESC LIMIT 12',[id])).rows.reverse();
  await q.query('INSERT INTO learning_assistant_sessions(id,tutor_session_id,child_id,state) VALUES($1,$1,$2,$3) ON CONFLICT(id) DO NOTHING',[id,tutor.child_id,JSON.stringify({context_word:{lemma:tutor.lemma,part_of_speech:tutor.part_of_speech,meaning_zh:tutor.meaning_zh},context_history:history})]);
 });}
 async open(actor:string,child:string){return this.access.tx(async q=>{await this.access.child(q,actor,child);const s=await one(q,'INSERT INTO learning_assistant_sessions(child_id) VALUES($1) RETURNING *',[uuid(child)]);return this.dto(q,s);});}
 async list(actor:string,child:string){return this.access.tx(async q=>{await this.access.child(q,actor,child);return {items:(await q.query("SELECT s.id,s.updated_at,(SELECT content FROM learning_assistant_messages WHERE session_id=s.id ORDER BY ordinal DESC LIMIT 1) last_message FROM learning_assistant_sessions s WHERE s.child_id=$1 AND s.tutor_session_id IS NULL ORDER BY s.updated_at DESC LIMIT 50",[child])).rows};});}
 async get(actor:string,id:string){return this.access.tx(async q=>this.dto(q,(await this.session(q,actor,id)).s));}
 async delete(actor:string,id:string){return this.access.tx(async q=>{const {s}=await this.session(q,actor,id);ensure(!await one(q,"SELECT 1 FROM learning_assistant_turns WHERE session_id=$1 AND status='running'",[id]),409,'TUTOR_GENERATING');if(s.tutor_session_id)await q.query('DELETE FROM word_tutor_sessions WHERE id=$1',[s.tutor_session_id]);else await q.query('DELETE FROM learning_assistant_sessions WHERE id=$1',[id]);return {deleted:true};});}
 private async words(q:Sql,actor:string,child:string,range:any,mistakes=false){await this.access.child(q,actor,child);
  const rows=(await q.query(`SELECT w.id,w.lemma,w.part_of_speech,w.meaning_zh,to_char(max(a.local_date),'YYYY-MM-DD') last_date FROM ${mistakes?'mistake_events':'daily_word_activity'} a JOIN child_words w ON w.id=a.child_word_id AND w.child_id=a.child_id WHERE a.child_id=$1 AND a.local_date BETWEEN $2::date AND $3::date AND w.archived_at IS NULL GROUP BY w.id ORDER BY max(a.local_date) DESC,w.id LIMIT 201`,[child,range.date_from,range.date_to])).rows;
  return {words:rows.slice(0,200).map(w=>({...w,...displayWordSenses(w.part_of_speech,w.meaning_zh)})),has_more:rows.length>200};
 }
 private async finish(q:Sql,actor:string,id:string,turn:string,state:any,question:string,content:string,payload:any,bills:string[]){const {s}=await this.session(q,actor,id,true);ensure(await one(q,"SELECT id FROM learning_assistant_turns WHERE id=$1 AND session_id=$2 AND status='running' FOR UPDATE",[turn,id]),409,'TUTOR_RETRY_NEW_REQUEST');
  await q.query("INSERT INTO learning_assistant_messages(session_id,role,content) VALUES($1,'user',$2)",[id,question]);const saved=await one(q,"INSERT INTO learning_assistant_messages(session_id,role,content,payload) VALUES($1,'assistant',$2,$3) RETURNING id",[id,content,JSON.stringify(payload)]);
  await saveTutorSuggestions(q,'assistant',saved.id,payload.suggestions);
  if(s.tutor_session_id){await q.query("INSERT INTO word_tutor_messages(session_id,role,content) VALUES($1,'user',$2)",[s.tutor_session_id,question]);await q.query("INSERT INTO word_tutor_messages(id,session_id,role,content,payload) VALUES($1,$2,'assistant',$3,$4)",[saved.id,s.tutor_session_id,content,JSON.stringify(payload)]);await saveTutorSuggestions(q,'word',saved.id,payload.suggestions);await q.query('UPDATE word_tutor_sessions SET updated_at=now() WHERE id=$1',[s.tutor_session_id]);}
  for(const bill of bills)await this.accounts!.settle(q,bill);
  await q.query("UPDATE learning_assistant_turns SET status='succeeded' WHERE id=$1",[turn]);await q.query('UPDATE learning_assistant_sessions SET state=$2,updated_at=now() WHERE id=$1',[id,JSON.stringify(state)]);return this.dto(q,{...s,state});
 }
 async answer(actor:string,id:string,b:any){
  const turn=uuid(b.request_id),question=b.question;ensure(typeof question==='string'&&question.trim().length>0&&question.length<=1000,422,'INVALID_TEXT');
  const action=b.action??'auto';ensure(['auto','summary','article','rewrite','quiz','mistakes','practice','quiz_answer'].includes(action),422,'INVALID_REQUEST_BODY');
  if(b.date_from!==undefined||b.date_to!==undefined){validDate(b.date_from);validDate(b.date_to);}
  if(b.source!==undefined)ensure(['studied','mistakes'].includes(b.source),422,'INVALID_SOURCE');
  if(b.days!==undefined)ensure([1,7,30].includes(b.days),422,'INVALID_DATE_RANGE');
  if(action==='quiz_answer')ensure(Number.isInteger(b.choice)&&b.choice>=0&&b.choice<=2&&Number.isInteger(b.index)&&typeof b.quiz_id==='string',422,'INVALID_REQUEST_BODY');
  const request={question,action,days:b.days??null,choice:b.choice??null,index:b.index??null,quiz_id:b.quiz_id??null,source:b.source??null,date_from:b.date_from??null,date_to:b.date_to??null};
  const begin=await this.access.tx(async q=>{const {s,child}=await this.session(q,actor,id,true);
   const old=await one(q,'SELECT * FROM learning_assistant_turns WHERE id=$1',[turn]);if(old){ensure(old.session_id===id&&Object.keys(request).every(k=>old.request[k]===(request as any)[k]),409,'IDEMPOTENCY_CONFLICT');if(old.status==='succeeded')return {done:await this.dto(q,s)};ensure(false,409,old.status==='running'?'TUTOR_GENERATING':'TUTOR_RETRY_NEW_REQUEST');}
   // Expired requests cannot later commit; release every possible model stage.
   const stale=(await q.query("SELECT id FROM learning_assistant_turns WHERE session_id=$1 AND status='running' AND created_at<now()-interval '10 minutes'",[id])).rows;
   for(const t of stale){for(const stage of ['plan','article','quiz','reply'])await this.accounts?.releaseInTransaction(q,`learning-assistant:${t.id}:${stage}`);await q.query("UPDATE learning_assistant_turns SET status='failed' WHERE id=$1",[t.id]);}
   ensure(!await one(q,"SELECT 1 FROM learning_assistant_turns WHERE session_id=$1 AND status='running'",[id]),409,'TUTOR_GENERATING');
   ensure(Number((await one(q,'SELECT count(*)::int n FROM learning_assistant_messages WHERE session_id=$1',[id])).n)<200,429,'TUTOR_EVENT_LIMIT');
   await q.query("INSERT INTO learning_assistant_turns(id,session_id,request,status) VALUES($1,$2,$3,'running')",[turn,id,JSON.stringify(request)]);
   if(action==='quiz_answer'){
    const quiz=s.state.quiz;ensure(quiz&&quiz.id===b.quiz_id&&quiz.index===b.index&&quiz.index<quiz.questions.length,409,'STUDY_SESSION_CHANGED');const item=quiz.questions[quiz.index],correct=b.choice===item.answer;quiz.index++;if(correct)quiz.score++;
    const content=`${correct?'答对了！':'这次选得不对。'}${item.explanation}${quiz.index===quiz.questions.length?`\n本次 ${quiz.questions.length} 题，答对 ${quiz.score} 题。本次练习已保存，不改变单词掌握状态。`:''}`;
    return {done:await this.finish(q,actor,id,turn,s.state,question,content,{kind:'feedback',correct,suggestions:quiz.index===quiz.questions.length?['再讲讲刚才容易错的地方','把这篇文章写得简单一点','换一个故事继续学习']:[]},[])};
   }
   const today=await this.access.day(q,child),days=b.days??7,range=b.date_from?assistantRange(b.date_from,b.date_to,today):b.days||!s.state.range?assistantRange(new Date(Date.parse(today)-(days-1)*86400000).toISOString().slice(0,10),today,today):s.state.range;
   const history=(await q.query('SELECT role,content FROM learning_assistant_messages WHERE session_id=$1 ORDER BY ordinal DESC LIMIT 8',[id])).rows.reverse();
   return {s,child,today,range,history};
  });
  if(begin.done)return begin.done;
  const bills:string[]=[];
  try{
   let suggestions:string[]=[];
   let generate:Awaited<ReturnType<AiAccounts['learningAssistant']>>|undefined;
   const call=async(stage:'plan'|'article'|'quiz'|'reply',input:any)=>{ensure(this.accounts,503,'AI_NOT_CONFIGURED');if(!generate)generate=await this.access.tx(async q=>{await this.session(q,actor,id);return this.accounts!.learningAssistant(q,actor,`learning-assistant:${turn}`,begin.child!.family_id);});const r=await generate(stage,input);bills.push(r.id);const data=(r.data as any).data;if(stage!=='plan')suggestions=data.suggestions??[];return data;};
   const state=begin.s!.state;
   const plan=action==='auto'?await call('plan',{question,today:begin.today,range:begin.range,has_article:!!state.article,source:state.source??'studied',history:begin.history}):{action,...begin.range,source:b.source??'studied'};
   let range=assistantRange(plan.date_from,plan.date_to,begin.today!);let content='',payload:any={};
   const task=plan.action;
   if(['summary','mistakes','article','practice'].includes(task)){
    const data=await this.access.tx(q=>this.words(q,actor,begin.s!.child_id,range,['mistakes','practice'].includes(task)||plan.source==='mistakes'));state.range=range;state.words=data.words.slice(0,12);state.source=['mistakes','practice'].includes(task)||plan.source==='mistakes'?'mistakes':'studied';state.quiz=null;
    const count=data.words.length,scope=`${range.date_from} 至 ${range.date_to}`;
    content=count?`${scope}${state.source==='mistakes'?'有答错记录的':'实际学习过的'}单词${data.has_more?'超过 200':`共 ${count}`}个。${state.source==='mistakes'?'答错记录不代表目前仍未掌握。':''}`:`${scope}没有查到${state.source==='mistakes'?'答错':'学习'}记录。可以换一个时间范围，或先去学几个单词。`;
    suggestions=count?['用这些单词写一个故事','帮我挑几个词练习','解释一下这些词怎么用']:['看看最近30天学的单词','我该从哪里开始学习','介绍一下你能帮我做什么'];payload={kind:'summary',range,words:data.words,has_more:data.has_more,source:state.source};
    if(task==='practice'&&count){const quiz=await call('quiz',{words:state.words,source:'mistakes',school_grade:begin.child!.school_grade,question});state.quiz={id:turn,...quiz,index:0,score:0};content+=`\n我们用其中 ${state.words.length} 个词练习，一次一道，共 3 题。`;}
    if(task==='article'&&count){const article=await call('article',{question,words:state.words,school_grade:begin.child!.school_grade});const used=articleWords(article,state.words);ensure(used.length>0,502,'GENERATED_CONTENT_REJECTED');state.article={...article,words:state.words,used_words:used,range};payload={kind:'article',...state.article};content=`根据 ${scope}的学习记录，选取 ${state.words.length} 个目标词，正文使用 ${used.length} 个。`;}
   }else if(task==='rewrite'){
    if(!state.article)content='还没有可以改写的文章，先用最近学过的单词生成一篇吧。';
    else{const article=await call('article',{question,words:state.article.words,current_article:state.article,school_grade:begin.child!.school_grade});const used=articleWords(article,state.article.words);ensure(used.length>0,502,'GENERATED_CONTENT_REJECTED');state.article={...state.article,...article,used_words:used};state.quiz=null;payload={kind:'article',...state.article};content=`已调整文章，正文使用 ${used.length} 个目标词。`;}
   }else if(task==='quiz'){
    if(!state.article)content='先生成一篇文章，再一起做阅读练习吧。';else{const quiz=await call('quiz',{article:state.article,school_grade:begin.child!.school_grade,question});state.quiz={id:turn,...quiz,index:0,score:0};content='我们一次做一道题，共 3 题。';}
   }else content=(await call('reply',{question,history:begin.history,current_word:state.context_word??null,earlier_lesson:state.context_history??[],current_question:publicQuiz(state)?.question??null,article:state.article??null,words:state.words??[],range:state.range??null})).answer;
   return await this.access.tx(q=>this.finish(q,actor,id,turn,state,question,content,{...payload,suggestions},bills));
  }catch(e){for(const bill of bills)await this.accounts!.failId(bill);await this.access.tx(q=>q.query("UPDATE learning_assistant_turns SET status='failed' WHERE id=$1 AND status='running'",[turn]));throw e;}
 }
}
