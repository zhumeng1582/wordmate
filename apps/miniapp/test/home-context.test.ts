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
 assert.equal(page.cache.get('family_id'),'family-a');assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/今日学习豆芽/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案|正在加载/);
});

test('home only shows the child setup prompt after confirming the family has no children',async()=>{
 let hasChild=false;const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path.endsWith('/children'))return {items:hasChild?[{id:'child-a'}]:[]};
  return today;
 },undefined,{cache:{child_id:''}});
 await page.show();assert.match(page.text(page.render()),/添加孩子档案/);assert.equal(page.cache.get('child_id'),'');
 hasChild=true;page.hide();await page.show();assert.match(page.text(page.render()),/今日学习豆芽/);assert.equal(page.cache.get('child_id'),'child-a');
});

test('failed child lookup offers retry instead of claiming there are no children',async()=>{
 let fail=true;const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path.endsWith('/children')){if(fail)throw Error('NETWORK_TIMEOUT');return {items:[{id:'child-a'}]};}
  return today;
 },undefined,{cache:{child_id:''}});
 await page.show();assert.match(page.text(page.render()),/暂时无法加载学习进度/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案/);
 fail=false;await page.button('重新加载').onClick();await tick();assert.match(page.text(page.render()),/今日学习豆芽/);
});

test('home replaces an archived cached child with the existing child from the current family',async()=>{
 const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path==='/children/removed/today')throw Object.assign(Error('CHILD_NOT_FOUND'),{status:404});
  if(path.endsWith('/children'))return {items:[{id:'child-a'}]};
  assert.equal(path,'/children/child-a/today?wordbook_id=book-a');return today;
 },undefined,{cache:{child_id:'removed'}});
 await page.show();assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/今日学习豆芽/);
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
 await page.show();await tick();assert.match(page.text(page.render()),/再学 10 词/);assert.match(page.text(page.render()),/一年级上册/);assert.match(page.text(page.render()),/已学 104 词 · 共 163 词/);
 page.hide();page.cache.set('current_wordbook:child-a','book-b');await page.show();await tick();assert.match(page.text(page.render()),/再学 3 词/);assert.match(page.text(page.render()),/一年级下册/);assert.match(page.text(page.render()),/已学 4 词 · 共 25 词/);assert.doesNotMatch(page.text(page.render()),/一年级上册|104 词/);
 assert.match(page.text(page.render()),/今日累计/);assert.equal(page.all(page.render()).filter(n=>n.type==='Button'&&n.props?.className==='home-current-book').length,1);assert(!page.all(page.render()).some(n=>n.type==='Button'&&n.props?.className==='home-shortcut'&&page.text(n)==='单词本'));page.button('当前词本').onClick();assert(page.routes.includes('/pages/words/index'));page.button('按日期复习').onClick();assert(page.routes.includes('/pages/calendar/index'));
 page.button('学习新词').onClick();assert.equal(page.cache.get('review_source').wordbook_id,'book-b');
});

test('late wordbook statistics cannot overwrite the newly selected book',async()=>{
 const oldStats=deferred(),page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[family]}:path.includes('/words?')?(path.includes('book-b')?{learned_count:3,book_total:9}:oldStats.promise):{...today,wordbook:{name:path.includes('book-b')?'新词本':'旧词本'}});
 await page.show();page.hide();page.cache.set('current_wordbook:child-a','book-b');await page.show();await tick();oldStats.resolve({learned_count:80,book_total:100});await tick();assert.match(page.text(page.render()),/已学 3 词 · 共 9 词/);assert.doesNotMatch(page.text(page.render()),/80 词/);
});
