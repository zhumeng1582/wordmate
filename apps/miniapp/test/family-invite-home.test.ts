import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const tracking={familyId:'family-b',name:'新家庭',account:'account-a'};
const today={child:{nickname:'小明'},completed_words:0,goal:10,due_count:0,new_count:0};
test('home shows a pending application after leaving the invitation page',async()=>{
 const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'}],family_applications:[{family_id:'family-b',family_name:'新家庭'}]}:today,undefined,{cache:{pending_family_invite:tracking}});
 await page.show();assert.match(page.text(page.render()),/等待家人确认/);assert(!page.all(page.render()).some(node=>node.type==='Button'&&page.text(node).includes('进入家庭')));page.dispose();
});
test('approval provides a direct entry and switches the selected family and child',async()=>{
 const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'},{id:'family-b',name:'新家庭'}],family_applications:[]}:path==='/families/family-b/children'?{items:[{id:'child-b'}]}:today,undefined,{cache:{pending_family_invite:tracking}});
 await page.show();assert.match(page.text(page.render()),/已加入“新家庭”/);page.button('进入家庭').onClick();await tick();assert.equal(page.cache.get('family_id'),'family-b');assert.equal(page.cache.get('child_id'),'child-b');assert.equal(page.cache.has('pending_family_invite'),false);page.dispose();
});
test('expired application can be dismissed and a late child response cannot switch accounts',async()=>{
 const invalid=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'}],family_applications:[]}:today,undefined,{cache:{pending_family_invite:tracking}});await invalid.show();assert.match(invalid.text(invalid.render()),/邀请已失效/);invalid.button('知道了').onClick();assert.equal(invalid.cache.has('pending_family_invite'),false);invalid.dispose();
 const wait=deferred(),page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'},{id:'family-b',name:'新家庭'}],family_applications:[]}:path==='/families/family-b/children'?wait.promise:today,undefined,{cache:{pending_family_invite:tracking}});await page.show();page.button('进入家庭').onClick();page.cache.set('access_token','other');wait.resolve({items:[{id:'child-b'}]});await tick();assert.equal(page.cache.get('family_id'),'family-a');page.dispose();
});
test('an application made using an invite token is tracked for approval after returning home',async()=>{
 const page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'}],family_applications:[{family_id:'family-b',family_name:'新家庭'}]}:today);
 await page.show();assert.equal(page.cache.get('pending_family_invite').familyId,'family-b');page.dispose();
});

test('a late approval response cannot overwrite a newer family selection or a hidden page',async()=>{
 for(const change of ['family','child','hide']){
  const wait=deferred(),page=pageHarness('pages/home/index',async path=>path==='/me'?{families:[{id:'family-a'},{id:'family-b',name:'新家庭'}],family_applications:[]}:path==='/families/family-b/children'?wait.promise:today,undefined,{cache:{pending_family_invite:tracking}});
  await page.show();page.button('进入家庭').onClick();
  if(change==='family')page.cache.set('family_id','family-c');
  if(change==='child')page.cache.set('child_id','child-c');
  if(change==='hide')page.hide();
  wait.resolve({items:[{id:'child-b'}]});await tick();
  assert.equal(page.cache.get('family_id'),change==='family'?'family-c':'family-a');
  assert.equal(page.cache.get('child_id'),change==='child'?'child-c':'child-a');
  assert.equal(page.cache.get('pending_family_invite').familyId,'family-b');page.dispose();
 }
});
