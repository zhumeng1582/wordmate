import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorAsr} from '../src/tutor-asr.ts';
const env={TUTOR_ASR_API_KEY:'test-secret',TUTOR_ASR_WORKSPACE_ID:'workspace'};
const mp3=new Uint8Array([73,68,51,4,0,0]);
test('ASR sends bounded audio as data, returns transcription and actual duration',async()=>{
 let sent=0;const provider=createTutorAsr(env,async(url,init)=>{sent++;assert.match(String(url),/^https:\/\/workspace\.cn-beijing\.maas\.aliyuncs\.com\//);const body=JSON.parse(String(init?.body));assert.equal(body.model,'qwen-audio-3.0-asr-flash');assert.match(body.input.messages[0].content[0].input_audio.data,/^data:audio\/mpeg;base64,/);return Response.json({output:{text:' 你好 rainbow '},usage:{duration:4},request_id:'req-1'});});
 assert.deepEqual(await provider.transcribe(mp3),{text:'你好 rainbow',duration_seconds:4,request_id:'req-1'});assert.equal(sent,1);
});
test('ASR rejects untrusted formats and responses without usage',async()=>{
 assert.throws(()=>createTutorAsr({...env,TUTOR_ASR_WORKSPACE_ID:'evil.example'}));
 const provider=createTutorAsr(env,async()=>Response.json({output:{text:'test'}}));
 await assert.rejects(provider.transcribe(new Uint8Array([1,2,3,4])),{code:'INVALID_ASR_AUDIO'});
 await assert.rejects(provider.transcribe(mp3),{code:'ASR_INVALID_RESPONSE'});
});
