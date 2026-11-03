import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';
import {emptyStudy,nextNewGroupSize} from '../src/services/study-flow.ts';
test('settings persists the automatic next switch per account and restores it on return',async()=>{
 const page=pageHarness('pages/settings-learning/index',async()=>({}));await page.show();const toggle=()=>page.all(page.render()).find(n=>n.type==='Switch');assert.equal(toggle().props.checked,true);toggle().props.onChange({detail:{value:false}});assert.equal(page.cache.get('study_auto_next:account-a'),false);page.hide();await page.show();assert.equal(toggle().props.checked,false);page.cache.set('access_token','account-b');await page.show();assert.equal(toggle().props.checked,true);page.dispose();
});
test('study automatically advances saved wrong answers only when enabled',async()=>{
 for(const enabled of [true,false]){let advanced=0;const data={...emptyStudy({source:'review'}),loaded:true,phase:'test' as const,total:1,cards:[{id:'c',child_word_id:'w',word_version:1,version:1,lemma:'apple',meaning_zh:'苹果'}],results:{c:{saved:true,correct:false,meaning:'苹果',selectedMeaning:'书',eventId:'event'}}};
  class Controller{state={flow:data,pending:null,conflict:null,busy:false,error:null,notice:'',rejected:false};subscribe(){return()=>{};}begin(){return Promise.resolve();}dispose(){}heartbeat(){}advance(){advanced++;}}
  const page=pageHarness('components/ReviewSession',async()=>({items:[]}),'ReviewSession',{studyController:Controller,cache:{'study_auto_next:account-a':enabled}});await page.runTimeouts();assert.equal(advanced,enabled?1:0);page.dispose();
 }
});
test('study shows the actual resumed wordbook instead of the newly selected book',async()=>{
 const data={...emptyStudy({source:'new_words',wordbook_id:'book-a'}),loaded:true,phase:'summary' as const};
 class Controller{state={flow:data,pending:null,conflict:null,busy:false,error:null,notice:'',rejected:false};subscribe(){return()=>{};}begin(){return Promise.resolve();}dispose(){}heartbeat(){}}
 const page=pageHarness('components/ReviewSession',async path=>{assert.equal(path,'/children/child-a/wordbooks');return {items:[{id:'book-a',name:'一年级上册'},{id:'book-b',name:'一年级下册'}]};},'ReviewSession',{studyController:Controller,cache:{'current_wordbook:child-a':'book-b'}});
 await tick();const tree=page.render(),toolbar=page.all(tree).find(node=>node.props?.className==='study-toolbar');assert(toolbar);assert.match(page.text(toolbar),/本次小结.*一年级上册/);assert.doesNotMatch(page.text(toolbar),/一年级下册|本次学习|调整发音与自动读音/);assert(!page.all(toolbar).some(node=>node.props?.['aria-label']==='学习选项'));page.dispose();
});
test('home offers the next 10 new words after the daily goal instead of hiding them behind the old quota',async()=>{
 const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'}]}:{child:{nickname:'孩子'},completed_words:10,goal:10,goal_reached:true,due_count:0,new_count:25,new_group_size:10,remaining_new_limit:0});
 await page.show();assert.equal(page.button('学习新词').disabled,false);assert.doesNotMatch(page.text(page.render()),/今日还可学|每天一点|月度测验|错题集/);assert.match(page.text(page.render()),/再学 10 词/);assert.equal(page.all(page.render()).filter(n=>String(n.props?.className).includes('home-study-button')).length,2);assert.equal(page.button('复习单词').disabled,true);page.button('按日期复习').onClick();assert(page.routes.includes('/pages/calendar/index'));
 page.button('学习新词').onClick();assert.equal(page.cache.get('review_source').source,'new_words');assert.equal(page.cache.get('study_intent'),'start');
 assert.equal(nextNewGroupSize({new_count:3,goal:10,remaining_new_limit:0}),3);assert.equal(nextNewGroupSize({new_count:0,goal:10}),0);
});
test('completion offers another round even when wrong words remain for optional practice',async()=>{
 for(const wrong of [false,true]){
  let next=0;const data={...emptyStudy({source:'new_words'}),loaded:true,phase:'summary' as const,total:1,cards:[{id:'c',child_word_id:'w',word_version:1,version:1,lemma:'apple',meaning_zh:'苹果'}],results:{c:{saved:true,correct:!wrong,meaning:'苹果',selectedMeaning:wrong?'书':'苹果',eventId:'event'}},today:{completed_words:10,goal:10,new_count:18,new_group_size:10,remaining_new_limit:0}};
  class Controller{state={flow:data,pending:null,conflict:null,busy:false,error:null,notice:'',rejected:false};subscribe(){return()=>{};}begin(){return Promise.resolve();}dispose(){}heartbeat(){}nextGroup(){next++;return Promise.resolve();}}
  const page=pageHarness('components/ReviewSession',async()=>({}),'ReviewSession',{studyController:Controller});await tick();assert.equal(page.button('继续下一轮 · 10 词').disabled,false);page.button('继续下一轮').onClick();assert.equal(next,1);assert.match(page.text(page.render()),/今天先到这里/);if(wrong)assert.match(page.text(page.render()),/巩固 1 个错词/);page.dispose();
 }
});
test('the two home actions open due reviews directly and resume the matching unfinished learning round',async()=>{
 const saved={...emptyStudy({source:'new_words'}),loaded:true,total:10,cards:[],results:{},phase:'learn'},page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'}]}:{child:{nickname:'孩子'},completed_words:0,goal:10,due_count:8,new_count:25,new_group_size:10},undefined,{cache:{'study_resume:account-a:child-a':saved}});
 await page.show();assert.equal(page.button('继续学习').disabled,false);assert.match(page.text(page.render()),/8 词待复习/);page.button('继续学习').onClick();assert.equal(page.cache.get('study_intent'),'resume');assert.equal(page.cache.get('review_source').source,'new_words');
 const review=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'}]}:{child:{nickname:'孩子'},completed_words:0,goal:10,due_count:8,new_count:25});await review.show();review.button('复习单词').onClick();assert.equal(review.cache.get('review_source').source,'review');assert.equal(review.cache.get('study_intent'),'start');assert.equal(review.routes.length,0);
});
test('calendar launches all words from the selected range, including dates with zero mistakes',async()=>{
 const page=pageHarness('pages/calendar/index',async path=>path.includes('/history-range?')?{count:8}:{today:'2026-10-31',days:[{date:'2026-10-02',studied_words:10,reviewable_words:8,wrong_words:0}]});
 await page.show();const grid=page.all(page.render()).find(n=>n.type==='DateRangeGrid');grid.props.onChange({start:'2026-10-02',end:'2026-10-03'});await tick();
 await page.button('开始复习').onClick();assert.deepEqual(JSON.parse(JSON.stringify(page.cache.get('review_source'))),{source:'calendar',date_from:'2026-10-02',date_to:'2026-10-03',scope:'studied'});assert(page.routes.includes('/pages/review/index'));assert.equal(page.cache.get('study_intent'),'start');
});
test('a late calendar response cannot offer another account old learning records',async()=>{
 const waiting=deferred(),page=pageHarness('pages/calendar/index',async()=>waiting.promise);await page.show();page.cache.set('access_token','account-b');waiting.resolve({days:[{date:'2026-10-02',studied_words:10,reviewable_words:10}]});await tick();assert.doesNotMatch(page.text(page.render()),/开始复习/);
});
