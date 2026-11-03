import {enterReview} from './review-entry';
import {mergeStudyCardWithWord} from './study-cards';
import {emptyStudy,studyKeys,sourceIdentity,studyComplete,studyCard,moveStudyForward,beginStudyPractice,mergeStudyFlow,type StudyFlow,type StudySource,type StudyCard,type StudyPending} from './study-flow';

type Store={get:(key:string)=>any;set:(key:string,value:any)=>void;remove:(key:string)=>void};
type Dependencies={token:string;child:string;source:StudySource;intent?:'start'|'resume';storage:Store;api:(path:string,method?:'GET'|'POST',body?:any,key?:string)=>Promise<any>;eventId:()=>string;now?:()=>number;isCurrent:()=>boolean};
export type StudyScreen={flow:StudyFlow|null;pending:StudyPending|null;conflict:StudyFlow|null;busy:boolean;error:unknown;notice:string;rejected:boolean};
const errorCode=(error:unknown)=>error instanceof Error?error.message:'';
const expired=(error:unknown)=>['SESSION_EXPIRED','SESSION_NOT_FOUND'].includes(errorCode(error));

export class StudySessionController{
 state:StudyScreen={flow:null,pending:null,conflict:null,busy:false,error:null,notice:'',rejected:false};
 private deps:Dependencies;private keys:ReturnType<typeof studyKeys>;private listener?:()=>void;private locked=false;private alive=true;private visible=true;private reload=false;private details=new Map<string,Promise<void>>();private detailTail:Promise<unknown>=Promise.resolve();
 constructor(deps:Dependencies){this.deps=deps;this.keys=studyKeys(deps.token,deps.child);}
 subscribe(listener:()=>void){this.alive=true;this.visible=true;this.listener=listener;return()=>{this.listener=undefined;};}
 private emit(update:Partial<StudyScreen>={}){this.state={...this.state,...update};if(this.alive)this.listener?.();}
 private now(){return this.deps.now?.()??Date.now();}
 private stored():StudyFlow|null{const value=this.deps.storage.get(this.keys.resume);return value?.format===1&&value.source&&Array.isArray(value.cards)?value:null;}
 private write(flow:StudyFlow){
  if(!this.deps.isCurrent())throw Error('SESSION_CHANGED');
  const next={...flow,updatedAt:this.now()};try{this.deps.storage.set(this.keys.resume,next);}catch{throw Error('STUDY_STORAGE_UNAVAILABLE');}
  this.emit({flow:next});return next;
 }
 private assertFlowUnchanged(expected:StudyFlow|null){
  if(!this.deps.isCurrent())throw Error('SESSION_CHANGED');
  if(!this.alive||JSON.stringify(this.stored())!==JSON.stringify(expected))throw Error('STUDY_SESSION_CHANGED');
 }
 private assertNoPending(){if(this.deps.storage.get(this.keys.pending))throw Error('STUDY_ANSWER_PENDING');}
 private change(update:(flow:StudyFlow)=>StudyFlow){const flow=this.stored();if(flow&&(!this.state.flow||sourceIdentity(flow.source)===sourceIdentity(this.state.flow.source)))return this.write(update(flow));return null;}
 private transition(update:(flow:StudyFlow)=>StudyFlow){try{if(this.state.flow)this.write(update(this.state.flow));}catch(error){this.emit({error});}}
 private async run(action:()=>Promise<void>){
  if(this.locked)return false;this.locked=true;this.emit({busy:true,error:null});let success=false;
  try{if(!this.deps.isCurrent())throw Error('SESSION_CHANGED');await action();success=true;}
  catch(error){this.emit({error});if(['SESSION_EXPIRED','CARD_CONFLICT','WORD_UNAVAILABLE','ANSWER_LOCKED'].includes(errorCode(error))&&this.state.pending)this.emit({rejected:true});}
  finally{this.locked=false;this.emit({busy:false});if(this.reload&&this.visible&&this.alive){this.reload=false;void this.resume();}}
  return success;
 }
 private legacy(){
  const scope=`${this.deps.token}:${this.deps.child}`,source=this.deps.source.source,activeKey=`active_review_session:${scope}:${source}`,pendingKey=`review_pending:${scope}:${source}`;
  const session=this.deps.storage.get(activeKey),pending=this.deps.storage.get(pendingKey);
  if(!this.state.pending&&pending?.event_id)this.emit({pending:{body:pending,legacyKey:pendingKey}});
  if(!this.state.flow&&['new_words','review','scheduled'].includes(source)&&session?.child_id===this.deps.child){this.write({...emptyStudy(this.deps.source,this.now()),session,total:session.total??0});this.deps.storage.remove(activeKey);}
 }
 begin(){return this.run(async()=>{
  const previous=this.stored();this.emit({flow:previous,pending:this.deps.storage.get(this.keys.pending)||null});this.legacy();
  if(previous&&!studyComplete(previous)&&sourceIdentity(previous.source)!==sourceIdentity(this.deps.source)){this.emit({conflict:previous});return;}
  if(previous&&studyComplete(previous)&&(this.deps.intent!=='resume'||sourceIdentity(previous.source)!==sourceIdentity(this.deps.source))&&!this.state.pending){await this.close(previous);this.assertFlowUnchanged(previous);this.assertNoPending();this.deps.storage.remove(this.keys.resume);this.emit({flow:null});}
  await this.open();
 });}
 continuePrevious(){return this.run(async()=>{this.emit({conflict:null});const source=this.state.flow?.source;if(source)this.deps.storage.set('review_source',source);await this.open();});}
 replacePrevious(){return this.run(async()=>{
  if(this.state.pending)throw Error('STUDY_ANSWER_PENDING');const previous=this.state.flow;if(previous)await this.close(previous);this.assertFlowUnchanged(previous);this.assertNoPending();this.deps.storage.remove(this.keys.resume);this.emit({flow:null,conflict:null,notice:''});await this.open();
 });}
 private async open(){
  if(this.state.pending)await this.flush();
  let previous=this.state.flow??emptyStudy(this.deps.source,this.now());
  if(studyComplete(previous)){this.emit({flow:previous,notice:''});return;}
  const remaining=previous.cards.filter(card=>!previous.results[card.id]?.saved).map(card=>card.child_word_id);
  const createSource:StudySource=previous.loaded&&remaining.length?{source:'manual',word_ids:remaining}:previous.source;
  const session=await enterReview({
   read:()=>previous.sessionClosed?null:previous.session,
   clear:()=>{previous={...previous,session:null,sessionClosed:true};this.write(previous);},
   heartbeat:async saved=>{await this.deps.api(`/study-sessions/${saved.id}/heartbeat`,'POST',{lease_generation:saved.lease_generation});},
   create:async()=>{
    try{return await this.deps.api(`/children/${this.deps.child}/study-sessions`,'POST',createSource,this.deps.eventId());}
    catch(error){if(errorCode(error)==='WORD_UNAVAILABLE'&&previous.loaded){this.emit({notice:'单词内容有变化，已重新载入当前可学内容。'});return this.deps.api(`/children/${this.deps.child}/study-sessions`,'POST',previous.source,this.deps.eventId());}throw error;}
   },
   save:saved=>{const latest=this.stored();if(latest&&latest.session?.id===saved.id&&sourceIdentity(latest.source)===sourceIdentity(previous.source))previous=latest;else if(!this.alive&&latest?.session)return;previous={...previous,session:saved,sessionClosed:false};this.write(previous);}
  });
  const [response,words]=await Promise.all([this.loadCards(session.id),this.deps.api(`/children/${this.deps.child}/words?limit=100`)]);
  if(!this.deps.isCurrent())throw Error('SESSION_CHANGED');if(!this.alive||!this.visible)return;
  const latest=this.stored();if(latest&&latest.session?.id===session.id&&sourceIdentity(latest.source)===sourceIdentity(previous.source))previous=latest;else if(latest?.session?.id&&latest.session.id!==session.id)return;
  const known=new Map<string,any>(words.items.map((word:any)=>[word.id,word]));
  const items=response.items.map((card:StudyCard)=>{const word=known.get(card.child_word_id),cached=previous.cards.find(old=>old.id===card.id&&old.word_version===card.word_version);return word?.version===card.word_version?mergeStudyCardWithWord(card,word):cached?.meaning_zh?{...cached,...card,example:cached.example??card.example}:card;});
  const pool=words.items.map((word:any)=>({id:word.id,meaning_zh:word.meaning_zh}));
  const next=mergeStudyFlow(previous,session,items,pool,response);this.write(next);this.prefetch();
 }
 private async loadCards(sessionId:string){
  const first=await this.deps.api(`/study-sessions/${sessionId}/cards?limit=100`),items=[...first.items],seen=new Set<string>();let cursor=first.next_cursor;
  while(cursor){
   if(!this.deps.isCurrent())throw Error('SESSION_CHANGED');if(!this.alive||!this.visible)return {...first,items};
   if(seen.has(cursor))throw Error('INVALID_CURSOR');seen.add(cursor);
   const page=await this.deps.api(`/study-sessions/${sessionId}/cards?limit=100&cursor=${encodeURIComponent(cursor)}`);items.push(...page.items);cursor=page.next_cursor;
  }
  return {...first,items};
 }
 prefetch(){
  const flow=this.state.flow;if(!flow||!flow.loaded||!this.visible||!this.alive)return;
  const card=studyCard(flow);if(!card)return;const index=flow.cards.findIndex(item=>item.id===card.id);
  for(const item of [card,flow.cards[index+1]].filter(Boolean))void this.ensureDetail(item,false);
 }
 private ensureDetail(card:StudyCard,report=true):Promise<void>{
  if(card.meaning_zh)return Promise.resolve();const key=`${card.child_word_id}:${card.word_version}`,existing=this.details.get(key);if(existing)return existing;
  // One small look-ahead queue avoids bursts of per-word requests on large wordbooks.
  const request=this.detailTail.catch(()=>{}).then(async()=>{
   if(!this.alive||!this.visible||!this.deps.isCurrent())return;
   const word=await this.deps.api(`/children/${this.deps.child}/words/${card.child_word_id}`);
   if(!this.alive||!this.deps.isCurrent())return;
   this.change(flow=>({...flow,cards:flow.cards.map(item=>item.id===card.id&&item.word_version===card.word_version?mergeStudyCardWithWord(item,word):item)}));
  });
  const guarded=request.catch(error=>{this.details.delete(key);if(this.alive&&(report||this.state.flow&&studyCard(this.state.flow)?.id===card.id))this.emit({error});}).finally(()=>{this.details.delete(key);});
  this.details.set(key,guarded);this.detailTail=guarded;return guarded;
 }
 private removeUnavailable(flow:StudyFlow,id:string){const cards=flow.cards.filter(card=>card.id!==id||flow.results[id]?.saved),next={...flow,cards,total:flow.baseDone+cards.length,learnIndex:Math.max(0,Math.min(flow.learnIndex,cards.length-1)),testIndex:Math.max(0,Math.min(flow.testIndex,cards.length-1))};if(studyComplete(next))next.phase='summary';return next;}
 retryDetail(){const card=this.state.flow&&studyCard(this.state.flow);if(card){if(errorCode(this.state.error)==='WORD_NOT_FOUND')return this.run(async()=>{this.change(flow=>this.removeUnavailable(flow,card.id));this.emit({notice:'这个单词已移除，已保留其余学习进度。'});await this.open();});this.emit({error:null});return this.ensureDetail(card);}return Promise.resolve();}
 learn(delta:number){
  const flow=this.state.flow;if(!flow||flow.phase!=='learn'||this.state.busy||this.state.pending)return;
  const current=studyCard(flow);if(delta>0&&!current?.meaning_zh)return;
  const index=Math.max(0,Math.min(flow.cards.length-1,flow.learnIndex+Math.sign(delta)));this.transition(current=>({...current,learnIndex:index}));this.prefetch();
 }
 startTest(){const flow=this.state.flow;if(!flow||flow.phase!=='learn'||flow.learnIndex<flow.cards.length-1||!studyCard(flow)?.meaning_zh||this.state.busy||this.state.pending)return;this.transition(current=>({...current,phase:'test',testIndex:0}));this.prefetch();}
 answer(selectedMeaning:string,remembered?:boolean){return this.run(async()=>{
  const flow=this.state.flow,card=flow&&studyCard(flow);if(!flow||!card||!card.meaning_zh||this.state.pending)return;
  const meaning=card.meaning_zh.trim(),correct=remembered??selectedMeaning.trim()===meaning;
  if(flow.phase==='practice'){if(flow.practiceFeedback)return;this.write({...flow,practiceFeedback:{correct,selectedMeaning}});return;}
  if(flow.phase!=='test'||flow.results[card.id])return;
  const body={session_id:flow.session.id,card_id:card.id,event_id:this.deps.eventId(),expected_version:card.version,rating:correct?'good':'again',lease_generation:flow.session.lease_generation,...('wordbook_id' in flow.source&&flow.source.wordbook_id?{wordbook_id:flow.source.wordbook_id}:{})};
  const result={correct,selectedMeaning,meaning,saved:false,eventId:body.event_id},pending={body,card,result};
  try{this.deps.storage.set(this.keys.pending,pending);}catch{throw Error('STUDY_STORAGE_UNAVAILABLE');}
  this.emit({pending,rejected:false});this.write({...flow,results:{...flow.results,[card.id]:result}});await this.flush();
 });}
 private async flush(){
  const pending=this.state.pending;if(!pending)return;
  const response=await this.deps.api('/reviews','POST',pending.body);
  if(!this.deps.isCurrent())throw Error('SESSION_CHANGED');
  this.change(flow=>{
   const known=flow.results[pending.body.card_id],original=known?.eventId===pending.body.event_id?known:flow.session?.id===pending.body.session_id?pending.result:undefined;
   return original?{...flow,results:{...flow.results,[pending.body.card_id]:{...original,saved:true}},today:response.today}:flow;
  });
  if(this.deps.storage.get(this.keys.pending)?.body?.event_id===pending.body.event_id)this.deps.storage.remove(this.keys.pending);
  if(pending.legacyKey&&this.deps.storage.get(pending.legacyKey)?.event_id===pending.body.event_id)this.deps.storage.remove(pending.legacyKey);this.emit({pending:null,rejected:false,error:null});
 }
 retryAnswer(){return this.run(()=>this.flush());}
 retryRejected(){const unavailable=errorCode(this.state.error)==='WORD_UNAVAILABLE';return this.run(async()=>{
  if(!this.state.rejected||!this.state.pending)return;
  const pending=this.state.pending,previous=this.state.flow;if(previous)await this.close(previous);this.assertFlowUnchanged(previous);const currentPending=this.deps.storage.get(this.keys.pending);if((!pending.legacyKey||currentPending)&&currentPending?.body?.event_id!==pending.body.event_id)throw Error('STUDY_SESSION_CHANGED');if(pending.legacyKey&&this.deps.storage.get(pending.legacyKey)?.event_id!==pending.body.event_id)throw Error('STUDY_SESSION_CHANGED');this.deps.storage.remove(this.keys.pending);if(pending.legacyKey)this.deps.storage.remove(pending.legacyKey);
  this.change(flow=>{const results={...flow.results};delete results[pending.body.card_id];const next={...flow,results,session:null,sessionClosed:true};return unavailable?this.removeUnavailable(next,pending.body.card_id):next;});
  this.emit({pending:null,rejected:false});await this.open();
 });}
 advance(){if(this.state.busy||this.state.pending||!this.state.flow)return;this.transition(moveStudyForward);this.prefetch();}
 practice(){if(this.state.busy||this.state.pending||!this.state.flow)return;this.transition(beginStudyPractice);this.prefetch();}
 private async close(flow:StudyFlow){if(!flow.session||flow.sessionClosed)return;try{await this.deps.api(`/study-sessions/${flow.session.id}/end`,'POST',{lease_generation:flow.session.lease_generation});}catch(error){if(!expired(error))throw error;}}
 pause(){return this.run(async()=>{if(this.state.pending)throw Error('STUDY_ANSWER_PENDING');const flow=this.state.flow;if(flow){await this.close(flow);this.assertFlowUnchanged(flow);this.assertNoPending();this.change(latest=>({...latest,sessionClosed:true}));}});}
 finish(){return this.run(async()=>{if(this.state.pending||!this.state.flow||!studyComplete(this.state.flow))throw Error('STUDY_NOT_FINISHED');const previous=this.state.flow;await this.close(previous);this.assertFlowUnchanged(previous);this.assertNoPending();this.deps.storage.remove(this.keys.resume);this.emit({flow:null});});}
 nextGroup(){return this.run(async()=>{if(this.state.pending||!this.state.flow||!studyComplete(this.state.flow))throw Error('STUDY_NOT_FINISHED');const previous=this.state.flow;await this.close(previous);this.assertFlowUnchanged(previous);this.assertNoPending();this.write(emptyStudy(previous.source,this.now()));this.emit({notice:''});await this.open();});}
 hide(){this.visible=false;}
 resume(){if(!this.alive)return Promise.resolve(false);this.visible=true;if(this.locked){this.reload=true;return Promise.resolve(false);}return this.run(async()=>{
  if(this.state.conflict)return;if(this.state.pending)await this.flush();const flow=this.state.flow;
  if(!flow||studyComplete(flow))return;if(!flow.loaded){await this.open();return;}
  if(flow.session&&!flow.sessionClosed){try{await this.deps.api(`/study-sessions/${flow.session.id}/heartbeat`,'POST',{lease_generation:flow.session.lease_generation});this.prefetch();return;}catch(error){if(!expired(error))throw error;}}
  await this.open();
 });}
 heartbeat(){const flow=this.state.flow;if(!this.visible||this.locked||this.state.pending||!flow?.session||flow.sessionClosed||studyComplete(flow))return Promise.resolve();return this.deps.api(`/study-sessions/${flow.session.id}/heartbeat`,'POST',{lease_generation:flow.session.lease_generation}).catch(error=>{if(!this.alive||!this.visible)return;if(expired(error))void this.resume();else this.emit({error});});}
 dispose(){this.alive=false;this.visible=false;this.listener=undefined;}
}
