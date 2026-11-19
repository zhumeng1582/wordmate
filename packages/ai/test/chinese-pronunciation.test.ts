import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chinesePronunciationPlan} from '../src/chinese-pronunciation.ts';
import {contentRepairRequest,repairSsml} from '../src/content-repair.ts';
const speech='四时田园杂兴（其三十一）。\n南宋，范成大。\n昼出耘田夜绩麻，村庄儿女各当家。\n童孙未解供耕织，也傍桑阴学种瓜。';
test('poem pronunciation comes from lexical data and preserves the exact spoken source',()=>{
 const plan=chinesePronunciationPlan(speech)!;assert(plan);const spans=plan.candidate.pronunciations,span=(text:string)=>spans.find(s=>s.text===text)!;
 assert.equal(span('四时田园杂兴').ph,'si4 shi2 tian2 yuan2 za2 xing4');assert.equal(span('南宋').ph,'nan2 song4');assert.equal(span('童孙未解供耕织').ph,'tong2 sun1 wei4 jie3 gong4 geng1 zhi1');assert.equal(span('也傍桑阴学种瓜').ph,'ye3 bang4 sang1 yin1 xue2 zhong4 gua1');
 const request=contentRepairRequest({kind:'poems',issue:'audio',description:'',source:{},fields:{},speech});assert(request.validate(plan.candidate));const ssml=repairSsml(speech,spans);assert.equal(ssml.replace(/<[^>]*>/g,''),speech);assert(plan.reference.phrases.some(p=>p.text==='杂兴'));
});
test('unsupported or mixed speech does not invent a dictionary pronunciation',()=>{assert.equal(chinesePronunciationPlan(''),null);assert.equal(chinesePronunciationPlan('你好 hello'),null);assert.equal(chinesePronunciationPlan('字'.repeat(1001)),null);});

test('model pronunciation cannot invent a tone for an unambiguous character',()=>{
 const r=contentRepairRequest({kind:'poems',issue:'audio',description:'核对朗读',source:{},fields:{},speech:'南宋。杂兴。'}),candidate=(text:string,ph:string)=>({values:{},pronunciations:[{text,alphabet:'py',ph}],note:'核对读音',verified:true});
 assert.throws(()=>r.validate(candidate('南宋','nan2 song3')),{validationIssue:{field:'pronunciation_phonemes'}});assert.throws(()=>r.validate(candidate('杂兴','za2 xing1')),{validationIssue:{field:'pronunciation_phonemes'}});assert(r.validate(candidate('南宋','nan2 song4')));
});
