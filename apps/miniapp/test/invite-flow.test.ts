import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {beginInviteLogin,acceptInviteLogin,consumeInviteLogin,cancelInviteLogin} from '../src/services/invite-login.ts';
const token='a'.repeat(43),family={id:'family-b',name:'共学家庭'},member={state:'member',family,children:[{id:'child-b'}]},ready={state:'ready',family},waiting={state:'waiting',family};
test('existing members enter home without an invitation form or an application',async()=>{
 const wait=deferred(),page=pageHarness('pages/invite/index',async()=>wait.promise,undefined,{query:{token}});await page.show();assert.doesNotMatch(page.text(page.render()),/和家人一起陪学|加入家庭/);
 wait.resolve(member);await tick();assert.deepEqual(page.routes,['/pages/home/index']);assert.equal(page.cache.get('family_id'),'family-b');assert.equal(page.cache.get('child_id'),'child-b');assert.deepEqual(page.calls.map(c=>c.path),['/family-invites/resolve']);page.dispose();
});
test('opening a card preserves a valid selected child in the same family',async()=>{
 const page=pageHarness('pages/invite/index',async()=>({...member,family:{...family,id:'family-a'},children:[{id:'child-a'},{id:'other-child'}]}),undefined,{query:{token}});await page.show();assert.equal(page.cache.get('child_id'),'child-a');assert.deepEqual(page.routes,['/pages/home/index']);page.dispose();
});
test('new signed-in parents apply once and automatically enter home after approval',async()=>{
 let state:any=ready;const page=pageHarness('pages/invite/index',async(path)=>{if(path.endsWith('/claim')){state=waiting;return {status:'claimed'};}return state;},undefined,{query:{token}});await page.show();assert.equal(page.calls.filter(c=>c.path.endsWith('/claim')).length,0);
 page.button('加入家庭').onClick();page.button('加入家庭').onClick();await tick();assert.equal(page.calls.filter(c=>c.path.endsWith('/claim')).length,1);assert.match(page.text(page.render()),/申请已发送/);assert.doesNotMatch(page.text(page.render()),/加入家庭/);
 state=member;await page.poll();assert.deepEqual(page.routes,['/pages/home/index']);page.dispose();
});
test('a waiting parent never resubmits when reopening the card or while backgrounded',async()=>{
 const page=pageHarness('pages/invite/index',async()=>waiting,undefined,{query:{token}});await page.show();assert.match(page.text(page.render()),/申请已发送/);page.hide();const before=page.calls.length;await page.poll();assert.equal(page.calls.length,before);await page.show();assert(page.calls.every(c=>c.path.endsWith('/resolve')));page.dispose();
});
test('successful login-and-join submits without a second join button',async()=>{
 let flow='',state:any=ready;const page=pageHarness('pages/invite/index',async(path)=>{if(path.endsWith('/claim')){state=waiting;return {status:'claimed'};}return state;},undefined,{query:{token},cache:{access_token:''},openLogin:async(_identity,id)=>{flow=id!;}});
 await page.show();assert(flow);assert.equal(page.calls.length,0);page.hide();page.cache.set('access_token','logged-in-parent');acceptInviteLogin(flow,'logged-in-parent');await page.show();assert.equal(page.calls.filter(c=>c.path.endsWith('/claim')).length,1);assert.match(page.text(page.render()),/申请已发送/);page.dispose();
});
test('cancelled login never applies or reopens the login screen in a loop',async()=>{
 let logins=0;const page=pageHarness('pages/invite/index',async()=>ready,undefined,{query:{token},cache:{access_token:''},openLogin:async()=>{logins++;}});await page.show();page.hide();await page.show();assert.equal(logins,1);assert.equal(page.calls.length,0);assert.match(page.text(page.render()),/微信登录并申请加入/);page.dispose();
});
test('a lost application response is recovered as waiting without submitting twice',async()=>{
 let state:any=ready;const page=pageHarness('pages/invite/index',async(path)=>{if(path.endsWith('/claim')){state=waiting;throw Error('NETWORK_TIMEOUT');}return state;},undefined,{query:{token}});await page.show();page.button('加入家庭').onClick();await tick();assert.match(page.text(page.render()),/申请已发送/);assert.doesNotMatch(page.text(page.render()),/NETWORK_TIMEOUT/);assert.equal(page.calls.filter(c=>c.path.endsWith('/claim')).length,1);page.dispose();
});
test('a late member response cannot switch the newly signed-in account or navigate home',async()=>{
 const wait=deferred(),page=pageHarness('pages/invite/index',async()=>wait.promise,undefined,{query:{token}});await page.show();page.cache.set('access_token','another-account');wait.resolve(member);await tick();assert.equal(page.routes.length,0);assert.equal(page.cache.get('family_id'),'family-a');page.dispose();
});
test('invalid and unavailable cards offer a clear exit without applying',async()=>{
 const invalid=pageHarness('pages/invite/index',async()=>{throw Error('must not request');},undefined,{query:{token:'invalid'}});await invalid.show();assert.match(invalid.text(invalid.render()),/邀请暂时不可用/);assert.equal(invalid.calls.length,0);invalid.dispose();
 const used=pageHarness('pages/invite/index',async()=>({state:'unavailable'}),undefined,{query:{token}});await used.show();assert.match(used.text(used.render()),/重新分享邀请卡片/);assert.equal(used.calls.length,1);used.dispose();
});
test('login consent acknowledgment is single-use and bound to its flow and account',()=>{
 beginInviteLogin('one');acceptInviteLogin('wrong','account');assert.equal(consumeInviteLogin('one','account'),false);
 beginInviteLogin('two');acceptInviteLogin('two','account');assert.equal(consumeInviteLogin('two','other'),false);
 beginInviteLogin('three');acceptInviteLogin('three','account');assert.equal(consumeInviteLogin('three','account'),true);assert.equal(consumeInviteLogin('three','account'),false);
 beginInviteLogin('four');acceptInviteLogin('four','account');cancelInviteLogin('four');assert.equal(consumeInviteLogin('four','account'),false);
});
