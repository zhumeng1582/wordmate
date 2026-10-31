import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness,deferred,tick} from './page-harness.ts';
import {vocabularyKeys,emptyVocabularyDraft,applyMaterial,removePreparedWord,type PreparedWord} from '../src/services/vocabulary-draft.ts';

const ready=(vision=false)=>({capability:vision?'vision':'text',family_id:'family-a',family_name:'我的家庭',families:[{id:'family-a',name:'我的家庭'}],mode:'system',model_id:'ready',version:1,has_key:false,byok_available:true,available_micros:20000000,gift_remaining_micros:20000000,models:[{id:'ready',label:'默认服务',vision,system_available:true,max_charge_micros:100000}]});
const entries:PreparedWord[]=['apple','banana','pear'].map((input,input_index)=>({input_index,input,status:'ok',lemma:input,meaning_zh:['苹果','香蕉','梨'][input_index],reason:null,part_of_speech:'noun',ipa_gb:'/test/',ipa_us:'/test/',sentence_en:`I like ${input}.`,sentence_zh:'我喜欢水果。'}));
const job=(overrides:any={})=>({id:'job-a',status:'queued',wordbook_id:'book-a',items:[],...overrides});
function fixture(options:{cache?:Record<string,any>;extract?:(...args:any[])=>Promise<any>;jobs?:any[];books?:any[];write?:(path:string,body:any)=>Promise<any>}={}){
 const backend={jobs:options.jobs??[] as any[],books:options.books??[{id:'book-a',name:'我的词本'},{id:'book-b',name:'校园词本'}]};
 const page=pageHarness('pages/add-words/index',async(path,method,body)=>{
  if(method!=='GET'){const result=options.write?await options.write(path,body):job();backend.jobs=[result,...backend.jobs.filter(item=>item.id!==result.id)];return result;}
  if(path.endsWith('/wordbooks'))return {items:backend.books};
  if(path.endsWith('/ai-batches'))return {items:backend.jobs};
  if(path.includes('/me/ai-settings'))return ready(path.includes('vision'));
  throw Error(`Unexpected path ${path}`);
 },undefined,{cache:options.cache,extract:options.extract});
 return {...page,backend};
}
const input=(page:ReturnType<typeof fixture>,raw:string)=>{page.all(page.render()).find(node=>node.type==='Textarea').props.onInput({detail:{value:raw}});page.render();};

test('opening the simplified page only reads data and keeps optional configuration folded',async()=>{
 const page=fixture();await page.show();const text=page.text(page.render());
 assert.match(text,/输入文字.*拍照 \/ 图片.*导入文件/);assert.match(text,/我的词本/);assert.doesNotMatch(text,/API Key|Token|正在结算|当前可用 ¥/);assert(page.calls.every(call=>call.method==='GET'));assert(!page.all(page.render()).some(node=>node.type==='Input'));
 page.button('主题与费用说明').onClick();assert(page.all(page.render()).some(node=>node.type==='Input'));
});

test('text submission is durable before posting and success shows the result without another form',async()=>{
 let page!:ReturnType<typeof fixture>;
 page=fixture({write:async(_,body)=>{const pending=page.cache.get(vocabularyKeys('account-a','child-a').pending);assert.equal(pending.body.raw_text,'apple\nbanana');assert.equal(body.source_type,'text');return job({status:'succeeded',items:[{ordinal:1,input:'apple',word_id:'word-a'},{ordinal:2,input:'banana',word_id:'word-b'}]});}});
 await page.show();input(page,'apple\nbanana');await page.button('整理并加入词本').onClick();await tick();
 assert.match(page.text(page.render()),/已加入 2 个单词/);assert(!page.all(page.render()).some(node=>node.type==='Textarea'));assert(!page.cache.has(vocabularyKeys('account-a','child-a').pending));assert.equal(page.cache.get(vocabularyKeys('account-a','child-a').draft).raw,'');
 page.button('去单词本学习').onClick();assert.deepEqual(page.routes,['/pages/words/index']);
});

test('lost submission response keeps the material and retries the identical request',async()=>{
 let attempts=0;const page=fixture({write:async()=>{if(++attempts===1)throw Error('NETWORK_TIMEOUT');return job();}});await page.show();input(page,'apple');await page.button('整理并加入词本').onClick();
 assert.equal(page.all(page.render()).find(node=>node.type==='Textarea').props.disabled,true);const first=page.calls.find(call=>call.method==='POST');assert(first);assert(page.cache.has(vocabularyKeys('account-a','child-a').pending));
 await page.button('重试上次提交').onClick();await tick();const writes=page.calls.filter(call=>call.method==='POST');assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.deepEqual(writes[0].body,writes[1].body);assert.match(page.text(page.render()),/正在整理单词/);
});

test('reopening restores an unfinished local draft and its destination without generating anything',async()=>{
 const page=fixture();await page.show();input(page,'read a book');const picker=page.all(page.render()).find(node=>node.type==='Picker');picker.props.onChange({detail:{value:1}});page.render();
 const reopened=fixture({cache:Object.fromEntries(page.cache)});await reopened.show();assert.equal(reopened.all(reopened.render()).find(node=>node.type==='Textarea').props.value,'read a book');assert.match(reopened.text(reopened.render()),/校园词本/);assert(reopened.calls.every(call=>call.method==='GET'));
});

test('a persisted pending submission is restored after restart and cannot be replaced by a new request',async()=>{
 const keys=vocabularyKeys('account-a','child-a'),pending={key:'original-id',body:{wordbook_id:'book-a',source_type:'text',raw_text:'apple',theme:''}};
 const page=fixture({cache:{[keys.pending]:pending}});await page.show();assert.match(page.text(page.render()),/上次提交还没确认/);await page.button('重试上次提交').onClick();await tick();const write=page.calls.find(call=>call.method==='POST');assert.equal(write?.key,'original-id');assert.deepEqual(write?.body,pending.body);
});

test('file contents append to existing text and remain editable before submission',async()=>{
 const imports:any[]=[];const page=fixture({extract:async(...args)=>{imports.push(args);return {source:'file',text:'banana'};}});await page.show();input(page,'apple');page.button('导入文件').onClick();await page.button('从微信聊天选择文件').onClick();
 assert.equal(imports.length,1);assert.equal(imports[0][2],'apple');assert.equal(page.all(page.render()).find(node=>node.type==='Textarea').props.value,'apple\nbanana');assert(page.calls.every(call=>call.method==='GET'));
});

test('image recognition previews entries and removal reindexes the saved result without another generation',async()=>{
 let imports=0;const page=fixture({extract:async()=>{imports++;return {source:'image',text:'apple banana pear',prepared_items:entries};}});await page.show();page.button('拍照 / 图片').onClick();await page.button('从相册选择').onClick();assert.match(page.text(page.render()),/检查识别结果/);assert(!page.all(page.render()).some(node=>node.type==='Textarea'));
 page.all(page.render()).find(node=>node.props?.['aria-label']==='移除 apple').props.onClick();page.render();await page.button('确认加入 2 个单词').onClick();await tick();
 const write=page.calls.find(call=>call.method==='POST');assert.equal(imports,1);assert.equal(write?.body.source_type,'vision');assert.deepEqual(Array.from(write?.body.prepared_items,(item:any)=>item.input),['banana','pear']);assert.deepEqual(Array.from(write?.body.prepared_items,(item:any)=>item.input_index),[0,1]);
});

test('editing recognized text invalidates prepared entries only when its content changes',async()=>{
 const page=fixture({extract:async()=>({source:'image',text:'apple banana pear',prepared_items:entries})});await page.show();page.button('拍照 / 图片').onClick();await page.button('从相册选择').onClick();page.button('查看 / 修改原文').onClick();assert.match(page.text(page.render()),/确认加入 3 个单词/);
 input(page,'apple\nbanana');assert.doesNotMatch(page.text(page.render()),/检查识别结果/);assert.match(page.text(page.render()),/整理并加入词本/);assert(page.calls.every(call=>call.method==='GET'));
});

test('an active batch can be opened with no input and new material can be prepared while it runs',async()=>{
 const page=fixture({jobs:[job()]});await page.show();assert.equal(page.button('查看进度').disabled,undefined);page.button('查看进度').onClick();assert.match(page.text(page.render()),/正在整理单词/);
 page.button('继续准备下一批').onClick();input(page,'next word');assert.equal(page.button('上一批正在整理').disabled,true);assert.equal(page.all(page.render()).find(node=>node.type==='Textarea').props.disabled,false);
});

test('a late image result cannot enter another childs form or local draft',async()=>{
 const waiting=deferred(),page=fixture({extract:async()=>waiting.promise});await page.show();page.button('拍照 / 图片').onClick();const work=page.button('从相册选择').onClick();page.hide();page.cache.set('child_id','child-b');await page.show();waiting.resolve({source:'image',text:'private word',prepared_items:entries});await work;await tick();
 assert.doesNotMatch(page.text(page.render()),/private word|苹果/);const saved=page.cache.get(vocabularyKeys('account-a','child-b').draft);assert(!saved?.raw?.includes('private word'));assert(!page.calls.some(call=>call.method==='POST'));
});

test('book list reordering never changes the chosen destination',async()=>{
 const page=fixture();await page.show();page.all(page.render()).find(node=>node.type==='Picker').props.onChange({detail:{value:1}});page.render();page.backend.books.reverse();page.hide();await page.show();input(page,'apple');await page.button('整理并加入词本').onClick();assert.equal(page.calls.find(call=>call.method==='POST')?.body.wordbook_id,'book-b');
});

test('discarding all recognized entries cannot silently submit the original material',()=>{
 let draft=applyMaterial(emptyVocabularyDraft(),{source:'image',text:'apple banana pear',prepared_items:entries});while(draft.prepared?.length)draft=removePreparedWord(draft,0);assert.equal(draft.raw,'');assert.equal(draft.prepared,null);
});

test('an expired login during submission returns to a clear login action',async()=>{
 let page!:ReturnType<typeof fixture>;page=fixture({write:async()=>{page.cache.clear();throw Object.assign(Error('UNAUTHENTICATED'),{status:401});}});await page.show();input(page,'apple');await page.button('整理并加入词本').onClick();
 assert.match(page.text(page.render()),/微信登录/);assert.doesNotMatch(page.text(page.render()),/正在提交|正在准备添加单词|apple/);
});
