import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {deferred} from './page-harness.ts';
const require=createRequire(import.meta.url),ts=require('typescript');
function imports(options:{choose?:()=>Promise<any>;response?:()=>Promise<any>}={}){
 const cache=new Map<string,string>([['access_token','account-a'],['child_id','child-a'],['family_id','family-a']]),calls:any[]=[];
 const taro={canIUse:()=>false,chooseMedia:options.choose??(async()=>({tempFiles:[{tempFilePath:'/private/image.jpg',size:1}]})),getImageInfo:async()=>({type:'jpg',width:100,height:100}),getFileSystemManager:()=>({readFile:({success}:any)=>success({data:'eA=='})})};
 const api=async(...args:any[])=>{calls.push(args);return options.response?options.response():{source:'image',text:'apple'};};
 const module={exports:{} as any},code=ts.transpileModule(readFileSync('apps/miniapp/src/services/files.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:(id:string)=>id==='@tarojs/taro'?taro:{api,storage:{get:(key:string)=>cache.get(key)}}});return {extract:module.exports.extractFile,calls,cache};
}
test('image import uses the shared authenticated request and preserves existing text',async()=>{
 const page=imports(),result=await page.extract('child-a','album','banana','校园');assert.equal(result.text,'apple');assert.equal(page.calls.length,1);assert.equal(page.calls[0][0],'/children/child-a/import-file');assert.equal(page.calls[0][1],'POST');assert.equal(page.calls[0][2].existing_text,'banana');assert.equal(page.calls[0][2].theme,'校园');assert.equal(page.calls[0][4],60000);
});
test('switching children while the native picker is open prevents an image upload',async()=>{
 const waiting=deferred(),page=imports({choose:async()=>waiting.promise}),work=page.extract('child-a','album');page.cache.set('child_id','child-b');waiting.resolve({tempFiles:[{tempFilePath:'/private/image.jpg',size:1}]});await assert.rejects(work,/SESSION_CHANGED/);assert.equal(page.calls.length,0);
});
test('switching accounts while the import response is pending never returns private recognition data',async()=>{
 const waiting=deferred(),started=deferred(),page=imports({response:async()=>{started.resolve();return waiting.promise;}}),work=page.extract('child-a','album');await started.promise;page.cache.set('access_token','account-b');waiting.resolve({text:'private recognized text',source:'image'});await assert.rejects(work,/SESSION_CHANGED/);
});
