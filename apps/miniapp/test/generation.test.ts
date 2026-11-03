import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.ts';
test('a server-granted validation recovery remains actionable without an exhausted-attempt warning',async()=>{
 let job:any={id:'job-a',status:'failed',attempts:3,max_attempts:3,retryable:true,error_code:'GENERATED_CONTENT_REJECTED',items:[]};
 const page=pageHarness('pages/generation/index',async(_path,method)=>{if(method==='POST'){job={...job,status:'running',max_attempts:4,retryable:false,error_code:null};return job;}return {items:[job]};});
 await page.show();assert.doesNotMatch(page.text(page.render()),/已达到尝试上限/);assert.equal(page.button('只重试未保存的单词').disabled,false);
 await page.button('只重试未保存的单词').onClick();assert.match(page.text(page.render()),/正在生成/);assert.equal(page.calls.filter(call=>call.method==='POST').length,1);
});
