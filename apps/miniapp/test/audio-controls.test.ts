import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
test('phonetic taps work with native event shapes and keep pronunciation and part of speech together',async()=>{
 const target={word_id:'rainbow',content_version:2},played:any[]=[],audio={active:'',status:'',error:'',play:async(value:any)=>{played.push(value);}};let held=0,stopped=0;
 const page=pageHarness('components/AudioControls',async()=>({}),'AudioText',{props:{audio,target,text:'/ˈreɪnbəʊ/',suffix:'名词',phonetic:true,onPlay:()=>{held++;}}});
 const button=page.button('/ˈreɪnbəʊ/');assert.match(page.text(page.render()),/名词/);button.onClick({detail:{}});button.onClick({stopPropagation:()=>{stopped++;}});await tick();assert.equal(played.length,2);assert.equal(held,2);assert.equal(stopped,1);assert(played.every(value=>value.word_id==='rainbow'&&value.content_version===2));page.dispose();
});
test('audio errors include an actionable retry and preparing status is readable',async()=>{
 let retried=0;const failure=pageHarness('components/AudioControls',async()=>({}),'AudioFeedback',{props:{audio:{error:'无法连接服务器',retry:async()=>{retried++;}}}});assert.match(failure.text(failure.render()),/无法连接服务器/);await failure.button('重试播放').onClick();assert.equal(retried,1);failure.dispose();
 const preparing=pageHarness('components/AudioControls',async()=>({}),'AudioFeedback',{props:{audio:{error:'',active:'rainbow',status:'首次准备发音，需要稍等…'}}});assert.match(preparing.text(preparing.render()),/首次准备发音/);preparing.dispose();
});
