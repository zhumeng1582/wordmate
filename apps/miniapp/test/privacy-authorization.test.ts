import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function bridge(route='',navigationFails=false){
 let listener:(resolve:(result:any)=>void)=>void=()=>assert.fail('privacy listener not installed'),registrations=0;
 const navigations:string[]=[],events:string[]=[],module={exports:{} as any};
 const taro={canIUse:()=>true,eventCenter:{trigger:(name:string)=>events.push(name)},getCurrentPages:()=>route?[{route}]:[],nextTick:(fn:()=>void)=>fn(),navigateTo:async(options:any)=>{navigations.push(options.url);if(navigationFails)throw Error('navigation failed');},onNeedPrivacyAuthorization:(callback:typeof listener)=>{listener=callback;registrations++;}};
 const code=ts.transpileModule(readFileSync('apps/miniapp/src/services/privacy-authorization.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:()=>taro});
 return {service:module.exports,need:(resolve:(result:any)=>void)=>listener(resolve),navigations,events,registrations:()=>registrations};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('native authorization opens the simple consent page and agrees with its registered button',async()=>{
 const c=bridge('pages/add-words/index'),answers:any[]=[];c.service.installPrivacyAuthorization();c.service.installPrivacyAuthorization();assert.equal(c.registrations(),1);
 c.need(answer=>answers.push(answer));await tick();assert.deepEqual(c.navigations,['/pages/login/index']);assert.equal(answers[0].event,'exposureAuthorization');assert.equal(c.service.hasPendingPrivacyAuthorization(),true);
 c.service.finishPrivacyAuthorization(true);assert.equal(answers[1].event,'agree');assert.equal(answers[1].buttonId,c.service.PRIVACY_AGREE_BUTTON);assert.equal(c.service.hasPendingPrivacyAuthorization(),false);
 c.service.finishPrivacyAuthorization(true);assert.equal(answers.length,2);
});
test('already-open login page is exposed without stacking another page and can be declined',()=>{
 const c=bridge('pages/login/index'),answers:any[]=[];c.service.installPrivacyAuthorization();c.need(answer=>answers.push(answer));assert.deepEqual(c.navigations,[]);assert.equal(answers[0].event,'exposureAuthorization');
 c.service.finishPrivacyAuthorization(false);assert.equal(answers[1].event,'disagree');assert.equal(c.service.hasPendingPrivacyAuthorization(),false);
});
test('concurrent native requests share one consent page and are all resolved',async()=>{
 const c=bridge(),first:any[]=[],second:any[]=[];c.service.installPrivacyAuthorization();c.need(answer=>first.push(answer));c.need(answer=>second.push(answer));await tick();assert.equal(c.navigations.length,1);
 c.service.finishPrivacyAuthorization(true);for(const answers of [first,second])assert.deepEqual(answers.map(answer=>answer.event),['exposureAuthorization','agree']);
});
test('failed navigation declines pending authorization instead of leaving the caller waiting',async()=>{
 const c=bridge('',true),answers:any[]=[];c.service.installPrivacyAuthorization();c.need(answer=>answers.push(answer));await tick();assert.equal(answers[0].event,'disagree');assert.equal(c.service.hasPendingPrivacyAuthorization(),false);
});
