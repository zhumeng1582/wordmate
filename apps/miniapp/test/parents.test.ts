import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {invitationState} from '../src/services/parents.ts';
const dad={id:'parent-a',user_id:'parent-a',display_name:'小明爸爸',version:1,avatar_path:null,is_self:true,role:'owner'},mom={id:'parent-b',user_id:'parent-b',display_name:'小明妈妈',version:2,avatar_path:null,is_self:false,role:'parent'};
const family={id:'family-a',name:'小明一家',role:'owner'},expires=new Date(Date.now()+86400000).toISOString();
function familyPage(state:{members?:any[];invites?:any[];families?:any[];applications?:any[]}={}){
 let invites=state.invites??[],members=state.members??[dad];
 return pageHarness('pages/family/index',async(path,method)=>{
  if(method==='POST'){assert.match(path,/\/approve$/);members=[dad,mom];invites=invites.map(item=>({...item,status:'approved'}));return {status:'approved'};}
  if(path==='/me')return {user:dad,families:state.families??[family],family_applications:state.applications??[]};
  if(path.endsWith('/members'))return {items:members};if(path.endsWith('/invites'))return {items:invites};return {items:[{id:'child-a',nickname:'小明'}]};
 });
}
test('an unused family invitation is visible while the member count stays accurate',async()=>{
 const page=familyPage({invites:[{id:'invite-a',status:'pending',expires_at:expires}]});await page.show();const text=page.text(page.render());assert.match(text,/一起陪学 · 1 位家长/);assert.match(text,/邀请已发出，等待家长申请/);assert.match(text,/继续邀请家长/);assert(page.calls.every(call=>call.method==='GET'));
});
test('family puts the selected child first and hides unused invitation hints after two parents join',async()=>{
 const page=familyPage({members:[dad,mom],invites:[{id:'unused',status:'pending',expires_at:expires}]});page.cache.set('child_id','');await page.show();const text=page.text(page.render());
 assert.equal(page.cache.get('child_id'),'child-a');assert(text.indexOf('孩子档案')<text.indexOf('一起陪学'));assert.match(text,/当前学习/);assert.doesNotMatch(text,/等待.*家长|选择孩子|已加入/);
 const reads=page.calls.length;await page.poll();assert.equal(page.calls.length,reads);
 page.button('小明').onClick();assert.equal(page.routes.at(-1),'/pages/home/index');page.dispose();
});
test('a claimed invitation displays the applicant and requires an explicit approval action',async()=>{
 const page=familyPage({invites:[{id:'invite-a',status:'claimed',expires_at:expires,applicant:'小明妈妈',applicant_profile:mom}]});await page.show();assert.match(page.text(page.render()),/小明妈妈.*已申请，等待你确认/);assert.doesNotMatch(page.text(page.render()),/邀请家人/);assert(!page.calls.some(call=>call.method==='POST'));
 await page.button('确认加入家庭').onClick();await tick();assert.match(page.text(page.render()),/一起陪学 · 2 位家长/);assert.doesNotMatch(page.text(page.render()),/等待你确认/);
});
test('a parent awaiting approval sees the application instead of a misleading create-family prompt',async()=>{
 const page=familyPage({families:[],applications:[{id:'invite-a',family_id:'family-b',family_name:'共学家庭',status:'claimed',expires_at:expires}]});await page.show();assert.match(page.text(page.render()),/已申请加入“共学家庭”/);assert.match(page.text(page.render()),/无需重复创建家庭/);assert.doesNotMatch(page.text(page.render()),/建立你们的家庭/);assert(page.button('设置头像与昵称'));
});
test('the home page focuses on learning and does not load or poll family details',async()=>{
 const page=pageHarness('pages/home/index',async path=>{if(path==='/me')return {families:[family],referral_code:'referral'};assert.equal(path,'/children/child-a/today?wordbook_id=book-a');return {child:{nickname:'小明'},completed_words:0,goal:10,due_count:0,new_count:8,remaining_new_limit:8};});await page.show();
 const text=page.text(page.render());assert.match(text,/今日学习小明/);assert.match(text,/学习新词/);assert.match(text,/分享小程序/);assert.doesNotMatch(text,/一起陪学|切换孩子|复习安排/);
 page.button('设置').onClick();assert.equal(page.routes.at(-1),'/pages/settings/index');
 const reads=page.calls.length;await page.poll();assert.equal(page.calls.length,reads);assert(page.calls.every(call=>!call.path.includes('/families/')));
});
test('settings keeps child switching with the family and opens the review instructions without login',async()=>{
 const page=pageHarness('pages/settings/index',async()=>({}),undefined,{cache:{access_token:'',child_id:''}});await page.show();
 assert.match(page.text(page.render()),/家庭与 AI/);assert.match(page.text(page.render()),/家庭与孩子/);assert.equal(page.button('家庭与孩子').disabled,false);page.button('家庭与孩子').onClick();assert.equal(page.routes.at(-1),'/pages/family/index');
 page.button('应用说明').onClick();assert.equal(page.routes.at(-1),'/pages/help/index');
 const help=pageHarness('pages/help/index',async()=>{throw Error('Help must work offline');});await help.show();assert.match(help.text(help.render()),/复习安排.*首次作答.*巩固练习不会更改首次答题记录/);assert.equal(help.calls.length,0);
});
test('expired invitations never appear as pending approval',()=>{
 assert.equal(invitationState({id:'old',status:'claimed',expires_at:'2020-01-01T00:00:00Z'}),'expired');assert.equal(invitationState({id:'done',status:'approved',expires_at:'2020-01-01T00:00:00Z'}),'approved');
});
test('profile saving uses the submitted WeChat nickname and only the chosen avatar',async()=>{
 let saved:any;const page=pageHarness('components/ParentProfileEditor',async(path,method,body)=>{assert.equal(path,'/me/profile');assert.equal(method,'PUT');return {...dad,display_name:body.display_name,version:2};},'ParentProfileEditor',{props:{profile:dad,onClose:()=>{},onSaved:(value:any)=>{saved=value;}}});
 assert.equal(page.calls.length,0);const choose=page.all(page.render()).find(node=>node.props?.openType==='chooseAvatar');assert(choose);await choose.props.onChooseAvatar({detail:{avatarUrl:'/tmp/selected-avatar.png'}});page.render();
 await page.all(page.render()).find(node=>node.type==='Form').props.onSubmit({detail:{value:{nickname:'微信填入的新昵称'}}});const request=page.calls[0];assert.equal(request.body.display_name,'微信填入的新昵称');assert.equal(request.body.expected_version,1);assert.equal(request.body.avatar_mime,'image/png');assert(request.body.avatar_base64);assert(!('user_id' in request.body));assert.equal(saved.display_name,'微信填入的新昵称');assert(!JSON.stringify([...page.cache.entries()]).includes(request.body.avatar_base64));
});
test('avatar downloads include authentication and late account responses are discarded',async()=>{
 const wait=deferred(),profile={...dad,id:'11111111-1111-4111-8111-111111111111',avatar_path:'/parents/11111111-1111-4111-8111-111111111111/avatar?v=1'};
 const page=pageHarness('components/ParentAvatar',async()=>({}),'ParentAvatar',{props:{profile},download:async()=>wait.promise});assert.equal(page.downloads[0].header.Authorization,'Bearer account-a');page.cache.set('access_token','account-b');wait.resolve({statusCode:200,tempFilePath:'/tmp/private-old-avatar.png'});await tick();assert(page.deleted.includes('/tmp/private-old-avatar.png'));assert(!page.all(page.render()).some(node=>node.type==='Image'&&node.props.src==='/tmp/private-old-avatar.png'));page.dispose();
});
