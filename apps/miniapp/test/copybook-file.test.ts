import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function setup(fail:'write'|'open'|null=null){
 const writes:any[]=[],opened:any[]=[],deleted:string[]=[],module={exports:{} as any};
 const taro={env:{USER_DATA_PATH:'/private'},getFileSystemManager:()=>({writeFile:(o:any)=>{writes.push(o);if(fail==='write')o.fail({errMsg:'writeFile:fail disk full'});else o.success();},unlinkSync:(path:string)=>deleted.push(path)}),openDocument:async(o:any)=>{opened.push(o);if(fail==='open')throw {errMsg:'openDocument:fail'};}};
 const code=ts.transpileModule(readFileSync('apps/miniapp/src/services/files.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:(id:string)=>id==='@tarojs/taro'?taro:{api:()=>{},storage:{}}});return {service:module.exports,writes,opened,deleted};
}
test('copybook opens a PDF viewer with sharing menu and retains the file while open',async()=>{const x=setup();await x.service.shareCopybook('JVBERg==');assert.equal(x.writes[0].encoding,'base64');assert.equal(x.opened[0].fileType,'pdf');assert.equal(x.opened[0].showMenu,true);assert.equal(x.opened[0].filePath,'/private/hanzi-copybook.pdf');assert.equal(x.deleted.length,0);x.service.clearCopybook();assert.deepEqual(x.deleted,['/private/hanzi-copybook.pdf']);});
test('copybook reports file failures separately from network errors',async()=>{for(const [fail,code] of [['write','COPYBOOK_SAVE_FAILED'],['open','COPYBOOK_OPEN_FAILED']] as const){const x=setup(fail);await assert.rejects(x.service.shareCopybook('JVBERg=='),(e:any)=>e.message===code);assert.equal(x.deleted.length,1);}});
