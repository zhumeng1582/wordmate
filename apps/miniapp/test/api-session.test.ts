import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function client(loginImpl=async()=>({code:'wechat-code'})){
 const cache=new Map<string,any>(),requests:{resolve:(value:any)=>void;reject:(error:unknown)=>void;headers:any;url:string;data:any}[]=[],navigations:string[]=[],module={exports:{} as any};let route='';
 const taro={getStorageSync:(k:string)=>cache.get(k)||'',setStorageSync:(k:string,v:any)=>cache.set(k,v),clearStorageSync:()=>cache.clear(),removeStorageSync:(k:string)=>cache.delete(k),request:(r:any)=>new Promise((resolve,reject)=>requests.push({resolve,reject,headers:r.header,url:r.url,data:r.data})),login:loginImpl,getCurrentPages:()=>route?[{route}]:[],navigateTo:async(options:any)=>{navigations.push(options.url);}};
 const code=ts.transpileModule(readFileSync('apps/miniapp/src/services/api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:(id:string)=>id==='@tarojs/taro'?taro:{finishPrivacyAuthorization(){}},API_BASE:'https://example.com/api',DEV_AUTH:false});
 return {api:module.exports.api,storage:module.exports.storage,clear:module.exports.clearAccountStorage,message:module.exports.message,login:module.exports.login,loginForDataManagement:module.exports.loginForDataManagement,setRoute:(next:string)=>{route=next;},cache,requests,navigations};
}
for(const statusCode of [200,401,500])test(`late ${statusCode} from old login cannot expose data or clear new account`,async()=>{
 const c=client();c.storage.set('access_token','old');const pending=c.api('/me');c.storage.set('access_token','new');c.storage.set('new-draft','preserve');
 c.requests[0].resolve({statusCode,data:{data:{private_old_account:'must not be delivered'},error:{code:'UNAUTHENTICATED'}}});
 await assert.rejects(pending,/SESSION_CHANGED/);assert.equal(c.storage.get('access_token'),'new');assert.equal(c.storage.get('new-draft'),'preserve');
});
test('same-token reset changes the session epoch and blocks pre-reset responses',async()=>{
 const c=client();c.storage.set('access_token','same');const pending=c.api('/me');c.clear();c.storage.set('access_token','same');
 c.requests[0].resolve({statusCode:401,data:{error:{code:'UNAUTHENTICATED'}}});await assert.rejects(pending,/SESSION_CHANGED/);assert.equal(c.storage.get('access_token'),'same');
});
test('current session 401 still clears its local data',async()=>{
 const c=client();c.storage.set('access_token','current');c.storage.set('draft','private');const pending=c.api('/me');c.requests[0].resolve({statusCode:401,data:{error:{code:'UNAUTHENTICATED'}}});await assert.rejects(pending,/UNAUTHENTICATED/);assert.equal(c.cache.size,0);
});
for(const [errMsg,expected] of [
 ['request:fail url not in domain list','NETWORK_DOMAIN_NOT_ALLOWED'],
 ['request:fail ssl hand shake error','NETWORK_CERTIFICATE_INVALID'],
 ['request:fail net::ERR_CERT_AUTHORITY_INVALID','NETWORK_CERTIFICATE_INVALID'],
 ['request:fail net::ERR_NAME_NOT_RESOLVED','NETWORK_DNS_FAILED'],
 ['request:fail timeout','NETWORK_TIMEOUT'],
 ['request:fail connection refused; token=must-not-display','NETWORK_REQUEST_FAILED']
])test(`platform request rejection reports ${expected} without exposing callback contents`,async()=>{
 const c=client();const pending=c.api('/privacy/policy');c.requests[0].reject({errMsg});
 await assert.rejects(pending,(error:any)=>{assert.equal(error.message,expected);assert.notEqual(c.message(error),expected);assert.doesNotMatch(c.message(error),/token=|must-not-display/);return true;});
 assert.notEqual(c.message({errMsg}),'请求失败，请重试');
 assert.doesNotMatch(c.message({errMsg}),/token=|must-not-display/);
});
for(const [errMsg,expected] of [
 ['login:fail timeout','WECHAT_LOGIN_TIMEOUT'],
 ['login:fail unknown; code=must-not-display','WECHAT_LOGIN_FAILED']
])test(`platform login rejection reports ${expected} before calling the backend`,async()=>{
 const c=client(async()=>{throw {errMsg};});
 await assert.rejects(c.loginForDataManagement(),(error:any)=>{assert.equal(error.message,expected);assert.doesNotMatch(c.message(error),/code=|must-not-display/);return true;});
 assert.equal(c.requests.length,0);
});
test('empty WeChat login code is rejected before calling the backend',async()=>{
 const c=client(async()=>({code:''}));await assert.rejects(c.loginForDataManagement(),/WECHAT_LOGIN_FAILED/);assert.equal(c.requests.length,0);
});
test('successful WeChat code is sent to the production login route and saves its session',async()=>{
 const c=client();const pending=c.loginForDataManagement();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.requests.length,1);assert.equal(c.requests[0].url,'https://example.com/api/auth/wechat');assert.equal(c.requests[0].data.code,'wechat-code');assert.equal(c.requests[0].data.management_only,true);
 c.requests[0].resolve({statusCode:200,data:{data:{access_token:'new-wechat-session',families:[]}}});await pending;assert.equal(c.storage.get('access_token'),'new-wechat-session');
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const respond=(request:any,data:any)=>request.resolve({statusCode:200,data:{data}});
test('reading the policy without agreeing opens the simple login page without exchanging identity',async()=>{
 const c=client(async()=>{assert.fail('WeChat identity must not be requested before consent');});const pending=c.login();
 respond(c.requests[0],{hash:'current-policy',version:'v1',publishable:true});await assert.rejects(pending,/PRIVACY_REVIEW_REQUIRED/);
 assert.deepEqual(c.navigations,['/pages/login/index']);assert.equal(c.requests.length,1);assert.equal(c.storage.get('access_token'),'');assert.equal(c.storage.get('privacy_decision'),'');
});
test('policy updates on the login page require a fresh explicit agreement without stacking pages',async()=>{
 const c=client();c.setRoute('pages/login/index');c.storage.set('privacy_decision','old-policy');const pending=c.login();
 respond(c.requests[0],{hash:'updated-policy',version:'v2',publishable:true});await assert.rejects(pending,/PRIVACY_POLICY_CHANGED/);assert.equal(c.requests.length,1);assert.deepEqual(c.navigations,[]);assert.equal(c.storage.get('privacy_decision'),'old-policy');
});
test('unpublished policies cannot start a production login',async()=>{
 const c=client();c.storage.set('privacy_decision','draft');const pending=c.login();respond(c.requests[0],{hash:'draft',version:'draft',publishable:false});await assert.rejects(pending,/PRIVACY_POLICY_NOT_READY/);assert.equal(c.requests.length,1);
});
test('agreed login saves the session and records the displayed policy and guardian confirmation',async()=>{
 const c=client();c.storage.set('privacy_decision','current-policy');const pending=c.login();
 respond(c.requests[0],{hash:'current-policy',version:'v1',publishable:true});await tick();
 assert.equal(c.requests[1].url,'https://example.com/api/auth/wechat');assert.equal(c.requests[1].data.code,'wechat-code');
 const user={id:'new-parent',display_name:'家长',version:1,avatar_path:null};respond(c.requests[1],{access_token:'wechat-session',families:[],is_new_user:true,user});await tick();
 assert.equal(c.storage.get('registration_avatar_pending').id,'new-parent');
 assert.equal(c.requests[2].url,'https://example.com/api/me/privacy-consent');assert.equal(c.requests[2].headers.Authorization,'Bearer wechat-session');
 assert.equal(c.requests[2].data.policy_hash,'current-policy');assert.equal(c.requests[2].data.policy_version,'v1');assert.equal(c.requests[2].data.guardian_confirmed,true);
 respond(c.requests[2],{accepted:true});await pending;assert.equal(c.storage.get('access_token'),'wechat-session');
});
test('a failed avatar save never persists the selected image or nickname in request storage',async()=>{
 const c=client();c.storage.set('access_token','parent');const body={avatar_base64:'private-avatar-bytes',display_name:'private-name',expected_version:1},pending=c.api('/me/profile','PUT',body,'profile-retry');
 assert.equal(c.requests[0].headers['Idempotency-Key'],'profile-retry');assert.doesNotMatch(JSON.stringify([...c.cache]),/private-avatar|private-name/);
 c.requests[0].reject({errMsg:'request:fail timeout'});await assert.rejects(pending,/NETWORK_TIMEOUT/);assert.doesNotMatch(JSON.stringify([...c.cache]),/private-avatar|private-name/);
});
