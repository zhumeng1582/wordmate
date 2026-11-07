import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,tick} from './page-harness.ts';
test('feedback sends selected category, example and matching played audio without adding inline messages',async()=>{
 const example={id:'sentence-a',content_version:2},target={sentence_id:example.id,content_version:2},audio={lastAudio:{target:JSON.stringify(target),audioId:'audio-a'}};
 const page=pageHarness('components/WordFeedback',async()=>({ok:true}),'WordFeedback',{actionIndex:4,props:{wordId:'word-a',wordVersion:1,example,audio}});
 page.button('反馈').onClick({stopPropagation(){}});await tick();await tick();assert.equal(page.calls[0].path,'/words/word-a/feedback');assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].body)),{kind:'example_pronunciation',word_version:1,sentence_id:'sentence-a',sentence_version:2,audio_id:'audio-a'});assert.equal(page.text(page.render()),'反馈');page.dispose();
});
test('word translation feedback does not attach an unrelated played audio',async()=>{
 const target={word_id:'word-a',content_version:1},audio={lastAudio:{target:JSON.stringify(target),audioId:'audio-a'}};
 const page=pageHarness('components/WordFeedback',async()=>({ok:true}),'WordFeedback',{actionIndex:2,props:{wordId:'word-a',wordVersion:1,audio}});page.button('反馈').onClick({stopPropagation(){}});await tick();await tick();assert.deepEqual(JSON.parse(JSON.stringify(page.calls[0].body)),{kind:'translation',word_version:1});page.dispose();
});
