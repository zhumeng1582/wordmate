import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.ts';
test('a server-granted validation recovery remains actionable without an exhausted-attempt warning',async()=>{
 let job:any={id:'job-a',status:'failed',attempts:3,max_attempts:3,retryable:true,error_code:'GENERATED_CONTENT_REJECTED',items:[]};
 const page=pageHarness('pages/generation/index',async(_path,method)=>{if(method==='POST'){job={...job,status:'running',max_attempts:4,retryable:false,error_code:null};return job;}return {items:[job]};});
 await page.show();assert.doesNotMatch(page.text(page.render()),/已达到尝试上限/);assert.equal(page.button('只重试未保存的单词').disabled,false);
 await page.button('只重试未保存的单词').onClick();assert.match(page.text(page.render()),/正在生成/);assert.equal(page.calls.filter(call=>call.method==='POST').length,1);
});
test('users review and deselect senses before confirming and can continue to the next page',async()=>{
 let pending:any[]=[{id:'one',lemma:'match',part_of_speech:'noun',meaning_zh:'比赛',sentence_en:'The match is fun.',sentence_zh:'比赛很有趣。'},{id:'two',lemma:'match',part_of_speech:'verb',meaning_zh:'匹配',sentence_en:'Colours match.',sentence_zh:'颜色相配。'}],submitted:any;
 const page=pageHarness('pages/generation/index',async(path,method,body)=>{if(path.endsWith('/candidates'))return {items:pending,pending_count:pending.length};if(path.endsWith('/confirm')){submitted=body;pending=[];return {ok:true};}return {items:[{id:'job-a',status:'succeeded',review_before_save:true,items:pending.map((item,i)=>({ordinal:i+1,input:item.lemma,status:'needs_confirmation'}))}]};});
 await page.show();await page.button('检查并选择词义').onClick();assert.match(page.text(page.render()),/比赛/);page.button('✓ 已选择').onClick();await page.button('确认本页选择').onClick();assert.deepEqual(JSON.parse(JSON.stringify(submitted)),{decisions:[{item_id:'one',selected:false},{item_id:'two',selected:true}]});assert.match(page.text(page.render()),/当前没有待选择的词义/);
});
test('a corrected meaning is shown and sent with its existing sentence',async()=>{
 let pending:any[]=[{id:'one',lemma:'cat',part_of_speech:'noun',meaning_zh:'猫',sentence_en:'The cat is here.',sentence_zh:'猫在这里。'}],submitted:any;
 const page=pageHarness('pages/generation/index',async(path,method,body)=>{if(path.endsWith('/candidates'))return {items:pending,pending_count:pending.length};if(path.endsWith('/confirm')){submitted=body;pending=[];return {ok:true};}return {items:[{id:'job-a',status:'succeeded',review_before_save:true,items:pending.map((item,i)=>({ordinal:i+1,input:item.lemma,status:'needs_confirmation'}))}]};});
 await page.show();await page.button('检查并选择词义').onClick();page.button('修改释义和例句').onClick();const input=page.all(page.render()).find(node=>node.type==='Input');input.props.onInput({detail:{value:'小猫'}});assert.match(page.text(page.render()),/小猫/);await page.button('确认本页选择').onClick();assert.equal(submitted.decisions[0].correction.meaning_zh,'小猫');assert.equal(submitted.decisions[0].correction.sentence_en,'The cat is here.');page.dispose();
});
test('candidate review has a return action at the top of the review card',async()=>{const item={id:'one',lemma:'cat',part_of_speech:'noun',meaning_zh:'猫',sentence_en:'The cat is here.',sentence_zh:'猫在这里。'};const page=pageHarness('pages/generation/index',async path=>path.endsWith('/candidates')?{items:[item],pending_count:1}:{items:[{id:'job',status:'succeeded',review_before_save:true,items:[{ordinal:1,input:'cat',status:'needs_confirmation'}]}]});await page.show();await page.button('检查并选择词义').onClick();const card=page.all(page.render()).find(n=>n.type==='View'&&n.props?.className==='card'&&page.text(n).includes('选择要加入的词义'));assert.equal(page.text(page.all(card).find(n=>n.type==='Button')),'‹ 返回记录');page.button('返回记录').onClick();assert.doesNotMatch(page.text(page.render()),/选择要加入的词义/);page.dispose();});
