import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture,response} from './ai-fixture.ts';
import {LearningAssistantSpeech} from '../src/learning-assistant-speech.ts';
const article={title:'A little cat',paragraphs:[{en:'The cat goes to a park.',zh:'小猫去公园。'}]};
async function prepare(f:any){for(const n of ['009_child_profiles','028_word_tutor','029_tutor_learning','052_learning_assistant'])await f.pg.exec(readFileSync(`apps/api/migrations/${n}.sql`,'utf8'));}
async function seed(f:any){const w=(await f.pg.query("INSERT INTO wordmate.child_words(child_id,lemma,normalized_lemma,part_of_speech,sense_key,meaning_zh,dictionary_source) VALUES($1,'cat','cat','noun','test','猫','test') RETURNING id",[f.child.id])).rows[0];const card=(await f.pg.query("INSERT INTO wordmate.review_cards(child_id,child_word_id,scheduler_version,parameter_version) VALUES($1,$2,'test','test') RETURNING id",[f.child.id,w.id])).rows[0];await f.pg.query("INSERT INTO wordmate.daily_word_activity(child_id,child_word_id,card_id,local_date,first_review_at,was_new) VALUES($1,$2,$3,(now() AT TIME ZONE 'Asia/Shanghai')::date,now(),true)",[f.child.id,w.id,card.id]);return w;}
const req=(question:string,action:string,extra:any={})=>({request_id:randomUUID(),question,action,...extra});
test('actual learning history, article, rewrite and quiz persist without changing study progress; replay is charged once',async()=>{
 let calls=0;const f=await fixture(async(_url,init)=>{calls++;const body=JSON.parse(String(init!.body));return response(body.response_format.json_schema.name==='learning_quiz'?{questions:Array.from({length:3},()=>({question:'Where does the cat go?',options:['A park','A shop','A school'],answer:0,explanation:'文章中说小猫去了公园。'}))}:article);});
 try{await prepare(f);const w=await seed(f),s=await f.core.assistant.open(f.dad,f.child.id);
 await assert.rejects(f.core.assistant.get(f.mom,s.id),{code:'FAMILY_NOT_FOUND'});
 const summary=await f.core.assistant.answer(f.dad,s.id,req('学了什么','summary',{days:1}));assert.equal(calls,0);assert.equal(summary.messages.at(-1).payload.words[0].id,w.id);
 const r=req('写个故事','article',{days:1}),generated=await f.core.assistant.answer(f.dad,s.id,r);assert.equal(generated.messages.at(-1).payload.used_words[0].id,w.id);await f.core.assistant.answer(f.dad,s.id,r);assert.equal(calls,1);
 await assert.rejects(f.core.assistant.answer(f.dad,s.id,{...r,question:'不同请求'}),{code:'IDEMPOTENCY_CONFLICT'});
 await f.core.assistant.answer(f.dad,s.id,req('简单一点','rewrite'));assert.equal(calls,2);
 let quiz=await f.core.assistant.answer(f.dad,s.id,req('考考我','quiz'));assert.equal(calls,3);assert.equal(JSON.stringify(quiz.quiz).includes('answer'),false);
 const q=req('A park','quiz_answer',{quiz_id:quiz.quiz.id,index:0,choice:0});quiz=await f.core.assistant.answer(f.dad,s.id,q);assert.equal(quiz.quiz.index,1);assert.equal(quiz.quiz.score,1);await f.core.assistant.answer(f.dad,s.id,q);await assert.rejects(f.core.assistant.answer(f.dad,s.id,{...q,request_id:randomUUID()}),{code:'STUDY_SESSION_CHANGED'});
 for(let i=1;i<3;i++)quiz=await f.core.assistant.answer(f.dad,s.id,req('A park','quiz_answer',{quiz_id:quiz.quiz.id,index:i,choice:0}));assert.equal(quiz.quiz.question,null);assert.equal(quiz.quiz.score,3);assert.equal(calls,3);
 assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.daily_word_activity')).rows[0].n,1);
 assert.equal((await f.accounts.history(f.dad)).entries.filter((e:any)=>e.kind==='charge').length,3);assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);
 await f.core.assistant.delete(f.dad,s.id);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.learning_assistant_messages')).rows[0].n,0);
 }finally{await f.close();}
});
test('no records never falls back to added words; date limits and failed generations leave no charge',async()=>{
 const f=await fixture(async()=>response({title:'No target words',paragraphs:[{en:'A dog runs.',zh:'狗在跑。'}]}));try{await prepare(f);const s=await f.core.assistant.open(f.dad,f.child.id);let result=await f.core.assistant.answer(f.dad,s.id,req('写故事','article'));assert.match(result.messages.at(-1).content,/没有查到/);assert.equal((await f.accounts.history(f.dad)).items.length,0);
 await assert.rejects(f.core.assistant.answer(f.dad,s.id,req('查记录','summary',{days:999})),{code:'INVALID_DATE_RANGE'});
 await seed(f);await assert.rejects(f.core.assistant.answer(f.dad,s.id,req('写故事','article')),{code:'GENERATED_CONTENT_REJECTED'});assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);assert.equal((await f.accounts.history(f.dad)).entries.filter((e:any)=>e.kind==='charge').length,0);
 assert.equal((await f.core.assistant.get(f.dad,s.id)).messages.length,2);
 }finally{await f.close();}
});
test('article speech uses English only, caches within authorized session and deletes with it',async()=>{
 const f=await fixture(async()=>response(article));try{await prepare(f);await seed(f);const s=await f.core.assistant.open(f.dad,f.child.id),result=await f.core.assistant.answer(f.dad,s.id,req('故事','article'));const id=result.messages.at(-1).id,texts:string[]=[];
 const speech=new LearningAssistantSpeech({tx:f.tx,child:(q:any,a:string,c:string)=>f.core.tutorChild(q,a,c)},{profile:{model:'cosyvoice-v3-flash'},voices:[{id:'voice',accent:'en-GB'}],pricePer10000Characters:'1',synthesize:async(r:any)=>{texts.push(r.text);return {bytes:Buffer.from('ID3audio')};}} as any);
 const a=await speech.create(f.dad,id,'en-GB','voice');assert.equal((await speech.create(f.dad,id,'en-GB','voice')).id,a.id);assert.deepEqual(texts,['The cat goes to a park.']);await assert.rejects(speech.content(f.mom,a.id),{code:'FAMILY_NOT_FOUND'});assert.equal((await speech.content(f.dad,a.id)).toString(),'ID3audio');await f.core.assistant.delete(f.dad,s.id);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.learning_assistant_audio')).rows[0].n,0);
 }finally{await f.close();}
});
test('natural language plans use bounded tools and failed second stage refunds the whole turn',async()=>{
 let calls=0;const f=await fixture(async(_url,init)=>{calls++;const name=JSON.parse(String(init!.body)).response_format.json_schema.name;return response(name==='learning_plan'?{action:'article',date_from:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),date_to:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),source:'studied'}:{title:'Bad article',paragraphs:[{en:'A dog runs.',zh:'狗跑。'}]});});
 try{await prepare(f);await seed(f);const s=await f.core.assistant.open(f.dad,f.child.id);await assert.rejects(f.core.assistant.answer(f.dad,s.id,req('用今天学的词写故事','auto')),{code:'GENERATED_CONTENT_REJECTED'});assert.equal(calls,2);assert.equal((await f.accounts.overview(f.dad)).balance_micros,20000000);assert.equal((await f.accounts.overview(f.dad)).frozen_micros,0);assert.equal((await f.core.assistant.get(f.dad,s.id)).messages.length,0);
 }finally{await f.close();}
});
test('word tutor runs learning tasks in the same conversation, retains word context and cascades task state on deletion',async()=>{
 const inputs:any[]=[];const f=await fixture(async(_url,init)=>{const body=JSON.parse(String(init!.body)),input=JSON.parse(body.messages[1].content);inputs.push(input);const name=body.response_format.json_schema.name;const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});return response(name==='learning_plan'?{action:input.question.includes('故事')?'article':input.question.includes('记录')?'summary':'reply',date_from:today,date_to:today,source:'studied'}:['learning_reply','word_tutor'].includes(name)?{answer:'cat 在这里表示猫。'}:article);});
 try{await prepare(f);const w=await seed(f),s=await f.core.tutor.open(f.dad,f.child.id,w.id);await f.pg.query("INSERT INTO wordmate.word_tutor_messages(session_id,role,content) VALUES($1,'assistant','cat 是猫。')",[s.id]);
 const summary=await f.core.tutor.answer(f.dad,s.id,randomUUID(),'查最近的学习记录');assert.equal(summary.id,s.id);assert.equal(summary.messages.at(-1).payload.kind,'summary');
 const result=await f.core.tutor.answer(f.dad,s.id,randomUUID(),'用最近的单词写故事');assert.equal(result.id,s.id);assert.equal(result.messages.at(-1).payload.kind,'article');const mid=result.messages.at(-1).id;assert.equal((await f.pg.query('SELECT id FROM wordmate.learning_assistant_messages WHERE id=$1',[mid])).rows[0].id,mid);
 await f.core.tutor.answer(f.dad,s.id,randomUUID(),'这个词是什么意思');assert.equal(inputs.at(-1).word.lemma,'cat');assert(inputs.at(-1).history.some((m:any)=>m.text.includes('选取')));assert.equal((await f.core.assistant.list(f.dad,f.child.id)).items.length,0);
 await f.core.tutor.delete(f.dad,s.id);assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.learning_assistant_sessions')).rows[0].n,0);
 }finally{await f.close();}
});
test('existing general conversations adopt the native tutor message stream without losing history or duplicating sessions',async()=>{
 const f=await fixture(async()=>response(article));try{await prepare(f);await seed(f);const s=await f.core.assistant.open(f.dad,f.child.id);const before=await f.core.assistant.answer(f.dad,s.id,req('写故事','article'));await assert.rejects(f.core.tutor.adoptConversation(f.mom,s.id),{code:'FAMILY_NOT_FOUND'});
 const adopted=await f.core.tutor.adoptConversation(f.dad,s.id);assert.equal(adopted.id,s.id);assert.equal(adopted.general,true);assert.deepEqual(adopted.messages.map((m:any)=>m.id),before.messages.map((m:any)=>m.id));assert.equal(adopted.messages.at(-1).payload.kind,'article');await f.core.tutor.adoptConversation(f.dad,s.id);assert.equal((await f.core.tutor.list(f.dad,f.child.id)).items.length,1);assert.equal((await f.core.assistant.list(f.dad,f.child.id)).items.length,0);await f.core.assistant.delete(f.dad,s.id);await assert.rejects(f.core.tutor.get(f.dad,s.id),{code:'TUTOR_SESSION_NOT_FOUND'});assert.equal((await f.pg.query('SELECT count(*)::int n FROM wordmate.learning_assistant_sessions')).rows[0].n,0);
 }finally{await f.close();}
});
test('practice intent uses recent real mistakes and starts questions directly in the original tutor session',async()=>{
 const inputs:any[]=[];const f=await fixture(async(_url,init)=>{const b=JSON.parse(String(init!.body)),input=JSON.parse(b.messages[1].content);inputs.push(input);const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});return response(b.response_format.json_schema.name==='learning_plan'?{action:'practice',source:'mistakes',date_from:today,date_to:today}:{questions:Array.from({length:3},()=>({question:'cat 的意思是？',options:['猫','狗','鸟'],answer:0,explanation:'cat 表示猫。'}))});});
 try{await prepare(f);const w=await seed(f),card=(await f.pg.query('SELECT id FROM wordmate.review_cards WHERE child_word_id=$1',[w.id])).rows[0];const lease=(await f.pg.query("INSERT INTO wordmate.study_sessions(child_id,actor_user_id,status,expires_at) VALUES($1,$2,'ended',now()+interval '1 hour') RETURNING id",[f.child.id,f.dad])).rows[0];const log=(await f.pg.query("INSERT INTO wordmate.review_logs(child_id,card_id,session_id,actor_user_id,event_id,request_hash,rating,local_date,timezone_snapshot,before_version,after_version,word_snapshot,before_state,after_state,response_snapshot) VALUES($1,$2,$3,$4,$5,'test','again',(now() AT TIME ZONE 'Asia/Shanghai')::date,'Asia/Shanghai',1,2,'{}','{}','{}','{}') RETURNING id",[f.child.id,card.id,lease.id,f.dad,randomUUID()])).rows[0];await f.pg.query("INSERT INTO wordmate.mistake_events(child_id,child_word_id,source,review_log_id,reason,local_date,timezone_snapshot,word_snapshot,answer_snapshot) VALUES($1,$2,'review',$3,'incorrect',(now() AT TIME ZONE 'Asia/Shanghai')::date,'Asia/Shanghai','{}','{}')",[f.child.id,w.id,log.id]);
 const s=await f.core.tutor.open(f.dad,f.child.id,w.id);await f.pg.query("INSERT INTO wordmate.word_tutor_messages(session_id,role,content) VALUES($1,'assistant','cat 表示猫。')",[s.id]);const result=await f.core.tutor.answer(f.dad,s.id,randomUUID(),'练习最近的错词');assert.equal(result.id,s.id);assert.equal(result.quiz.question.question,'cat 的意思是？');assert.equal(inputs.at(-1).source,'mistakes');assert.equal(inputs.at(-1).words[0].id,w.id);assert.equal(inputs.at(-1).article,undefined);
 const next=await f.core.tutor.agentAnswer(f.dad,s.id,req('猫','quiz_answer',{quiz_id:result.quiz.id,index:0,choice:0}));assert.equal(next.quiz.score,1);assert.equal(next.quiz.index,1);
 }finally{await f.close();}
});
