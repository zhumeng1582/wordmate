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

test('ECS role uses IMDSv2, single-flight caching, refresh, and never falls back to static credentials',async()=>{
 const {ossCredentialProvider}=await import('../src/oss-credentials.ts');
 let now=Date.now(),issued=0,requests:{url:string;init:any}[]=[];
 const fetcher:typeof fetch=async(url,init)=>{
  requests.push({url:String(url),init});assert.equal(init?.redirect,'error');
  if(String(url).endsWith('/api/token')){assert.equal(init?.method,'PUT');assert.equal((init?.headers as any)['X-aliyun-ecs-metadata-token-ttl-seconds'],'60');return new Response('metadata-secret');}
  assert.equal(String(url),'http://100.100.100.200/latest/meta-data/ram/security-credentials/WordmateRole');
  assert.equal((init?.headers as any)['X-aliyun-ecs-metadata-token'],'metadata-secret');
  return Response.json({Code:'Success',AccessKeyId:`STS.test-${++issued}`,AccessKeySecret:'temporary-secret',SecurityToken:'temporary-token',Expiration:new Date(now+3600000).toISOString()});
 };
 const roleEnv={...env,OSS_CREDENTIAL_MODE:'ecs_ram_role',OSS_RAM_ROLE_NAME:'WordmateRole'};
 const provider=ossCredentialProvider(roleEnv,fetcher,()=>now);
 const first=await Promise.all([provider(),provider(),provider()]);assert.equal(issued,1);assert.equal(requests.length,2);assert(first.every(c=>c.id==='STS.test-1'));
 now+=3550000;assert.equal((await provider()).id,'STS.test-2');assert.equal(issued,2);
 assert.throws(()=>ossCredentialProvider({...roleEnv,OSS_RAM_ROLE_NAME:'../secrets'},fetcher),{code:'INVALID_OSS_RAM_ROLE'});
 const offline=ossCredentialProvider(roleEnv,async()=>{throw Error('provider response must remain private');});
 await assert.rejects(offline(),e=>(e as any).code==='AUDIO_STORAGE_UNAVAILABLE'&&!String(e).includes('private'));
 let storageRequests=0;
 const storage=createOssStorage(roleEnv,async(url,init)=>{
  if(String(url).startsWith('http://100.100.100.200/'))return fetcher(url,init);
  storageRequests++;const headers=init?.headers as any;assert.match(headers.Authorization,/Credential=STS.test-/);assert.equal(headers['x-oss-security-token'],'temporary-token');assert(!JSON.stringify(headers).includes('metadata-secret'));return new Response(null,{status:200});
 });
 await storage.stat('private/child/audio.mp3');assert.equal(storageRequests,1);
});

test('expired or malformed ECS credentials never reach OSS or expose metadata values',async()=>{
 for(const expiration of ['not-a-date',new Date(Date.now()-1000).toISOString()]){
  let ossCalls=0;
  const storage=createOssStorage({...env,OSS_CREDENTIAL_MODE:'ecs_ram_role',OSS_RAM_ROLE_NAME:'WordmateRole'},async(url)=>{
   if(String(url).endsWith('/api/token'))return new Response('private-metadata-token');
   if(String(url).startsWith('http://100.100.100.200/'))return Response.json({Code:'Success',AccessKeyId:'private-id',AccessKeySecret:'private-secret',SecurityToken:'private-sts',Expiration:expiration});
   ossCalls++;return new Response(null,{status:200});
  });
  await assert.rejects(storage.stat('private/child/file.mp3'),e=>(e as any).code==='AUDIO_STORAGE_UNAVAILABLE'&&!String(e).includes('private'));
  assert.equal(ossCalls,0);
 }
});
