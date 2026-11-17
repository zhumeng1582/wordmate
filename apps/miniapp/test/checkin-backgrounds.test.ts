import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CheckinBackgroundLoader} from '../src/services/checkin-backgrounds.ts';
const fixture=(platform='android')=>{
 const requests:any[]=[],removed:string[]=[],info:string[]=[];
 const taro={getDeviceInfo:()=>({platform}),getFileSystemManager:()=>({unlink:({filePath}:any)=>removed.push(filePath)}),downloadFile:async(args:any)=>{requests.push(args);return {statusCode:200,tempFilePath:'/tmp/background-'+requests.length};},getImageInfo:async({src}:any)=>{info.push(src);return {width:941,height:1672};}};
 return {taro,requests,removed,info,loader:new CheckinBackgroundLoader(taro,'https://api.test/api')};
};
test('private OSS backgrounds use authenticated API downloads and reuse the temporary file',async()=>{
 const f=fixture(),file=await f.loader.load('01-lake','token',()=>true);assert.equal(file,'/tmp/background-1');assert.match(f.requests[0].url,/\/checkin-backgrounds\/01-lake\/webp$/);assert.equal(f.requests[0].header.Authorization,'Bearer token');assert.equal(await f.loader.load('01-lake','token',()=>true),file);assert.equal(f.requests.length,1);f.loader.clear();assert.deepEqual(f.removed,[file]);
});
test('iOS uses JPEG; other platforms fall back when WebP cannot be decoded',async()=>{
 const ios=fixture('ios');await ios.loader.load('01-lake','token',()=>true);assert.match(ios.requests[0].url,/\/jpg$/);
 const f=fixture();f.taro.getImageInfo=async({src}:any)=>{if(src==='/tmp/background-1')throw Error('decode unsupported');return {width:941,height:1672};};assert.equal(await f.loader.load('01-lake','token',()=>true),'/tmp/background-2');assert.match(f.requests[1].url,/\/jpg$/);assert.deepEqual(f.removed,['/tmp/background-1']);
});
test('late files are removed after owner changes, authentication errors never trigger another download',async()=>{
 const f=fixture();let active=true;f.taro.downloadFile=async args=>{f.requests.push(args);active=false;return {statusCode:200,tempFilePath:'/tmp/late'};};assert.equal(await f.loader.load('01-lake','token',()=>active),null);assert.deepEqual(f.removed,['/tmp/late']);
 const auth=fixture();auth.taro.downloadFile=async args=>{auth.requests.push(args);return {statusCode:401,tempFilePath:'/tmp/unauthorized'};};await assert.rejects(auth.loader.load('01-lake','token',()=>true),/登录已失效/);assert.equal(auth.requests.length,1);assert.deepEqual(auth.removed,['/tmp/unauthorized']);
});
test('temporary background cache is bounded and clear invalidates an in-flight download',async()=>{
 const f=fixture();for(const id of ['01-lake','02-ocean-sunrise','03-cloud-sky','04-desert'])await f.loader.load(id,'token',()=>true);assert.deepEqual(f.removed,['/tmp/background-1']);f.loader.clear();assert.equal(f.removed.length,4);
 f.taro.downloadFile=async()=>{f.loader.clear();return {statusCode:200,tempFilePath:'/tmp/stale'};};assert.equal(await f.loader.load('01-lake','token',()=>true),null);assert(f.removed.includes('/tmp/stale'));
});
