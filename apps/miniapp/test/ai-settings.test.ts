import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {aiMoney,aiStatus,aiModels,defaultAiModel,aiScope,aiQuery,aiCallLabel,type AiSettings,type AiModel} from '../src/services/ai-settings.ts';
import * as aiHelpers from '../src/services/ai-settings.ts';
import {selectFamilyContext} from '../src/services/family-context.ts';

const model:AiModel={id:'default',label:'默认文字服务',provider:'qwen',model:'text-test',vision:false,system_available:true,max_charge_micros:81920,input_yuan_per_million:'1',output_yuan_per_million:'2',cached_yuan_per_million:'1',pricing_tiers:null};
export function settings(overrides:Partial<AiSettings>={}):AiSettings{return {capability:'text',family_id:'family-a',family_name:'测试家庭',families:[{id:'family-a',name:'测试家庭'}],mode:'system',model_id:'default',version:3,has_key:false,byok_available:true,custom_provider:null,custom_model:null,available_micros:20000000,balance_micros:20000000,frozen_micros:0,gift_remaining_micros:20000000,legacy_balance_micros:0,welcome_credit_micros:20000000,models:[{...model}],...overrides};}
test('small charges and negative balances are never rounded into a misleading zero',()=>{
 assert.equal(aiMoney(110),'¥0.00011');assert.equal(aiMoney(-1),'¥-0.000001');assert.equal(aiMoney(20000000,true),'¥20.00');assert.equal(aiMoney(1,true),'不足 ¥0.01');assert.equal(aiMoney(-1,true),'欠费不足 ¥0.01');assert.equal(aiMoney(0),'¥0.00');
});
test('default service readiness accounts for funds reserved for each generation',()=>{
 assert.equal(aiStatus(settings()).ready,true);assert.equal(aiStatus(settings({available_micros:81919})).action,'usage');assert.equal(aiStatus(settings({available_micros:81920})).ready,true);assert.equal(aiStatus(settings({available_micros:0})).ready,false);
});
test('a personal account does not require family funds and a missing key needs setup',()=>{
 assert.equal(aiStatus(settings({mode:'byok',has_key:true,available_micros:0})).ready,true);assert.equal(aiStatus(settings({mode:'byok',has_key:false})).action,'settings');assert.equal(aiStatus(settings({mode:'byok',has_key:true,byok_available:false})).ready,false);
});
test('unavailable and missing models are not presented as a usable service',()=>{
 assert.equal(aiStatus(settings({models:[{...model,system_available:false}]})).ready,false);assert.equal(aiStatus(settings({model_id:'removed-model'})).action,'settings');
});
test('system choices exclude unavailable/custom models and preserve the current valid selection',()=>{
 const data=settings({model_id:'second',models:[{...model,id:'unavailable',system_available:false},{...model,id:'custom',system_available:false},{...model},{...model,id:'second'}]});
 assert.deepEqual(aiModels(data,'system').map(item=>item.id),['default','second']);assert.equal(defaultAiModel(data,'system')?.id,'second');assert.equal(defaultAiModel({...data,model_id:'unavailable'},'system')?.id,'default');assert.equal(data.model_id,'second');
});
test('vision choices do not offer text-only services even with a saved text preference',()=>{
 const data=settings({capability:'vision',models:[{...model},{...model,id:'vision',vision:true}]});assert.deepEqual(aiModels(data,'byok').map(item=>item.id),['vision']);assert.equal(defaultAiModel(data,'system')?.id,'vision');
});
test('request scope keeps the purpose and family together without including credentials',()=>{
 assert.deepEqual(aiScope(settings({capability:'vision'})),{capability:'vision',family_id:'family-a'});assert.deepEqual(aiScope(settings({family_id:null})),{capability:'text'});assert.equal(aiQuery('vision','family a'),'?capability=vision&family_id=family%20a');
});
test('personal-provider failures do not claim to be free and system failures release quota',()=>{
 assert.equal(aiCallLabel({state:'failed',mode:'system',charge_micros:0}).cost,'未扣额度');assert.match(aiCallLabel({state:'failed',mode:'byok',charge_micros:0}).cost,/服务商可能已计费/);assert.match(aiCallLabel({state:'uncertain',mode:'byok',charge_micros:0}).cost,/服务商账单/);assert.equal(aiCallLabel({state:'succeeded',mode:'system',charge_micros:110}).cost,'扣除 ¥0.00011');
});

// Exercise actual page handlers with native components and API calls stubbed.
const require=createRequire(import.meta.url),ts=require('typescript'),tick=()=>new Promise(resolve=>setImmediate(resolve));
function screen(page='ai-settings',options:{read?:(path:string,method:string,data:any)=>Promise<any>;cache?:Record<string,any>}={}){
 const cache=new Map<string,any>(Object.entries({access_token:'session',family_id:'family-a',child_id:'child-a',...options.cache})),calls:{path:string;method:string;data:any}[]=[],routes:string[]=[],slots:any[]=[];let cursor=0,show=()=>{},hide=()=>{};
 const hooks={useState:(initial:any)=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],(value:any)=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef:(initial:any)=>{const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];}};
 const storage={get:(key:string)=>cache.get(key)||'',set:(key:string,value:any)=>cache.set(key,value)};
 const api=async(path:string,method='GET',data?:any)=>{calls.push({path,method,data});if(options.read)return options.read(path,method,data);return settings({capability:path.includes('capability=vision')?'vision':'text',models:[{...model,vision:true}]});};
 const taro={useDidShow:(callback:()=>void)=>{show=callback;},useDidHide:(callback:()=>void)=>{hide=callback;},useRouter:()=>({params:{}}),navigateTo:async({url}:{url:string})=>{routes.push(url);},getSystemInfoSync:()=>({platform:'android'}),canIUse:()=>false,showModal:async()=>({confirm:true})};
 const services={api,storage,message:(error:any)=>error.message,go:async(page:string)=>{routes.push(`/pages/${page}/index`);},openLogin:async()=>{routes.push('/pages/login/index');},eventId:()=> 'request-id'};
 const module={exports:{} as any},code=ts.transpileModule(readFileSync(`apps/miniapp/src/pages/${page}/index.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,DEV_AUTH:false,require:(id:string)=>id==='react'?hooks:id==='react/jsx-runtime'?{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:'Fragment'}:id==='@tarojs/taro'?taro:id==='@tarojs/components'?{View:'View',Text:'Text',Button:'Button',Picker:'Picker',Input:'Input',Checkbox:'Checkbox',CheckboxGroup:'CheckboxGroup'}:id.endsWith('/services/api')?services:id.endsWith('/family-context')?{selectFamilyContext}:id.endsWith('/services/ai-settings')?aiHelpers:{}});
 const render=()=>{cursor=0;return module.exports.default();};
 const all=(tree:any):any[]=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(all):[tree,...all(tree.props?.children)];
 const text=(tree:any):string=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(''):typeof tree==='object'?text(tree.props?.children):String(tree);
 const button=(label:string)=>{const found=all(render()).find(node=>node.type==='Button'&&text(node).includes(label));assert(found,`missing button: ${label}`);return found.props;};
 render();return {cache,calls,routes,render,all,text,button,show:async()=>{render();show();await tick();return render();},hide:()=>hide()};
}
test('novice overview is read-only and leads directly to adding words without configuration',async()=>{
 const page=screen();await page.show();const text=page.text(page.render());assert.match(text,/AI 助手/);assert.match(text,/¥20.00/);assert.doesNotMatch(text,/Token|API Key|保存设置|充值订单/);
 assert.equal(page.calls.length,2);assert(page.calls.every(call=>call.method==='GET'&&call.path.startsWith('/me/ai-settings?')));
 await page.button('去添加单词').onClick();assert.deepEqual(page.routes,['/pages/add-words/index']);assert.equal(page.calls.length,2);
});
test('new parents get a clear child setup action before adding learning material',async()=>{
 const page=screen('ai-settings',{cache:{child_id:''}});await page.show();await page.button('选择孩子，开始使用').onClick();assert.deepEqual(page.routes,['/pages/family/index']);
});
test('audio usage displays the charged character count and price instead of token usage',async()=>{
 const call={id:'speech',kind:'audio',mode:'system',provider:'cosyvoice',model:'cosyvoice-v3-flash',state:'succeeded',charge_micros:500,billable_characters:5,audio_yuan_per_10000_characters:'1',created_at:'2026-10-31T01:00:00Z'};
 const page=screen('ai-usage',{read:async path=>path.startsWith('/me/ai-settings')?settings({audio_yuan_per_10000_characters:'1'}):path.startsWith('/me/ai-recharges')?{enabled:false,products:[],orders:[]}:{items:[call],entries:[]}});await page.show();assert.match(page.text(page.render()),/语音生成.*扣除 ¥0.0005/);page.button('详情 ›').onClick();assert.match(page.text(page.render()),/计费字符：5 · ¥1\/万字符/);assert.doesNotMatch(page.text(page.render()),/Token/);page.button('额度与扣费说明').onClick();assert.match(page.text(page.render()),/已生成音频可重复播放，不重复扣费/);
});
for(const pageName of ['ai-settings','ai-usage'])test(`${pageName} shows the exact remaining credit after charges below one cent`,async()=>{
 const data=settings({available_micros:19997527,balance_micros:19997527,gift_remaining_micros:19997527}),calls=[2223,250].map((charge_micros,id)=>({id:String(id),kind:'vocabulary',mode:'system',provider:'qwen',model:'text-test',state:'succeeded',charge_micros,created_at:'2026-10-30T12:13:00Z'}));
 const page=screen(pageName,{read:async path=>path.startsWith('/me/ai-settings')?data:path.startsWith('/me/ai-recharges')?{enabled:false,products:[],orders:[]}:{items:calls,entries:[]}});await page.show();
 const amount=page.all(page.render()).find(node=>node.props?.className==='ai-credit-amount');assert.equal(page.text(amount),'¥19.997527');
 if(pageName==='ai-usage'){assert.match(page.text(page.render()),/扣除 ¥0.002223/);assert.match(page.text(page.render()),/扣除 ¥0.00025/);page.button('额度与扣费说明').onClick();assert.match(page.text(page.render()),/0.000001 元/);assert.match(page.text(page.render()),/完成并保存后扣除实际费用/);}
});
test('switching family clears the selected child and reloads both purposes in the new family',async()=>{
 const page=screen('ai-settings',{read:async(path)=>settings({capability:path.includes('vision')?'vision':'text',family_id:path.includes('family-b')?'family-b':'family-a',families:[{id:'family-a',name:'家庭 A'},{id:'family-b',name:'家庭 B'}],models:[{...model,vision:true}]})});await page.show();
 const picker=page.all(page.render()).find(node=>node.type==='Picker');picker.props.onChange({detail:{value:'1'}});await tick();assert.equal(page.cache.get('family_id'),'family-b');assert.equal(page.cache.get('child_id'),'');assert(page.calls.slice(-2).every(call=>call.path.includes('family_id=family-b')));
});
test('no-family state offers setup instead of showing a false usable balance',async()=>{
 const page=screen('ai-settings',{cache:{family_id:'',child_id:''},read:async()=>settings({family_id:null,families:[],available_micros:0})});await page.show();assert.doesNotMatch(page.text(page.render()),/¥20.00/);await page.button('设置家庭与孩子').onClick();assert.deepEqual(page.routes,['/pages/family/index']);
});
test('advanced changes require explicit consent and keys never enter local storage',async()=>{
 const page=screen('ai-advanced');await page.show();assert.equal(page.calls.length,1);assert(page.calls.every(call=>call.method==='GET'));
 page.button('我的 AI 账号').onClick();let tree=page.render();const input=page.all(tree).find(node=>node.type==='Input'&&node.props.password);input.props.onInput({detail:{value:'private-key-for-test'}});
 await page.button('保存并使用').onClick();assert.equal(page.calls.filter(call=>call.method==='PUT').length,0);
 tree=page.render();page.all(tree).find(node=>node.type==='CheckboxGroup').props.onChange({detail:{value:['provider']}});await page.button('保存并使用').onClick();await tick();
 const save=page.calls.find(call=>call.method==='PUT');assert(save);assert.equal(save.data.api_key,'private-key-for-test');assert.equal(save.data.family_id,'family-a');assert.equal(save.data.capability,'text');assert.equal(save.data.expected_version,3);assert.equal(save.data.provider_consent,true);
 assert(!JSON.stringify([...page.cache.entries()]).includes('private-key-for-test'));assert(!page.calls.some(call=>call.path==='/me/ai-test'));
});
test('closed recharge access stays hidden while precise usage costs and pagination work',async()=>{
 const calls=Array.from({length:11},(_,index)=>({id:String(index),kind:'vocabulary',mode:'system',provider:'qwen',model:'text-test',state:'succeeded',charge_micros:110,input_tokens:100,output_tokens:20,cached_tokens:0,created_at:'2026-10-30T10:00:00Z'}));
 const page=screen('ai-usage',{read:async(path)=>path.startsWith('/me/ai-settings')?settings():path.startsWith('/me/ai-recharges')?{enabled:false,ios_enabled:false,products:[],orders:[]}:{items:calls,entries:[]}});await page.show();
 assert.doesNotMatch(page.text(page.render()),/补充额度|充值订单/);assert.match(page.text(page.render()),/扣除 ¥0.00011/);assert.equal(page.all(page.render()).filter(node=>node.props?.className==='ai-record-row').length,10);
 page.button('查看更多').onClick();assert.equal(page.all(page.render()).filter(node=>node.props?.className==='ai-record-row').length,11);assert(page.calls.every(call=>call.method==='GET'));
});

test('returning to the AI overview keeps its content and primary action while refreshing',async()=>{
 let hold=false,release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);
 const page=screen('ai-settings',{read:async()=>{if(hold)await wait;return settings({models:[{...model,vision:true}]});}});
 await page.show();page.hide();hold=true;await page.show();
 assert.match(page.text(page.render()),/¥20.00/);assert.doesNotMatch(page.text(page.render()),/正在加载|正在准备/);assert.equal(page.button('去添加单词').disabled,false);
 release();await tick();assert.match(page.text(page.render()),/¥20.00/);
});

test('returning to usage retains expanded records and pagination during a delayed refresh',async()=>{
 let hold=false,release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);
 const calls=Array.from({length:11},(_,id)=>({id:String(id),kind:'vocabulary',mode:'system',provider:'qwen',model:'text-test',state:'succeeded',charge_micros:110,created_at:'2026-10-30T10:00:00Z'}));
 const page=screen('ai-usage',{read:async(path)=>{if(hold)await wait;return path.startsWith('/me/ai-settings')?settings():path.startsWith('/me/ai-recharges')?{enabled:false,products:[],orders:[]}:{items:calls,entries:[]};}});
 await page.show();page.button('查看更多').onClick();page.button('详情 ›').onClick();page.hide();hold=true;await page.show();
 assert.match(page.text(page.render()),/模型：text-test/);assert.doesNotMatch(page.text(page.render()),/正在加载/);assert.equal(page.all(page.render()).filter(node=>node.props?.className==='ai-record-row').length,11);
 release();await tick();assert.match(page.text(page.render()),/模型：text-test/);
});

test('a background refresh never overwrites an unsaved AI configuration or restores a cleared secret',async()=>{
 let hold=false,release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);
 const page=screen('ai-advanced',{read:async()=>{if(hold)await wait;return settings();}});
 await page.show();page.button('我的 AI 账号').onClick();let tree=page.render();page.all(tree).find(node=>node.type==='Input'&&node.props.password).props.onInput({detail:{value:'private-draft-key'}});page.render();
 page.hide();hold=true;await page.show();assert.doesNotMatch(page.text(page.render()),/正在加载/);
 release();await tick();tree=page.render();const selected=page.all(tree).find(node=>node.props?.className==='ai-choice is-selected');assert.match(page.text(selected),/我的 AI 账号/);
 assert.equal(page.all(tree).find(node=>node.type==='Input'&&node.props.password).props.value,'');assert(!JSON.stringify([...page.cache.entries()]).includes('private-draft-key'));
});

test('changing the family clears the previous credit immediately before a delayed response',async()=>{
 let hold=false,release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);
 const page=screen('ai-settings',{read:async(path)=>{if(hold)await wait;return settings({family_id:path.includes('family-b')?'family-b':'family-a',family_name:path.includes('family-b')?'家庭 B':'家庭 A',models:[{...model,vision:true}]});}});
 await page.show();assert.match(page.text(page.render()),/家庭 A/);page.hide();page.cache.set('family_id','family-b');hold=true;await page.show();
 assert.doesNotMatch(page.text(page.render()),/家庭 A|¥20.00/);release();await tick();assert.match(page.text(page.render()),/家庭 B/);
});
