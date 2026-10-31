import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';

const family={id:'family-a',name:'共学家庭',role:'owner'};
const today={child:{nickname:'豆芽'},completed_words:16,goal:10,goal_reached:true,due_count:0,new_count:0,remaining_new_limit:0,streak_days:2};

test('home restores the existing child after login before showing any setup prompt',async()=>{
 const kids=deferred();const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family],referral_code:'referral'};
  if(path==='/families/family-a/children')return kids.promise;
  assert.equal(path,'/children/child-a/today');return today;
 },undefined,{cache:{family_id:'',child_id:''}});
 assert.match(page.text(page.render()),/正在加载/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案/);
 await page.show();assert.match(page.text(page.render()),/正在加载/);kids.resolve({items:[{id:'child-a',nickname:'豆芽'}]});await tick();
 assert.equal(page.cache.get('family_id'),'family-a');assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/豆芽 · 今日学习/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案|正在加载/);
});

test('home only shows the child setup prompt after confirming the family has no children',async()=>{
 let hasChild=false;const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path.endsWith('/children'))return {items:hasChild?[{id:'child-a'}]:[]};
  return today;
 },undefined,{cache:{child_id:''}});
 await page.show();assert.match(page.text(page.render()),/添加孩子档案/);assert.equal(page.cache.get('child_id'),'');
 hasChild=true;page.hide();await page.show();assert.match(page.text(page.render()),/豆芽 · 今日学习/);assert.equal(page.cache.get('child_id'),'child-a');
});

test('failed child lookup offers retry instead of claiming there are no children',async()=>{
 let fail=true;const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path.endsWith('/children')){if(fail)throw Error('NETWORK_TIMEOUT');return {items:[{id:'child-a'}]};}
  return today;
 },undefined,{cache:{child_id:''}});
 await page.show();assert.match(page.text(page.render()),/暂时无法加载学习进度/);assert.doesNotMatch(page.text(page.render()),/添加孩子档案/);
 fail=false;await page.button('重新加载').onClick();await tick();assert.match(page.text(page.render()),/豆芽 · 今日学习/);
});

test('home replaces an archived cached child with the existing child from the current family',async()=>{
 const page=pageHarness('pages/home/index',async path=>{
  if(path==='/me')return {families:[family]};
  if(path==='/children/removed/today')throw Object.assign(Error('CHILD_NOT_FOUND'),{status:404});
  if(path.endsWith('/children'))return {items:[{id:'child-a'}]};
  assert.equal(path,'/children/child-a/today');return today;
 },undefined,{cache:{child_id:'removed'}});
 await page.show();assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/豆芽 · 今日学习/);
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
