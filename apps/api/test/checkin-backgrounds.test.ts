import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CheckinBackgrounds} from '../src/checkin-backgrounds.ts';
const webp=Buffer.concat([Buffer.from('RIFF1234WEBP'),Buffer.from([1])]);
test('backgrounds allow only known objects, share concurrent reads and cache immutable content',async()=>{
 const keys:string[]=[],service=new CheckinBackgrounds({get:async key=>{keys.push(key);return webp;}});
 const [one,two]=await Promise.all([service.content('01-lake','webp'),service.content('01-lake','webp')]);assert.strictEqual(one,two);assert.equal(one.mime,'image/webp');assert.deepEqual(keys,['compressed-v1/01-lake.webp']);await service.content('01-lake','webp');assert.equal(keys.length,1);
 for(const [id,format] of [['../01-lake','webp'],['01-lake','png'],['https://evil.invalid','jpg']])await assert.rejects(service.content(id,format),{code:'CHECKIN_BACKGROUND_NOT_FOUND'});
 assert.equal(keys.length,1);
});
test('missing, corrupt or failed storage reads do not poison retry cache',async()=>{
 let reads=0;const service=new CheckinBackgrounds({get:async()=>{reads++;if(reads===1)throw Error('secret storage details');if(reads===2)return Buffer.from('not an image');return webp;}});
 await assert.rejects(service.content('01-lake','webp'),{code:'CHECKIN_BACKGROUND_UNAVAILABLE'});await assert.rejects(service.content('01-lake','webp'),{code:'CHECKIN_BACKGROUND_UNAVAILABLE'});assert.equal((await service.content('01-lake','webp')).mime,'image/webp');assert.equal(reads,3);
 await assert.rejects(new CheckinBackgrounds().content('01-lake','jpg'),{code:'CHECKIN_BACKGROUND_UNAVAILABLE'});
});
