import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';

test('home keeps date review separate when nothing is due',async()=>{
 const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[]}:{child:{nickname:'小明'},completed_words:0,goal:10,due_count:0,new_count:0});
 await page.show();assert.equal(page.button('复习单词').disabled,true);assert.match(page.text(page.render()),/今日无待复习/);page.button('按日期复习').onClick();assert.equal(page.routes.at(-1),'/pages/calendar/index');
});

test('wordbook selector switches the visible book and saves the selection',async()=>{
 const page=pageHarness('pages/words/index',async path=>path.endsWith('/wordbooks')?{items:[{id:'book-a',name:'英语一'},{id:'book-b',name:'英语二'}]}:path.includes('/ai-batches')?{items:[]}:{items:[],total:0,book_total:0,learned_count:0,next_cursor:null});
 await page.show();const picker=page.all(page.render()).find(n=>n.type==='Picker');assert(picker);assert.match(page.text(picker),/英语一/);picker.props.onChange({detail:{value:'1'}});await tick();assert.equal(page.cache.get('current_wordbook:child-a'),'book-b');assert(page.requests.some(path=>path.includes('wordbook_id=book-b')));
});

test('wordbook export keeps whole-book selection and exclusions in the bottom bar',async()=>{
 const page=pageHarness('pages/words/index',async(path,method)=>{
  if(path.endsWith('/wordbooks'))return {items:[{id:'book-a',name:'英语一'}]};
  if(path.includes('/ai-batches'))return {items:[]};
  if(method==='POST'&&path.endsWith('/word-exports'))return {content:'word\ncat'};
  return {items:[{id:'word-a',lemma:'cat',version:1},{id:'word-b',lemma:'dog',version:1}],total:5,book_total:5,learned_count:2,next_cursor:null};
 });
 await page.show();let tree=page.render();const picker=page.all(tree).find(n=>n.type==='Picker');assert(picker);assert.match(page.text(picker),/英语一/);assert.match(page.text(tree),/单词列表2\/5/);assert(!page.all(tree).some(n=>n.props?.className==='wordbook-overview'));page.button('选择导出').onClick();tree=page.render();assert(page.all(tree).some(n=>n.props?.className==='wordbook-export-bar'));assert.match(page.text(tree),/已选 0 词/);
 page.button('全选整个词本').onClick();tree=page.render();assert.match(page.text(tree),/已选 5 词/);
 const word=page.all(tree).find(n=>n.props?.id==='word-word-a');assert(word);word.props.onClick();tree=page.render();assert.match(page.text(tree),/已选 4 词/);
 await page.button('导出 CSV').onClick();await tick();const call=page.calls.find(x=>x.path.endsWith('/word-exports'));assert(call);assert.equal(call.body.all,true);assert.equal(call.body.wordbook_id,'book-a');assert.deepEqual(Array.from(call.body.excluded_ids),['word-a']);
 const cancel=page.all(page.render()).find(n=>n.props?.className==='wordbook-export-cancel');assert(cancel);cancel.props.onClick();assert(!page.all(page.render()).some(n=>n.props?.className==='wordbook-export-bar'));
});

test('wordbook uses its heading for switching and leaves management in settings',async()=>{
 const page=pageHarness('pages/words/index',async path=>path.endsWith('/wordbooks')?{items:[{id:'book-a',name:'英语一'}]}:path.includes('/ai-batches')?{items:[]}:{items:[],total:0,book_total:0,learned_count:0,next_cursor:null});
 await page.show();assert(page.all(page.render()).some(n=>n.type==='Picker'));assert.doesNotMatch(page.text(page.render()),/词本工具/);
 const settings=pageHarness('pages/settings-tools/index',async()=>({}));await settings.show();settings.button('词本管理与发现').onClick();settings.button('添加单词').onClick();settings.button('搜索单词').onClick();assert.equal(settings.routes.join(','),'/pages/wordbooks/index,/pages/add-words/index,/pages/word-search/index');
});

test('settings groups tools and preferences into clear subpages',async()=>{
 const page=pageHarness('pages/settings/index',async()=>({}));await page.show();const tree=page.render();assert.match(page.text(tree),/家庭与 AI/);assert.doesNotMatch(page.text(tree),/词本管理与发现|答题后自动切换/);page.button('学习工具').onClick();page.button('学习设置').onClick();assert.deepEqual(page.routes,['/pages/settings-tools/index','/pages/settings-learning/index']);page.cache.set('child_id','');await page.show();assert.equal(page.button('学习工具').disabled,true);assert.equal(page.button('单词聊天记录').disabled,true);
});

test('a failed quiz scope change clears the previous count and can be retried',async()=>{
 let fail=true;const page=pageHarness('pages/quiz/index',async path=>{if(path.includes('scope=favorites')){if(fail)throw Error('NETWORK_TIMEOUT');return {eligible_count:7};}return {eligible_count:12};});
 await page.show();assert.match(page.text(page.render()),/学习过 12/);await page.button('收藏测试').onClick();await tick();assert.match(page.text(page.render()),/已收藏 —/);assert.equal(page.button('开始收藏测试').disabled,true);fail=false;await page.button('重新加载测试范围').onClick();await tick();assert.match(page.text(page.render()),/已收藏 7/);assert.equal(page.button('开始收藏测试').disabled,false);
});

test('joining a shared book offers a direct route to the selected book',async()=>{
 const page=pageHarness('pages/discover/index',async(path,method)=>method==='POST'?{id:'joined-book'}:{items:[{id:'shared-a',title:'词本',word_count:2}],next_offset:null});
 await page.show();page.button('加入词本').onClick({stopPropagation(){}});await tick();assert.equal(page.cache.get('current_wordbook:child-a'),'joined-book');assert.match(page.text(page.render()),/已加入词本/);page.button('查看词本').onClick();assert.equal(page.routes.at(-1),'/pages/words/index');
});

test('continuing a test opens the first unanswered page',async()=>{
 const quiz={id:'quiz-a',status:'in_progress',version:1,total_count:2,answered_count:1,mode:'full',month:'2026-10'};
 const page=pageHarness('pages/quiz/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:2,active_quiz_id:quiz.id};
  if(path.endsWith('/resume'))return {quiz,session:{id:'session',lease_generation:1}};
  if(path.includes('/items?'))return {items:[{id:'first',ordinal:1,selected_option_id:'a',word:{id:'a',lemma:'first',version:1},options:[]},{id:'second',ordinal:2,selected_option_id:null,word:{id:'b',lemma:'second',version:1},options:[]}],next_cursor:null};
  return quiz;
 });
 await page.show();await page.button('继续未完成的测试').onClick();page.render();await tick();assert.match(page.text(page.render()),/second/);assert.equal(page.calls.filter(call=>call.path.endsWith('/resume')).length,1);
});

test('a new test enters its first question when preparation completes',async()=>{
 const quiz={id:'quiz-b',status:'preparing',version:1,total_count:1,answered_count:0,mode:'sample',month:'2026-10'};
 const ready={...quiz,status:'ready'};
 const page=pageHarness('pages/quiz/index',async(path,method)=>{
  if(path.includes('/preview'))return {eligible_count:1,active_quiz_id:null};
  if(path.endsWith('/monthly-quizzes')&&method==='POST')return quiz;
  if(path.endsWith('/resume'))return {quiz:{...ready,status:'in_progress'},session:{id:'session',lease_generation:1}};
  if(path.includes('/items?'))return {items:[{id:'one',ordinal:1,selected_option_id:null,word:{id:'word',lemma:'apple',version:1},options:[]}],next_cursor:null};
  return ready;
 });
 await page.show();await page.button('开始月测').onClick();page.render();await page.poll();page.render();await tick();assert.match(page.text(page.render()),/apple/);assert.equal(page.calls.filter(call=>call.path.endsWith('/resume')).length,1);
});
