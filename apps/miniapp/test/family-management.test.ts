import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
const family={id:'family-a',name:'甲家庭',role:'owner'},otherFamily={id:'family-b',name:'乙家庭',role:'owner'},parent={id:'parent',display_name:'爸爸'};
const first={id:'child-a',nickname:'大宝',school_grade:'小学一年级',gender:'boy',version:3};
const second={id:'child-b',nickname:'二宝',school_grade:'',gender:'unspecified',version:1};
function childPage(){
 let children=[first];
 return pageHarness('pages/family/index',async(path,method,body)=>{
  if(path==='/me')return {user:parent,families:[family]};
  if(path.endsWith('/children')){if(method==='POST'){children=[...children,{...second,...body}];return children.at(-1);}return {items:children};}
  if(path==='/children/child-a'&&method==='PATCH'){assert.equal(body.expected_version,3);children=[{...first,...body,version:4}];return children[0];}
  return {items:[]};
 });
}
test('adding a sibling preserves current learning and provides an explicit switch',async()=>{
 const page=childPage();await page.show();page.button('＋ 添加').onClick();
 page.all(page.render()).find(n=>n.type==='Input'&&n.props.placeholder==='例如：小明')!.props.onInput({detail:{value:'二宝'}});
 await page.button('保存孩子档案').onClick();await tick();
 assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/当前学习的孩子保持不变/);
 page.button('切换到二宝').onClick();assert.equal(page.cache.get('child_id'),'child-b');assert.equal(page.routes.at(-1),'/pages/home/index');page.dispose();
});
test('editing a child uses its version and keeps the existing selection and records',async()=>{
 const page=childPage();await page.show();page.button('编辑大宝资料').onClick();
 const view=page.text(page.render());assert.match(view,/编辑孩子资料/);
 page.all(page.render()).find(n=>n.type==='Input'&&n.props.placeholder==='例如：小明')!.props.onInput({detail:{value:'小明'}});
 await page.button('保存孩子档案').onClick();await tick();
 assert.equal(page.cache.get('child_id'),'child-a');assert.match(page.text(page.render()),/小明/);assert(!page.calls.some(c=>c.method==='DELETE'));assert.equal(page.calls.filter(c=>c.method==='PATCH').length,1);page.dispose();
});
test('switching back to a family restores its second child',async()=>{
 const page=pageHarness('pages/family/index',async path=>path==='/me'?{user:parent,families:[family,otherFamily]}:path.endsWith('/children')?{items:path.includes('family-a')?[first,second]:[{id:'child-c',nickname:'乙家孩子'}]}:{items:[]},undefined,{cache:{child_id:'child-b'}});
 await page.show();page.button('账号与家庭').onClick();await page.button('乙家庭 · 管理员').onClick();await tick();page.button('账号与家庭').onClick();await page.button('甲家庭 · 管理员').onClick();await tick();
 assert.equal(page.cache.get('child_id'),'child-b');page.dispose();
});
test('expired login on family page immediately exposes its login entry',async()=>{
 let page:ReturnType<typeof pageHarness>;
 page=pageHarness('pages/family/index',async()=>{await tick();page.cache.clear();throw Error('UNAUTHENTICATED');});
 await page.show();await tick();assert.match(page.text(page.render()),/微信登录/);assert.doesNotMatch(page.text(page.render()),/孩子档案/);page.dispose();
});
test('an applicant can cancel; the owner can reject applications and revoke unused invitations',async()=>{
 let applications:any[]=[{id:'application',family_id:'family-b',family_name:'乙家庭'}],invites:any[]=[{id:'claimed',status:'claimed',applicant:'妈妈',expires_at:new Date(Date.now()+86400000).toISOString()},{id:'unused',status:'pending',expires_at:new Date(Date.now()+86400000).toISOString()}];
 const page=pageHarness('pages/family/index',async(path,method)=>{
  if(path==='/me')return {user:parent,families:[family],family_applications:applications};
  if(path.endsWith('/cancel')){applications=[];return {};}
  if(path.endsWith('/reject')){invites=invites.filter(i=>i.id!=='claimed');return {};}
  if(path.endsWith('/revoke')){invites=[];return {};}
  return {items:path.endsWith('/children')?[first]:path.endsWith('/invites')?invites:[]};
 });
 await page.show();await page.button('取消申请').onClick();await tick();assert(!page.text(page.render()).includes('已申请加入'));
 await page.button('拒绝申请').onClick();await tick();assert(!page.text(page.render()).includes('等待你确认'));
 page.button('账号与家庭').onClick();await page.button('加入申请').onClick();await tick();await page.button('撤销邀请').onClick();await tick();
 assert.deepEqual(page.calls.filter(c=>c.method==='POST').map(c=>c.path),['/family-invites/application/cancel','/family-invites/claimed/reject','/family-invites/unused/revoke']);page.dispose();
});
test('a late child creation cannot change the newly selected account context',async()=>{
 const wait=deferred();
 const page=pageHarness('pages/family/index',async(path,method)=>path==='/me'?{user:parent,families:[family]}:method==='POST'?wait.promise:{items:path.endsWith('/children')?[first]:[]});
 await page.show();page.button('＋ 添加').onClick();page.all(page.render()).find(n=>n.type==='Input')!.props.onInput({detail:{value:'二宝'}});
 const saving=page.button('保存孩子档案').onClick();page.cache.set('access_token','new-account');page.cache.set('child_id','new-account-child');wait.resolve(second);await saving;await tick();
 assert.equal(page.cache.get('child_id'),'new-account-child');assert(!page.text(page.render()).includes('已添加“二宝”'));page.dispose();
});
