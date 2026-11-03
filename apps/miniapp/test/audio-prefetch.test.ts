import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioPrefetch} from '../src/services/audio-prefetch.ts';
import {emptyStudy,upcomingStudyCards} from '../src/services/study-flow.ts';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const words=[1,2,3,4].map(n=>({word_id:`word-${n}`,content_version:1}));
test('prepares word and sentence audio for at most three upcoming words and reuses completed work',async()=>{
 const calls:any[]=[],prefetch=new AudioPrefetch({scope:()=> 'account:child',child:()=> 'child',eventId:()=> 'key',preferences:async()=>({accent:'en-GB',voice_id:'voice'}),api:async(path,method,body)=>{calls.push({path,method,body});return path==='/audio'?{status:'succeeded'}:{example:{id:`sentence-${path.split('-').pop()}`,content_version:2}};}});
 prefetch.setWords(words);for(let i=0;i<10;i++)await tick();const audio=calls.filter(c=>c.path==='/audio');assert.deepEqual(audio.map(c=>c.body.word_id||c.body.sentence_id),['word-1','sentence-1','word-2','sentence-2','word-3','sentence-3']);prefetch.setWords(words.slice(1));for(let i=0;i<5;i++)await tick();assert.equal(calls.filter(c=>c.path==='/audio').length,8);prefetch.stop();
});
test('only one speculative job runs and leaving prevents further requests',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve),calls:any[]=[],prefetch=new AudioPrefetch({scope:()=> 'account:child',child:()=> 'child',eventId:()=> 'key',preferences:async()=>({accent:'en-GB',voice_id:'voice'}),wait:async()=>wait,api:async(path,method,body)=>{calls.push({path,body});return {status:'queued',job_id:'job'};}});
 prefetch.setWords(words);await tick();assert.equal(calls.length,1);prefetch.stop();release();for(let i=0;i<3;i++)await tick();assert.equal(calls.length,1);
});
test('changing upcoming words waits for the existing job instead of flooding the queue',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve),calls:any[]=[],prefetch=new AudioPrefetch({scope:()=> 'account:child',child:()=> 'child',eventId:()=> 'key',preferences:async()=>({accent:'en-GB',voice_id:'voice'}),wait:async()=>wait,api:async(path,method,body)=>{calls.push({path,body});return path==='/audio'?{status:'queued',job_id:body.word_id}:path.startsWith('/jobs/')?{status:'succeeded'}:{};}});
 prefetch.setWords(words);await tick();prefetch.setWords(words.slice(1));await tick();assert.equal(calls.filter(c=>c.path==='/audio').length,1);release();for(let i=0;i<8;i++)await tick();assert.equal(calls.filter(c=>c.path==='/audio').length,4);assert.deepEqual(calls.filter(c=>c.path==='/audio').map(c=>c.body.word_id),['word-1','word-2','word-3','word-4']);prefetch.stop();
});
test('lookahead follows the actual learning, unanswered test and practice queues',()=>{
 const flow=emptyStudy({source:'new_words'}),cards=words.map((w,i)=>({id:`c${i}`,child_word_id:w.word_id,word_version:1,version:1,lemma:w.word_id}));flow.cards=cards;flow.loaded=true;flow.learnIndex=1;assert.deepEqual(upcomingStudyCards(flow).map(c=>c.id),['c2','c3']);flow.phase='test';flow.testIndex=2;flow.results.c3={correct:true,saved:true,selectedMeaning:'',meaning:'',eventId:'x'};assert.deepEqual(upcomingStudyCards(flow).map(c=>c.id),['c0','c1']);flow.phase='practice';flow.practiceQueue=['c2','c0','c3','c1'];assert.deepEqual(upcomingStudyCards(flow).map(c=>c.id),['c0','c3','c1']);
});
