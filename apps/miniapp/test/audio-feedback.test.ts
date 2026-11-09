import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
test('feedback sends selected category, example and matching played audio without adding inline messages',async()=>{
 const example={id:'sentence-a',content_version:2},target={sentence_id:example.id,content_version:2},audio={lastAudio:{target:JSON.stringify(target),audioId:'audio-a'}};
 const page=pageHarness('components/WordFeedback',async()=>({ok:true}),'WordFeedback',{actionIndex:4,props:{wordId:'word-a',wordVersion:1,example,audio}});
 page.button('反馈').onClick({stopPropagation(){}});await tick();await tick();assert.equal(page.calls[0].path,'/words/word-a/feedback');assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].body)),{kind:'example_pronunciation',word_version:1,sentence_id:'sentence-a',sentence_version:2,audio_id:'audio-a'});assert.equal(page.text(page.render()),'反馈错误');page.dispose();
});
test('word translation feedback does not attach an unrelated played audio',async()=>{
 const target={word_id:'word-a',content_version:1},audio={lastAudio:{target:JSON.stringify(target),audioId:'audio-a'}};
 const page=pageHarness('components/WordFeedback',async()=>({ok:true}),'WordFeedback',{actionIndex:2,props:{wordId:'word-a',wordVersion:1,audio}});page.button('反馈').onClick({stopPropagation(){}});await tick();await tick();assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].body)),{kind:'translation',word_version:1});page.dispose();
});
test('feedback status persists and a new report updates the correction mark',async()=>{let submitted:any;const page=pageHarness('components/WordFeedback',async(_path,method)=>method==='GET'?{reported:true}:{already_reported:false,annotations:{manual_needs_correction:true,needs_correction:true,version:2}},'WordFeedback',{actionIndex:2,props:{wordId:'word-a',wordVersion:1,audio:{},showStatus:true,onSubmitted:(r:any)=>{submitted=r;}}});await tick();assert.equal(page.text(page.render()),'已反馈');page.button('已反馈').onClick({stopPropagation(){}});await tick();await tick();assert.equal(submitted.annotations.manual_needs_correction,true);assert.equal(page.text(page.render()),'已反馈');page.dispose();});
