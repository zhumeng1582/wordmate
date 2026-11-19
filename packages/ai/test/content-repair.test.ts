import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentRepairRequest,repairSsml} from '../src/content-repair.ts';
const request=(speech?:string)=>contentRepairRequest({kind:'hanzi',issue:speech?'audio':'pinyin',description:'这里读háng',source:{character:'行'},fields:speech?{}:{pinyin:200},speech});
test('repair contracts reject extra fields, missing changes and invalid pronunciation markup',()=>{const text=request();assert.throws(()=>text.validate({verified:true,note:'已修',values:{meaning:'错误范围'},pronunciations:[]}));const audio=request('银行');for(const pronunciation of [{text:'银行',alphabet:'py',ph:'yin2'},{text:'木',alphabet:'py',ph:'mu4'},{text:'银行',alphabet:'py',ph:'<script>'}])assert.throws(()=>audio.validate({verified:true,note:'已修',values:{},pronunciations:[pronunciation]}));assert.throws(()=>audio.validate({verified:true,note:'已修',values:{},pronunciations:[]}));});
test('validated phonemes build escaped SSML without rewriting the source',()=>{const audio=request('银行 & <hello>');const value=audio.validate({verified:true,note:'明确多音字读音',values:{},pronunciations:[{text:'银行',alphabet:'py',ph:'yin2 hang2'}]});assert.equal(repairSsml('银行 & <hello>',value.pronunciations),'<speak><phoneme alphabet="py" ph="yin2 hang2">银行</phoneme> &amp; &lt;hello&gt;</speak>');});

test('English pronunciation schema permits CMU only and rejects the real pupil-as-pinyin failure',()=>{
 const r=contentRepairRequest({kind:'words',issue:'audio',description:'',source:{lemma:'pupil',meaning_zh:'学生'},fields:{},speech:'pupil',accent:'en-GB'}),schema=r.schema as any;
 assert.deepEqual(schema.properties.pronunciations.items.properties.alphabet.enum,['cmu']);
 assert.throws(()=>r.validate({values:{},pronunciations:[{text:'pupil',alphabet:'py',ph:'pi1 lu4'}],note:'中文拼音近似',verified:true}),{code:'GENERATED_CONTENT_REJECTED',validationIssue:{field:'pronunciation_alphabet'}});
 const value=r.validate({values:{},pronunciations:[{text:'pupil',alphabet:'cmu',ph:'P Y UW1 P AH0 L'}],note:'核对英文音素',verified:true});assert.match(repairSsml('pupil',value.pronunciations),/alphabet="cmu"/);
});
test('Chinese pronunciation schema permits pinyin only and mixed text cannot use CMU for Han characters',()=>{
 const r=request('银行');assert.deepEqual((r.schema as any).properties.pronunciations.items.properties.alphabet.enum,['py']);
 assert.throws(()=>r.validate({values:{},pronunciations:[{text:'银行',alphabet:'cmu',ph:'Y IH1 N'}],note:'错误体系',verified:true}));
 const mixed=request('银行 book');assert.throws(()=>mixed.validate({values:{},pronunciations:[{text:'银行 book',alphabet:'cmu',ph:'B UH1 K'}],note:'错误混用',verified:true}));
});

test('an audio-only word repair must match its existing IPA instead of another word pronunciation',()=>{
 const r=contentRepairRequest({kind:'words',issue:'audio',description:'',source:{lemma:'pupil',ipa_gb:'/pju:pəl/',ipa_us:'/ˈpjuːpəl/'},fields:{},speech:'pupil',accent:'en-GB'}),candidate=(ph:string)=>({values:{},pronunciations:[{text:'pupil',alphabet:'cmu',ph}],note:'核对英文发音',verified:true});
 assert.throws(()=>r.validate(candidate('P IY1 P AH0 L')),{validationIssue:{field:'pronunciation_reference'}});
 assert.equal(r.validate(candidate('P Y UW1 P AH0 L')).verified,true);assert.deepEqual((r.input as any).pronunciation_reference.cmu_tokens,['P','Y','UW','P','AH','L']);
 const schema=r.schema as any;assert.equal(schema.properties.pronunciations.items.properties.text.const,'pupil');assert(!new RegExp(schema.properties.pronunciations.items.properties.ph.pattern).test('P IY1 P AH0 L'));
});

test('text repairs enforce word, IPA and dictionary pinyin contracts while preserving unknown poem metadata',()=>{
 const make=(kind:string,issue:string,source:any,fields:any)=>contentRepairRequest({kind,issue,source,fields,description:''}),candidate=(values:any)=>({values,pronunciations:[],verified:true,note:'已核对'});
 const word=make('words','source',{lemma:'apple'},{lemma:100});assert.throws(()=>word.validate(candidate({lemma:'have a nice day'})));assert.equal(word.validate(candidate({lemma:"don't"})).values.lemma,"don't");
 const ipa=make('words','phonetic',{}, {ipa_gb:200,ipa_us:200});assert.throws(()=>ipa.validate(candidate({ipa_gb:'读作苹果',ipa_us:'apple'})));assert.equal(ipa.validate(candidate({ipa_gb:'/ˈæpəl/',ipa_us:'/ˈæpəl/'})).verified,true);
 const py=request();for(const pinyin of ['随便','hǎn','hang9'])assert.throws(()=>py.validate(candidate({pinyin})));for(const pinyin of ['háng（行业）','xíng、háng','hang2'])assert.equal(py.validate(candidate({pinyin})).verified,true);
 const poem=make('poems','source',{}, {title:100,author:100,dynasty:40,body:1000});assert.equal(poem.validate(candidate({title:'民歌',author:'',dynasty:'',body:'天苍苍，野茫茫。'})).values.author,'');assert.throws(()=>poem.validate(candidate({title:'',author:'',dynasty:'',body:'天苍苍。'})));
});
