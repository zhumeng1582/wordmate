import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTtsProvider,audioCacheKey,createAudioStorageRouter} from '../src/index.ts';
import type {TtsProvider,SpeechProfile,AudioObjectStorage} from '../src/index.ts';
const profile:SpeechProfile={provider:'test-tts',region:'test-region',model:'test-model',revision:'1',format:'mp3',sampleRate:24000};
const request={text:'record',accent:'en-GB' as const,voiceId:'voice-one',rate:1};
const bytes=new Uint8Array([73,68,51,1]);
const hash=createHash('sha256').update(bytes).digest('hex');
function memoryStore(provider:string){
 const files=new Map<string,Uint8Array>();
 const adapter:AudioObjectStorage={provider,async put(k,b){files.set(k,b.slice());},async get(k){const b=files.get(k);if(!b)throw Error('not found');return b.slice();},async stat(k){return files.has(k)?{size:files.get(k)!.length}:null;},async delete(k){files.delete(k);}};
 return {adapter,files};
}
test('registered TTS uses its own adapter and structured cache identity without fallback',async()=>{
 let received:any;
 const provider:TtsProvider={profile,async listVoices(){return [{id:'voice-one',accent:'en-GB',gender:'Female'}];},async synthesize(){return {bytes,mimeType:'audio/mpeg',provider:'test-tts'};}};
 const tts=createTtsProvider({TTS_PROVIDER:'test-tts'},fetch,{'test-tts':env=>{received=env;return provider;}});
 assert.equal(received.TTS_PROVIDER,'test-tts');assert.equal((await tts.synthesize(request)).provider,'test-tts');
 assert.throws(()=>createTtsProvider({TTS_PROVIDER:'unknown'}),{code:'UNSUPPORTED_TTS_PROVIDER'});
 assert.throws(()=>createTtsProvider({TTS_PROVIDER:'wrong'},fetch,{wrong:()=>provider}),{code:'TTS_PROFILE_MISMATCH'});
 const key=audioCacheKey('child:a','1',profile,request,'noun');
 for(const changed of [{provider:'another'},{model:'next'},{region:'elsewhere'},{revision:'2'},{sampleRate:48000}])assert.notEqual(key,audioCacheKey('child:a','1',{...profile,...changed},request,'noun'));
 assert.notEqual(key,audioCacheKey('child:a','1',profile,request,'verb'));
 assert.notEqual(key,audioCacheKey('child:b','1',profile,request,'noun'));
});
test('storage switches new writes but reads old locations; verified copies retain source',async()=>{
 const old=memoryStore('oss'),next=memoryStore('other');
 const before=createAudioStorageRouter({'old-bucket':old.adapter},'old-bucket');
 const location=await before.put('private/a/audio.mp3',bytes);
 const after=createAudioStorageRouter({'old-bucket':old.adapter,'new-bucket':next.adapter},'new-bucket');
 assert.deepEqual(await after.get(location),bytes);
 const fresh=await after.put('private/b/audio.mp3',bytes);assert.equal(fresh.profileId,'new-bucket');
 const migrated=await after.copyToActive(location,hash);assert.equal(migrated.profileId,'new-bucket');assert.deepEqual(await after.get(migrated),bytes);
 assert(old.files.has(location.key));assert.deepEqual(await after.stat(location),{size:4});
 assert.throws(()=>after.get({profileId:'removed',key:'audio.mp3'}),{code:'STORAGE_PROFILE_UNAVAILABLE'});
 await assert.rejects(after.put('../escape',bytes),{code:'INVALID_AUDIO_OBJECT_KEY'});
 await assert.rejects(after.copyToActive(location,'0'.repeat(64)),{code:'AUDIO_CHECKSUM_MISMATCH'});
});
test('migration never reports success on corrupt destination and preserves source on failure',async()=>{
 const old=memoryStore('oss'),bad=memoryStore('broken');await old.adapter.put('a.mp3',bytes,'audio/mpeg');
 bad.adapter.put=async(k)=>{bad.files.set(k,new Uint8Array([0]));};
 const router=createAudioStorageRouter({old:old.adapter,bad:bad.adapter},'bad');
 await assert.rejects(router.copyToActive({profileId:'old',key:'a.mp3'},hash),{code:'AUDIO_COPY_VERIFICATION_FAILED'});
 assert(old.files.has('a.mp3'));
 bad.adapter.stat=async()=>{throw Error('permission denied');};
 await assert.rejects(router.stat({profileId:'bad',key:'a.mp3'}),/permission denied/);
});
