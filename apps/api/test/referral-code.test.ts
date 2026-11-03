import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReferralCodeImage} from '../src/referral-code.ts';

test('mini-program code uses the caller referral and reuses the generated image',async()=>{
 const requests:{url:string,body:any}[]=[];
 const fetcher=async(input:any,init:any)=>{const url=String(input),body=JSON.parse(init.body);requests.push({url,body});return url.includes('stable_token')?new Response(JSON.stringify({access_token:'token',expires_in:7200}),{headers:{'content-type':'application/json'}}):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});};
 const service=new ReferralCodeImage({WECHAT_APP_ID:'app',WECHAT_APP_SECRET:'secret'},fetcher as typeof fetch);
 const first=await service.create('0123456789abcdef');assert.equal(first.base64,'AQID');assert.equal((await service.create('0123456789abcdef')).base64,first.base64);assert.equal(requests.length,2);assert.equal(requests[1].body.scene,'0123456789abcdef');assert.equal(requests[1].body.page,'pages/home/index');assert.equal(requests[1].body.env_version,'release');
 await assert.rejects(service.create('bad!'),{code:'REFERRAL_CODE_INVALID'});
});
test('wechat errors do not produce a fake code image',async()=>{
 const service=new ReferralCodeImage({WECHAT_APP_ID:'app',WECHAT_APP_SECRET:'secret'},(async()=>new Response(JSON.stringify({errcode:40001}),{headers:{'content-type':'application/json'}})) as typeof fetch);
 await assert.rejects(service.create('0123456789abcdef'),{code:'REFERRAL_CODE_UNAVAILABLE'});
});
test('an unpublished page falls back to a trial code with page checking disabled',async()=>{
 const requests:any[]=[];const service=new ReferralCodeImage({WECHAT_APP_ID:'app',WECHAT_APP_SECRET:'secret'},(async(input:any,init:any)=>{const body=JSON.parse(init.body);requests.push(body);if(String(input).includes('stable_token'))return new Response(JSON.stringify({access_token:'token',expires_in:7200}),{headers:{'content-type':'application/json'}});if(body.check_path)return new Response(JSON.stringify({errcode:41030,errmsg:'invalid page'}),{headers:{'content-type':'application/json'}});return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});}) as typeof fetch);
 const result=await service.create('0123456789abcdef');assert.equal(result.mime,'image/jpeg');assert.equal(requests[1].env_version,'release');assert.equal(requests[1].check_path,true);assert.equal(requests[2].env_version,'trial');assert.equal(requests[2].check_path,false);assert.equal(requests[2].page,'pages/home/index');
});
test('failure diagnostics contain safe codes and request id without secrets',async()=>{
 const messages:string[]=[],old=console.warn;console.warn=(value:any)=>messages.push(String(value));
 try{const fetcher=async()=>new Response(JSON.stringify({errcode:40001,errmsg:'secret-token'}),{headers:{'content-type':'application/json'}});const service=new ReferralCodeImage({WECHAT_APP_ID:'app',WECHAT_APP_SECRET:'secret-token'},fetcher as typeof fetch);await assert.rejects(service.create('0123456789abcdef','request-1'),{code:'REFERRAL_CODE_UNAVAILABLE'});const log=JSON.parse(messages[0]);assert.equal(log.request_id,'request-1');assert.equal(log.stage,'token');assert.equal(log.upstream_code,40001);assert.doesNotMatch(messages[0],/secret-token|0123456789abcdef/);}finally{console.warn=old;}
});
