import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeStudyCardWithWord} from '../src/services/study-cards.ts';

test('word details never replace the review-card id or version',()=>{
 const card={id:'review-card-id',version:4,child_word_id:'word-id',word_version:7,lemma:'run'};
 const word={id:'word-id',version:7,lemma:'run',meaning_zh:'跑',part_of_speech:'verb',ipa_gb:'/rʌn/',ipa_us:'/rʌn/',example:{id:'sentence-id',translation_zh:'我们跑步。'}};
 const merged=mergeStudyCardWithWord(card,word);
 assert.equal(merged.id,'review-card-id');
 assert.equal(merged.version,4);
 assert.equal(merged.child_word_id,'word-id');
 assert.equal(merged.word_version,7);
 assert.equal(merged.meaning_zh,'跑');
 assert.deepEqual(merged.example,word.example);
});
