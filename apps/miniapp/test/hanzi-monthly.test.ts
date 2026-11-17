import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';

test('character monthly quiz saves answers, submits and shows results',async()=>{
 let status='in_progress',selected:string|null=null,version=1;
 const page=pageHarness('pages/hanzi-monthly/index',async(path,method,body)=>{
  if(path.includes('/preview'))return {eligible_count:4,active_quiz_id:null};
  if(path.endsWith('/hanzi-monthly-quizzes')&&method==='POST')return {id:'quiz'};
  if(path.endsWith('/resume'))return {quiz:{id:'quiz',status:'in_progress',version,total_count:1,answered_count:0},session:{id:'lease',lease_generation:1}};
  if(path.endsWith('/answer')){selected=body.answer;version++;return {correct:true};}
  if(path.endsWith('/submit')){status='submitted';return {};}
  if(path.includes('/items?'))return {items:[{id:'item',ordinal:1,character:'春',options:['chūn','xià','qiū','dōng'],selected,answer_version:selected?2:1,...(selected?{correct_answer:'chūn'}:{})}]};
  if(path.endsWith('/quiz'))return {id:'quiz',status,version,total_count:1,answered_count:selected?1:0,...(status==='submitted'?{result:{score:100,correct_count:1,wrong_count:0,unanswered_count:0}}:{})};
  return {items:[]};
 });
 await page.show();await tick();page.button('开始测试').onClick();await tick();await tick();assert.match(page.text(page.render()),/请选择正确拼音/);
 page.button('chūn').onClick();await tick();await tick();assert.match(page.text(page.render()),/答对了/);assert(page.calls.some(c=>c.path.endsWith('/answer')&&c.body.answer==='chūn'));
 page.button('交卷').onClick();await tick();await tick();assert.match(page.text(page.render()),/成绩 100 分/);page.dispose();
});

test('uncertain answer retries with the same key and child switch clears quiz',async()=>{
 let calls=0;const page=pageHarness('pages/hanzi-monthly/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:4,active_quiz_id:null};
  if(path.endsWith('/hanzi-monthly-quizzes')&&method==='POST')return {id:'quiz'};
  if(path.endsWith('/resume'))return {quiz:{id:'quiz',status:'in_progress',version:1,total_count:1,answered_count:0},session:{id:'lease',lease_generation:1}};
  if(path.endsWith('/answer')){if(++calls===1)throw Error('NETWORK_TIMEOUT');return {correct:true};}
  if(path.includes('/items?'))return {items:[{id:'item',ordinal:1,character:'春',options:['chūn','xià','qiū','dōng'],selected:null,answer_version:1}]};
  if(path.endsWith('/quiz'))return {id:'quiz',status:'in_progress',version:1,total_count:1,answered_count:0};
  return {items:[]};
 });await page.show();await tick();page.button('开始测试').onClick();await tick();await tick();page.button('chūn').onClick();await tick();assert.match(page.text(page.render()),/上次操作尚未确认/);
 const saved=page.cache.get('hanzi-monthly-pending:account-a:child-a');page.button('重试保存').onClick();await tick();await tick();const answers=page.calls.filter(c=>c.path.endsWith('/answer'));assert.equal(answers.length,2);assert.equal(answers[0].key,answers[1].key);assert.equal(answers[0].key,saved.key);
 page.hide();page.cache.set('child_id','child-b');await page.show();await tick();assert.doesNotMatch(page.text(page.render()),/请选择正确拼音|春/);page.dispose();
});

test('another parent must be explicitly taken over before answering',async()=>{
 let taken=false;const page=pageHarness('pages/hanzi-monthly/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:4,active_quiz_id:'quiz'};
  if(path.endsWith('/resume'))throw Error('CHILD_BUSY');
  if(path.endsWith('/takeover')){taken=true;return {quiz:{id:'quiz',status:'in_progress',version:3,total_count:1,answered_count:0},session:{id:'new-lease',lease_generation:2}};}
  if(path.includes('/items?'))return {items:[{id:'item',ordinal:1,character:'春',options:['chūn','xià','qiū','dōng'],selected:null,answer_version:1}]};
  if(path.endsWith('/quiz'))return {id:'quiz',status:'in_progress',version:2,total_count:1,answered_count:0,active_session:{id:'old-lease',owner_name:'妈妈'}};
  if(path.endsWith('/answer'))return {correct:true};
  return {items:[]};
 });await page.show();await tick();page.button('继续未完成测试').onClick();await tick();await tick();assert.match(page.text(page.render()),/妈妈 正在进行测试/);assert.equal(page.button('chūn').disabled,true);page.button('由我接着陪学').onClick();await tick();await tick();assert(taken);page.button('chūn').onClick();await tick();const call=page.calls.find(c=>c.path.endsWith('/answer'));assert.equal(call.body.lease_id,'new-lease');assert.equal(call.body.lease_generation,2);page.dispose();
});

test('character quiz history loads additional pages',async()=>{
 const page=pageHarness('pages/hanzi-monthly/index',async path=>path.includes('/preview')?{eligible_count:4}:path.includes('cursor=next')?{items:[{id:'q2',month:'2026-09',status:'submitted',result:{score:90}}],next_cursor:null}:{items:[{id:'q1',month:'2026-10',status:'submitted',result:{score:100}}],next_cursor:'next'});
 await page.show();await tick();page.button('历史成绩').onClick();await tick();assert.match(page.text(page.render()),/2026-10/);page.button('加载更多').onClick();await tick();assert.match(page.text(page.render()),/2026-09/);assert(!page.all(page.render()).some(node=>node.type==='Button'&&page.text(node)==='加载更多'));page.dispose();
});

test('large character quiz navigates between question pages',async()=>{
 const page=pageHarness('pages/hanzi-monthly/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:51};
  if(path.endsWith('/hanzi-monthly-quizzes')&&method==='POST')return {id:'quiz'};
  if(path.endsWith('/resume'))return {quiz:{id:'quiz',status:'in_progress',version:1,total_count:51,answered_count:0},session:{id:'lease',lease_generation:1}};
  if(path.includes('/items?cursor=50'))return {items:[{id:'q51',ordinal:51,character:'后',options:['a','b','c','d'],selected:null,answer_version:1}],next_cursor:null};
  if(path.includes('/items?'))return {items:Array.from({length:50},(_,i)=>({id:`q${i+1}`,ordinal:i+1,character:'前',options:['a','b','c','d'],selected:null,answer_version:1})),next_cursor:'50'};
  if(path.endsWith('/quiz'))return {id:'quiz',status:'in_progress',version:1,total_count:51,answered_count:0};
  return {};
 });await page.show();await tick();page.button('开始测试').onClick();await tick();await tick();for(let i=0;i<50;i++){page.button('下一题').onClick();await tick();}assert.match(page.text(page.render()),/第 51 \/ 51 题/);page.button('上一题').onClick();await tick();assert.match(page.text(page.render()),/第 50 \/ 51 题/);page.dispose();
});

test('resuming a quiz opens its first unanswered question',async()=>{
 const page=pageHarness('pages/hanzi-monthly/index',async path=>{
  if(path.includes('/preview'))return {eligible_count:51,active_quiz_id:'quiz'};
  if(path.endsWith('/resume'))return {quiz:{id:'quiz',status:'in_progress',version:2,total_count:51,answered_count:50,first_unanswered:51},session:{id:'lease',lease_generation:1}};
  if(path.includes('/items?cursor=50'))return {items:[{id:'q51',ordinal:51,character:'后',options:['a','b','c','d'],selected:null,answer_version:1}],next_cursor:null};
  if(path.endsWith('/quiz'))return {id:'quiz',status:'in_progress',version:1,total_count:51,answered_count:50,first_unanswered:51};
  return {};
 });await page.show();await tick();page.button('继续未完成测试').onClick();await tick();await tick();assert.match(page.text(page.render()),/第 51 \/ 51 题/);page.dispose();
});
