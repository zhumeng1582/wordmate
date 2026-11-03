import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {enterReview} from '../src/services/review-entry.ts';
import {mergeStudyCardWithWord} from '../src/services/study-cards.ts';
import * as flow from '../src/services/study-flow.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),module={exports:{} as any};
const code=ts.transpileModule(readFileSync('apps/miniapp/src/services/study-session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,Error,Date,require:(name:string)=>name==='./review-entry'?{enterReview}:name==='./study-cards'?{mergeStudyCardWithWord}:flow});
const Controller=module.exports.StudySessionController,tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(count=8,roundSize=count){
 const storageMap=new Map<string,any>(),calls:{path:string;method:string;body:any}[]=[],events=new Map<string,any>(),accepted:string[]=[],sessions=new Map<string,any>();let clock=100000,event=0,current=true,sessionNumber=0,networkAfterAccept=false;
 const words=Array.from({length:count},(_,index)=>({id:`word-${index}`,version:1,lemma:`word${index}`,meaning_zh:`释义${index}`,part_of_speech:'noun',ipa_gb:'/a/',ipa_us:'/b/'}));
 const cards=words.map((word,index)=>({id:`card-${index}`,version:1,word_version:1,child_word_id:word.id,lemma:word.lemma,state:'new',part_of_speech:'noun',ordinal:index+1}));
 const storage={get:(key:string)=>{const value=storageMap.get(key);return value===undefined?'':JSON.parse(JSON.stringify(value));},set:(key:string,value:any)=>storageMap.set(key,JSON.parse(JSON.stringify(value))),remove:(key:string)=>storageMap.delete(key)};
 let intercept:((body:any,reply:any,isReplay:boolean)=>Promise<void>)|null=null,interceptEnd:(()=>Promise<void>)|null=null;
 const api=async(path:string,method='GET',body?:any)=>{
  calls.push({path,method,body});
  if(path.endsWith('/study-sessions')&&method==='POST'){
   for(const session of sessions.values())if(!session.closed&&session.expires>clock)throw Error('CHILD_BUSY');
   const available=cards.filter(card=>!accepted.includes(card.id)&&(body.source!=='manual'||body.word_ids.includes(card.child_word_id))),chosen=body.source==='new_words'?available.slice(0,roundSize):available,id=`session-${++sessionNumber}`;
   if(!chosen.length)throw Error('EMPTY_REVIEW_QUEUE');const session={id,child_id:'child',lease_generation:1,expires_at:new Date(clock+120000).toISOString(),expires:clock+120000,closed:false,total:chosen.length,ids:chosen.map(card=>card.id),source:body.source};sessions.set(id,session);return {...session};
  }
  if(path.includes('/heartbeat')||path.endsWith('/end')){if(path.endsWith('/end')&&interceptEnd)await interceptEnd();const id=path.split('/')[2],session=sessions.get(id);if(!session||session.closed||session.expires<=clock)throw Error('SESSION_EXPIRED');if(path.endsWith('/end'))session.closed=true;else session.expires=clock+120000;return {...session};}
  if(path.includes('/cards?')){const session=sessions.get(path.split('/')[2]);if(session.closed||session.expires<=clock)throw Error('SESSION_EXPIRED');const items=cards.filter(card=>session.ids.includes(card.id)&&!accepted.includes(card.id)),cursor=Number(new URL(path,'https://test.invalid').searchParams.get('cursor')??0),page=items.filter(card=>card.ordinal>cursor).slice(0,100);return {items:page.map(card=>({...card})),total:session.total,remaining:items.length,next_cursor:page.length&&page.at(-1)!.ordinal<items.at(-1)!.ordinal?String(page.at(-1)!.ordinal):null};}
  if(path==='/children/child/words?limit=100')return {items:words};
  if(path.startsWith('/children/child/words/')){const word=words.find(word=>word.id===path.split('/').pop());if(!word)throw Error('WORD_NOT_FOUND');return word;}
  if(path==='/reviews'){
   const replay=events.get(body.event_id);if(replay){if(intercept)await intercept(body,replay,true);return replay;}
   const session=sessions.get(body.session_id);if(session.closed||session.expires<=clock)throw Error('SESSION_EXPIRED');assert(!accepted.includes(body.card_id),'a card must be graded only once');accepted.push(body.card_id);
   const reply={card_id:body.card_id,event_id:body.event_id,today:{completed_words:accepted.length,goal:roundSize,goal_reached:accepted.length>=roundSize,new_count:Math.max(0,count-accepted.length),remaining_new_limit:20-accepted.length}};events.set(body.event_id,reply);if(intercept)await intercept(body,reply,false);if(networkAfterAccept){networkAfterAccept=false;throw Error('NETWORK_TIMEOUT');}return reply;
  }
  throw Error(`unexpected request: ${path}`);
 };
 const make=(source:any={source:'new_words'},intent='resume')=>new Controller({token:'token',child:'child',source,intent,storage,api,eventId:()=>`event-${++event}`,now:()=>clock,isCurrent:()=>current});
 return {make,storage,calls,accepted,words,cards,sessions,events,advanceClock:(duration:number)=>{clock+=duration;},failAfterAccept:()=>{networkAfterAccept=true;},intercept:(fn:typeof intercept)=>{intercept=fn;},interceptEnd:(fn:typeof interceptEnd)=>{interceptEnd=fn;},switchAccount:()=>{current=false;},keys:flow.studyKeys('token','child')};
}
function learnAll(controller:any){const count=controller.state.flow.cards.length;controller.startTest();if(count>1)assert.equal(controller.state.flow.phase,'learn');for(let index=1;index<count;index++)controller.learn(1);controller.startTest();assert.equal(controller.state.flow.phase,'test');}
test('eight-word study uses one card read and one word-list read, with no reload between answers',async()=>{
 const f=fixture(),study=f.make();await study.begin();learnAll(study);study.advance();assert.equal(study.state.flow.testIndex,0);
 for(let index=0;index<8;index++){const card=flow.studyCard(study.state.flow)!;await study.answer(card.meaning_zh);assert.equal(flow.studyCounts(study.state.flow).done,index+1);study.advance();}
 assert.equal(study.state.flow.phase,'summary');assert.equal(f.accepted.length,8);assert.equal(f.calls.filter(call=>call.path.includes('/cards?')).length,1);assert.equal(f.calls.filter(call=>call.path.includes('/words?')).length,1);assert.equal(f.calls.filter(call=>call.path==='/reviews').length,8);assert.equal(await study.finish(),true);assert.equal(f.storage.get(f.keys.resume),'');
});
test('there is no forward skip or completion action before answers have been saved',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();study.advance();assert.equal(study.state.flow.testIndex,0);assert.equal(await study.finish(),false);assert.equal(study.state.flow.phase,'test');assert.equal(f.accepted.length,0);
});
test('wrong-word practice keeps the first answer and makes no additional grading requests',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();const first=flow.studyCard(study.state.flow)!;await study.answer('选错了');study.advance();
 while(study.state.flow.phase==='test'){const card=flow.studyCard(study.state.flow)!;await study.answer(card.meaning_zh);study.advance();}
 const before=f.calls.filter(call=>call.path==='/reviews').length;study.practice();assert.equal(study.state.flow.phase,'practice');await study.answer('还是不确定');study.advance();assert.equal(study.state.flow.phase,'practice');await study.answer(first.meaning_zh);study.advance();assert.equal(study.state.flow.phase,'summary');assert.equal(study.state.flow.results[first.id].correct,false);assert.equal(flow.studyCounts(study.state.flow).wrong,1);assert.equal(f.calls.filter(call=>call.path==='/reviews').length,before);assert.equal(study.state.flow.practiced[first.id],true);
});
test('explicit pause releases the lease and resumes the same learning position',async()=>{
 const f=fixture(),study=f.make();await study.begin();study.learn(1);study.learn(1);study.learn(1);const expected=flow.studyCard(study.state.flow)!.id;assert.equal(await study.pause(),true);study.dispose();
 const resumed=f.make();await resumed.begin();assert.equal(resumed.state.flow.phase,'learn');assert.equal(flow.studyCard(resumed.state.flow)!.id,expected);const creates=f.calls.filter(call=>call.path.endsWith('/study-sessions'));assert.equal(creates[1].body.source,'manual');assert.equal(creates[1].body.word_ids.length,8);
});
test('backgrounding does not end a session; expiry restores only the unanswered words',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);study.advance();const expected=flow.studyCard(study.state.flow)!.id;
 study.hide();assert.equal(f.calls.filter(call=>call.path.endsWith('/end')).length,0);f.advanceClock(121000);await study.resume();assert.equal(flow.studyCard(study.state.flow)!.id,expected);assert.equal(flow.studyCounts(study.state.flow).done,1);assert.equal(study.state.flow.total,3);const lastCreate=f.calls.filter(call=>call.path.endsWith('/study-sessions')).at(-1)!;assert.equal(lastCreate.body.word_ids.length,2);assert.equal(f.accepted.length,1);
});
test('a saved answer with a lost response reuses its event and never increments progress twice',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();f.failAfterAccept();await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);assert(study.state.pending);assert.equal(flow.studyCounts(study.state.flow).done,0);study.advance();assert.equal(study.state.flow.testIndex,0);
 const event=study.state.pending.body.event_id;assert.equal(await study.retryAnswer(),true);assert.equal(study.state.pending,null);assert.equal(flow.studyCounts(study.state.flow).done,1);await study.retryAnswer();assert.equal(f.accepted.length,1);assert(f.calls.filter(call=>call.path==='/reviews').every(call=>call.body.event_id===event));
});
test('cold reopening retries a durable pending answer before restoring the next position',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();f.failAfterAccept();await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);study.dispose();const resumed=f.make({source:'review'});await resumed.begin();assert.equal(resumed.state.pending,null);assert.equal(flow.studyCounts(resumed.state.flow).done,1);resumed.advance();assert.equal(resumed.state.flow.testIndex,1);assert.equal(f.accepted.length,1);
});
test('a definitively expired unsaved answer is explicitly reloaded and answered in the replacement lease',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();f.advanceClock(121000);await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);assert.equal(study.state.rejected,true);assert.equal(f.accepted.length,0);assert.equal(await study.retryRejected(),true);assert.equal(study.state.pending,null);assert.equal(flow.studyCounts(study.state.flow).done,0);await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);assert.equal(f.accepted.length,1);assert.equal(flow.studyCounts(study.state.flow).done,1);
});
test('storage failures stop grading before an answer without a durable retry record is sent',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();const original=f.storage.set;f.storage.set=()=>{throw Error('full');};assert.equal(await study.answer(flow.studyCard(study.state.flow)!.meaning_zh),false);assert.equal(f.accepted.length,0);assert.equal(study.state.error.message,'STUDY_STORAGE_UNAVAILABLE');f.storage.set=original;
});
test('a late acknowledgment from an exited view cannot erase a newer pending answer',async()=>{
 const f=fixture(3);let releaseFirst!:()=>void,releaseSecond!:()=>void;const firstGate=new Promise<void>(resolve=>releaseFirst=resolve),secondGate=new Promise<void>(resolve=>releaseSecond=resolve);
 f.intercept(async(body,_reply,replay)=>{if(!replay)await(body.card_id==='card-0'?firstGate:secondGate);});const old=f.make({source:'review'});await old.begin();const first=old.answer(flow.studyCard(old.state.flow)!.meaning_zh);await tick();old.dispose();
 const active=f.make({source:'review'});await active.begin();active.advance();const second=active.answer(flow.studyCard(active.state.flow)!.meaning_zh);await tick();const newer=f.storage.get(f.keys.pending).body.event_id;releaseFirst();await first;assert.equal(f.storage.get(f.keys.pending).body.event_id,newer);assert.equal(f.storage.get(f.keys.resume).results['card-1'].saved,false);releaseSecond();await second;assert.equal(flow.studyCounts(active.state.flow).done,2);assert.equal(f.accepted.length,2);
});
test('changed study filters offer a deliberate resume choice instead of silently using another group',async()=>{
 const f=fixture(4),old=f.make({source:'manual',word_ids:['word-0','word-1']});await old.begin();await old.answer(flow.studyCard(old.state.flow)!.meaning_zh);old.advance();await old.pause();old.dispose();const next=f.make({source:'manual',word_ids:['word-2','word-3']},'start');await next.begin();assert(next.state.conflict);assert.equal(f.calls.filter(call=>call.path.endsWith('/study-sessions')).length,1);await next.continuePrevious();assert.equal(flow.studyCard(next.state.flow)!.child_word_id,'word-1');
});
test('account changes prevent stale answers from restoring another account storage',async()=>{
 const f=fixture(3),study=f.make({source:'review'});await study.begin();f.switchAccount();assert.equal(await study.answer('释义0'),false);assert.equal(f.accepted.length,0);assert.equal(f.storage.get(f.keys.pending),'');
});
test('stable distinct choices do not change on render and one-word sets use recall instead of fake alternatives',()=>{
 const card:any={id:'c',child_word_id:'w',meaning_zh:'苹果'},pool=[{id:'w',meaning_zh:'苹果'},{id:'a',meaning_zh:'书'},{id:'b',meaning_zh:'书'},{id:'d',meaning_zh:'狗'}];const options=flow.studyOptions(card,pool,'test');assert.deepEqual(options,flow.studyOptions(card,pool,'test'));assert.equal(new Set(options).size,options.length);assert.deepEqual(flow.studyOptions(card,[pool[0]],'test'),['苹果']);assert.notEqual(flow.studyKeys('first','child').resume,flow.studyKeys('second','child').resume);assert.equal(flow.sourceIdentity({source:'manual',word_ids:['b','a']}),flow.sourceIdentity({word_ids:['a','b'],source:'manual'}));
});
test('next round closes the completed lease, learns 10 + 10 + 3 and survives leaving between rounds',async()=>{
 const f=fixture(23,10);let study=f.make();await study.begin();const groups:number[]=[];
 for(const size of [10,10,3]){
  groups.push(study.state.flow.cards.length);assert.equal(study.state.flow.cards.length,size);learnAll(study);
  while(study.state.flow.phase==='test'){const card=flow.studyCard(study.state.flow)!;await study.answer(card.meaning_zh);study.advance();}
  assert.equal(study.state.flow.phase,'summary');
  if(f.accepted.length<23){assert.equal(await study.nextGroup(),true);assert.equal(study.state.flow.phase,'learn');if(f.accepted.length===10){await study.pause();study.dispose();study=f.make();await study.begin();assert.equal(study.state.flow.cards.length,10);}}
 }
 assert.deepEqual(groups,[10,10,3]);assert.equal(new Set(f.accepted).size,23);assert.equal(await study.finish(),true);assert.equal(f.storage.get(f.keys.resume),'');
});
test('calendar review loads every page and resumes more than 100 unanswered words after expiry',async()=>{
 const f=fixture(105),study=f.make({source:'calendar',date:'2026-10-30',scope:'studied'});await study.begin();assert.equal(study.state.flow.cards.length,105);assert.equal(study.state.flow.total,105);assert.equal(f.calls.filter(call=>call.path.includes('/cards?')).length,2);
 await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);study.advance();study.hide();f.advanceClock(121000);await study.resume();assert.equal(study.state.flow.cards.length,105);assert.equal(flow.studyCounts(study.state.flow).done,1);
 const create=f.calls.filter(call=>call.path.endsWith('/study-sessions')).at(-1)!;assert.equal(create.body.word_ids.length,104);assert.equal(flow.studyCard(study.state.flow)!.id,'card-1');assert.equal(f.accepted.length,1);
});

test('late session closures cannot erase or replace newer local study progress',async()=>{
 for(const action of ['pause','finish','nextGroup','replace'] as const){
  const f=fixture(action==='replace'?2:1,1),study=f.make({source:action==='replace'?'manual':'review',...(action==='replace'?{word_ids:['word-0']}: {})});await study.begin();
  if(action==='finish'||action==='nextGroup'){await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);study.advance();}
  if(action==='replace'){study.dispose();const other=f.make({source:'manual',word_ids:['word-1']},'start');await other.begin();assert(other.state.conflict);study.dispose();
   let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);f.interceptEnd(()=>gate);const closing=other.replacePrevious();await tick();const newer=f.storage.get(f.keys.resume);newer.updatedAt++;f.storage.set(f.keys.resume,newer);release();assert.equal(await closing,false);assert.equal(other.state.error.message,'STUDY_SESSION_CHANGED');assert.equal(f.storage.get(f.keys.resume).updatedAt,newer.updatedAt);continue;
  }
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);f.interceptEnd(()=>gate);const closing=study[action]();await tick();const newer=f.storage.get(f.keys.resume);newer.updatedAt++;f.storage.set(f.keys.resume,newer);release();assert.equal(await closing,false);assert.equal(study.state.error.message,'STUDY_SESSION_CHANGED');assert.equal(f.storage.get(f.keys.resume).updatedAt,newer.updatedAt);
 }
});
test('a late closure cannot clean up after the account changes or the view is disposed',async()=>{
 for(const change of ['account','dispose']){
  const f=fixture(1),study=f.make({source:'review'});await study.begin();await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);study.advance();
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);f.interceptEnd(()=>gate);const closing=study.finish();await tick();if(change==='account')f.switchAccount();else study.dispose();release();assert.equal(await closing,false);assert(f.storage.get(f.keys.resume));
 }
});

test('pending answers created or replaced while closing are never deleted',async()=>{
 for(const action of ['finish','retryRejected']){
  const f=fixture(1),study=f.make({source:'review'});await study.begin();
  if(action==='finish'){await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);study.advance();}else{f.advanceClock(121000);await study.answer(flow.studyCard(study.state.flow)!.meaning_zh);assert(study.state.rejected);}
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);f.interceptEnd(()=>gate);const closing=study[action]();await tick();const newer={body:{event_id:'new-event'}};f.storage.set(f.keys.pending,newer);release();assert.equal(await closing,false);assert.equal(f.storage.get(f.keys.pending).body.event_id,'new-event');assert(f.storage.get(f.keys.resume));
 }
});

test('large resumed groups retain saved answers and identify newly added cards',()=>{
 const previous=flow.emptyStudy({source:'new_words'}),cards=Array.from({length:8000},(_,i)=>({id:`c${i}`,child_word_id:`w${i}`,lemma:`word${i}`,version:1,word_version:1}));
 previous.loaded=true;previous.cards=cards.slice(0,7999);previous.results={c0:{correct:true,selectedMeaning:'x',meaning:'x',saved:true,eventId:'e0'},obsolete:{correct:false,selectedMeaning:'x',meaning:'x',saved:true,eventId:'e1'}};previous.phase='test';previous.total=7999;
 const next=flow.mergeStudyFlow(previous,{id:'session'},cards,[],{total:8000,remaining:8000});
 assert.equal(next.cards.length,8000);assert.equal(next.results.c0.saved,true);assert.equal(next.results.obsolete,undefined);assert.equal(next.phase,'learn');assert.equal(next.total,8000);
});
