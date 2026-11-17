import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {roundFixture} from './hanzi-round-fixture.ts';
const progress={date:'2026-11-10',completed:3,goal:10,checked_in:false,new_count:6,due_count:2,streak_days:1,total_days:5,makeup_credits:1};
const loader=(round:any=null,fail=false)=>async(path:string)=>{
 if(path==='/me')return {families:[{id:'family-a'}]};if(path.endsWith('/poem-books'))return {items:[{id:'poem-a',name:'我的诗本'}]};if(path.endsWith('/hanzi-books'))return {items:[{id:'hanzi-a',name:'我的汉字本'}]};if(path.includes('/hanzi-progress')){if(fail)throw Error('NETWORK_TIMEOUT');return progress;}if(path.endsWith('/hanzi-study-rounds'))return {round};if(path.includes('/hanzi?'))return {items:[],total:20,learned_count:8};if(path.includes('/words?'))return {items:[],book_total:20,learned_count:8};if(path.includes('/today'))return {child:{id:'child-a',nickname:'豆芽'},wordbook:{id:'book-a',name:'我的单词本'},completed_words:3,goal:10,new_count:6,new_group_size:6,due_count:2};return {items:[],poems:{total_days:0,checked_in:false},hanzi:{total_days:0,checked_in:false}};
};
const card=(page:any,kind:string)=>page.all(page.render()).find((n:any)=>n.props?.['data-kind']===kind);
const button=(page:any,node:any,title:string)=>page.all(node).find((n:any)=>n.type==='Button'&&n.props.className!=='home-current-book'&&page.text(n).includes(title)).props;
test('home learned totals include both learning and mastered items in all three subjects',async()=>{
 const read=loader();
 const page=pageHarness('pages/home/index',async(path)=>{
  if(path.includes('/poems?'))return {items:[],total:2,memorized_count:1,overall_total:4,overall_learned_count:3};
  const result=await read(path);
  return path.includes('/hanzi?')||path.includes('/words?')?{...result,overall_total:24,overall_learned_count:12}:result;
 });
 await page.show();await tick();
 for(const kind of ['words','hanzi'])assert.match(page.text(card(page,kind)),/已学 12 · 共 24/);
 assert.match(page.text(card(page,'poems')),/已学 3 首 · 共 4 首/);
 for(const kind of ['words','hanzi'])assert.match(page.text(card(page,kind)),/今日累计3 \/ 10/);
 page.dispose();
});
test('word and character home cards share the same layout, daily progress and check-in component without calendar shortcuts',async()=>{
 const page=pageHarness('pages/home/index',loader());await page.show();await tick();const words=card(page,'words'),hanzi=card(page,'hanzi');assert(words&&hanzi);for(const area of [words,hanzi]){assert.match(page.text(area),/已学 8 · 共 20/);assert.match(page.text(area),/今日累计3 \/ 10/);for(const name of ['home-current-book','home-progress-summary','home-learning-actions'])assert.equal(page.all(area).filter((n:any)=>n.props?.className?.split(' ').includes(name)).length,1);assert.equal(page.all(area).filter((n:any)=>n.type==='CheckinStatus').length,1);}assert.doesNotMatch(page.text(page.render()),/学习日历/);button(page,hanzi,'学习新字').onClick();assert.equal(page.routes.at(-1),'/pages/hanzi-study/index?source=new&count=6');button(page,hanzi,'复习汉字').onClick();await tick();assert.equal(page.routes.at(-1),'/pages/hanzi-study/index?source=review&count=2');page.dispose();
});
test('character home resumes only the selected book and preserves the old scope warning',async()=>{
 for(const selected of [true,false]){const round={id:'r',status:'in_progress',source:'new',book_id:selected?'hanzi-a':'other',total_count:10,answered_count:4};const page=pageHarness('pages/home/index',loader(round));await page.show();await tick();const area=card(page,'hanzi');assert.match(page.text(area),selected?/继续学习剩余 6 字/:/其他范围的学习未完成/);button(page,area,selected?'继续学习':'学习新字').onClick();assert.equal(page.routes.at(-1),selected?'/pages/hanzi-study/index?source=new':'/pages/hanzi-study/index?source=new&count=6');page.dispose();}
});
test('character loading errors disable its actions and leave word learning usable',async()=>{
 const page=pageHarness('pages/home/index',loader(null,true));await page.show();await tick();assert.equal(button(page,card(page,'words'),'学习新词').disabled,false);assert.equal(card(page,'hanzi').props['data-state'],'error');assert.match(page.text(card(page,'hanzi')),/NETWORK_TIMEOUT/);page.dispose();
});
test('character home recommendation is honored by the actual new learning group',async()=>{
 const items=Array.from({length:8},(_,n)=>({id:'h'+n,character:String.fromCodePoint(0x4e00+n),learned_at:null}));const page=pageHarness('pages/hanzi-study/index',roundFixture(async()=>({items})),undefined,{query:{source:'new',count:'6'},cache:{'current_hanzi_book:child-a':'hanzi-a'}});await page.show();page.button('开始学习').onClick();await tick();const created=page.calls.find(c=>c.method==='POST'&&c.path.endsWith('/hanzi-study-rounds'))!;assert.equal(created.body.ids.length,6);assert.equal(created.body.book_id,'hanzi-a');assert.equal(page.actionSheets.length,0);page.dispose();
});
test('character check-in shares and makes up character progress through the common status component',async()=>{
 let shares=0;const page=pageHarness('components/CheckinStatus',async()=>({}),'CheckinStatus',{props:{kind:'hanzi',today:{...progress,completed_words:3,total_checkin_days:5},onShare:()=>shares++,onChanged(){}}});assert.match(page.text(page.render()),/今日汉字未打卡/);page.button('分享进度').onClick();assert.equal(shares,1);assert(!page.all(page.render()).some(n=>n.type==='Picker'));assert.doesNotMatch(page.text(page.render()),/补卡/);assert.equal(page.calls.length,0);page.dispose();
});
test('empty new-word and new-character home actions still enter learning and never open import',async()=>{
 const read=loader();const page=pageHarness('pages/home/index',async(path,method,body)=>{const result=await read(path);return path.includes('/today')?{...result,new_count:0,new_group_size:0}:path.includes('/hanzi-progress')?{...result,new_count:0}:result;});
 await page.show();await tick();assert.doesNotMatch(page.text(page.render()),/录入单词|录入汉字/);
 page.button('学习新词').onClick();assert.equal(page.routes.at(-1),'/pages/review/index');assert.deepEqual(JSON.parse(JSON.stringify(page.cache.get('review_source'))),{source:'new_words',wordbook_id:'book-a'});
 page.button('学习新字').onClick();assert.equal(page.routes.at(-1),'/pages/hanzi-study/index?source=new');assert(!page.routes.some(route=>/add-words|hanzi-import/.test(route)));page.dispose();
});
test('an empty character book shows a learning empty state without creating a round or offering import',async()=>{
 const page=pageHarness('pages/hanzi-study/index',roundFixture(async()=>({items:[]})),undefined,{query:{source:'new'},cache:{'current_hanzi_book:child-a':'hanzi-a'}});await page.show();assert.match(page.text(page.render()),/当前字本暂无未学汉字/);assert.doesNotMatch(page.text(page.render()),/添加|导入|开始学习/);assert(!page.calls.some(c=>c.method==='POST'));page.button('返回').onClick();assert.equal(page.backCount,1);page.dispose();
});
test('an empty word queue shows a learning empty state with a return action',async()=>{
 class Controller{state={flow:null,pending:null,conflict:null,busy:false,error:Error('EMPTY_NEW_QUEUE'),notice:'',rejected:false};subscribe(){return()=>{};}begin(){return Promise.resolve();}dispose(){}heartbeat(){}}
 const page=pageHarness('components/ReviewSession',async()=>({items:[]}),'ReviewSession',{studyController:Controller,cache:{review_source:{source:'new_words',wordbook_id:'book-a'}}});await tick();assert.match(page.text(page.render()),/当前词本暂无未学单词/);assert.doesNotMatch(page.text(page.render()),/正在准备单词|添加|导入/);page.button('返回').onClick();assert.equal(page.backCount,1);page.dispose();
});

test('returning home keeps character learning actions stable while refreshing book and progress data',async()=>{
 for(const continuing of [false,true]){
  const round=continuing?{id:'r',status:'in_progress',source:'new',book_id:'hanzi-a',total_count:10,answered_count:4}:null;
  const read=loader(round),books=deferred(),refreshProgress=deferred();let refreshing=false;
  const page=pageHarness('pages/home/index',async(path)=>{if(refreshing&&path.endsWith('/hanzi-books'))return books.promise;if(refreshing&&path.includes('/hanzi-progress'))return refreshProgress.promise;return read(path);});
  await page.show();await tick();const snapshot=()=>{const area=card(page,'hanzi');return {text:page.text(area),buttons:page.all(area).filter((n:any)=>n.type==='Button').map((n:any)=>({text:page.text(n),className:n.props.className,disabled:n.props.disabled}))};},before=snapshot();
  assert.equal(button(page,card(page,'hanzi'),continuing?'继续学习':'学习新字').disabled,false);
  page.hide();refreshing=true;await page.show();assert.deepEqual(snapshot(),before);
  books.resolve({items:[{id:'hanzi-a',name:'我的汉字本'}]});await tick();assert.deepEqual(snapshot(),before);
  refreshProgress.resolve({...progress,completed:7,new_count:4});await tick();assert.match(page.text(card(page,'hanzi')),/今日累计7 \/ 10/);assert.equal(button(page,card(page,'hanzi'),continuing?'继续学习':'学习新字').disabled,false);page.dispose();
 }
});
test('switching the current character book still clears previous progress and blocks learning until ready',async()=>{
 const read=loader(),waiting=deferred();let changed=false;
 const page=pageHarness('pages/home/index',async(path)=>{if(path.endsWith('/hanzi-books'))return {items:[{id:'hanzi-a',name:'我的汉字本'},{id:'hanzi-b',name:'新字本'}]};if(changed&&path.includes('/hanzi-progress'))return waiting.promise;return read(path);});
 await page.show();await tick();page.hide();page.cache.set('current_hanzi_book:child-a','hanzi-b');changed=true;await page.show();assert.equal(card(page,'hanzi').props['data-state'],'loading');assert.doesNotMatch(page.text(card(page,'hanzi')),/今日累计3 \/ 10/);
 waiting.resolve({...progress,completed:9});await tick();assert.equal(button(page,card(page,'hanzi'),'学习新字').disabled,false);assert.match(page.text(card(page,'hanzi')),/新字本/);button(page,card(page,'hanzi'),'学习新字').onClick();assert.equal(page.routes.at(-1),'/pages/hanzi-study/index?source=new&count=6');page.dispose();
});

test('a removed character book does not reuse its cached progress while the fallback book loads',async()=>{
 const read=loader(),waiting=deferred();let removed=false;
 const page=pageHarness('pages/home/index',async(path)=>{if(removed&&path.endsWith('/hanzi-books'))return {items:[{id:'fallback',name:'其他字本'}]};if(removed&&path.includes('/hanzi-progress'))return waiting.promise;return read(path);});
 await page.show();await tick();page.hide();removed=true;await page.show();assert.equal(page.cache.get('current_hanzi_book:child-a'),'fallback');assert.equal(card(page,'hanzi').props['data-state'],'loading');assert.doesNotMatch(page.text(card(page,'hanzi')),/今日累计3 \/ 10/);
 waiting.resolve({...progress,completed:5});await tick();assert.equal(button(page,card(page,'hanzi'),'学习新字').disabled,false);assert.match(page.text(card(page,'hanzi')),/今日累计5 \/ 10/);page.dispose();
});
