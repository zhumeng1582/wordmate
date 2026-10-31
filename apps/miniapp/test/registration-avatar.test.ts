import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick,deferred} from './page-harness.ts';
import {beginInviteLogin,consumeInviteLogin} from '../src/services/invite-login.ts';
const profile={id:'new-parent',display_name:'家长',version:1,avatar_path:null},policy={version:'v1',hash:'policy-hash',publishable:true};
async function registrationPage(fresh=true,query:Record<string,string>={}){
 let page:ReturnType<typeof pageHarness>;
 page=pageHarness('pages/login/index',async()=>policy,undefined,{cache:{access_token:''},query,login:async()=>{page.cache.set('access_token','new-session');if(fresh)page.cache.set('registration_avatar_pending',profile);return {is_new_user:fresh,user:profile};}});
 await page.show();page.all(page.render()).find(node=>node.type==='CheckboxGroup').props.onChange({detail:{value:['consent']}});page.button('微信登录').onClick();await tick();page.render();return page;
}
const setup=(page:ReturnType<typeof pageHarness>)=>page.all(page.render()).find(node=>node.type==='ParentProfileEditor');
test('first registration offers an optional avatar after consent and ignores picker foreground refreshes',async()=>{
 const page=await registrationPage();assert.equal(page.backCount,0);assert(setup(page).props.registration);assert.equal(setup(page).props.profile.id,'new-parent');
 const before=page.calls.length;await page.show();assert.equal(page.calls.length,before);assert(setup(page));page.dispose();
});
test('existing accounts continue without an avatar prompt or a profile write',async()=>{
 const page=await registrationPage(false);assert.equal(page.backCount,1);assert(!setup(page));assert(!page.calls.some(call=>call.path==='/me/profile'));page.dispose();
});
test('resuming unfinished registration refreshes the profile and preserves an avatar already saved elsewhere',async()=>{
 const page=pageHarness('pages/login/index',async path=>path==='/me'?{user:{...profile,version:2,avatar_path:'/parents/new-parent/avatar?v=1'}}:policy,undefined,{cache:{registration_avatar_pending:profile}});
 await page.show();page.all(page.render()).find(node=>node.type==='CheckboxGroup').props.onChange({detail:{value:['consent']}});page.button('同意并继续').onClick();await tick();assert.equal(page.backCount,1);assert(!setup(page));assert(!page.cache.has('registration_avatar_pending'));page.dispose();
});
for(const action of ['skip','save'])test(`registration avatar ${action} preserves login-and-join and clears its one-time prompt`,async()=>{
 const flow=`registration-${action}`;beginInviteLogin(flow);const page=await registrationPage(true,{intent:'join-family',flow});assert.equal(page.backCount,0);
 if(action==='skip')setup(page).props.onClose();else await setup(page).props.onSaved({...profile,version:2,avatar_path:'/parents/new-parent/avatar?v=1'});await tick();
 assert.equal(page.backCount,1);assert.equal(page.cache.has('registration_avatar_pending'),false);assert.equal(consumeInviteLogin(flow,'new-session'),true);assert.equal(consumeInviteLogin(flow,'new-session'),false);page.dispose();
});
test('a stale registration cannot finish or change the newly signed-in account',async()=>{
 const page=await registrationPage(),old=setup(page).props;page.cache.set('access_token','different-session');page.cache.set('registration_avatar_pending',{id:'different-parent'});await old.onSaved(profile);assert.equal(page.backCount,0);assert.equal(page.cache.get('registration_avatar_pending').id,'different-parent');page.dispose();
});
test('avatar selection saves immediately and blocks duplicate saves while uploading',async()=>{
 const wait=deferred();let saved=0;const page=pageHarness('components/ParentProfileEditor',async()=>wait.promise,'ParentProfileEditor',{props:{profile,registration:true,onClose(){},onSaved(){saved++;}}});
 const choose=page.all(page.render()).find(node=>node.props?.openType==='chooseAvatar').props.onChooseAvatar,pending=choose({detail:{avatarUrl:'/tmp/wechat-avatar.png'}});await tick();assert.equal(page.calls.length,1);assert.equal(page.calls[0].body.display_name,'家长');assert.equal(page.calls[0].body.avatar_mime,'image/png');assert(page.calls[0].body.avatar_base64);assert.equal(page.button('暂时跳过').disabled,true);
 await choose({detail:{avatarUrl:'/tmp/duplicate.png'}});assert.equal(page.calls.length,1);wait.resolve({...profile,version:2,avatar_path:'/parents/new-parent/avatar?v=1'});await pending;assert.equal(saved,1);page.dispose();
});
test('failed avatar uploads retain a visible retry and reuse the original idempotency key',async()=>{
 let saved=0;const page=pageHarness('components/ParentProfileEditor',async()=>{if(!saved++)throw Error('NETWORK_TIMEOUT');return {...profile,version:2};},'ParentProfileEditor',{props:{profile,registration:true,onClose(){},onSaved(){}}});
 await page.all(page.render()).find(node=>node.props?.openType==='chooseAvatar').props.onChooseAvatar({detail:{avatarUrl:'/tmp/wechat-avatar.png'}});assert.match(page.text(page.render()),/NETWORK_TIMEOUT/);assert.equal(page.button('暂时跳过').disabled,false);page.button('重试保存').onClick();await tick();assert.equal(page.calls.length,2);assert.equal(page.calls[0].key,page.calls[1].key);assert.doesNotMatch(page.text(page.render()),/NETWORK_TIMEOUT/);page.dispose();
});
test('an old avatar response cannot complete registration after an account switch',async()=>{
 const wait=deferred();let saved=false;const page=pageHarness('components/ParentProfileEditor',async()=>wait.promise,'ParentProfileEditor',{props:{profile,registration:true,onClose(){},onSaved(){saved=true;}}});
 const pending=page.all(page.render()).find(node=>node.props?.openType==='chooseAvatar').props.onChooseAvatar({detail:{avatarUrl:'/tmp/wechat-avatar.png'}});await tick();page.cache.set('access_token','different-account');wait.resolve({...profile,version:2});await pending;assert.equal(saved,false);page.dispose();
});
