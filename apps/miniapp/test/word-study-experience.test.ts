import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {emptyStudy,nextNewGroupSize,studyResumeDetail,type StudyFlow} from '../src/services/study-flow.ts';

function flow(phase:StudyFlow['phase']='test'):StudyFlow{
 const cards=Array.from({length:5},(_,n)=>({id:`card-${n}`,child_word_id:`word-${n}`,word_version:1,version:1,lemma:['apple','book','cat','dog','egg'][n],meaning_zh:['苹果','书','猫','狗','鸡蛋'][n]}));
 return {...emptyStudy({source:'new_words',wordbook_id:'book-a'}),loaded:true,phase,cards,total:5,pool:cards.map(c=>({id:c.child_word_id,meaning_zh:c.meaning_zh!})),today:{goal:10,completed_words:5,new_count:15,new_group_size:5,due_count:18}};
}
function pageFor(data:StudyFlow,patch:any={},options:any={}){
 const calls:any[]=[];
 class Controller{
  state={flow:data,pending:null,conflict:null,busy:false,error:null,notice:'',rejected:false,...patch};
  subscribe(){return()=>{};}begin(){return Promise.resolve();}dispose(){}heartbeat(){}hide(){}
  advance(){calls.push('advance');}learn(delta:number){calls.push(['learn',delta]);}startTest(){calls.push('test');}
  pause(){calls.push('pause');return options.pause?options.pause():Promise.resolve(true);}
  finish(){calls.push('finish');return Promise.resolve(true);}nextGroup(){calls.push('next');return Promise.resolve(true);}
  answer(meaning:string,remembered?:boolean){calls.push(['answer',meaning,remembered]);return Promise.resolve();}
 }
 const page=pageHarness('components/ReviewSession',async()=>({items:[{id:'book-a',name:'一年级词本'}]}),'ReviewSession',{studyController:Controller,...options});
 return {page,calls};
}
function complete(data:StudyFlow,wrong=false){data.cards.forEach((card,n)=>data.results[card.id]={correct:!(wrong&&n===0),selectedMeaning:'选择',meaning:card.meaning_zh!,saved:true,eventId:card.id});return data;}

test('new-word recommendations cap at five even for older payloads while character groups retain their limit',()=>{
 assert.equal(nextNewGroupSize({new_count:28,new_group_size:10,goal:10}),5);assert.equal(nextNewGroupSize({new_count:3,new_group_size:3}),3);
 assert.equal(nextNewGroupSize({new_count:28,goal:10},100),10);
});
test('correct answers advance only after saving, while wrong answers always remain visible',async()=>{
 for(const correct of [true,false])for(const pending of [true,false]){
  const data=flow();data.results['card-0']={correct,saved:!pending,meaning:'苹果',selectedMeaning:correct?'苹果':'书',eventId:'first'};
  const {page,calls}=pageFor(data,{pending:pending?{body:{event_id:'first'}}:null});await tick();await page.runTimeouts();
  assert.equal(calls.includes('advance'),correct&&!pending);page.dispose();
 }
});
test('automatic progression waits for ongoing pronunciation',async()=>{
 const data=flow();data.results['card-0']={correct:true,saved:true,meaning:'苹果',selectedMeaning:'苹果',eventId:'first'};
 const {page,calls}=pageFor(data,{}, {audio:{status:'正在播放…',active:'word-0'}});await tick();await page.runTimeouts();assert(!calls.includes('advance'));page.dispose();
});
test('a child can admit not remembering without guessing an option',async()=>{
 const {page,calls}=pageFor(flow());await tick();await page.button('还没记住').onClick();await tick();assert.deepEqual(calls,[['answer','还没记住',false]]);page.dispose();
});
test('pause releases the session before navigating back; a failed pause stays on the page',async()=>{
 for(const success of [true,false]){
  const {page,calls}=pageFor(flow('learn'),{}, {pause:()=>Promise.resolve(success)});await tick();await page.button('暂停').onClick();await tick();
  assert(calls.includes('pause'));assert.equal(page.backCount,success?1:0);page.dispose();
 }
});
test('unconfirmed answers can be kept locally on an explicit exit and never get discarded',async()=>{
 const pending={body:{event_id:'keep-me'}},{page,calls}=pageFor(flow(),{pending},{cache:{'study_pending:account-a:child-a':pending}});await tick();
 await page.button('暂存退出').onClick();await tick();assert.equal(page.backCount,1);assert(!calls.includes('pause'));
 assert.equal(page.cache.get('study_pending:account-a:child-a').body.event_id,'keep-me');assert.match(page.modals[0].content,/这台设备/);page.dispose();
});
test('a network interruption offers a deliberate local exit without treating it as a successful cloud save',async()=>{
 const {page,calls}=pageFor(flow('learn'),{error:Error('NETWORK_TIMEOUT')},{pause:()=>Promise.resolve(false)});await tick();await page.button('暂停').onClick();await tick();
 assert(calls.includes('pause'));assert.equal(page.backCount,1);assert.match(page.modals[0].content,/这台设备/);page.dispose();
});
test('a late pause acknowledgment cannot navigate out of a newly selected child',async()=>{
 const gate=deferred(),{page}=pageFor(flow('learn'),{}, {pause:()=>gate.promise});await tick();const paused=page.button('暂停').onClick();
 page.cache.set('child_id','another-child');gate.resolve(true);await paused;await tick();assert.equal(page.backCount,0);page.dispose();
});
test('summary offers one primary action based on practice needs and the daily goal',async()=>{
 for(const scenario of [{wrong:true,reached:false,label:'再练这 1 个词'},{wrong:false,reached:false,label:'再学 5 词'},{wrong:false,reached:true,label:'完成今天的学习'}]){
  const data=complete(flow('summary'),scenario.wrong);data.today={...data.today,goal_reached:scenario.reached,completed_words:scenario.reached?10:5};
  const {page}=pageFor(data);await tick();const primary=page.all(page.render()).filter(n=>n.type==='Button'&&n.props.className==='btn primary');
  assert.equal(primary.length,1);assert.equal(page.text(primary[0]),scenario.label);page.dispose();
 }
});
test('review summaries can continue with the next ten due words',async()=>{
 const data=complete(flow('summary'));data.source={source:'review',wordbook_id:'book-a'};const {page,calls}=pageFor(data);await tick();await page.button('再复习 10 词').onClick();assert(calls.includes('next'));page.dispose();
});
test('wrong-word practice can be paused for another day without marking it correct',async()=>{
 const data=complete(flow('practice'),true);data.practiceQueue=['card-0'];const {page,calls}=pageFor(data);await tick();await page.button('留到下次再练').onClick();await tick();
 assert(calls.includes('pause'));assert.equal(data.results['card-0'].correct,false);assert.equal(data.practiced['card-0'],undefined);assert.equal(page.backCount,1);page.dispose();
});
test('resume copy distinguishes recognition progress, unanswered practice and the saved summary',()=>{
 const data=flow('learn');data.learnIndex=2;assert.equal(studyResumeDetail(data),'认识单词 3 / 5');
 data.phase='test';data.results['card-0']={correct:true,saved:true,meaning:'苹果',selectedMeaning:'苹果',eventId:'first'};assert.equal(studyResumeDetail(data),'本轮练习 1 / 5');
 complete(data);assert.equal(studyResumeDetail(data),'本轮已完成，查看小结');data.phase='practice';data.practiceQueue=['card-0'];assert.equal(studyResumeDetail(data),'还有 1 词待巩固');
});
