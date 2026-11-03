import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBody} from '../src/validation.ts';

test('check-in sharing accepts both legacy and local-poster requests',()=>{
 const path=['children','child','checkin-share'];
 assert.doesNotThrow(()=>validateBody(path,'POST',{date:'2026-10-31'}));
 assert.doesNotThrow(()=>validateBody(path,'POST',{date:'2026-10-31',local_poster:true}));
 assert.throws(()=>validateBody(path,'POST',{date:'2026-10-31',local_poster:'true'}));
 assert.throws(()=>validateBody(path,'POST',{date:'2026-10-31',unexpected:true}));
});
test('shared quiz and annotation contracts preserve existing validation rules',()=>{
 const quiz=['children','child','monthly-quizzes'],annotation=['words','word','annotations'];
 assert.doesNotThrow(()=>validateBody(quiz,'POST',{month:'2026-10',mode:'sample',scope:'favorites',sample_count:20}));
 assert.throws(()=>validateBody(quiz,'POST',{month:'2026-13',mode:'sample'}));
 assert.throws(()=>validateBody(quiz,'POST',{month:'2026-10',mode:'sample',sample_count:9}));
 assert.doesNotThrow(()=>validateBody(annotation,'PATCH',{expected_version:0,favorite:true}));
 assert.throws(()=>validateBody(annotation,'PATCH',{expected_version:0}));
 assert.throws(()=>validateBody(annotation,'PATCH',{expected_version:0,easy:true,error_prone:true}));
});

test('study session contract accepts each source and rejects ambiguous requests',()=>{
 const path=['children','child','study-sessions'];
 const id='00000000-0000-4000-8000-000000000001';
 for(const body of [{source:'scheduled'},{source:'review'},{source:'new_words'},{source:'favorites'},{source:'calendar',date:'2026-10-31',scope:'mistakes',mistake_source:'review'},{source:'calendar',date_from:'2026-10-01',date_to:'2026-10-31'},{source:'manual',word_ids:[id]},{source:'quiz',quiz_id:id}])assert.doesNotThrow(()=>validateBody(path,'POST',body));
 for(const body of [{source:'review',date:'2026-10-31'},{source:'calendar',date:'2026-10-31',date_from:'2026-10-01',date_to:'2026-10-31'},{source:'manual',word_ids:[]},{source:'manual',word_ids:[id,id]},{source:'quiz',quiz_id:'invalid'}])assert.throws(()=>validateBody(path,'POST',body));
});
