import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {deferred} from './page-harness.ts';
const require=createRequire(import.meta.url),ts=require('typescript');
function imports(options:{choose?:(callbacks:any)=>any;response?:()=>Promise<any>}={}){
 const cache=new Map<string,string>([['access_token','account-a'],['child_id','child-a'],['family_id','family-a']]),calls:any[]=[],events:string[]=[];
 const taro={canIUse:()=>false,chooseMedia:options.choose??(async()=>({tempFiles:[{tempFilePath:'/private/image.jpg',size:1}]})),chooseMessageFile:options.choose??(async()=>({tempFiles:[{path:'/private/words.txt',name:'words.txt',size:1}]})),getImageInfo:async()=>{events.push('image-info');return {type:'jpg',width:100,height:100};},getFileSystemManager:()=>({readFile:({success}:any)=>{events.push('read');success({data:'eA=='});}})};
 const api=async(...args:any[])=>{calls.push(args);return options.response?options.response():{source:'image',text:'apple'};};
 const module={exports:{} as any},code=ts.transpileModule(readFileSync('apps/miniapp/src/services/files.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:(id:string)=>id==='@tarojs/taro'?taro:{api,storage:{get:(key:string)=>cache.get(key)}}});return {extract:module.exports.extractFile,isCancel:module.exports.isFileCancel,calls,cache,events};
}
for(const kind of ['camera','album','file'] as const){
 test(`${kind} cancellation from native fail or complete does not read, upload or start recognition`,async()=>{
  for(const callback of ['fail','complete']){
   const page=imports({choose:callbacks=>{callbacks[callback]({errMsg:'chooseMedia:fail cancel'});return new Promise(()=>{});}});let selected=0;
   await assert.rejects(page.extract('child-a',kind,'existing draft','',()=>selected++),page.isCancel);
   assert.equal(selected,0);assert.equal(page.events.length,0);assert.equal(page.calls.length,0);
  }
 });
 test(`${kind} empty picker results are cancellation and do not start an import`,async()=>{
  for(const result of [undefined,{}, {tempFiles:[]},{tempFiles:[{}]}]){
   const page=imports({choose:async()=>result});let selected=0;
   await assert.rejects(page.extract('child-a',kind,'existing draft','',()=>selected++),page.isCancel);
   assert.equal(selected,0);assert.equal(page.events.length,0);assert.equal(page.calls.length,0);
  }
 });
}
test('picker Promise cancellation is recognized, including a string error, without swallowing permission failures',async()=>{
 for(const error of ['chooseMedia:fail cancel',new Error('chooseMedia:fail cancel'),{errMsg:'chooseMedia:fail cancel'}]){
  const page=imports({choose:async()=>{throw error;}});await assert.rejects(page.extract('child-a','camera'),page.isCancel);assert.equal(page.calls.length,0);
 }
 const denied={errMsg:'chooseMedia:fail auth deny'},page=imports({choose:callbacks=>{callbacks.fail(denied);return new Promise(()=>{});}});
 await assert.rejects(page.extract('child-a','camera'),error=>error===denied&&!page.isCancel(error));assert.equal(page.calls.length,0);
});
test('recognition starts only after a real selected image, including a delayed native success after returning to the page',async()=>{
 let callbacks:any;const waiting=deferred(),page=imports({choose:options=>{callbacks=options;return waiting.promise;}});let selected=0;
 const work=page.extract('child-a','album','','',()=>selected++);assert.equal(selected,0);assert.equal(page.calls.length,0);
 callbacks.success({tempFiles:[{tempFilePath:'/private/image.jpg',size:1}]});callbacks.complete({errMsg:'chooseMedia:ok'});
 const result=await work;assert.equal(selected,1);assert.equal(result.text,'apple');assert.equal(page.calls.length,1);assert.deepEqual(page.events,['image-info','read']);
 waiting.resolve({tempFiles:[]});await Promise.resolve();assert.equal(page.calls.length,1);
});
test('image import uses the shared authenticated request and preserves existing text',async()=>{
 const page=imports(),result=await page.extract('child-a','album','banana','校园');assert.equal(result.text,'apple');assert.equal(page.calls.length,1);assert.equal(page.calls[0][0],'/children/child-a/import-file');assert.equal(page.calls[0][1],'POST');assert.equal(page.calls[0][2].existing_text,'banana');assert.equal(page.calls[0][2].theme,'校园');assert.equal(page.calls[0][4],60000);
});
test('Markdown is selectable and its filename is sent to the authenticated document import endpoint',async()=>{
 let picker:any;const page=imports({choose:async options=>{picker=options;return {tempFiles:[{path:'/private/words.md',name:'水果词表.md',size:100}]};},response:async()=>({source:'file',text:'# 水果\n- apple 苹果'})});
 const result=await page.extract('child-a','file','banana','校园');assert(picker.extension.includes('md'));assert.equal(picker.type,'file');assert.equal(result.source,'file');assert.equal(page.calls.length,1);assert.equal(page.calls[0][0],'/children/child-a/import-file');assert.equal(page.calls[0][2].name,'水果词表.md');assert.equal(page.calls[0][2].existing_text,'banana');assert.deepEqual(page.events,['read']);
});
test('switching children while the native picker is open prevents an image upload',async()=>{
 const waiting=deferred(),page=imports({choose:async()=>waiting.promise}),work=page.extract('child-a','album');page.cache.set('child_id','child-b');waiting.resolve({tempFiles:[{tempFilePath:'/private/image.jpg',size:1}]});await assert.rejects(work,/SESSION_CHANGED/);assert.equal(page.calls.length,0);
});
test('switching accounts while the import response is pending never returns private recognition data',async()=>{
 const waiting=deferred(),started=deferred(),page=imports({response:async()=>{started.resolve();return waiting.promise;}}),work=page.extract('child-a','album');await started.promise;page.cache.set('access_token','account-b');waiting.resolve({text:'private recognized text',source:'image'});await assert.rejects(work,/SESSION_CHANGED/);
});
