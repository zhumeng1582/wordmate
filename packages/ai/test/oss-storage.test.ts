import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createOssStorage,ossHeaders,boundedAudio} from '../src/oss-storage.ts';
const require=createRequire(import.meta.url),{sign}=require('../../../scripts/lib/oss-probe.cjs');
const env={OSS_BUCKET:'test-bucket',OSS_REGION:'cn-beijing',OSS_ENDPOINT:'https://oss-cn-beijing.aliyuncs.com',OSS_AUDIO_PREFIX:'staging/audio/',ALIBABA_CLOUD_ACCESS_KEY_ID:'test-id',ALIBABA_CLOUD_ACCESS_KEY_SECRET:'test-secret'};
test('OSS production signing agrees with verified probe for RAM and STS GET/HEAD/PUT',()=>{
 for(const token of ['', 'test-token'])for(const method of ['GET','HEAD','PUT']){
  const date=new Date('2026-10-21T04:00:00Z'),extra=method==='PUT'?{'content-type':'audio/mpeg','content-md5':'test-md5'}:{};
  assert.deepEqual(ossHeaders(method,'test-bucket','staging/audio/private/id/1.mp3','cn-beijing','test-id','test-secret',token,extra,date),sign({method,bucket:'test-bucket',key:'staging/audio/private/id/1.mp3',region:'cn-beijing',accessKeyId:'test-id',accessKeySecret:'test-secret',token,headers:extra,timestamp:'20261021T040000Z'}));
 }
});
test('OSS bounds target and treats only 404 as missing; 403 never triggers synthesis fallback',async()=>{
 let status=404,calls=0;
 const storage=createOssStorage(env,async(url,options)=>{calls++;assert(String(url).startsWith('https://test-bucket.oss-cn-beijing.aliyuncs.com/staging/audio/'));assert.equal(options?.redirect,'error');return new Response(null,{status});});
 assert.equal(await storage.stat('private/test/1.mp3'),null);
 status=403;await assert.rejects(storage.stat('private/test/1.mp3'),{code:'AUDIO_STORAGE_ACCESS_DENIED',retryable:false});
 status=500;await assert.rejects(storage.get('private/test/1.mp3'),{code:'AUDIO_STORAGE_UNAVAILABLE',retryable:true});
 const before=calls;await assert.rejects(storage.get('../secret'),{code:'INVALID_AUDIO_OBJECT_KEY'});assert.equal(calls,before);
 assert.throws(()=>createOssStorage({...env,OSS_ENDPOINT:'https://attacker.example'}),{code:'INVALID_OSS_ENDPOINT'});
 assert.throws(()=>createOssStorage({...env,OSS_CREDENTIAL_MODE:'sts'}),{code:'OSS_CREDENTIAL_MODE_MISMATCH'});
});
test('streamed audio stops reading when size exceeds limit',async()=>{
 await assert.rejects(boundedAudio(new Response('oversize'),3),{code:'AUDIO_TOO_LARGE'});
 await assert.rejects(boundedAudio(new Response('x',{headers:{'content-length':'100'}}),3),{code:'AUDIO_TOO_LARGE'});
 assert.deepEqual(await boundedAudio(new Response('ID3'),3),Buffer.from('ID3'));
});
