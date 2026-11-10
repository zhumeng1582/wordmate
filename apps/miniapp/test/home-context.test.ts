import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';

const family={id:'family-a',name:'共学家庭',role:'owner'};
const today={child:{nickname:'豆芽'},completed_words:16,goal:10,goal_reached:true,due_count:0,new_count:0,remaining_new_limit:0,streak_days:2};

test('home restores the existing child after login before showing any setup prompt',async()=>{
 const kids=deferred();const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family],referral_code:'referral'};
  if(path==='/families/family-a/children')return kids.promise;
  assert.equal(path,'/children/child-a/today?wordbook_id=book-a');return today;
 },undefined,{cache:{family_id:'',child_id:''}});
 assert.match(page.text(page.render()),/正在加载/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案/);
 await page.show();assert.match(page.text(page.render()),/正在加载/);kids.resolve({items:[{id:'child-a',nickname:'豆芽'}]});await tick();
 assert.equal(page.cache.get('family_id'),'family-a');assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/豆芽，今天一起学/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案|正在加载/);
});

test('home only shows the child setup prompt after confirming the family has no children',async()=>{
 let hasChild=false;const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path.endsWith('/children'))return {items:hasChild?[{id:'child-a'}]:[]};
  return today;
 },undefined,{cache:{child_id:''}});
 await page.show();assert.match(page.text(page.render()),/添加孩子档案/);assert.equal(page.cache.get('child_id'),'');
 hasChild=true;page.hide();await page.show();assert.match(page.text(page.render()),/豆芽，今天一起学/);assert.equal(page.cache.get('child_id'),'child-a');
});

test('failed child lookup offers retry instead of claiming there are no children',async()=>{
 let fail=true;const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path.endsWith('/children')){if(fail)throw Error('NETWORK_TIMEOUT');return {items:[{id:'child-a'}]};}
  return today;
 },undefined,{cache:{child_id:''}});
 await page.show();assert.match(page.text(page.render()),/暂时无法加载学习进度/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案/);
 fail=false;await page.button('重新加载').onClick();await tick();assert.match(page.text(page.render()),/豆芽，今天一起学/);
});

test('home replaces an archived cached child with the existing child from the current family',async()=>{
 const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path==='/children/removed/today')throw Object.assign(Error('CHILD_NOT_FOUND'),{status:404});
  if(path.endsWith('/children'))return {items:[{id:'child-a'}]};
  assert.equal(path,'/children/child-a/today?wordbook_id=book-a');return today;
 },undefined,{cache:{child_id:'removed'}});
 await page.show();assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/豆芽，今天一起学/);
});

test('home preserves the selected child and avoids fetching the child list on ordinary returns',async()=>{
 const page=pageHarness('pages/home/index',async path=>{if(path==='/me')return {families:[family]};assert.equal(path,'/children/child-b/today');return today;},undefined,{cache:{child_id:'child-b'}});
 await page.show();page.hide();await page.show();assert.equal(page.cache.get('child_id'),'child-b');assert(!page.calls.some(call=>call.path.endsWith('/children')));
});

test('late child discovery cannot change another account or a more recent child selection',async()=>{
 for(const change of ['account','selection','hide']){
  const kids=deferred(),page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:kids.promise,undefined,{cache:{child_id:''}});
  await page.show();
  if(change==='account')page.cache.set('access_token','account-b');else if(change==='selection')page.cache.set('child_id','new-selection');else page.hide();
  kids.resolve({items:[{id:'child-a'}]});await tick();assert.equal(page.cache.get('child_id'),change==='selection'?'new-selection':'');assert.doesNotMatch(page.text(page.render()),/豆芽/);
 }
});
test('returning home after a wordbook change reloads its counts and launches that book',async()=>{
 const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:path.includes('/words?')?(path.includes('wordbook_id=book-b')?{learned_count:4,book_total:25}:{learned_count:104,book_total:163}):{...today,wordbook:path.includes('wordbook_id=book-b')?{id:'book-b',name:'一年级下册'}:{id:'book-a',name:'一年级上册'},new_count:path.includes('wordbook_id=book-b')?3:20,new_group_size:path.includes('wordbook_id=book-b')?3:10});
 await page.show();await tick();assert.match(page.text(page.render()),/再学 10 词/);assert.match(page.text(page.render()),/一年级上册/);assert.match(page.text(page.render()),/已学 104 · 共 163/);
 page.hide();page.cache.set('current_wordbook:child-a','book-b');await page.show();await tick();assert.match(page.text(page.render()),/再学 3 词/);assert.match(page.text(page.render()),/一年级下册/);assert.match(page.text(page.render()),/已学 4 · 共 25/);assert.doesNotMatch(page.text(page.render()),/一年级上册|104 词/);
 assert.match(page.text(page.render()),/今日累计/);assert.equal(page.all(page.render()).filter(n=>n.type==='Button'&&n.props?.className==='home-current-book'&&page.text(n).includes('英语单词')).length,1);assert(!page.all(page.render()).some(n=>n.type==='Button'&&n.props?.className==='home-shortcut'&&page.text(n)==='单词本'));page.button('英语单词').onClick();assert(page.routes.includes('/pages/words/index'));assert(page.all(page.render()).some(n=>n.type==='CheckinStatus'));
 page.button('学习新词').onClick();assert.equal(page.cache.get('review_source').wordbook_id,'book-b');
});

test('late wordbook statistics cannot overwrite the newly selected book',async()=>{
 const oldStats=deferred(),page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:path.includes('/words?')?(path.includes('book-b')?{learned_count:3,book_total:9}:oldStats.promise):{...today,wordbook:{name:path.includes('book-b')?'新词本':'旧词本'}});
 await page.show();page.hide();page.cache.set('current_wordbook:child-a','book-b');await page.show();await tick();oldStats.resolve({learned_count:80,book_total:100});await tick();assert.match(page.text(page.render()),/已学 3 · 共 9/);assert.doesNotMatch(page.text(page.render()),/80 词/);
});
test('home keeps the student name in the title and learning and check-in in the English card',async()=>{
 const load=async(path:string)=>path==='/me'?{families:[family]}:path.endsWith('/poems')?{items:[],total:3}:path.includes('/words?')?{learned_count:0,book_total:0}:today;
 const page=pageHarness('pages/home/index',load);await page.show();await tick();const tree=page.render(),card=page.all(tree).find(n=>n.props?.className==='card home-progress-card');assert.match(page.text(tree),/豆芽，今天一起学/);assert.match(page.text(card),/英语单词/);assert(!page.text(card).includes('豆芽'));assert(page.all(card).some(n=>n.type==='CheckinStatus'));page.button('古诗词').onClick();assert.equal(page.routes.at(-1),'/pages/poems/index');page.dispose();
});

test('home shows the total number of memorized poems, including beyond the first page',async()=>{const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:path.endsWith('/poems')?{items:[],total:120,memorized_count:75}:path.includes('/words?')?{learned_count:0,book_total:0}:today);await page.show();await tick();assert.match(page.text(page.render()),/已背诵 75 首 · 共 120 首/);page.dispose();});

test('home uses the account visibility settings and refreshes them after returning',async()=>{const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:path.endsWith('/poems')?{total:2,memorized_count:1}:path.endsWith('/hanzi')?{total:3,learned_count:1}:path.includes('/words?')?{learned_count:0,book_total:0}:today,undefined,{cache:{'home_sections:account-a':{words:false,poems:true,hanzi:true}}});await page.show();await tick();let text=page.text(page.render());assert.doesNotMatch(text,/英语单词|今日累计/);assert.match(text,/古诗词/);assert.match(text,/汉字学习/);page.hide();page.cache.set('home_sections:account-a',{words:true,poems:false,hanzi:false});await page.show();text=page.text(page.render());assert.match(text,/英语单词/);assert.doesNotMatch(text,/古诗词|汉字学习/);page.dispose();});

test('poem and character libraries remain accessible if the daily word request fails',async()=>{const page=pageHarness('pages/home/index',async path=>{if(path==='/me')return {families:[family]};if(path.includes('/today'))throw Error('NETWORK_TIMEOUT');if(path.endsWith('/poems'))return {total:12,memorized_count:5};if(path.endsWith('/hanzi'))return {total:20,learned_count:4};return {learned_count:0,book_total:0};});await page.show();await tick();const text=page.text(page.render());assert.match(text,/暂时无法加载学习进度/);assert.match(text,/已背诵 5 首 · 共 12 首/);assert.match(text,/已学 4 字 · 共 20 字/);page.button('古诗词').onClick();assert.equal(page.routes.at(-1),'/pages/poems/index');page.button('汉字学习').onClick();assert.equal(page.routes.at(-1),'/pages/hanzi/index');page.dispose();});

test('settings require at least one visible home section and isolate accounts',async()=>{const page=pageHarness('pages/settings-home/index',async()=>({}));await page.show();const switchFor=(name:string)=>page.all(page.render()).find(n=>n.type==='Switch'&&n.props['aria-label']===`首页显示${name}`).props;switchFor('英语单词').onChange({detail:{value:false}});switchFor('古诗词').onChange({detail:{value:false}});assert.equal(switchFor('汉字学习').disabled,true);switchFor('汉字学习').onChange({detail:{value:false}});assert.deepEqual(JSON.parse(JSON.stringify(page.cache.get('home_sections:account-a'))),{words:false,poems:false,hanzi:true});page.cache.set('access_token','account-b');await page.show();assert.equal(switchFor('英语单词').checked,true);assert.equal(switchFor('古诗词').checked,true);assert.equal(switchFor('汉字学习').checked,true);page.dispose();});

test('home visibility settings open on a separate page',async()=>{const page=pageHarness('pages/settings/index',async()=>({}));await page.show();assert.equal(page.all(page.render()).filter(n=>n.type==='Switch').length,0);page.button('首页显示').onClick();assert.equal(page.routes.at(-1),'/pages/settings-home/index');page.dispose();});
test('independent library cards show view check-ins and open the correct filtered lists',async()=>{const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:path.endsWith('/library-checkins')?{poems:{total_days:3,checked_in:true},hanzi:{total_days:7,checked_in:false}}:path.endsWith('/poems')?{total:12,memorized_count:5}:path.endsWith('/hanzi')?{total:20,learned_count:4}:path.includes('/words?')?{learned_count:0,book_total:0}:today);await page.show();await tick();await tick();const view=page.text(page.render());assert.match(view,/累计 3 天/);assert.match(view,/累计 7 天/);page.button('学习新诗').onClick();page.button('复习诗词').onClick();page.button('学习新字').onClick();page.button('复习汉字').onClick();assert.deepEqual(page.routes.slice(-4),['/pages/poems/index?status=unmemorized','/pages/poems/index?status=memorized','/pages/hanzi/index?status=unlearned','/pages/hanzi/index?status=learned']);page.dispose();});
