import {useRef,useState} from 'react';
import {View,Text,Button,Input,Picker,Checkbox,CheckboxGroup} from '@tarojs/components';
import Taro,{useDidShow,useDidHide,useRouter} from '@tarojs/taro';
import {api,message,storage,go,openLogin} from '../../services/api';
import {selectFamilyContext} from '../../services/family-context';
import {aiQuery,aiScope,aiModels,defaultAiModel,aiMoney,capabilityNames,providerNames,type AiSettings,type AiMode,type AiCapability} from '../../services/ai-settings';
import '../ai-settings/index.css';
import './index.css';

export default function AiAdvancedPage(){
 const router=useRouter();
 const [capability,setCapability]=useState<AiCapability>(router.params.capability==='vision'?'vision':'text'),[data,setData]=useState<AiSettings|null>(null);
 const [mode,setMode]=useState<AiMode>('system'),[modelId,setModelId]=useState(''),[provider,setProvider]=useState('qwen'),[customModel,setCustomModel]=useState(''),[key,setKey]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[details,setDetails]=useState(false),[chooseModel,setChooseModel]=useState(false);
 const shown=useRef(false),serial=useRef(0),inFlight=useRef(false),reloadOnShow=useRef(false),capabilityRef=useRef(capability),context=useRef(''),draft=useRef(false);
 const refresh=async(cap=capabilityRef.current,family=storage.get('family_id') as string,preserveDraft=false)=>{
  const current=++serial.current,token=storage.get('access_token'),scope=`${token}:${family||''}:${cap}`,changedScope=context.current!==scope;
  if(changedScope){context.current=scope;setData(null);setKey('');setConsent(false);draft.current=false;}if(!token)return;
  let settings:AiSettings;try{settings=await api<AiSettings>('/me/ai-settings'+aiQuery(cap,family));}catch(e){if(shown.current&&current===serial.current&&(e as Error)?.message==='FAMILY_NOT_FOUND'&&family){selectFamilyContext(storage,'');setData(null);return refresh(cap,'');}throw e;}
  if(!shown.current||current!==serial.current||token!==storage.get('access_token'))return;
  if(settings.family_id&&!family){selectFamilyContext(storage,settings.family_id);context.current=`${token}:${settings.family_id}:${cap}`;}
  if(preserveDraft&&!changedScope&&draft.current)return;
  const selected=settings.mode==='system'?defaultAiModel(settings,'system'):settings.models.find(model=>model.id===settings.model_id);setData(settings);setMode(settings.mode);setModelId(selected?.id??settings.model_id??'');setProvider(settings.custom_provider??selected?.provider??'qwen');setCustomModel(settings.custom_model??'');setConsent(false);setKey('');if(!preserveDraft){setDetails(false);setChooseModel(false);}
 };
 const load=async()=>{if(!data||context.current!==`${storage.get('access_token')}:${storage.get('family_id')||''}:${capabilityRef.current}`)setBusy(true);try{await refresh(undefined,undefined,true);if(shown.current)setError('');}catch(e){if(shown.current)setError(message(e));}finally{if(shown.current&&!inFlight.current)setBusy(false);}};
 const run=async(fn:()=>Promise<unknown>)=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){if(shown.current)setError(message(e));}finally{inFlight.current=false;setBusy(false);if(shown.current&&reloadOnShow.current){reloadOnShow.current=false;void load();}}};
 useDidShow(()=>{shown.current=true;if(context.current!==`${storage.get('access_token')}:${storage.get('family_id')||''}:${capabilityRef.current}`)setData(null);setKey('');if(inFlight.current)reloadOnShow.current=true;else{reloadOnShow.current=false;void load();}});useDidHide(()=>{shown.current=false;serial.current++;setKey('');setConsent(false);});
 const providers=capability==='vision'?['qwen','openai']:['qwen','deepseek','openai'];
 const models=data?aiModels(data,mode):[],presets=models.filter(model=>model.id!=='custom'&&(mode==='system'||model.provider===provider));
 const choices=mode==='system'?presets:[...presets,{id:'custom',label:'自己填写模型名称'}],selected=models.find(model=>model.id===modelId),custom=mode==='byok'&&modelId==='custom';
 const savedProvider=data?.custom_provider??data?.models.find(model=>model.id===data.model_id)?.provider;
 const canKeepKey=!!data?.has_key&&data.mode==='byok'&&savedProvider===(custom?provider:selected?.provider);
 const changed=!!data&&(mode!==data.mode||modelId!==data.model_id||!!key||custom&&(provider!==data.custom_provider||customModel!==data.custom_model));
 draft.current=changed;
 const valid=mode==='system'?!!selected?.system_available:!!data?.byok_available&&(!!key||canKeepKey)&&!!modelId&&(!custom||!!customModel.trim());
 const switchMode=(next:AiMode)=>{if(!data||next===mode)return;const model=defaultAiModel(data,next);setMode(next);setModelId(model?.id??(next==='byok'?'custom':''));setProvider(model?.provider??'qwen');setCustomModel(model?.id==='custom'?data.custom_model??'':'');setKey('');setConsent(false);setChooseModel(false);};
 const save=()=>run(async()=>{
  if(!data||!changed||!valid||!consent)return;
  try{await api('/me/ai-settings','PUT',{...aiScope(data),mode,model_id:modelId,expected_version:data.version,provider_consent:true,...(custom?{custom_provider:provider,custom_model:customModel.trim()}:{}),...(key?{api_key:key}:{})});}finally{setKey('');}
  await refresh();if(shown.current)setNotice('已保存，可以返回 AI 助手使用。');
 });
 const testConnection=()=>run(async()=>{
  if(!data||changed||!data.has_key||data.mode!=='byok')return;
  const answer=await Taro.showModal({title:'检查个人账号连接',content:'会发送一小段测试内容，可能产生少量费用，由你的 AI 服务账号承担。是否继续？',confirmText:'开始检查'});if(!answer.confirm)return;
  await api('/me/ai-test','POST',aiScope(data),undefined,90000);await refresh();if(shown.current)setNotice('连接正常。测试费用由你的 AI 服务账号承担。');
 });
 const deleteKey=()=>run(async()=>{
  if(!data)return;const answer=await Taro.showModal({title:'删除服务密钥？',content:'只删除当前用途的密钥。个人账号模式将停止生成，不会自动扣家庭额度。'});if(!answer.confirm)return;
  await api('/me/ai-key','DELETE',{...aiScope(data),expected_version:data.version});await refresh();if(shown.current)setNotice('服务密钥已删除。');
 });
 return <View className='page ai-advanced-page'>
  <View className='title'>高级设置</View><View className='ai-page-intro'>默认服务可直接使用；有自己的 AI 账号时再设置。</View>
  {error&&<View className='error'>{error}<Button className='text-action' disabled={busy} onClick={()=>void run(()=>refresh())}>重新加载</Button></View>}{notice&&<View className='notice'>{notice}</View>}
  {!storage.get('access_token')?<Button className='btn primary' onClick={()=>void openLogin()}>先微信登录</Button>:!data?<View className='card muted'>{busy?'正在加载…':'暂时无法加载，请重试。'}</View>:!data.family_id?<View className='card'><View>先在 AI 助手选择或建立家庭。</View><Button className='btn primary' onClick={()=>go('ai-settings')}>选择家庭</Button></View>:<>
   <View className='ai-purpose-tabs'>{(['text','vision'] as const).map(cap=><Button key={cap} className={`ai-purpose-tab ${cap===capability?'is-selected':''}`} disabled={busy} onClick={()=>{if(cap===capability)return;capabilityRef.current=cap;setCapability(cap);setData(null);setKey('');void run(()=>refresh(cap));}}>{capabilityNames[cap]}</Button>)}</View>
   <View className='card'>
    <View className='ai-step-title'>1. 选择使用方式</View>
    <Button className={`ai-choice ${mode==='system'?'is-selected':''}`} disabled={busy} onClick={()=>switchMode('system')}><View><View className='ai-choice-title'>默认服务<Text className='ai-recommended'>推荐</Text></View><View className='ai-choice-description'>无需填写配置，使用家庭共享额度</View></View><Text className='ai-choice-check'>{mode==='system'?'✓':'○'}</Text></Button>
    <Button className={`ai-choice ${mode==='byok'?'is-selected':''}`} disabled={busy} onClick={()=>switchMode('byok')}><View><View className='ai-choice-title'>我的 AI 账号</View><View className='ai-choice-description'>需要服务密钥，费用由该账号承担</View></View><Text className='ai-choice-check'>{mode==='byok'?'✓':'○'}</Text></Button>
   </View>
   <View className='card'>
    <View className='ai-step-title'>2. {mode==='system'?'确认默认服务':'填写个人服务信息'}</View>
    {mode==='system'?<>
     <View className='ai-service-name'>{selected?.label??'暂时没有可用的默认服务'}</View>
     {selected?.system_available?<View className='muted small'>每次最多预留 {aiMoney(selected.max_charge_micros??0)}，完成后按实际使用扣减，剩余退回。</View>:<View className='notice'>默认服务暂未就绪，请稍后重试或配置你已有的 AI 账号。</View>}
     {choices.length>1&&<Button className='text-action ai-detail-toggle' disabled={busy} onClick={()=>setChooseModel(value=>!value)}>{chooseModel?'收起模型选择':'更换模型 ›'}</Button>}
    </>:<>
     <View className='ai-field-label'>服务商</View><Picker mode='selector' range={providers.map(value=>providerNames[value])} value={Math.max(0,providers.indexOf(provider))} disabled={busy} onChange={event=>{const next=providers[Number(event.detail.value)];setProvider(next);setModelId(models.find(model=>model.id!=='custom'&&model.provider===next)?.id??'custom');setCustomModel('');setKey('');setConsent(false);}}><View className='field field-picker'>{providerNames[provider]??'选择服务商'} ▾</View></Picker>
    </>}
    {(mode==='byok'||chooseModel)&&<><View className='ai-field-label'>模型</View><Picker mode='selector' range={choices.map(model=>model.label)} value={Math.max(0,choices.findIndex(model=>model.id===modelId))} disabled={busy||!choices.length} onChange={event=>{setModelId(choices[Number(event.detail.value)]?.id??'');setConsent(false);}}><View className='field field-picker'>{choices.find(model=>model.id===modelId)?.label??'选择模型'} ▾</View></Picker></>}
    {custom&&<Input className='field' value={customModel} disabled={busy} maxlength={120} placeholder='复制服务商提供的模型名称' onInput={event=>{setCustomModel(event.detail.value);setConsent(false);}}/>}
    {mode==='byok'&&<><View className='ai-field-label'>服务密钥（API Key）</View><Input className='field' password value={key} disabled={busy||!data.byok_available} maxlength={512} placeholder={canKeepKey?'已保存，留空即可继续使用':'粘贴该服务商的 API Key'} onInput={event=>{setKey(event.detail.value);setConsent(false);}}/><View className='muted small'>密钥由服务商提供，加密保存在服务器，不向其他家长展示。费用以服务商账单为准。</View>{!data.byok_available&&<View className='error'>个人账号暂时无法保存，请联系运营者。</View>}</>}
    {mode==='system'&&selected?.system_available&&<><Button className='text-action ai-detail-toggle' onClick={()=>setDetails(value=>!value)}>{details?'收起计费详情':'查看计费详情 ›'}</Button>{details&&<View className='ai-pricing'><View>人民币 / 百万 Token：输入 {selected.input_yuan_per_million}，输出 {selected.output_yuan_per_million}，缓存输入 {selected.cached_yuan_per_million}。</View>{selected.pricing_tiers?.map(tier=><View key={tier.up_to_input_tokens}>输入不超过 {tier.up_to_input_tokens} Token：输入 {tier.input_yuan_per_million} / 输出 {tier.output_yuan_per_million} / 缓存 {tier.cached_yuan_per_million??tier.input_yuan_per_million}。</View>)}</View>}</>}
   </View>
   <View className='card'>
    <View className='ai-step-title'>3. 确认并保存</View>
    {changed?<><CheckboxGroup onChange={event=>setConsent(event.detail.value.includes('provider'))}><View className='ai-provider-consent'><Checkbox value='provider' checked={consent} disabled={busy}/><Text>我同意将{capabilityNames[capability]}的材料发送给{providerNames[custom?provider:selected?.provider??provider]}处理，费用{mode==='system'?'按本页规则从家庭额度扣减。':'由我的服务商账号承担。'}</Text></View></CheckboxGroup><Button className='btn primary' disabled={busy||!consent||!valid} loading={busy} onClick={save}>保存并使用</Button></>:<View className='muted'>当前设置已生效，无需重复保存。</View>}
    {data.mode==='byok'&&data.has_key&&<Button className='btn secondary' disabled={busy||changed} onClick={testConnection}>检查已保存的连接</Button>}
    {data.has_key&&<Button className='text-action' disabled={busy} onClick={deleteKey}>删除当前用途的服务密钥</Button>}
   </View>
   <Button className='text-action' disabled={busy} onClick={()=>void Taro.navigateBack().catch(()=>Taro.reLaunch({url:'/pages/ai-settings/index'}))}>返回 AI 助手</Button>
  </>}
 </View>;
}
